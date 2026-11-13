'use strict';

const crypto = require('node:crypto');
const { sql } = require('./core/sql');

function auditFromRequest(req) {
  // Identidade vem do JWT validado pelo servidor, nunca do corpo da requisição.
  return {
    usuario: String(req.user?.sub || '').slice(0, 100) || null,
    requisicao: req.id || crypto.randomUUID(),
    origem: `${req.method} ${req.path}`.slice(0, 200)
  };
}

async function setAuditContext(transaction, audit) {
  await new sql.Request(transaction)
    .input('usuario', sql.NVarChar(100), audit?.usuario || null)
    .input('requisicao', sql.UniqueIdentifier, audit?.requisicao || null)
    .input('origem', sql.NVarChar(200), audit?.origem || null)
    .query(`EXEC sys.sp_set_session_context @key=N'gp_usuario', @value=@usuario;
            EXEC sys.sp_set_session_context @key=N'gp_requisicao', @value=@requisicao;
            EXEC sys.sp_set_session_context @key=N'gp_origem', @value=@origem;`);
}

async function clearAuditContext(transaction) {
  await new sql.Request(transaction).query(`
    EXEC sys.sp_set_session_context @key=N'gp_usuario', @value=NULL;
    EXEC sys.sp_set_session_context @key=N'gp_requisicao', @value=NULL;
    EXEC sys.sp_set_session_context @key=N'gp_origem', @value=NULL;`);
}

module.exports = { auditFromRequest, setAuditContext, clearAuditContext };
