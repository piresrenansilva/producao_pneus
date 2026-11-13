'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthRateLimit } = require('../src/http/middleware/auth-rate-limit');

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    }
  };
}

test('rate limit bloqueia após o máximo de tentativas e limpa com sucesso', () => {
  let now = 1000;
  const limiter = createAuthRateLimit({ windowMs: 1000, maxAttempts: 2, now: () => now });
  const req = { ip: '127.0.0.1', path: '/api/login' };

  let nextCalled = 0;
  const next = () => {
    nextCalled += 1;
  };

  limiter.middleware(req, fakeRes(), next);
  limiter.middleware(req, fakeRes(), next);
  const blocked = fakeRes();
  limiter.middleware(req, blocked, next);

  assert.equal(nextCalled, 2);
  assert.equal(blocked.statusCode, 429);
  assert.ok(blocked.headers['Retry-After']);

  limiter.clear(req);
  limiter.middleware(req, fakeRes(), next);
  assert.equal(nextCalled, 3);

  now += 2000;
  limiter.middleware(req, fakeRes(), next);
  assert.equal(nextCalled, 4, 'janela expirada deve reiniciar a contagem');
});
