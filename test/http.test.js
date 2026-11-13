'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.JWT_KEY = 'chave-local-de-teste-com-mais-de-trinta-e-dois-bytes';
process.env.JWT_ISSUER = 'FabricaPneus';
process.env.JWT_AUDIENCE = 'FabricaPneusApp';

const databasePath = require.resolve('../src/database');
const { createApp } = require('../src/http/app');
const { createToken } = require('../src/auth');

function fakeRuntime({ ready = false } = {}) {
  const pool = ready ? {} : null;
  return {
    getPool: () => pool,
    prepare: () => (pool ? Promise.resolve(pool) : Promise.reject(new Error('banco indisponível'))),
    status: () => ({
      pronto: Boolean(pool),
      etapa: 'teste',
      erro: pool ? null : 'banco indisponível',
      versao: 'teste',
      url: 'http://localhost'
    }),
    shouldRetry: () => false,
    close: async () => {}
  };
}

async function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base };
}

test('a aplicação HTTP não carrega o driver SQL Server no boot', () => {
  assert.equal(require.cache[databasePath], undefined, 'src/database.js deve continuar lazy');
});

test('GET /api/status responde sem banco e com cabeçalhos de segurança', async () => {
  const app = createApp({ runtime: fakeRuntime(), rootDir: path.join(__dirname, '..') });
  const { server, base } = await listen(app);
  try {
    const response = await fetch(`${base}/api/status`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.pronto, false);
    assert.equal(body.etapa, 'teste');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('x-request-id'), /^[a-f0-9-]{36}$/);
  } finally {
    server.close();
  }
});

test('GET / injeta a tela de boot e as flags do painel DEV', async () => {
  const app = createApp({ runtime: fakeRuntime(), rootDir: path.join(__dirname, '..') });
  const { server, base } = await listen(app);
  try {
    const response = await fetch(base);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /js\/boot\.js/);
    assert.match(html, /window\.GP_FLAGS=/);
  } finally {
    server.close();
  }
});

test('chamadas /api devolvem 503 enquanto o banco não está pronto', async () => {
  const app = createApp({ runtime: fakeRuntime(), rootDir: path.join(__dirname, '..') });
  const { server, base } = await listen(app);
  try {
    const response = await fetch(`${base}/api/dados`);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.match(body.detail, /SQL Server/);
  } finally {
    server.close();
  }
});

test('módulo desativado no painel DEV bloqueia relatório antes do banco/auth', async () => {
  process.env.MODULOS_DESATIVADOS = 'relatorios';
  try {
    const app = createApp({ runtime: fakeRuntime(), rootDir: path.join(__dirname, '..') });
    const { server, base } = await listen(app);
    try {
      const response = await fetch(`${base}/api/relatorios/vendas`);
      assert.equal(response.status, 404);
    } finally {
      server.close();
    }
  } finally {
    delete process.env.MODULOS_DESATIVADOS;
  }
});

test('rotas protegidas exigem JWT e rota inexistente devolve 404', async () => {
  const app = createApp({ runtime: fakeRuntime({ ready: true }), rootDir: path.join(__dirname, '..') });
  const { server, base } = await listen(app);
  try {
    const semToken = await fetch(`${base}/api/dados`);
    assert.equal(semToken.status, 401);

    const token = createToken('TESTE');
    const inexistente = await fetch(`${base}/api/rota-que-nao-existe`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(inexistente.status, 404);
  } finally {
    server.close();
  }
});
