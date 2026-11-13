'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Configurações de inicialização que NÃO dependem do SQL Server.
// Ficam em arquivo separado para serem testadas sem precisar de banco.
const DEFAULT_PORT = 5090;
const LEGACY_PORT = 5080;
const APP_VERSION = '2026.11.02-boot5090';

// O .env não vai para o GitHub. Quem já tem PORT=5080 no computador precisa
// ser migrado automaticamente, senão a troca do código não teria efeito local.
// Para manter 5080 de propósito: ALLOW_LEGACY_PORT=true no .env.
function applyLegacyPortMigration(envPath = path.join(__dirname, '..', '.env')) {
  if (process.env.ALLOW_LEGACY_PORT === 'true') return false;
  if (Number(process.env.PORT) !== LEGACY_PORT) return false;

  process.env.PORT = String(DEFAULT_PORT);
  let reescrito = false;
  try {
    if (fs.existsSync(envPath)) {
      const original = fs.readFileSync(envPath, 'utf8');
      const linhas = original.split(/\r?\n/);
      let mudou = false;
      for (let i = 0; i < linhas.length; i += 1) {
        const encontrado = /^(\s*PORT\s*=\s*)5080(\s*(?:#.*)?)$/.exec(linhas[i]);
        if (encontrado) {
          linhas[i] = `${encontrado[1]}${DEFAULT_PORT}${encontrado[2]}`;
          mudou = true;
        }
      }
      if (mudou) {
        const quebra = original.includes('\r\n') ? '\r\n' : '\n';
        fs.writeFileSync(envPath, linhas.join(quebra), 'utf8');
        reescrito = true;
      }
    }
  } catch (error) {
    console.warn(`[config] Não foi possível atualizar o .env automaticamente: ${error.message}`);
  }
  console.warn(
    `[config] PORT=${LEGACY_PORT} é a porta antiga. Usando ${DEFAULT_PORT}${reescrito ? ' e atualizando o .env' : ' (ajuste o .env manualmente)'}.`
  );
  return true;
}

function resolvePort(value = process.env.PORT) {
  if (value == null || String(value).trim() === '') return DEFAULT_PORT;
  const texto = String(value).trim();
  // Aceita "5090", "5090  # comentário" etc. sem derrubar o servidor no boot.
  const encontrado = /^(\d{1,5})(?!\d)/.exec(texto);
  const port = encontrado ? Number(encontrado[1]) : Number.NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT inválida: "${value}". Use um número entre 1 e 65535 (padrão ${DEFAULT_PORT}).`);
  }
  return port;
}

// No Windows, "localhost" resolve às vezes para ::1 e às vezes para 127.0.0.1.
// Escutando nos dois endereços de loopback, http://localhost:5090 funciona sempre,
// sem expor o sistema para a rede local.
function listenAddresses(value = process.env.HOST) {
  const host = String(value == null ? '' : value).trim();
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return ['127.0.0.1', '::1'];
  }
  return [host];
}

function isLoopbackOnly(addresses) {
  return addresses.every(
    (address) => address === '127.0.0.1' || address === '::1' || address === 'localhost'
  );
}

function displayUrl(port) {
  return `http://localhost:${port}`;
}

// Endereço usado pelo próprio Node para confirmar que o servidor já responde.
function probeUrl(port, addresses = listenAddresses()) {
  const address = addresses.find((item) => item === '127.0.0.1') || addresses[0];
  return `http://${address.includes(':') ? `[${address}]` : address}:${port}`;
}

function openBrowserEnabled(value = process.env.OPEN_BROWSER) {
  if (value == null || String(value).trim() === '') return true;
  return !['0', 'false', 'no', 'off', 'nao', 'não', 'desligado'].includes(String(value).trim().toLowerCase());
}

module.exports = {
  DEFAULT_PORT,
  LEGACY_PORT,
  APP_VERSION,
  applyLegacyPortMigration,
  resolvePort,
  listenAddresses,
  isLoopbackOnly,
  displayUrl,
  probeUrl,
  openBrowserEnabled
};
