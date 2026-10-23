require('dotenv').config();

const crypto = require('node:crypto');
const express = require('express');
const path = require('node:path');
const { sql, initializeDatabase } = require('./src/database');
const { tables } = require('./src/definitions');
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
  parseGuid
} = require('./src/operations');
const { createOrderPdf } = require('./src/pdf');

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
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 5080);
let pool = null;
let httpServer = null;

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'wwwroot'), { etag: true, maxAge: '1h' }));

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

async function start() {
  try {
    pool = await initializeDatabase();
    httpServer = app.listen(port, host, () => {
      console.log(`Fábrica de Pneus em http://${host}:${port}`);
      console.log('Banco de dados preparado e servidor Node.js pronto.');
    });
    httpServer.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`A porta ${port} já está em uso. Feche a instância deste sistema ou altere PORT no .env.`);
      } else {
        console.error('Não foi possível iniciar o servidor:', error);
      }
      process.exitCode = 1;
    });
  } catch (error) {
    console.error('Não foi possível preparar o banco de dados.');
    console.error(error.message);
    if (error.number) console.error(`Código SQL Server: ${error.number}`);
    process.exitCode = 1;
    if (pool) await pool.close().catch(() => {});
  }
}

async function shutdown() {
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  if (pool) await pool.close().catch(() => {});
}
process.on('SIGINT', () => shutdown().finally(() => process.exit(0)));
process.on('SIGTERM', () => shutdown().finally(() => process.exit(0)));

if (require.main === module) start();

module.exports = { app, start };


const { exec } = require('child_process');

exec('start "" "http://localhost:5090"');