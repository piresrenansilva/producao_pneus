'use strict';

const { HttpError } = require('../../errors');

function errorHandler(logger = console) {
  return (error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ detail: error.detail });
    }
    if (error?.number === 547 || error?.number === 2601 || error?.number === 2627) {
      return res.status(409).json({
        detail: 'A operação viola uma regra do banco de dados. Verifique vínculos e valores duplicados.'
      });
    }
    logger.error(`Erro na aplicação${req.id ? ` [${req.id}]` : ''}:`, error);
    return res.status(500).json({ detail: 'Erro interno no servidor.' });
  };
}

module.exports = { errorHandler };
