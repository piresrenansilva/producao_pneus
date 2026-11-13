'use strict';

// Carrega o driver do SQL Server apenas no primeiro uso real. Isso mantém o
// servidor HTTP e a interface disponíveis imediatamente, mesmo que o driver
// nativo ou o SQL Server ainda não estejam prontos.
function loadDatabase() {
  return require('../database');
}

const sql = new Proxy(Object.create(null), {
  get(_target, property) {
    return loadDatabase().sql[property];
  }
});

module.exports = { sql, loadDatabase };
