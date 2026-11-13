'use strict';

const { sql } = require('./sql');
const { setAuditContext, clearAuditContext } = require('../audit-context');

// Executa um bloco dentro de uma transação SQL Server, garantindo que o
// contexto de auditoria seja definido no início e limpo antes de commit/rollback.
async function withTransaction(pool, audit, work, isolationLevel) {
  const transaction = new sql.Transaction(pool);
  await transaction.begin(isolationLevel ?? sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    await setAuditContext(transaction, audit);
    const result = await work(transaction);
    await clearAuditContext(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await clearAuditContext(transaction).catch(() => {});
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

module.exports = { withTransaction };
