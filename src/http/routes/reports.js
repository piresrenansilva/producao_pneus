'use strict';

const { notFound } = require('../../errors');
const { getSalesReport } = require('../../reports');
const { isEnabled } = require('../../dev-panel');
const { asyncRoute } = require('../middleware/async-route');

function registerReportRoutes(app, { runtime }) {
  app.get(
    '/api/relatorios/vendas',
    asyncRoute(async (req, res) => {
      if (!isEnabled('relatorios')) throw notFound('Módulo de relatórios desativado no painel DEV.');
      res.json(await getSalesReport(runtime.getPool(), req.query));
    })
  );
}

module.exports = { registerReportRoutes };
