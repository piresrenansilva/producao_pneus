require('dotenv').config();

const crypto = require('node:crypto');
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const {
  DEFAULT_PORT,
  APP_VERSION,
  applyLegacyPortMigration,
  resolvePort,
  listenAddresses,
  isLoopbackOnly,
  displayUrl,
  probeUrl,
  openBrowserEnabled
} = require('./src/config');
applyLegacyPortMigration(); // .env antigo com PORT=5080 passa a valer 5090
const { tables } = require('./src/definitions');

// O driver do SQL Server (módulo nativo no Windows) só é carregado no primeiro
// uso. Assim a interface e o servidor HTTP sobem imediatamente.
// IMPORTANTE: src/database.js NÃO é modificado por esta atualização — quem tem
// alterações locais nele continua com o arquivo intacto.
let databaseModule = null;
function loadDatabase() {
  if (!databaseModule) databaseModule = require('./src/database');
  return databaseModule;
}
const sql = new Proxy({}, { get: (_target, property) => loadDatabase().sql[property] });

let bootDatabaseModule = null;
function loadBootDatabase() {
  if (!bootDatabaseModule) bootDatabaseModule = require('./src/boot-database');
  return bootDatabaseModule;
}

const { HttpError, badRequest, conflict, notFound } = require('./src/errors');
const {
  hashPassword,
  verifyPassword,
  createToken,
  requireAuthentication,
  ensureValidLoginBody
} = require('./src/auth');
const {
  getAllData,
  createRow,
  updateRow,
  deleteRow,
  createOrUpdateSale,
  createOrUpdateCarcacaOrdem,
  createOrUpdateCarga,
  parseGuid
} = require('./src/operations');
const { createOrderPdf, createCarcacaOrdemPdf, createCargaPdf } = require('./src/pdf');
const { getSalesReport } = require('./src/reports');
const { registrarDevRoutes, injetarFlags, isEnabled } = require('./src/dev-panel');

if (!process.env.JWT_KEY) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Defina JWT_KEY com uma chave aleatória de pelo menos 32 bytes.');
  }
  process.env.JWT_KEY = crypto.randomBytes(48).toString('base64');
  console.warn('AVISO: JWT_KEY temporária gerada para esta execução. Para manter sessões após reiniciar, configure JWT_KEY no arquivo .env.');
}
if (Buffer.byteLength(process.env.JWT_KEY, 'utf8') < 32) {
  throw new Error('JWT_KEY deve ter pelo menos 32 bytes.');
}

const app = express();
const port = resolvePort();
const addresses = listenAddresses();
const url = displayUrl(port);
const probe = probeUrl(port, addresses);
let pool = null;
const httpServers = [];
const bootStartedAt = Date.now();
let dbStage = 'Aguardando o banco de dados';
let dbError = null;
let dbInit = null;
let lastFailureAt = 0;
let browserOpened = false;
let announced = false;

function markStage(message) {
  dbStage = message;
  console.log(`[boot] ${message} (+${((Date.now() - bootStartedAt) / 1000).toFixed(1)}s)`);
}

// Preparação do banco em SEGUNDO PLANO: o HTTP já está de pé, a interface abre
// na hora e as chamadas /api esperam (ou tentam de novo) até o pool existir.
function registrarFalha(error) {
  dbError = error;
  lastFailureAt = Date.now();
  dbInit = null;
  markStage(`Falha ao preparar o banco: ${error.message}`);
  console.error('Não foi possível preparar o banco de dados.');
  console.error(error.stack || error.message);
  if (error.number) console.error(`Código SQL Server: ${error.number}`);
  return Promise.reject(error);
}

