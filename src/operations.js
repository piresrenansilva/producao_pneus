'use strict';

// Fachada de compatibilidade: mantém os imports antigos (`require('./operations')`)
// enquanto a implementação fica separada por domínio em src/services.
const { parseGuid } = require('./core/validators');
const { normalizeSaleUnitPrice } = require('./sale-prices');
const { diasParcelas } = require('./services/payment-terms');
const crud = require('./services/crud');
const sales = require('./services/sales');
const carcassOrders = require('./services/carcass-orders');
const cargo = require('./services/cargo');

module.exports = {
  getAllData: crud.getAllData,
  createRow: crud.createRow,
  updateRow: crud.updateRow,
  deleteRow: crud.deleteRow,
  createOrUpdateSale: sales.createOrUpdateSale,
  createOrUpdateCarcacaOrdem: carcassOrders.createOrUpdateCarcacaOrdem,
  createOrUpdateCarga: cargo.createOrUpdateCarga,
  getOrderForPdf: sales.getOrderForPdf,
  getCarcacaOrdemForPdf: carcassOrders.getCarcacaOrdemForPdf,
  getCargaForPdf: cargo.getCargaForPdf,
  parseGuid,
  diasParcelas,
  normalizeSaleUnitPrice
};
