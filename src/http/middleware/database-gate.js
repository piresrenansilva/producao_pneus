'use strict';

// Bloqueia chamadas /api enquanto o pool não está pronto. A tela de boot faz
// polling em /api/status; aqui devolvemos 503 com a etapa atual para diagnóstico.
function databaseGate(runtime) {
  return (req, res, next) => {
    if (runtime.getPool()) return next();
    runtime.prepare().then(
      () => next(),
      (error) =>
        res.status(503).json({
          detail: `Não foi possível acessar o SQL Server: ${
            error.message || runtime.status().etapa
          }. Confira o serviço e a configuração no .env; o sistema tenta novamente em instantes.`,
          etapa: runtime.status().etapa
        })
    );
  };
}

module.exports = { databaseGate };