// Qualquer erro AQUI (arquivo novo ausente, driver msnodesqlv8 não instalado,
// .env inválido...) precisa virar mensagem na tela, e NUNCA uma exceção não
// tratada que fecha a janela do .bat sem deixar rastro.
function prepareDatabase() {
  if (pool) return Promise.resolve(pool);
  if (dbError && Date.now() - lastFailureAt < 5000) return Promise.reject(dbError);
  if (!dbInit) {
    dbError = null;
    try {
      dbInit = Promise.resolve(loadBootDatabase().initializeDatabaseFast(markStage))
        .then((readyPool) => {
          pool = readyPool;
          markStage('Banco pronto — sistema liberado.');
          return pool;
        })
        .catch(registrarFalha);
    } catch (error) {
      return registrarFalha(error);
    }
  }
  return dbInit;
}

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Injeta a tela de boot no HTML sem precisar editar o wwwroot/index.html
// (evita conflito com versões locais desse arquivo). O HTML é sempre
// revalidado, então atualizações aparecem sem Ctrl+F5.
let indexBaseCache = null;
app.get(['/', '/index.html'], (req, res, next) => {
  try {
    if (!indexBaseCache || process.env.NODE_ENV === 'development') {
      const original = fs.readFileSync(path.join(__dirname, 'wwwroot', 'index.html'), 'utf8');
      const injetado = '  <script src="/js/boot.js?v=20261102-boot5090"></script>\n';
      indexBaseCache = /<\/body>/i.test(original)
        ? original.replace(/<\/body>/i, `${injetado}</body>`)
        : original + injetado;
    }
    // As flags são relidas a cada request: editar dev-flags.json + F5 já aplica,
    // sem reiniciar o servidor.
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(injetarFlags(indexBaseCache));
  } catch (error) {
    next(error);
  }
});

app.use(express.static(path.join(__dirname, 'wwwroot'), {
  etag: true,
  maxAge: '1h',
  setHeaders(res, filePath) {
    // HTML/JS/CSS são sempre revalidados: depois de atualizar os arquivos não é
    // mais obrigatório dar Ctrl+F5 para sair da versão antiga em cache.
    if (/\.(html?|js|css)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  }
}));

// Painel DEV: só localhost, e não depende do banco (útil para diagnosticar).
registrarDevRoutes(app);

// Módulo desligado no painel DEV: bloqueia ANTES do gate do banco e da autenticação.
// Assim a resposta é 404 imediata mesmo se o SQL Server ainda não subiu.
app.use('/api/relatorios/vendas', (req, res, next) => {
  if (!isEnabled('relatorios')) {
    return res.status(404).json({ detail: 'Módulo de relatórios desativado no painel DEV.' });
  }
  next();
});

app.get('/api/status', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    pronto: Boolean(pool),
    etapa: dbStage,
    erro: dbError ? (dbError.message || String(dbError)) : null,
    versao: APP_VERSION,
    url
  });
  // A tela de boot faz polling: se o SQL Server demorou a subir, tentamos de novo.
  if (!pool && dbError && Date.now() - lastFailureAt >= 5000) prepareDatabase().catch(() => {});
});

