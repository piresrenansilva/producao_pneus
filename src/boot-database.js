'use strict';

// Camada de inicialização rápida. Este arquivo é NOVO e NÃO altera o
// src/database.js original — importante para quem tem modificações locais
// naquele arquivo: o comportamento dele continua exatamente o mesmo.
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { sql, initializeDatabase, configFor } = require('./database');
const { databaseName } = require('./db-config');

const raiz = path.join(__dirname, '..');

const META_DDL = `
IF OBJECT_ID('dbo.schema_meta', 'U') IS NULL
CREATE TABLE dbo.schema_meta (
  chave nvarchar(50) NOT NULL CONSTRAINT PK_schema_meta PRIMARY KEY,
  valor nvarchar(128) NOT NULL,
  atualizadoEm datetime2 NOT NULL CONSTRAINT DF_schema_meta_atualizadoEm DEFAULT SYSDATETIME()
);`;
const META_SELECT = `SELECT valor FROM dbo.schema_meta WHERE chave = N'schema'`;
const META_UPSERT = `
IF EXISTS (SELECT 1 FROM dbo.schema_meta WHERE chave = N'schema')
  UPDATE dbo.schema_meta SET valor = @versao, atualizadoEm = SYSDATETIME() WHERE chave = N'schema';
ELSE
  INSERT INTO dbo.schema_meta (chave, valor) VALUES (N'schema', @versao);`;

// Todos os arquivos que podem mudar a estrutura do banco:
//   - schema.sql (tabelas)
//   - sql/*.sql (tipos de entidades, vendedores e a procedure de relatórios)
//   - src/database.js (schema + migrações + ordem de aplicação dos scripts)
// Se qualquer um mudar, o hash muda e a estrutura é reaplicada por completo.
async function sqlVersionFiles() {
  const arquivos = [path.join(raiz, 'schema.sql')];
  const pasta = path.join(raiz, 'sql');
  try {
    const nomes = (await fs.readdir(pasta)).filter((nome) => /\.sql$/i.test(nome)).sort();
    for (const nome of nomes) arquivos.push(path.join(pasta, nome));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return arquivos;
}

function computeFingerprintFrom(sqlFiles, databaseSource) {
  const hash = crypto.createHash('sha256');
  hash.update('FabricaPneus/schema-v3\n');
  for (const arquivo of sqlFiles) {
    hash.update(`\n-- ${arquivo.nome} --\n`);
    hash.update(arquivo.conteudo);
  }
  hash.update('\n-- src/database.js --\n');
  hash.update(databaseSource);
  return hash.digest('hex');
}

async function computeFingerprint() {
  const caminhos = await sqlVersionFiles();
  const sqlFiles = await Promise.all(caminhos.map(async (caminho) => ({
    nome: path.relative(raiz, caminho).replace(/\\/g, '/'),
    conteudo: await fs.readFile(caminho, 'utf8')
  })));
  const databaseSource = await fs.readFile(path.join(__dirname, 'database.js'), 'utf8');
  return computeFingerprintFrom(sqlFiles, databaseSource);
}

function isMissingDatabaseError(error) {
  const code = Number(error?.number ?? error?.code);
  if (code === 4060 || code === 911) return true;
  const message = String(error?.message || '');
  return /cannot open database|database[^\n]*does not exist|não é possível abrir o banco|banco de dados[^\n]*não existe|invalid database/i.test(message);
}

async function openPool(database) {
  const candidate = new sql.ConnectionPool(configFor(database));
  try {
    return await candidate.connect();
  } catch (error) {
    await candidate.close().catch(() => {});
    throw error;
  }
}

async function gravarVersao(pool, versao) {
  await pool.request().query(META_DDL);
  await pool.request().input('versao', sql.NVarChar(128), versao).query(META_UPSERT);
}

// Devolve um pool pronto. No boot normal (nada mudou) são apenas 2 consultas
// leves. Quando algo mudou, delega ao inicializador ORIGINAL, que continua
// responsável por criar o banco, aplicar schema.sql, as migrações e os
// scripts sql/*.sql (inclusive a procedure dbo.usp_RelatorioVendas).
async function initializeDatabaseFast(onProgress = () => {}) {
  const dbName = databaseName();
  const versao = await computeFingerprint();

  onProgress('Conectando ao SQL Server...');
  let sondagem;
  try {
    sondagem = await openPool(dbName);
  } catch (error) {
    if (!isMissingDatabaseError(error)) throw error;
    onProgress(`Criando o banco ${dbName} (primeira instalação)...`);
    const completo = await initializeDatabase();
    await gravarVersao(completo, versao);
    return completo;
  }

  try {
    onProgress('Verificando a versão do schema...');
    await sondagem.request().query(META_DDL);
    const atual = await sondagem.request().query(META_SELECT);
    const gravado = String(atual.recordset?.[0]?.valor || '');

    // CAMINHO RÁPIDO: estrutura idêntica à do último boot.
    if (gravado === versao && process.env.FORCE_SCHEMA_CHECK !== 'true') {
      onProgress('Estrutura já atualizada: schema e migrações pulados (boot rápido).');
      return sondagem;
    }

    // Algo mudou (ou FORCE_SCHEMA_CHECK): roda o inicializador original.
    onProgress('Atualizando a estrutura (schema.sql, migrações e sql/*.sql)...');
    await sondagem.close();
    sondagem = null;
    const completo = await initializeDatabase();
    await gravarVersao(completo, versao);
    onProgress('Schema, migrações e scripts SQL concluídos.');
    return completo;
  } catch (error) {
    if (sondagem) await sondagem.close().catch(() => {});
    throw error;
  }
}

module.exports = { initializeDatabaseFast, computeFingerprint, computeFingerprintFrom, sqlVersionFiles };
