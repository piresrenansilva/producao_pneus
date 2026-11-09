/*
  Tipos de entidades
  ------------------
  Centraliza as opções usadas no campo "Tipo" do cadastro de entidades.
  O texto antigo em clientes.tipo é preservado por compatibilidade; o novo
  vínculo clientes.tipoEntidadeId é a fonte de verdade para novos registros.
*/

IF OBJECT_ID(N'dbo.tiposEntidades', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.tiposEntidades (
    id        int IDENTITY(1,1) NOT NULL CONSTRAINT PK_tiposEntidades PRIMARY KEY,
    criadoEm  datetime2         NOT NULL CONSTRAINT DF_tiposEntidades_criadoEm DEFAULT SYSDATETIME(),
    nome      nvarchar(80)      NOT NULL CONSTRAINT UQ_tiposEntidades_nome UNIQUE,
    status    nvarchar(30)      NOT NULL CONSTRAINT DF_tiposEntidades_status DEFAULT N'Ativo'
  );
END;
GO

/* Opções iniciais. A empresa pode cadastrar outras diretamente na tabela. */
INSERT INTO dbo.tiposEntidades (nome, status)
SELECT padrao.nome, N'Ativo'
FROM (VALUES (N'Cliente'), (N'Fornecedor'), (N'Funcionário')) AS padrao(nome)
WHERE NOT EXISTS (
  SELECT 1
  FROM dbo.tiposEntidades existente
  WHERE existente.nome COLLATE Latin1_General_CI_AI = padrao.nome COLLATE Latin1_General_CI_AI
);
GO

/* A aplicação identifica Vendedor pelo id 4. Reserve esse id antes de
   importar tipos antigos, sem alterar um cadastro existente por engano. */
IF EXISTS (
  SELECT 1 FROM dbo.tiposEntidades
  WHERE id = 4 AND LTRIM(RTRIM(nome)) COLLATE Latin1_General_CI_AI <> N'Vendedor' COLLATE Latin1_General_CI_AI
)
  THROW 50001, 'O tipo de entidade id 4 ja pertence a outro cadastro. Verifique dbo.tiposEntidades antes de continuar.', 1;

IF EXISTS (
  SELECT 1 FROM dbo.tiposEntidades
  WHERE id <> 4 AND LTRIM(RTRIM(nome)) COLLATE Latin1_General_CI_AI = N'Vendedor' COLLATE Latin1_General_CI_AI
)
  THROW 50002, 'O tipo Vendedor ja existe com id diferente de 4. Verifique dbo.tiposEntidades antes de continuar.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.tiposEntidades WHERE id = 4)
BEGIN
  BEGIN TRY
    SET IDENTITY_INSERT dbo.tiposEntidades ON;
    INSERT INTO dbo.tiposEntidades (id, nome, status) VALUES (4, N'Vendedor', N'Ativo');
    SET IDENTITY_INSERT dbo.tiposEntidades OFF;
  END TRY
  BEGIN CATCH
    SET IDENTITY_INSERT dbo.tiposEntidades OFF;
    THROW;
  END CATCH;
END
ELSE
  UPDATE dbo.tiposEntidades SET status = N'Ativo' WHERE id = 4 AND status <> N'Ativo';
GO

IF COL_LENGTH(N'dbo.clientes', N'tipoEntidadeId') IS NULL
  ALTER TABLE dbo.clientes ADD tipoEntidadeId int NULL;
GO

/* Mantém todos os tipos que já existiam em clientes antes da mudança. */
INSERT INTO dbo.tiposEntidades (nome, status)
SELECT legados.nome, N'Ativo'
FROM (
  SELECT DISTINCT CONVERT(nvarchar(80), LTRIM(RTRIM(tipo))) AS nome
  FROM dbo.clientes
  WHERE NULLIF(LTRIM(RTRIM(tipo)), N'') IS NOT NULL
) AS legados
WHERE NOT EXISTS (
  SELECT 1
  FROM dbo.tiposEntidades existente
  WHERE existente.nome COLLATE Latin1_General_CI_AI = legados.nome COLLATE Latin1_General_CI_AI
);
GO

/* Vincula os cadastros antigos sem apagar ou alterar o texto histórico. */
UPDATE cliente
SET tipoEntidadeId = tipo.id
FROM dbo.clientes cliente
JOIN dbo.tiposEntidades tipo
  ON tipo.nome COLLATE Latin1_General_CI_AI = LTRIM(RTRIM(cliente.tipo)) COLLATE Latin1_General_CI_AI
WHERE cliente.tipoEntidadeId IS NULL
  AND NULLIF(LTRIM(RTRIM(cliente.tipo)), N'') IS NOT NULL;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE parent_object_id = OBJECT_ID(N'dbo.clientes')
    AND name = N'FK_clientes_tiposEntidades'
)
BEGIN
  ALTER TABLE dbo.clientes
    ADD CONSTRAINT FK_clientes_tiposEntidades
    FOREIGN KEY (tipoEntidadeId) REFERENCES dbo.tiposEntidades(id);
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID(N'dbo.clientes') AND name = N'IX_clientes_tipoEntidadeId'
)
  CREATE INDEX IX_clientes_tipoEntidadeId ON dbo.clientes(tipoEntidadeId) WHERE tipoEntidadeId IS NOT NULL;
GO
