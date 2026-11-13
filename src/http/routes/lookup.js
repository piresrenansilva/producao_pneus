'use strict';

const { badRequest, notFound } = require('../../errors');
const { asyncRoute } = require('../middleware/async-route');

function registerLookupRoutes(app, { logger = console } = {}) {
  app.get(
    '/api/consulta/cnpj/:cnpj',
    asyncRoute(async (req, res) => {
      const cnpj = String(req.params.cnpj || '').replace(/\D/g, '');
      if (cnpj.length !== 14) throw badRequest('CNPJ deve ter 14 dígitos.');
      const providers = [
        `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
        `https://www.receitaws.com.br/v1/cnpj/${cnpj}`
      ];
      for (const url of providers) {
        try {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(15000),
            headers: { 'User-Agent': 'FabricaPneus/1.0' }
          });
          if (response.ok) {
            const text = await response.text();
            res.type('application/json').send(text);
            return;
          }
        } catch (error) {
          logger.warn('Falha em provedor de CNPJ:', error.message);
        }
      }
      throw notFound('CNPJ não encontrado.');
    })
  );

  app.get(
    '/api/consulta/cep/:cep',
    asyncRoute(async (req, res) => {
      const cep = String(req.params.cep || '').replace(/\D/g, '');
      if (cep.length !== 8) throw badRequest('CEP deve ter 8 dígitos.');
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
          signal: AbortSignal.timeout(10000)
        });
        if (response.ok) {
          const data = await response.json();
          if (!data.erro) return res.json(data);
        }
      } catch (error) {
        logger.warn('Falha ao consultar o provedor de CEP:', error.message);
      }
      throw notFound('CEP não encontrado.');
    })
  );
}

module.exports = { registerLookupRoutes };
