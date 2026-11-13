'use strict';

// Rate limiting em memória para endpoints de autenticação. Inclui limpeza
// periódica para não crescer indefinidamente em instalações de longa duração.
function createAuthRateLimit({ windowMs = 15 * 60 * 1000, maxAttempts = 12, now = Date.now } = {}) {
  const attempts = new Map();
  let lastSweep = 0;

  function keyFor(req) {
    return `${req.ip}:${req.path}`;
  }

  function sweep(time) {
    if (time - lastSweep < windowMs) return;
    lastSweep = time;
    for (const [key, bucket] of attempts) {
      if (time - bucket.startedAt > windowMs) attempts.delete(key);
    }
  }

  function middleware(req, res, next) {
    const time = now();
    sweep(time);
    const key = keyFor(req);
    let bucket = attempts.get(key);
    if (!bucket || time - bucket.startedAt > windowMs) {
      bucket = { startedAt: time, count: 0 };
      attempts.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > maxAttempts) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.startedAt + windowMs - time) / 1000)));
      return res.status(429).json({ detail: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
    }
    return next();
  }

  function clear(req) {
    attempts.delete(keyFor(req));
  }

  return { middleware, clear };
}

module.exports = { createAuthRateLimit };