app.use('/api', (req, res, next) => {
  if (pool) return next();
  prepareDatabase().then(
    () => next(),
    (error) => res.status(503).json({
      detail: `Não foi possível acessar o SQL Server: ${error.message || dbStage}. Confira o serviço e a configuração no .env; o sistema tenta novamente em instantes.`,
      etapa: dbStage
    })
  );
});

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const authAttempts = new Map();
function authRateLimit(req, res, next) {
  const now = Date.now();
  const key = `${req.ip}:${req.path}`;
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 12;
  let bucket = authAttempts.get(key);
  if (!bucket || now - bucket.startedAt > windowMs) {
    bucket = { startedAt: now, count: 0 };
    authAttempts.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > maxAttempts) {
    return res.status(429).json({ detail: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
  }
  return next();
}
function clearAuthAttempts(req) {
  authAttempts.delete(`${req.ip}:${req.path}`);
}

app.get('/api/login/status', asyncRoute(async (req, res) => {
  const result = await pool.request().query('SELECT CONVERT(bit, CASE WHEN EXISTS (SELECT 1 FROM dbo.logins) THEN 1 ELSE 0 END) AS configurado');
  res.json({ configurado: Boolean(result.recordset[0]?.configurado) });
}));

app.post('/api/login/setup', authRateLimit, asyncRoute(async (req, res) => {
  const { username, password } = ensureValidLoginBody(req.body);
  const confirmation = typeof req.body.confirmacaoSenha === 'string' ? req.body.confirmacaoSenha : '';
  if (password !== confirmation) throw badRequest('A confirmação da senha não corresponde.');
  if (username.length > 100) throw badRequest('O usuário deve ter entre 1 e 100 caracteres.');
  if (password.length < 6) throw badRequest('A senha deve ter pelo menos 6 caracteres.');
  if (password.length > 256) throw badRequest('A senha não pode exceder 256 caracteres.');

  const normalizedUser = username.toUpperCase();
  const passwordHash = hashPassword(password);
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const lockResult = await new sql.Request(transaction).query(`
      DECLARE @resultado int;
      EXEC @resultado = sys.sp_getapplock
        @Resource = N'FabricaPneus-LoginSetup',
        @LockMode = 'Exclusive',
        @LockOwner = 'Transaction',
        @LockTimeout = 10000;
      SELECT @resultado AS resultado;`);
    if (Number(lockResult.recordset[0]?.resultado) < 0) {
      throw conflict('A configuração inicial está ocupada. Tente novamente.');
    }

    const existing = await new sql.Request(transaction).query('SELECT COUNT_BIG(1) AS quantidade FROM dbo.logins');
    if (Number(existing.recordset[0]?.quantidade) !== 0) {
      await transaction.rollback();
      return res.status(409).json({ detail: 'O acesso inicial já foi configurado. Entre com seu usuário e senha.' });
    }

    await new sql.Request(transaction)
      .input('usuario', sql.NVarChar(100), normalizedUser)
      .input('senhaHash', sql.NVarChar(200), passwordHash)
      .query('INSERT INTO dbo.logins (usuario, senhaHash) VALUES (@usuario, @senhaHash)');
    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }

  clearAuthAttempts(req);
  return res.json({ token: createToken(normalizedUser), usuario: normalizedUser });
}));

app.post('/api/login', authRateLimit, asyncRoute(async (req, res) => {
  const { username, password } = ensureValidLoginBody(req.body);
  if (username.length > 100 || password.length > 256) return res.status(401).end();
  const normalizedUser = username.toUpperCase();
  const result = await pool.request()
    .input('usuario', sql.NVarChar(100), normalizedUser)
    .query('SELECT senhaHash FROM dbo.logins WHERE usuario = @usuario');
  const storedHash = result.recordset[0]?.senhaHash;
  if (!storedHash || !verifyPassword(password, storedHash)) return res.status(401).end();
  clearAuthAttempts(req);
  return res.json({ token: createToken(normalizedUser), usuario: normalizedUser });
}));

// A partir daqui, todas as rotas da API exigem JWT.
app.use('/api', requireAuthentication);

app.get('/api/dados', asyncRoute(async (req, res) => {
  res.json(await getAllData(pool));
}));

// Relatório calculado pela procedure dbo.usp_RelatorioVendas. A tela nunca acessa
// o banco diretamente; o período é validado antes de ser enviado ao SQL Server.
app.get('/api/relatorios/vendas', asyncRoute(async (req, res) => {
  if (!isEnabled('relatorios')) throw notFound('Módulo de relatórios desativado no painel DEV.');
  res.json(await getSalesReport(pool, req.query));
}));

app.get('/api/consulta/cnpj/:cnpj', asyncRoute(async (req, res) => {
  const cnpj = String(req.params.cnpj || '').replace(/\D/g, '');
  if (cnpj.length !== 14) throw badRequest('CNPJ deve ter 14 dígitos.');
  const providers = [
    `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
    `https://www.receitaws.com.br/v1/cnpj/${cnpj}`
  ];
  for (const url of providers) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'FabricaPneus/1.0' }
      });
      if (response.ok) {
        const text = await response.text();
        res.type('application/json').send(text);
        return;
      }
    } catch (error) {
      console.warn('Falha em provedor de CNPJ:', error.message);
    }
  }
  throw notFound('CNPJ não encontrado.');
}));

