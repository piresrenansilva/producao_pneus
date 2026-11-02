/*
  Vendedores das vendas
  ---------------------
  O tipo de entidade de id 4 representa Vendedor. As vendas passam a guardar
  vendedorId, mantendo pedidos.vendedor como cópia histórica do nome.
*/

IF COL_LENGTH(N'dbo.pedidos', N'vendedorId') IS NULL
  ALTER TABLE dbo.pedidos ADD vendedorId uniqueidentifier NULL;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE parent_object_id = OBJECT_ID(N'dbo.pedidos')
    AND name = N'FK_pedidos_vendedor'
)
BEGIN
  ALTER TABLE dbo.pedidos
    ADD CONSTRAINT FK_pedidos_vendedor
    FOREIGN KEY (vendedorId) REFERENCES dbo.clientes(id);
END;
GO

/*
  Garante a entidade Padrão para o tipo Vendedor (4), independentemente de
  já existirem outros vendedores. Se ela tiver sido inativada, a reativa para
  que possa ser usada como escolha automática nas novas vendas.
*/
IF EXISTS (SELECT 1 FROM dbo.tiposEntidades WHERE id = 4)
BEGIN
  DECLARE @VendedorPadraoId uniqueidentifier;

  SELECT TOP (1) @VendedorPadraoId = id
  FROM dbo.clientes
  WHERE tipoEntidadeId = 4
    AND LTRIM(RTRIM(nome)) COLLATE Latin1_General_CI_AI = N'Padrão' COLLATE Latin1_General_CI_AI
  ORDER BY criadoEm, id;

  IF @VendedorPadraoId IS NULL
    INSERT INTO dbo.clientes (nome, tipo, tipoEntidadeId, status, obs)
    SELECT N'Padrão', tipo.nome, tipo.id, N'Ativo',
           N'Cadastro criado automaticamente como vendedor padrão das vendas.'
    FROM dbo.tiposEntidades tipo
    WHERE tipo.id = 4;
  ELSE
    UPDATE dbo.clientes
    SET status = N'Ativo'
    WHERE id = @VendedorPadraoId
      AND status = N'Inativo';
END;
GO

/* Relaciona vendas antigas ao vendedor do mesmo nome, quando houver. */
UPDATE pedido
SET vendedorId = vendedor.id
FROM dbo.pedidos pedido
CROSS APPLY (
  SELECT TOP (1) entidade.id
  FROM dbo.clientes entidade
  WHERE entidade.tipoEntidadeId = 4
    AND entidade.nome COLLATE Latin1_General_CI_AI = LTRIM(RTRIM(pedido.vendedor)) COLLATE Latin1_General_CI_AI
  ORDER BY CASE WHEN entidade.status = N'Inativo' THEN 1 ELSE 0 END, entidade.criadoEm, entidade.id
) vendedor
WHERE pedido.vendedorId IS NULL
  AND NULLIF(LTRIM(RTRIM(pedido.vendedor)), N'') IS NOT NULL;
GO

/* Vendas sem vendedor histórico passam a usar a entidade Padrão. */
UPDATE pedido
SET vendedorId = vendedor.id,
    vendedor = vendedor.nome
FROM dbo.pedidos pedido
CROSS APPLY (
  SELECT TOP (1) entidade.id, entidade.nome
  FROM dbo.clientes entidade
  WHERE entidade.tipoEntidadeId = 4
    AND entidade.status <> N'Inativo'
  ORDER BY CASE WHEN entidade.nome COLLATE Latin1_General_CI_AI = N'Padrão' COLLATE Latin1_General_CI_AI THEN 0 ELSE 1 END,
           entidade.criadoEm, entidade.id
) vendedor
WHERE pedido.vendedorId IS NULL;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID(N'dbo.pedidos') AND name = N'IX_pedidos_vendedorId'
)
  CREATE INDEX IX_pedidos_vendedorId ON dbo.pedidos(vendedorId) WHERE vendedorId IS NOT NULL;
GO
