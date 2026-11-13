'use strict';

const { sql } = require('../core/sql');
const { hashPassword, verifyPassword, createToken, ensureValidLoginBody } = require('../auth');
const { badRequest, conflict } = require('../errors');
const { withTransaction } = require('../core/transaction');

async function loginStatus(pool) {
  const result = await pool
    .request()
    .query(
      'SELECT CONVERT(bit, CASE WHEN EXISTS (SELECT 1 FROM dbo.logins) THEN 1 ELSE 0 END) AS configurado'
    );
  return { configurado: Boolean(result.recordset[0]?.configurado) };
}

async function setupLogin(pool, body) {
  const { username, password } = ensureValidLoginBody(body);
  const confirmation = typeof body.confirmacaoSenha === 'string' ? body.confirmacaoSenha : '';
  if (password !== confirmation) throw badRequest('A confirmação da senha não corresponde.');
  if (username.length > 100) throw badRequest('O usuário deve ter entre 1 e 100 caracteres.');
  if (password.length < 6) throw badRequest('A senha deve ter pelo menos 6 caracteres.');
  if (password.length > 256) throw badRequest('A senha não pode exceder 256 caracteres.');

  const normalizedUser = username.toUpperCase();
  const passwordHash = hashPassword(password);

  await withTransaction(
    pool,
    null,
    async (transaction) => {
      const lockResult = await new sql.Request(transaction).query(`
        DECLARE @resultado int;
        EXEC @resultado = sys.sp_getapplock
          @Resource = N'FabricaPneus-LoginSetup',
          @LockMode = 'Exclusive',
          @LockOwner = 'Transaction',
          @LockTimeout = 10000;
        SELECT @resultado AS resultado;`);
      if (Number(lockResult.recordset[0]?.resultado) < 0) {
        throw conflict('A configuração inicial está ocupada. Tente novamente.');
      }

      const existing = await new sql.Request(transaction).query(
        'SELECT COUNT_BIG(1) AS quantidade FROM dbo.logins'
      );
      if (Number(existing.recordset[0]?.quantidade) !== 0) {
        throw conflict('O acesso inicial já foi configurado. Entre com seu usuário e senha.');
      }

      await new sql.Request(transaction)
        .input('usuario', sql.NVarChar(100), normalizedUser)
        .input('senhaHash', sql.NVarChar(200), passwordHash)
        .query('INSERT INTO dbo.logins (usuario, senhaHash) VALUES (@usuario, @senhaHash)');
    },
    sql.ISOLATION_LEVEL.SERIALIZABLE
  );

  return { token: createToken(normalizedUser), usuario: normalizedUser };
}

async function login(pool, body) {
  const { username, password } = ensureValidLoginBody(body);
  const normalizedUser = username.toUpperCase();
  const result = await pool
    .request()
    .input('usuario', sql.NVarChar(100), normalizedUser)
    .query('SELECT senhaHash FROM dbo.logins WHERE usuario = @usuario');
  const storedHash = result.recordset[0]?.senhaHash;
  if (!storedHash || !verifyPassword(password, storedHash)) return null;
  return { token: createToken(normalizedUser), usuario: normalizedUser };
}

module.exports = { loginStatus, setupLogin, login };
