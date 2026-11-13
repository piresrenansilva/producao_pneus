'use strict';

// Envolve handlers assíncronos para que rejeições cheguem ao middleware de erro.
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

module.exports = { asyncRoute };