app.get('/api/consulta/cep/:cep', asyncRoute(async (req, res) => {
  const cep = String(req.params.cep || '').replace(/\D/g, '');
  if (cep.length !== 8) throw badRequest('CEP deve ter 8 dígitos.');
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(10000) });
    if (response.ok) {
      const data = await response.json();
      if (!data.erro) return res.json(data);
    }
  } catch (error) {
    console.warn('Falha ao consultar o provedor de CEP:', error.message);
  }
  throw notFound('CEP não encontrado.');
}));

app.post('/api/vendas', asyncRoute(async (req, res) => {
  res.json(await createOrUpdateSale(pool, req.body));
}));
app.put('/api/vendas/:id', asyncRoute(async (req, res) => {
  const id = parseGuid(req.params.id, 'Identificador do pedido');
  res.json(await createOrUpdateSale(pool, req.body, id));
}));

// Apontamentos de entrada de carcaças (ordem com itens e total).
app.post('/api/carcaca-ordens', asyncRoute(async (req, res) => {
  res.json(await createOrUpdateCarcacaOrdem(pool, req.body));
}));
app.put('/api/carcaca-ordens/:id', asyncRoute(async (req, res) => {
  const id = parseGuid(req.params.id, 'Identificador do apontamento');
  res.json(await createOrUpdateCarcacaOrdem(pool, req.body, id));
}));

