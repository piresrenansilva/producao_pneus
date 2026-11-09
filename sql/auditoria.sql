/*
  Auditoria de alterações de dados operacionais.
  Não inclui a tabela de logins, senhas, tokens ou consultas de leitura.
  Os registros são inseridos na mesma transação das alterações auditadas.
*/
IF OBJECT_ID(N'dbo.auditoria_operacoes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.auditoria_operacoes (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_auditoria_operacoes PRIMARY KEY,
    dataUtc datetime2(3) NOT NULL CONSTRAINT DF_auditoria_dataUtc DEFAULT SYSUTCDATETIME(),
    usuario nvarchar(100) NULL,
    loginSql nvarchar(128) NULL,
    requisicaoId uniqueidentifier NULL,
    origem nvarchar(200) NULL,
    tabela sysname NOT NULL,
    registroId nvarchar(100) NOT NULL,
    operacao nvarchar(10) NOT NULL,
    anterior nvarchar(max) NULL,
    posterior nvarchar(max) NULL
  );
  CREATE INDEX IX_auditoria_registro ON dbo.auditoria_operacoes (tabela, registroId, id);
  CREATE INDEX IX_auditoria_requisicao ON dbo.auditoria_operacoes (requisicaoId, id);
  CREATE INDEX IX_auditoria_data ON dbo.auditoria_operacoes (dataUtc, id);
END;
GO

/* Não auditar logins: snapshots jamais devem copiar hash de senha. */
DECLARE @tabela sysname, @chave sysname, @comando nvarchar(max);
DECLARE tabelas CURSOR LOCAL FAST_FORWARD FOR
  SELECT tabela, chave FROM (VALUES
    (N'clientes', N'id'), (N'veiculos', N'id'), (N'servicos', N'id'),
    (N'produtoCategoria', N'id'), (N'produtos', N'id'), (N'carcacas', N'id'),
    (N'estoque', N'id'), (N'producao', N'id'), (N'cargas', N'id'),
    (N'carga_itens', N'id'), (N'pedidos', N'id'), (N'pedido_itens', N'id'),
    (N'carcaca_ordens', N'id'), (N'carcaca_ordem_itens', N'id'),
    (N'CondicoesPagamento', N'Codigo'), (N'financeiroCategoria', N'id'),
    (N'financeiro_lancamentos', N'id'), (N'tiposEntidades', N'id')
  ) AS lista(tabela, chave);
OPEN tabelas;
FETCH NEXT FROM tabelas INTO @tabela, @chave;
WHILE @@FETCH_STATUS = 0
BEGIN
  IF OBJECT_ID(N'dbo.' + QUOTENAME(@tabela), N'U') IS NULL
    THROW 50010, 'Tabela operacional ausente; a auditoria nao pode ser instalada parcialmente.', 1;
  SET @comando = N'CREATE OR ALTER TRIGGER dbo.' + QUOTENAME(N'trg_auditoria_' + @tabela) + N'
    ON dbo.' + QUOTENAME(@tabela) + N' AFTER INSERT, UPDATE, DELETE AS
    BEGIN
      SET NOCOUNT ON;
      INSERT INTO dbo.auditoria_operacoes
        (usuario, loginSql, requisicaoId, origem, tabela, registroId, operacao, anterior, posterior)
      SELECT TRY_CONVERT(nvarchar(100), SESSION_CONTEXT(N''gp_usuario'')), SUSER_SNAME(),
        TRY_CONVERT(uniqueidentifier, SESSION_CONTEXT(N''gp_requisicao'')),
        TRY_CONVERT(nvarchar(200), SESSION_CONTEXT(N''gp_origem'')), N''' + REPLACE(@tabela, N'''', N'''''') + N''',
        CONVERT(nvarchar(100), COALESCE(i.' + QUOTENAME(@chave) + N', d.' + QUOTENAME(@chave) + N')),
        CASE WHEN d.' + QUOTENAME(@chave) + N' IS NULL THEN N''INSERT''
             WHEN i.' + QUOTENAME(@chave) + N' IS NULL THEN N''DELETE'' ELSE N''UPDATE'' END,
        dados.anterior, dados.posterior
      FROM inserted i
      FULL OUTER JOIN deleted d ON i.' + QUOTENAME(@chave) + N' = d.' + QUOTENAME(@chave) + N'
      CROSS APPLY (SELECT
        CASE WHEN d.' + QUOTENAME(@chave) + N' IS NULL THEN NULL ELSE
          (SELECT d.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) END AS anterior,
        CASE WHEN i.' + QUOTENAME(@chave) + N' IS NULL THEN NULL ELSE
          (SELECT i.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) END AS posterior
      ) dados
      WHERE dados.anterior IS NULL OR dados.posterior IS NULL
         OR dados.anterior COLLATE Latin1_General_100_BIN2 <> dados.posterior COLLATE Latin1_General_100_BIN2;
    END;';
  EXEC sys.sp_executesql @comando;
  FETCH NEXT FROM tabelas INTO @tabela, @chave;
END;
CLOSE tabelas;
DEALLOCATE tabelas;
GO
