'use strict';

const { auditFromRequest } = require('../../audit-context');
const { parseGuid } = require('../../core/validators');
const { createOrUpdateSale } = require('../../services/sales');
const { createOrUpdateCarcacaOrdem } = require('../../services/carcass-orders');
const { createOrUpdateCarga } = require('../../services/cargo');
const { asyncRoute } = require('../middleware/async-route');

function registerSalesRoutes(app, { runtime }) {
  app.post(
    '/api/vendas',
    asyncRoute(async (req, res) => {
      res.json(await createOrUpdateSale(runtime.getPool(), req.body, null, auditFromRequest(req)));
    })
  );
  app.put(
    '/api/vendas/:id',
    asyncRoute(async (req, res) => {
      const id = parseGuid(req.params.id, 'Identificador do pedido');
      res.json(await createOrUpdateSale(runtime.getPool(), req.body, id, auditFromRequest(req)));
    })
  );

  // Apontamentos de entrada de carcaças (ordem com itens e total).
  app.post(
    '/api/carcaca-ordens',
    asyncRoute(async (req, res) => {
      res.json(await createOrUpdateCarcacaOrdem(runtime.getPool(), req.body, null, auditFromRequest(req)));
    })
  );
  app.put(
    '/api/carcaca-ordens/:id',
    asyncRoute(async (req, res) => {
      const id = parseGuid(req.params.id, 'Identificador do apontamento');
      res.json(await createOrUpdateCarcacaOrdem(runtime.getPool(), req.body, id, auditFromRequest(req)));
    })
  );

  // Carga e descarga com vários produtos (movimenta o estoque).
  app.post(
    '/api/cargas',
    asyncRoute(async (req, res) => {
      res.json(await createOrUpdateCarga(runtime.getPool(), req.body, null, auditFromRequest(req)));
    })
  );
  app.put(
    '/api/cargas/:id',
    asyncRoute(async (req, res) => {
      const id = parseGuid(req.params.id, 'Identificador do movimento');
      res.json(await createOrUpdateCarga(runtime.getPool(), req.body, id, auditFromRequest(req)));
    })
  );
}

module.exports = { registerSalesRoutes };
