'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-dev-'));
const arquivo = path.join(pasta, 'dev-flags.json');
process.env.DEV_FLAGS_FILE = arquivo;
delete process.env.MODULOS_DESATIVADOS;

const {
  MODULOS,
  lerFlags,
  salvarFlags,
  isEnabled,
  injetarFlags,
  somenteLocal,
  autorizado
} = require('../src/dev-panel');

test('painel DEV: todos os módulos ligados por padrão', () => {
  const flags = lerFlags();
  assert.equal(Object.keys(flags).length, MODULOS.length);
  assert.ok(MODULOS.every(([id]) => flags[id] === true));
  assert.equal(isEnabled('relatorios'), true);
});

test('painel DEV: desligar relatórios escreve no arquivo e esconde no HTML injetado', () => {
  const flags = salvarFlags({ relatorios: false, vendas: true, painel: true });
  assert.equal(flags.relatorios, false);
  assert.equal(lerFlags().relatorios, false);
  assert.equal(isEnabled('relatorios'), false);
  assert.equal(isEnabled('vendas'), true);
  assert.match(fs.readFileSync(arquivo, 'utf8'), /"relatorios": false/);

  const html = injetarFlags('<html><body><div id="nav"></div></body></html>');
  assert.match(html, /data-page="relatorios"\]\{display:none!important\}/);
  assert.match(html, /window\.GP_FLAGS=/);
  assert.match(html, /"relatorios":false/);
  assert.ok(!/data-page="vendas"\]\{display:none/.test(html), 'vendas continua visível');
  assert.match(html, /gpDevLink/, 'link para /dev é injetado');
});

test('painel DEV: religar e chaves desconhecidas são ignoradas', () => {
  const flags = salvarFlags({ relatorios: true, moduloQueNaoExiste: false });
  assert.equal(flags.relatorios, true);
  assert.equal(Object.keys(flags).length, MODULOS.length);
  assert.ok(!('moduloQueNaoExiste' in flags));
});

test('painel DEV: MODULOS_DESATIVADOS no .env trava o módulo', () => {
  process.env.MODULOS_DESATIVADOS = 'relatorios, cargas';
  try {
    const flags = lerFlags();
    assert.equal(flags.relatorios, false);
    assert.equal(flags.cargas, false);
    assert.equal(flags.vendas, true);
    assert.equal(
      salvarFlags({ relatorios: true }).relatorios,
      false,
      'painel não consegue religar um travado'
    );
  } finally {
    delete process.env.MODULOS_DESATIVADOS;
  }
});

test('painel DEV: só aceita requisições locais', () => {
  assert.equal(somenteLocal({ ip: '127.0.0.1' }), true);
  assert.equal(somenteLocal({ ip: '::1' }), true);
  assert.equal(somenteLocal({ ip: '::ffff:127.0.0.1' }), true);
  assert.equal(somenteLocal({ ip: '192.168.0.10' }), false);
  assert.equal(autorizado({ ip: '127.0.0.1', query: {}, get: () => undefined }).ok, true);
  assert.equal(autorizado({ ip: '192.168.0.10', query: {}, get: () => undefined }).status, 403);
});

test('painel DEV: DEV_KEY opcional protege o painel', () => {
  process.env.DEV_KEY = 'segredo';
  try {
    const req = (chave) => ({ ip: '::1', query: { chave }, get: () => undefined });
    assert.equal(autorizado(req('segredo')).ok, true);
    assert.equal(autorizado(req('errada')).status, 401);
  } finally {
    delete process.env.DEV_KEY;
  }
});
