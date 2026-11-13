'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function setupDriver(failInsert = false) {
  const calls = [];
  class Transaction {
    async begin() {
      calls.push('begin');
    }
    async commit() {
      calls.push('commit');
    }
    async rollback() {
      calls.push('rollback');
    }
  }
  class Request {
    constructor() {
      this.inputs = {};
    }
    input(key, _type, value) {
      this.inputs[key] = value;
      return this;
    }
    async query(query) {
      if (query.includes("@key=N'gp_usuario'")) {
        calls.push(this.inputs.usuario ? ['context', this.inputs.usuario, this.inputs.requisicao] : 'clear');
        return { recordset: [], rowsAffected: [] };
      }
      if (query.includes('INSERT INTO dbo.')) {
        calls.push('insert');
        if (failInsert) throw new Error('falha simulada');
        return { recordset: [{ id: '12345678-1234-1234-1234-123456789012' }], rowsAffected: [1] };
      }
      throw new Error('SQL inesperado no teste');
    }
  }
  return {
    calls,
    sql: {
      Request,
      Transaction,
      ISOLATION_LEVEL: { READ_COMMITTED: 1 },
      NVarChar: () => 'texto',
      UniqueIdentifier: 'guid'
    }
  };
}

async function testCreateRow(failInsert) {
  const database = require.resolve('../src/database');
  const operations = require.resolve('../src/operations');
  const context = require.resolve('../src/audit-context');
  const saved = [database, operations, context].map((file) => require.cache[file]);
  const fake = setupDriver(failInsert);
  try {
    require.cache[database] = {
      id: database,
      filename: database,
      loaded: true,
      exports: { sql: fake.sql },
      children: [],
      paths: []
    };
    delete require.cache[operations];
    delete require.cache[context];
    const { createRow } = require('../src/operations');
    const { auditFromRequest } = require('../src/audit-context');
    const audit = auditFromRequest({
      method: 'POST',
      path: '/api/servicos',
      user: { sub: 'OPERADOR' },
      body: { usuario: 'FALSO' }
    });
    assert.equal(audit.usuario, 'OPERADOR');
    assert.match(audit.requisicao, /^[a-f0-9-]{36}$/);
    if (failInsert) {
      await assert.rejects(createRow({}, 'servicos', { nome: 'Exemplo' }, audit), /falha simulada/);
    } else await createRow({}, 'servicos', { nome: 'Exemplo' }, audit);
    assert.deepEqual(
      fake.calls.map((c) => (Array.isArray(c) ? c[0] : c)),
      ['begin', 'context', 'insert', 'clear', failInsert ? 'rollback' : 'commit']
    );
  } finally {
    [database, operations, context].forEach((file, i) => {
      delete require.cache[file];
      if (saved[i]) require.cache[file] = saved[i];
    });
  }
}

test('contexto acompanha alteração e é limpo antes do commit', () => testCreateRow(false));
test('em falha o contexto é limpo e a transação é revertida', () => testCreateRow(true));
test('tabelas de login e auditoria não são auditadas recursivamente', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../sql/auditoria.sql'), 'utf8');
  assert.match(sql, /N'estoque'/);
  assert.match(sql, /N'pedidos'/);
  assert.doesNotMatch(sql, /\(N'logins'/);
  assert.doesNotMatch(sql, /\(N'auditoria_operacoes'/);
});
