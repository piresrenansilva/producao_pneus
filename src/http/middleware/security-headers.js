'use strict';

// Cabeçalhos de segurança compatíveis com a interface atual (sem CSP rígida,
// pois ainda há scripts/estilos inline). Endurecer CSP é um próximo passo.
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
}

module.exports = { securityHeaders };
