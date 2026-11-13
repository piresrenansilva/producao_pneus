'use strict';

const { tables } = require('../../definitions');
const { conflict, notFound } = require('../../errors');
const { auditFromRequest } = require('../../audit-context');
const { getAllData, createRow, updateRow, deleteRow } = require('../../services/crud');
const { asyncRoute } = require('../middleware/async-route');

function registerDataRoutes(app, { runtime }) {
  app.get(
    '/api/dados',
    asyncRoute(async (req, res) => {
      res.json(await getAllData(runtime.getPool()));
    })
  );

  // CRUD genérico somente para tabelas explicitamente listadas. Pedidos/itens
  // passam pelo fluxo próprio de venda para impedir inconsistência de estoque.
  app.post(
    '/api/:route',
    asyncRoute(async (req, res) => {
      const route = req.params.route;
      if (!tables[route]) throw notFound('Rota não encontrada.');
      res.json(await createRow(runtime.getPool(), route, req.body, auditFromRequest(req)));
    })
  );

  app.put(
    '/api/:route/:id',
    asyncRoute(async (req, res) => {
      const route = req.params.route;
      if (!tables[route]) throw notFound('Rota não encontrada.');
      if (route === 'itens') throw conflict('Itens de pedidos são gerenciados pelo fluxo de vendas.');
      if (route === 'carcacaOrdens' || route === 'carcacaOrdemItens') {
        throw conflict('Apontamentos de carcaças são gerenciados pelo fluxo de apontamentos.');
      }
      await updateRow(runtime.getPool(), route, req.params.id, req.body, auditFromRequest(req));
      res.status(204).end();
    })
  );

  app.delete(
    '/api/:route/:id',
    asyncRoute(async (req, res) => {
      const route = req.params.route;
      if (!tables[route]) throw notFound('Rota não encontrada.');
      if (route === 'itens') throw conflict('Itens de pedidos são gerenciados pelo fluxo de vendas.');
      if (route === 'carcacaOrdemItens') {
        throw conflict('Itens de apontamentos são gerenciados pelo fluxo de apontamentos.');
      }
      await deleteRow(runtime.getPool(), route, req.params.id, auditFromRequest(req));
      res.status(204).end();
    })
  );
}

module.exports = { registerDataRoutes };
