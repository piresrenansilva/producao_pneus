const crypto = require('node:crypto');
const { HttpError } = require('./errors');

const ITERATIONS = 600_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = crypto.pbkdf2Sync(password, salt, ITERATIONS, HASH_BYTES, 'sha256');
  return `$pbkdf2-sha256$${ITERATIONS}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 5 || parts[1] !== 'pbkdf2-sha256') return false;
  const iterations = Number(parts[2]);
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 2_000_000) return false;
  try {
    const salt = Buffer.from(parts[3], 'base64');
    const expected = Buffer.from(parts[4], 'base64');
    if (salt.length !== SALT_BYTES || expected.length !== HASH_BYTES) return false;
    const actual = crypto.pbkdf2Sync(password, salt, iterations, expected.length, 'sha256');
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signingKey() {
  const key = process.env.JWT_KEY;
  if (!key || Buffer.byteLength(key, 'utf8') < 32) {
    throw new Error('JWT_KEY deve existir e ter pelo menos 32 bytes. Configure-a no arquivo .env.');
  }
  return Buffer.from(key, 'utf8');
}

function createToken(username) {
  const key = signingKey();
  const minutes = Number(process.env.JWT_EXPIRES_MINUTES || 480);
  if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('JWT_EXPIRES_MINUTES deve ser positivo.');
  const now = Math.floor(Date.now() / 1000);
  const issuer = process.env.JWT_ISSUER || 'FabricaPneus';
  const audience = process.env.JWT_AUDIENCE || 'FabricaPneusApp';
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    sub: username,
    name: username,
    role: 'Admin',
    iss: issuer,
    aud: audience,
    iat: now,
    exp: now + Math.floor(minutes * 60)
  }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', key).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function verifyToken(token) {
  const key = signingKey();
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (header.alg !== 'HS256') return null;
    const unsigned = `${parts[0]}.${parts[1]}`;
    const expected = crypto.createHmac('sha256', key).update(unsigned).digest();
    const actual = Buffer.from(parts[2], 'base64url');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    if (payload.iss !== (process.env.JWT_ISSUER || 'FabricaPneus')) return null;
    if (payload.aud !== (process.env.JWT_AUDIENCE || 'FabricaPneusApp')) return null;
    if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000) - 300) return null;
    if (payload.nbf && payload.nbf > Math.floor(Date.now() / 1000) + 300) return null;
    return payload;
  } catch {
    return null;
  }
}

function requireAuthentication(req, res, next) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const payload = match ? verifyToken(match[1]) : null;
  if (!payload) return res.status(401).json({ detail: 'Sessão expirada. Faça login novamente.' });
  req.user = payload;
  return next();
}

function ensureValidLoginBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Informe usuário e senha.');
  }
  const username = String(body.usuario || '').trim();
  const password = typeof body.senha === 'string' ? body.senha : '';
  if (!username || username.length > 100 || !password || password.length > 256) {
    throw new HttpError(400, 'Informe usuário e senha.');
  }
  return { username, password };
}

module.exports = {
  hashPassword,
  verifyPassword,
  createToken,
  verifyToken,
  requireAuthentication,
  ensureValidLoginBody
};
