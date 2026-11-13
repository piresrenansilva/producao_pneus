'use strict';

const crypto = require('node:crypto');

// Identificador por requisição para correlacionar logs, auditoria e respostas.
function requestContext(req, res, next) {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

module.exports = { requestContext };
