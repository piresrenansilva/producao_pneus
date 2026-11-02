'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  DEFAULT_PORT,
  APP_VERSION,
  resolvePort,
  listenAddresses,
  displayUrl,
  probeUrl,
  openBrowserEnabled,
  applyLegacyPortMigration
} = require('../src/config');

test('porta única: 5090 é o padrão e é a URL mostrada', () => {
  const anterior = process.env.PORT;
  delete process.env.PORT;
  try {
    assert.equal(resolvePort(), 5090);
    assert.equal(DEFAULT_PORT, 5090);
    assert.equal(displayUrl(resolvePort()), 'http://localhost:5090');
    assert.match(APP_VERSION, /boot5090/);
    assert.equal(resolvePort('7000'), 7000);
    assert.throws(() => resolvePort('abc'), /PORT inválida/);
    assert.throws(() => resolvePort('70000'), /PORT inválida/);
  } finally {
    if (anterior === undefined) delete process.env.PORT;
    else process.env.PORT = anterior;
  }
});

test('localhost passa a funcionar em IPv4 e IPv6 sem abrir para a rede', () => {
  assert.deepEqual(listenAddresses(''), ['127.0.0.1', '::1']);
  assert.deepEqual(listenAddresses('127.0.0.1'), ['127.0.0.1', '::1']);
  assert.deepEqual(listenAddresses('localhost'), ['127.0.0.1', '::1']);
  assert.deepEqual(listenAddresses('0.0.0.0'), ['0.0.0.0']);
  assert.equal(probeUrl(5090, ['127.0.0.1', '::1']), 'http://127.0.0.1:5090');
  assert.equal(openBrowserEnabled(), true);
  assert.equal(openBrowserEnabled('false'), false);
});

