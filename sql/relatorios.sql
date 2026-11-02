/*
  Relatórios de vendas
  ---------------------
  Este arquivo é aplicado a cada inicialização pelo servidor. Mantém a procedure
  versionada junto com o código, sem exigir alteração manual no SQL Server.
*/

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID(N'dbo.pedidos') AND name = N'IX_pedidos_relatorio_vendas'
)
BEGIN
  CREATE INDEX IX_pedidos_relatorio_vendas
    ON dbo.pedidos (data, status)
    INCLUDE (id, vendedor, pagamento, condicaoPagamentoId, descontoValor);
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID(N'dbo.pedido_itens') AND name = N'IX_pedido_itens_relatorio_vendas'
)
BEGIN
  CREATE INDEX IX_pedido_itens_relatorio_vendas
    ON dbo.pedido_itens (pedidoId, tipo)
    INCLUDE (qtd, unitario);
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_RelatorioVendas
  @DataInicial date,
  @DataFinal date,
  @VendedorId uniqueidentifier = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF @DataInicial IS NULL OR @DataFinal IS NULL
    THROW 50001, N'Informe a data inicial e a data final do relatório.', 1;

  IF @DataFinal < @DataInicial
    THROW 50002, N'A data final não pode ser anterior à data inicial.', 1;

  IF DATEDIFF(day, @DataInicial, @DataFinal) > 3660
    THROW 50003, N'O período máximo para este relatório é de 10 anos.', 1;

  /*
    Cada pedido entra apenas uma vez em #Vendas. Isso é essencial: uma venda
    pode conter vários itens e parcelas, mas seu desconto deve ser somado uma
    única vez. O financeiro não é unido aqui para não multiplicar a venda por
    cada parcela gerada.
  */
  CREATE TABLE #PedidosDoPeriodo (
    id uniqueidentifier NOT NULL PRIMARY KEY,
    data date NOT NULL,
    vendedor nvarchar(100) NULL,
    formaPagamento nvarchar(100) NULL,
    descontoValor decimal(12, 2) NOT NULL
  );

  INSERT INTO #PedidosDoPeriodo (id, data, vendedor, formaPagamento, descontoValor)
  SELECT p.id,
         p.data,
         COALESCE(NULLIF(LTRIM(RTRIM(vendedor.nome)), N''), NULLIF(LTRIM(RTRIM(p.vendedor)), N'')),
         COALESCE(NULLIF(LTRIM(RTRIM(p.pagamento)), N''), cp.Descricao, N'Não informado'),
         ISNULL(p.descontoValor, 0)
  FROM dbo.pedidos p
  LEFT JOIN dbo.CondicoesPagamento cp ON cp.Codigo = p.condicaoPagamentoId
  LEFT JOIN dbo.clientes vendedor ON vendedor.id = p.vendedorId
  WHERE p.data >= @DataInicial
    AND p.data <= @DataFinal
    AND LOWER(LTRIM(RTRIM(ISNULL(p.status, N'')))) IN (N'faturado', N'pago')
    AND (@VendedorId IS NULL OR p.vendedorId = @VendedorId);

  SELECT i.pedidoId,
         CAST(SUM(CAST(ISNULL(i.qtd, 0) AS decimal(19, 2)) * ISNULL(i.unitario, 0)) AS decimal(19, 2)) AS valorBruto,
         CAST(SUM(CASE WHEN LOWER(LTRIM(RTRIM(ISNULL(i.tipo, N'pneu')))) <> N'servico'
                       THEN ISNULL(i.qtd, 0) ELSE 0 END) AS int) AS quantidadePneus,
         CAST(SUM(CASE WHEN LOWER(LTRIM(RTRIM(ISNULL(i.tipo, N'pneu')))) = N'servico'
                       THEN ISNULL(i.qtd, 0) ELSE 0 END) AS int) AS quantidadeServicos,
         CAST(SUM(CASE WHEN LOWER(LTRIM(RTRIM(ISNULL(i.tipo, N'pneu')))) <> N'servico'
                       THEN CAST(ISNULL(i.qtd, 0) AS decimal(19, 2)) * ISNULL(i.unitario, 0) ELSE 0 END) AS decimal(19, 2)) AS valorPneus,
         CAST(SUM(CASE WHEN LOWER(LTRIM(RTRIM(ISNULL(i.tipo, N'pneu')))) = N'servico'
                       THEN CAST(ISNULL(i.qtd, 0) AS decimal(19, 2)) * ISNULL(i.unitario, 0) ELSE 0 END) AS decimal(19, 2)) AS valorServicos
  INTO #ItensPorPedido
  FROM dbo.pedido_itens i
  INNER JOIN #PedidosDoPeriodo p ON p.id = i.pedidoId
  GROUP BY i.pedidoId;

  SELECT p.id,
         p.data,
         COALESCE(p.vendedor, N'Não informado') AS vendedor,
         p.formaPagamento,
         CAST(ISNULL(i.valorBruto, 0) AS decimal(19, 2)) AS valorBruto,
         CAST(ISNULL(p.descontoValor, 0) AS decimal(19, 2)) AS valorDesconto,
         CAST(CASE WHEN ISNULL(i.valorBruto, 0) > ISNULL(p.descontoValor, 0)
                   THEN ISNULL(i.valorBruto, 0) - ISNULL(p.descontoValor, 0)
                   ELSE 0 END AS decimal(19, 2)) AS valorLiquido,
         ISNULL(i.quantidadePneus, 0) AS quantidadePneus,
         ISNULL(i.quantidadeServicos, 0) AS quantidadeServicos,
         CAST(ISNULL(i.valorPneus, 0) AS decimal(19, 2)) AS valorPneus,
         CAST(ISNULL(i.valorServicos, 0) AS decimal(19, 2)) AS valorServicos
  INTO #Vendas
  FROM #PedidosDoPeriodo p
  LEFT JOIN #ItensPorPedido i ON i.pedidoId = p.id;

  -- 1. Indicadores gerais do período.
  SELECT CAST(COUNT(*) AS int) AS quantidadeVendas,
         ISNULL(SUM(quantidadePneus), 0) AS quantidadePneus,
         ISNULL(SUM(quantidadeServicos), 0) AS quantidadeServicos,
         CAST(ISNULL(SUM(valorPneus), 0) AS decimal(19, 2)) AS valorPneus,
         CAST(ISNULL(SUM(valorServicos), 0) AS decimal(19, 2)) AS valorServicos,
         CAST(ISNULL(SUM(valorBruto), 0) AS decimal(19, 2)) AS valorBruto,
         CAST(ISNULL(SUM(valorDesconto), 0) AS decimal(19, 2)) AS valorDesconto,
         CAST(ISNULL(SUM(valorLiquido), 0) AS decimal(19, 2)) AS valorLiquido,
         CAST(CASE WHEN COUNT(*) = 0 THEN 0 ELSE SUM(valorLiquido) / COUNT(*) END AS decimal(19, 2)) AS ticketMedio
  FROM #Vendas;

  -- 2. Totalização diária, usada tanto para períodos curtos quanto para o mês.
  SELECT CONVERT(char(10), data, 23) AS data,
         CAST(COUNT(*) AS int) AS quantidadeVendas,
         ISNULL(SUM(quantidadePneus), 0) AS quantidadePneus,
         ISNULL(SUM(quantidadeServicos), 0) AS quantidadeServicos,
         CAST(ISNULL(SUM(valorBruto), 0) AS decimal(19, 2)) AS valorBruto,
         CAST(ISNULL(SUM(valorDesconto), 0) AS decimal(19, 2)) AS valorDesconto,
         CAST(ISNULL(SUM(valorLiquido), 0) AS decimal(19, 2)) AS valorLiquido,
         CAST(CASE WHEN COUNT(*) = 0 THEN 0 ELSE SUM(valorLiquido) / COUNT(*) END AS decimal(19, 2)) AS ticketMedio
  FROM #Vendas
  GROUP BY data
  ORDER BY data;

  -- 3. Comparativo de vendas por vendedor.
  SELECT vendedor,
         CAST(COUNT(*) AS int) AS quantidadeVendas,
         ISNULL(SUM(quantidadePneus), 0) AS quantidadePneus,
         CAST(ISNULL(SUM(valorLiquido), 0) AS decimal(19, 2)) AS valorLiquido,
         CAST(CASE WHEN COUNT(*) = 0 THEN 0 ELSE SUM(valorLiquido) / COUNT(*) END AS decimal(19, 2)) AS ticketMedio
  FROM #Vendas
  GROUP BY vendedor
  ORDER BY valorLiquido DESC, vendedor;

  -- 4. Distribuição do faturamento pela condição de pagamento da venda.
  SELECT formaPagamento,
         CAST(COUNT(*) AS int) AS quantidadeVendas,
         CAST(ISNULL(SUM(valorLiquido), 0) AS decimal(19, 2)) AS valorLiquido
  FROM #Vendas
  GROUP BY formaPagamento
  ORDER BY valorLiquido DESC, formaPagamento;
END;
GO
