const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, createToken, verifyToken } = require('../src/auth');

test('hash PBKDF2 valida a senha e rejeita uma senha diferente', () => {
  const stored = hashPassword('UmaSenhaForte-123');
  assert.match(stored, /^\$pbkdf2-sha256\$600000\$/);
  assert.equal(verifyPassword('UmaSenhaForte-123', stored), true);
  assert.equal(verifyPassword('outra-senha', stored), false);
});

test('JWT assinado é aceito e assinatura alterada é rejeitada', () => {
  process.env.JWT_KEY = 'chave-local-de-teste-com-mais-de-trinta-e-dois-bytes';
  process.env.JWT_ISSUER = 'FabricaPneus';
  process.env.JWT_AUDIENCE = 'FabricaPneusApp';
  const token = createToken('USUARIO');
  assert.equal(verifyToken(token)?.sub, 'USUARIO');
  const altered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
  assert.equal(verifyToken(altered), null);
});