app.get('/api/carcaca-ordens/:id/pdf', asyncRoute(async (req, res) => {
  const pdf = await createCarcacaOrdemPdf(pool, req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
  res.setHeader('Content-Length', pdf.buffer.length);
  res.send(pdf.buffer);
}));

// Carga e descarga com vários produtos (movimenta o estoque).
app.post('/api/cargas', asyncRoute(async (req, res) => {
  res.json(await createOrUpdateCarga(pool, req.body));
}));
app.put('/api/cargas/:id', asyncRoute(async (req, res) => {
  const id = parseGuid(req.params.id, 'Identificador do movimento');
  res.json(await createOrUpdateCarga(pool, req.body, id));
}));
app.get('/api/cargas/:id/pdf', asyncRoute(async (req, res) => {
  const pdf = await createCargaPdf(pool, req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
  res.setHeader('Content-Length', pdf.buffer.length);
  res.send(pdf.buffer);
}));

app.get('/api/pedidos/:id/pdf', asyncRoute(async (req, res) => {
  const pdf = await createOrderPdf(pool, req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
  res.setHeader('Content-Length', pdf.buffer.length);
  res.send(pdf.buffer);
}));

// CRUD genérico somente para tabelas explicitamente listadas. Pedidos/itens
// passam pelo fluxo próprio de venda para impedir inconsistência de estoque.
app.post('/api/:route', asyncRoute(async (req, res) => {
  const route = req.params.route;
  if (!tables[route]) throw notFound('Rota não encontrada.');
  res.json(await createRow(pool, route, req.body));
}));
app.put('/api/:route/:id', asyncRoute(async (req, res) => {
  const route = req.params.route;
  if (!tables[route]) throw notFound('Rota não encontrada.');
  if (route === 'itens') throw conflict('Itens de pedidos são gerenciados pelo fluxo de vendas.');
  if (route === 'carcacaOrdens' || route === 'carcacaOrdemItens') throw conflict('Apontamentos de carcaças são gerenciados pelo fluxo de apontamentos.');
  await updateRow(pool, route, req.params.id, req.body);
  res.status(204).end();
}));
app.delete('/api/:route/:id', asyncRoute(async (req, res) => {
  const route = req.params.route;
  if (!tables[route]) throw notFound('Rota não encontrada.');
  if (route === 'itens') throw conflict('Itens de pedidos são gerenciados pelo fluxo de vendas.');
  if (route === 'carcacaOrdemItens') throw conflict('Itens de apontamentos são gerenciados pelo fluxo de apontamentos.');
  await deleteRow(pool, route, req.params.id);
  res.status(204).end();
}));

app.use('/api', (req, res) => res.status(404).json({ detail: 'Rota não encontrada.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof HttpError) {
    return res.status(error.status).json({ detail: error.detail });
  }
  if (error?.number === 547 || error?.number === 2601 || error?.number === 2627) {
    return res.status(409).json({ detail: 'A operação viola uma regra do banco de dados. Verifique vínculos e valores duplicados.' });
  }
  console.error('Erro na aplicação:', error);
  return res.status(500).json({ detail: 'Erro interno no servidor.' });
});

function openBrowser(target = url) {
  if (browserOpened || !openBrowserEnabled()) return;
  browserOpened = true;
  let command;
  let args;
  if (process.platform === 'win32') {
    command = 'cmd.exe';
    args = ['/c', 'start', '', target];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [target];
  } else {
    command = 'xdg-open';
    args = [target];
  }
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', (error) => console.warn('Não foi possível abrir o navegador:', error.message));
    child.unref();
  } catch (error) {
    console.warn('Não foi possível abrir o navegador:', error.message);
  }
}

// Confere que o servidor realmente responde ANTES de abrir o navegador.
// Era aqui que o sistema abria uma página de erro no boot antigo.
async function waitForHttp(target, attempts = 20) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`${target}/api/status`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return true;
    } catch (error) {
      // ainda iniciando
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

function announce() {
  console.log(`Fábrica de Pneus ${APP_VERSION} → ${url}`);
  console.log(`Porta ${port} (padrão ${DEFAULT_PORT}). Endereço fixo: ${url}`);
  for (const address of addresses) {
    const shown = address.includes(':') ? `[${address}]` : address;
    console.log(`  ouvindo em http://${shown}:${port}`);
  }
  if (!isLoopbackOnly(addresses)) {
    for (const list of Object.values(os.networkInterfaces())) {
      for (const item of list || []) {
        if (item.family === 'IPv4' && !item.internal) {
          console.log(`  na rede: http://${item.address}:${port}`);
        }
      }
    }
  }
  console.log('O SQL Server está sendo preparado em segundo plano; a interface já abre.');
}

async function start() {
  let portInUse = false;

  for (const address of addresses) {
    const server = app.listen(port, address);
    httpServers.push(server);

    server.on('listening', () => {
      if (announced) return;
      announced = true;
      try {
        announce();
        prepareDatabase().catch(() => {});
        waitForHttp(probe).then((ok) => {
          if (ok) openBrowser(url);
          else console.warn(`Não foi possível confirmar o servidor local. Abra manualmente ${url}`);
        });
      } catch (error) {
        console.error('Falha ao iniciar a preparação do banco:', error.stack || error.message);
      }
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
        portInUse = true;
        return;
      }
      // IPv6 desabilitado no Windows: o 127.0.0.1 continua funcionando.
      if (error.code === 'EAFNOSUPPORT' || error.code === 'EADDRNOTAVAIL') {
        console.warn(`[boot] Endereço ${address} indisponível (IPv6 desabilitado?). Continuando com os demais.`);
        return;
      }
      console.error(`Não foi possível escutar em ${address}:${port}:`, error.message);
    });
  }

  // Se a porta já estava ocupada, quase sempre é uma instância antiga do próprio
  // sistema: abre o navegador nela em vez de mostrar "não foi possível conectar".
  setTimeout(async () => {
    if (announced) return;
    try {
    if (portInUse) {
      const existing = await waitForHttp(probe, 6);
      if (existing) {
        console.warn(`Já existe uma instância do sistema rodando em ${url}. Abrindo essa instância.`);
        openBrowser(url);
        setInterval(() => {}, 1 << 30); // mantém o processo vivo (o .bat reinicia se ele sair)
      } else {
        console.error(`A porta ${port} já está em uso por outro programa. Feche-o ou altere PORT no .env.`);
        process.exitCode = 1;
      }
    } else {
      console.error('Não foi possível iniciar o servidor HTTP. Veja as mensagens acima.');
      process.exitCode = 1;
    }
    } catch (error) {
      console.error('Falha na verificação da porta:', error.stack || error.message);
    }
  }, 1200);
}

async function shutdown() {
  await Promise.all(httpServers.map((server) => new Promise((resolve) => server.close(resolve))));
  if (pool) await pool.close().catch(() => {});
}
process.on('SIGINT', () => shutdown().finally(() => process.exit(0)));
process.on('SIGTERM', () => shutdown().finally(() => process.exit(0)));

if (require.main === module) start();

module.exports = { app, start };