test('.env antigo com 5080 é migrado para 5090', () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-env-'));
  const arquivo = path.join(pasta, '.env');
  const anteriores = { PORT: process.env.PORT, ALLOW_LEGACY_PORT: process.env.ALLOW_LEGACY_PORT };
  try {
    fs.writeFileSync(arquivo, 'DB_NAME=FabricaPneus\r\nPORT=5080\r\nHOST=127.0.0.1\r\n', 'utf8');
    delete process.env.ALLOW_LEGACY_PORT;
    process.env.PORT = '5080';
    const warnOriginal = console.warn;
    console.warn = () => {};
    let migrado;
    try { migrado = applyLegacyPortMigration(arquivo); } finally { console.warn = warnOriginal; }
    assert.equal(migrado, true);
    assert.equal(process.env.PORT, '5090');
    assert.match(fs.readFileSync(arquivo, 'utf8'), /PORT=5090/);
    assert.equal(applyLegacyPortMigration(arquivo), false);
  } finally {
    if (anteriores.PORT === undefined) delete process.env.PORT;
    else process.env.PORT = anteriores.PORT;
    if (anteriores.ALLOW_LEGACY_PORT === undefined) delete process.env.ALLOW_LEGACY_PORT;
    else process.env.ALLOW_LEGACY_PORT = anteriores.ALLOW_LEGACY_PORT;
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test('o projeto atual (index.html, database.js, package.json) não é alterado pelo boot', () => {
  const raiz = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(raiz, 'wwwroot', 'index.html'), 'utf8');
  assert.ok(!html.includes('boot.js'), 'index.html deve ficar intacto (boot injetado pelo servidor)');
  assert.match(html, /relatorios\.js/, 'a versão nova com relatórios deve continuar presente');
  const database = fs.readFileSync(path.join(raiz, 'src', 'database.js'), 'utf8');
  assert.match(database, /applySqlBatches/, 'os scripts sql/*.sql do projeto devem continuar no database.js');
  assert.ok(fs.readFileSync(path.join(raiz, 'wwwroot', 'js', 'boot.js'), 'utf8').includes('/api/status'));
});

// Simula o SQL Server para provar a economia de comandos no segundo boot.
function driverFalso() {
  const estado = { meta: null, queries: [] };

  class RequestFalso {
    constructor() { this.params = {}; }
    input(nome, _tipo, valor) { this.params[nome] = valor; return this; }
    async query(texto) {
      estado.queries.push(texto);
      const vazio = { recordset: [], recordsets: [[]] };
      if (/SELECT valor FROM dbo\.schema_meta/.test(texto)) {
        return estado.meta
          ? { recordset: [{ valor: estado.meta }], recordsets: [[{ valor: estado.meta }]] }
          : vazio;
      }
      if (/INSERT INTO dbo\.schema_meta|UPDATE dbo\.schema_meta/.test(texto)) {
        estado.meta = this.params.versao;
      }
      return vazio;
    }
  }
  class PoolFalso {
    constructor(config) { this.config = config; }
    async connect() { return this; }
    request() { return new RequestFalso(); }
    async close() { return undefined; }
  }
  const sqlFalso = {
    ConnectionPool: PoolFalso,
    Request: RequestFalso,
    NVarChar: () => ({}),
    Int: () => ({}),
    Transaction: class {},
    ISOLATION_LEVEL: { SERIALIZABLE: 4 }
  };
  return { estado, sqlFalso };
}

test('fingerprint inclui schema.sql, todos os sql/*.sql e src/database.js', async () => {
  // Testa a função pura sem precisar do driver nativo do SQL Server.
  const envAnterior = {};
  for (const chave of ['DB_AUTH', 'DB_USER', 'DB_PASSWORD']) envAnterior[chave] = process.env[chave];
  process.env.DB_AUTH = 'sql';
  process.env.DB_USER = 'usuario';
  process.env.DB_PASSWORD = 'senha';
  const caminhoDatabase = require.resolve('../src/database');
  const caminhoBoot = require.resolve('../src/boot-database');
  delete require.cache[caminhoBoot];
  delete require.cache[caminhoDatabase];
  const mssqlPath = require.resolve('mssql');
  const cacheAnterior = require.cache[mssqlPath];
  const { sqlFalso } = driverFalso();
  require.cache[mssqlPath] = { id: mssqlPath, filename: mssqlPath, loaded: true, exports: sqlFalso, children: [], paths: [] };
  try {
    const { computeFingerprintFrom, computeFingerprint, sqlVersionFiles } =
      require('../src/boot-database');
    const arquivos = await sqlVersionFiles();
    const nomes = arquivos.map((a) => path.basename(a));
    assert.ok(nomes.includes('schema.sql'));
    assert.ok(nomes.includes('relatorios.sql'));
    assert.ok(nomes.includes('tipos-entidades.sql'));
    assert.ok(nomes.includes('vendedores.sql'));

    const base = [
      { nome: 'schema.sql', conteudo: 'CREATE TABLE X' },
      { nome: 'sql/relatorios.sql', conteudo: 'CREATE PROCEDURE usp_RelatorioVendas' }
    ];
    const versao = computeFingerprintFrom(base, 'codigo database.js');
    assert.equal(versao.length, 64);
    assert.notEqual(versao, computeFingerprintFrom(
      [{ ...base[0], conteudo: 'CREATE TABLE Y' }, base[1]], 'codigo database.js'
    ), 'mudar schema.sql deve mudar o hash');
    assert.notEqual(versao, computeFingerprintFrom(
      [base[0], { ...base[1], conteudo: 'ALTER PROCEDURE usp_RelatorioVendas' }], 'codigo database.js'
    ), 'editar sql/relatorios.sql deve mudar o hash e reimplantar a procedure');
    assert.notEqual(versao, computeFingerprintFrom(base, 'database.js alterado'),
      'mudar database.js deve mudar o hash');

    const real = await computeFingerprint();
    assert.equal(real.length, 64);
  } finally {
    delete require.cache[caminhoBoot];
    delete require.cache[caminhoDatabase];
    delete require.cache[mssqlPath];
    if (cacheAnterior) require.cache[mssqlPath] = cacheAnterior;
    for (const [chave, valor] of Object.entries(envAnterior)) {
      if (valor === undefined) delete process.env[chave];
      else process.env[chave] = valor;
    }
  }
});

test('boot rápido: o 2º boot não reaplica schema, migrações nem sql/*.sql', async () => {
  const caminhoMssql = require.resolve('mssql');
  const caminhoDatabase = require.resolve('../src/database');
  const caminhoBoot = require.resolve('../src/boot-database');
  const cacheAnterior = require.cache[caminhoMssql];
  const envAnterior = {};
  for (const chave of ['DB_AUTH', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'FORCE_SCHEMA_CHECK']) {
    envAnterior[chave] = process.env[chave];
  }

  try {
    process.env.DB_AUTH = 'sql';
    process.env.DB_USER = 'usuario';
    process.env.DB_PASSWORD = 'senha';
    process.env.DB_NAME = 'FabricaPneusTeste';
    delete process.env.FORCE_SCHEMA_CHECK;

    const { estado, sqlFalso } = driverFalso();
    require.cache[caminhoMssql] = {
      id: caminhoMssql, filename: caminhoMssql, loaded: true,
      exports: sqlFalso, children: [], paths: []
    };
    delete require.cache[caminhoDatabase];
    delete require.cache[caminhoBoot];

    const { initializeDatabaseFast, computeFingerprint } = require('../src/boot-database');
    const versao = await computeFingerprint();

    // 1º boot: sem versão gravada -> inicializador original roda tudo.
    await initializeDatabaseFast();
    assert.equal(estado.meta, versao, 'a versão do schema deve ser gravada no banco');
    const primeiro = estado.queries.length;
    assert.ok(estado.queries.some((q) => /dbo\.logins/.test(q)), 'schema.sql deve rodar');
    assert.ok(estado.queries.some((q) => /dbo\.seq_servico/.test(q)), 'migrações devem rodar');
    assert.ok(estado.queries.some((q) => /usp_RelatorioVendas/.test(q)),
      'sql/relatorios.sql (procedure do projeto atual) deve rodar no 1º boot');
    assert.ok(primeiro > 40, `esperava dezenas de comandos, veio ${primeiro}`);

    await new Promise((resolve) => setImmediate(resolve));
    estado.queries.length = 0;

    // 2º boot: só a verificação da versão.
    await initializeDatabaseFast();
    const segundo = estado.queries.slice();
    assert.ok(segundo.length <= 2, `boot rápido deveria usar no máximo 2 consultas, usou ${segundo.length}`);
    assert.ok(segundo.every((q) => /dbo\.schema_meta/.test(q)), 'nenhum lote de schema/migração/SQL deve ser reenviado');
    assert.equal(estado.meta, versao);

    // FORCE_SCHEMA_CHECK=true volta a rodar tudo (ex.: procedure apagada no banco).
    estado.queries.length = 0;
    process.env.FORCE_SCHEMA_CHECK = 'true';
    await initializeDatabaseFast();
    assert.ok(estado.queries.some((q) => /usp_RelatorioVendas/.test(q)),
      'FORCE_SCHEMA_CHECK deve reaplicar os scripts de relatórios');
  } finally {
    delete require.cache[caminhoBoot];
    delete require.cache[caminhoDatabase];
    delete require.cache[caminhoMssql];
    if (cacheAnterior) require.cache[caminhoMssql] = cacheAnterior;
    for (const [chave, valor] of Object.entries(envAnterior)) {
      if (valor === undefined) delete process.env[chave];
      else process.env[chave] = valor;
    }
  }
});
