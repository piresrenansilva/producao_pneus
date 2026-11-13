'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const { APP_VERSION } = require('../config');
const { requireAuthentication } = require('../auth');
const { registrarDevRoutes, injetarFlags, isEnabled } = require('../dev-panel');
const { requestContext } = require('./middleware/request-context');
const { securityHeaders } = require('./middleware/security-headers');
const { databaseGate } = require('./middleware/database-gate');
const { errorHandler } = require('./middleware/error-handler');
const { createAuthRateLimit } = require('./middleware/auth-rate-limit');
const { registerAuthRoutes } = require('./routes/auth');
const { registerReportRoutes } = require('./routes/reports');
const { registerLookupRoutes } = require('./routes/lookup');
const { registerSalesRoutes } = require('./routes/sales');
const { registerPdfRoutes } = require('./routes/pdf');
const { registerDataRoutes } = require('./routes/data');

function createApp({ runtime, rootDir = path.join(__dirname, '..', '..'), logger = console } = {}) {
  const app = express();
  const wwwroot = path.join(rootDir, 'wwwroot');
  const rateLimit = createAuthRateLimit();

  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(securityHeaders);
  app.use(express.json({ limit: '1mb' }));

  // Injeta a tela de boot no HTML sem editar wwwroot/index.html. O HTML é sempre
  // revalidado, então atualizações aparecem sem Ctrl+F5.
  let indexBaseCache = null;
  app.get(['/', '/index.html'], (req, res, next) => {
    try {
      if (!indexBaseCache || process.env.NODE_ENV === 'development') {
        const original = fs.readFileSync(path.join(wwwroot, 'index.html'), 'utf8');
        const injetado = `  <script src="/js/boot.js?v=${APP_VERSION}"></script>\n`;
        indexBaseCache = /<\/body>/i.test(original)
          ? original.replace(/<\/body>/i, `${injetado}</body>`)
          : original + injetado;
      }
      // As flags são relidas a cada request: editar dev-flags.json + F5 já aplica.
      res.set('Cache-Control', 'no-cache');
      res.type('html').send(injetarFlags(indexBaseCache));
    } catch (error) {
      next(error);
    }
  });

  app.use(
    express.static(wwwroot, {
      etag: true,
      maxAge: '1h',
      setHeaders(res, filePath) {
        if (/\.(html?|js|css)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
      }
    })
  );

  // Painel DEV: só localhost, e não depende do banco (útil para diagnosticar).
  registrarDevRoutes(app);

  // Módulo desligado no painel DEV: bloqueia ANTES do gate do banco e da autenticação.
  app.use('/api/relatorios/vendas', (req, res, next) => {
    if (!isEnabled('relatorios')) {
      return res.status(404).json({ detail: 'Módulo de relatórios desativado no painel DEV.' });
    }
    next();
  });

  app.get('/api/status', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(runtime.status());
    if (runtime.shouldRetry()) runtime.prepare().catch(() => {});
  });

  app.use('/api', databaseGate(runtime));

  registerAuthRoutes(app, { runtime, rateLimit });

  // A partir daqui, todas as rotas da API exigem JWT.
  app.use('/api', requireAuthentication);

  registerReportRoutes(app, { runtime });
  registerLookupRoutes(app, { logger });
  registerSalesRoutes(app, { runtime });
  registerPdfRoutes(app, { runtime });
  registerDataRoutes(app, { runtime });

  app.use('/api', (req, res) => res.status(404).json({ detail: 'Rota não encontrada.' }));
  app.use(errorHandler(logger));

  return app;
}

module.exports = { createApp };
