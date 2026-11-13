'use strict';

const { asyncRoute } = require('../middleware/async-route');
const { loginStatus, setupLogin, login } = require('../../services/authentication');

function registerAuthRoutes(app, { runtime, rateLimit }) {
  app.get(
    '/api/login/status',
    asyncRoute(async (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json(await loginStatus(runtime.getPool()));
    })
  );

  app.post(
    '/api/login/setup',
    rateLimit.middleware,
    asyncRoute(async (req, res) => {
      const result = await setupLogin(runtime.getPool(), req.body);
      rateLimit.clear(req);
      res.set('Cache-Control', 'no-store');
      res.json(result);
    })
  );

  app.post(
    '/api/login',
    rateLimit.middleware,
    asyncRoute(async (req, res) => {
      const result = await login(runtime.getPool(), req.body);
      if (!result) return res.status(401).end();
      rateLimit.clear(req);
      res.set('Cache-Control', 'no-store');
      return res.json(result);
    })
  );
}

module.exports = { registerAuthRoutes };
