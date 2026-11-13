'use strict';

const { createOrderPdf, createCarcacaOrdemPdf, createCargaPdf } = require('../../pdf');
const { asyncRoute } = require('../middleware/async-route');

function sendPdf(res, pdf) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
  res.setHeader('Content-Length', pdf.buffer.length);
  res.send(pdf.buffer);
}

function registerPdfRoutes(app, { runtime }) {
  app.get(
    '/api/pedidos/:id/pdf',
    asyncRoute(async (req, res) => {
      sendPdf(res, await createOrderPdf(runtime.getPool(), req.params.id));
    })
  );
  app.get(
    '/api/carcaca-ordens/:id/pdf',
    asyncRoute(async (req, res) => {
      sendPdf(res, await createCarcacaOrdemPdf(runtime.getPool(), req.params.id));
    })
  );
  app.get(
    '/api/cargas/:id/pdf',
    asyncRoute(async (req, res) => {
      sendPdf(res, await createCargaPdf(runtime.getPool(), req.params.id));
    })
  );
}

module.exports = { registerPdfRoutes };
