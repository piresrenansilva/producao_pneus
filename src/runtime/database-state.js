'use strict';

// Estado de inicialização do banco em segundo plano. O HTTP sobe imediatamente;
// as chamadas /api aguardam (ou tentam novamente) até o pool existir.
function createDatabaseRuntime({ appVersion, url, retryDelayMs = 5000, logger = console } = {}) {
  let pool = null;
  let dbStage = 'Aguardando o banco de dados';
  let dbError = null;
  let dbInit = null;
  let lastFailureAt = 0;
  const bootStartedAt = Date.now();
  let bootDatabaseModule = null;

  function loadBootDatabase() {
    if (!bootDatabaseModule) bootDatabaseModule = require('../boot-database');
    return bootDatabaseModule;
  }

  function markStage(message) {
    dbStage = message;
    logger.log(`[boot] ${message} (+${((Date.now() - bootStartedAt) / 1000).toFixed(1)}s)`);
  }

  function registerFailure(error) {
    dbError = error;
    lastFailureAt = Date.now();
    dbInit = null;
    markStage(`Falha ao preparar o banco: ${error.message}`);
    logger.error('Não foi possível preparar o banco de dados.');
    logger.error(error.stack || error.message);
    if (error.number) logger.error(`Código SQL Server: ${error.number}`);
    return Promise.reject(error);
  }

  function prepare() {
    if (pool) return Promise.resolve(pool);
    if (dbError && Date.now() - lastFailureAt < retryDelayMs) return Promise.reject(dbError);
    if (!dbInit) {
      dbError = null;
      try {
        dbInit = Promise.resolve(loadBootDatabase().initializeDatabaseFast(markStage))
          .then((readyPool) => {
            pool = readyPool;
            markStage('Banco pronto — sistema liberado.');
            return pool;
          })
          .catch(registerFailure);
      } catch (error) {
        return registerFailure(error);
      }
    }
    return dbInit;
  }

  function status() {
    return {
      pronto: Boolean(pool),
      etapa: dbStage,
      erro: dbError ? dbError.message || String(dbError) : null,
      versao: appVersion,
      url
    };
  }

  function shouldRetry() {
    return !pool && dbError && Date.now() - lastFailureAt >= retryDelayMs;
  }

  async function close() {
    if (pool) await pool.close().catch(() => {});
    pool = null;
  }

  return {
    prepare,
    getPool: () => pool,
    status,
    shouldRetry,
    close,
    markStage
  };
}

module.exports = { createDatabaseRuntime };
