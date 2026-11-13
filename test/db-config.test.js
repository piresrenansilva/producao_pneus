'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { databaseName, connectionStringFor } = require('../src/db-config');

test('DB_NAME é obrigatório e não utiliza um banco padrão', () => {
  for (const value of [undefined, '', '   ']) {
    assert.throws(() => databaseName({ DB_NAME: value }), /Defina DB_NAME/);
  }
  assert.equal(databaseName({ DB_NAME: 'MeuBanco_2026' }), 'MeuBanco_2026');
  assert.throws(() => databaseName({ DB_NAME: 'Banco;DROP DATABASE x' }), /caracteres não permitidos/);
});

test('DB_NAME prevalece sobre todos os nomes na connection string', () => {
  const base =
    'Driver={ODBC Driver 18 for SQL Server};Server=localhost;Database=Antigo;Initial Catalog=Outro;DATABASE=MaisUm;Trusted_Connection=Yes;';
  assert.equal(
    connectionStringFor(base, 'MeuBanco'),
    'Driver={ODBC Driver 18 for SQL Server};Server=localhost;Trusted_Connection=Yes;Database=MeuBanco;'
  );
  assert.equal(
    connectionStringFor(base, 'master'),
    'Driver={ODBC Driver 18 for SQL Server};Server=localhost;Trusted_Connection=Yes;Database=master;'
  );
});

test('preserva valores da connection string que contêm ponto e vírgula', () => {
  const base =
    'Driver={ODBC Driver 18 for SQL Server};PWD={segredo;Database=nao};Server="host;outro";Database=Velho;';
  assert.equal(
    connectionStringFor(base, 'Novo'),
    'Driver={ODBC Driver 18 for SQL Server};PWD={segredo;Database=nao};Server="host;outro";Database=Novo;'
  );
  assert.equal(
    connectionStringFor(base, null),
    'Driver={ODBC Driver 18 for SQL Server};PWD={segredo;Database=nao};Server="host;outro";'
  );
  assert.throws(() => connectionStringFor('PWD={incompleto;', 'Novo'), /inválida/);
  assert.equal(connectionStringFor('', 'Novo'), '');
});
