'use strict';

require('dotenv').config();

const crypto = require('node:crypto');
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

const { createDatabaseRuntime } = require('./src/runtime/database-state');
const { createApp } = require('./src/http/app');

if (!process.env.JWT_KEY) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Defina JWT_KEY com uma chave aleatória de pelo menos 32 bytes.');
  }
  process.env.JWT_KEY = crypto.randomBytes(48).toString('base64');
  console.warn(
    'AVISO: JWT_KEY temporária gerada para esta execução. Para manter sessões após reiniciar, configure JWT_KEY no arquivo .env.'
  );
}
if (Buffer.byteLength(process.env.JWT_KEY, 'utf8') < 32) {
  throw new Error('JWT_KEY deve ter pelo menos 32 bytes.');
}

const port = resolvePort();
const addresses = listenAddresses();
const url = displayUrl(port);
const probe = probeUrl(port, addresses);

const runtime = createDatabaseRuntime({ appVersion: APP_VERSION, url });
const app = createApp({ runtime, rootDir: __dirname });

const httpServers = [];
let browserOpened = false;
let announced = false;

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
async function waitForHttp(target, attempts = 20) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`${target}/api/status`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return true;
    } catch {
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
        runtime.prepare().catch(() => {});
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
        console.warn(
          `[boot] Endereço ${address} indisponível (IPv6 desabilitado?). Continuando com os demais.`
        );
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
  await runtime.close();
}
process.on('SIGINT', () => shutdown().finally(() => process.exit(0)));
process.on('SIGTERM', () => shutdown().finally(() => process.exit(0)));

if (require.main === module) start();

module.exports = { app, start, runtime };
