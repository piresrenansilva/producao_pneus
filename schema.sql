IF OBJECT_ID('dbo.seq_servico', 'SO') IS NULL
    CREATE SEQUENCE dbo.seq_servico START WITH 1 INCREMENT BY 1;
GO

IF OBJECT_ID('dbo.seq_cliente', 'SO') IS NULL
    CREATE SEQUENCE dbo.seq_cliente START WITH 1 INCREMENT BY 1;
GO

IF OBJECT_ID('dbo.logins', 'U') IS NULL
CREATE TABLE dbo.logins (
    id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_logins PRIMARY KEY,
    criadoEm datetime2 NOT NULL CONSTRAINT DF_logins_criadoEm DEFAULT SYSDATETIME(),
    usuario nvarchar(100) NOT NULL CONSTRAINT UQ_logins_usuario UNIQUE,
    senhaHash nvarchar(200) NOT NULL
);
GO

IF OBJECT_ID('dbo.clientes', 'U') IS NULL
CREATE TABLE dbo.clientes (
    id          uniqueidentifier NOT NULL CONSTRAINT DF_clientes_id DEFAULT NEWID() CONSTRAINT PK_clientes PRIMARY KEY,
    criadoEm    datetime2        NOT NULL CONSTRAINT DF_clientes_criadoEm DEFAULT SYSDATETIME(),
    codigo      nvarchar(20)     NOT NULL CONSTRAINT DF_clientes_codigo DEFAULT (N'CLI-' + FORMAT(NEXT VALUE FOR dbo.seq_cliente, '0000')),
    nome        nvarchar(200)    NOT NULL,
    tipo        nvarchar(30)     NULL,
    documento   nvarchar(30)     NULL,
    telefone    nvarchar(30)     NULL,
    email       nvarchar(150)    NULL,
    limiteCredito decimal(12,2)  NOT NULL CONSTRAINT DF_clientes_limiteCredito DEFAULT 0,
    cep         nvarchar(12)     NULL,
    endereco    nvarchar(200)    NULL,
    numero      nvarchar(20)     NULL,
    complemento nvarchar(100)    NULL,
    bairro      nvarchar(100)    NULL,
    cidade      nvarchar(100)    NULL,
    estado      nvarchar(2)      NULL,
    status      nvarchar(30)     NOT NULL CONSTRAINT DF_clientes_status DEFAULT N'Ativo',
    obs         nvarchar(500)    NULL
);
GO

IF OBJECT_ID('dbo.veiculos', 'U') IS NULL
CREATE TABLE dbo.veiculos (
    id       uniqueidentifier NOT NULL CONSTRAINT DF_veiculos_id DEFAULT NEWID() CONSTRAINT PK_veiculos PRIMARY KEY,
    criadoEm datetime2        NOT NULL CONSTRAINT DF_veiculos_criadoEm DEFAULT SYSDATETIME(),
    clienteId uniqueidentifier NOT NULL CONSTRAINT FK_veiculos_clientes REFERENCES dbo.clientes(id),
    marca    nvarchar(80)     NULL,
    modelo   nvarchar(120)    NOT NULL,
    ano      nvarchar(10)     NULL,
    placa    nvarchar(12)     NULL,
    medidaPneu nvarchar(60)   NULL,
    status   nvarchar(30)     NOT NULL CONSTRAINT DF_veiculos_status DEFAULT N'Ativo'
);
GO

IF OBJECT_ID('dbo.servicos', 'U') IS NULL
CREATE TABLE dbo.servicos (
    id       uniqueidentifier NOT NULL CONSTRAINT DF_servicos_id DEFAULT NEWID() CONSTRAINT PK_servicos PRIMARY KEY,
    criadoEm datetime2        NOT NULL CONSTRAINT DF_servicos_criadoEm DEFAULT SYSDATETIME(),
    codigo   nvarchar(20)     NOT NULL CONSTRAINT DF_servicos_codigo DEFAULT (N'SRV-' + FORMAT(NEXT VALUE FOR dbo.seq_servico, '0000')),
    nome     nvarchar(150)    NOT NULL,
    descricao nvarchar(300)  NULL,
    preco    decimal(12,2)   NOT NULL CONSTRAINT DF_servicos_preco DEFAULT 0,
    status   nvarchar(30)    NOT NULL CONSTRAINT DF_servicos_status DEFAULT N'Ativo'
);
GO

IF OBJECT_ID('dbo.produtoCategoria', 'U') IS NULL
CREATE TABLE dbo.produtoCategoria (
    id       int IDENTITY(1,1) NOT NULL CONSTRAINT PK_produtoCategoria PRIMARY KEY,
    criadoEm datetime2         NOT NULL CONSTRAINT DF_produtoCategoria_criadoEm DEFAULT SYSDATETIME(),
    nome     nvarchar(80)      NOT NULL CONSTRAINT UQ_produtoCategoria_nome UNIQUE,
    status   nvarchar(30)      NOT NULL CONSTRAINT DF_produtoCategoria_status DEFAULT N'Ativo'
);
GO

-- Categorias iniciais do cadastro de produtos (insere somente se ainda não existirem).
IF NOT EXISTS (SELECT 1 FROM dbo.produtoCategoria WHERE nome = N'Revenda')
    INSERT INTO dbo.produtoCategoria (nome) VALUES (N'Revenda');
IF NOT EXISTS (SELECT 1 FROM dbo.produtoCategoria WHERE nome = N'Carcaça')
    INSERT INTO dbo.produtoCategoria (nome) VALUES (N'Carcaça');
GO

IF OBJECT_ID('dbo.produtos', 'U') IS NULL
CREATE TABLE dbo.produtos (
    id uniqueidentifier NOT NULL CONSTRAINT DF_produtos_id DEFAULT NEWID() CONSTRAINT PK_produtos PRIMARY KEY,
    criadoEm datetime2 NOT NULL CONSTRAINT DF_produtos_criadoEm DEFAULT SYSDATETIME(),
    produtoId nvarchar(60) NULL,
    nome nvarchar(200) NOT NULL,
    categoriaId int NULL CONSTRAINT FK_produtos_produtoCategoria REFERENCES dbo.produtoCategoria (id),
    categoria nvarchar(80) NULL, -- legado: texto antigo; a categoria vem de produtoCategoria
    modelo nvarchar(120) NULL,
    medida nvarchar(60) NULL,
    unidade nvarchar(20) NULL,
    preco decimal(12,2) NOT NULL CONSTRAINT DF_produtos_preco DEFAULT 0,
    custo decimal(12,2) NOT NULL CONSTRAINT DF_produtos_custo DEFAULT 0,
    obs nvarchar(500) NULL,
    status nvarchar(30) NOT NULL CONSTRAINT DF_produtos_status DEFAULT N'Ativo'
);
GO

IF OBJECT_ID('dbo.seq_pedido', 'SO') IS NULL
    CREATE SEQUENCE dbo.seq_pedido START WITH 1 INCREMENT BY 1;
GO

IF OBJECT_ID('dbo.carcacas', 'U') IS NULL
CREATE TABLE dbo.carcacas (
    id        uniqueidentifier NOT NULL CONSTRAINT DF_carcacas_id DEFAULT NEWID() CONSTRAINT PK_carcacas PRIMARY KEY,
    criadoEm  datetime2        NOT NULL CONSTRAINT DF_carcacas_criadoEm DEFAULT SYSDATETIME(),
    fogo      nvarchar(50)  NULL,
    medida    nvarchar(50)  NULL,
    dono      nvarchar(150) NULL,
    origem    nvarchar(30)  NULL,
    qtd       int           NOT NULL CONSTRAINT DF_carcacas_qtd DEFAULT 0,
    valorUnitario decimal(12, 2) NOT NULL CONSTRAINT DF_carcacas_valorUnitario DEFAULT (0),
    entrada   date          NULL,
    status    nvarchar(30)  NULL,
    obs       nvarchar(500) NULL
);
GO

IF OBJECT_ID('dbo.estoque', 'U') IS NULL
CREATE TABLE dbo.estoque (
    id        uniqueidentifier NOT NULL CONSTRAINT DF_estoque_id DEFAULT NEWID() CONSTRAINT PK_estoque PRIMARY KEY,
    criadoEm  datetime2        NOT NULL CONSTRAINT DF_estoque_criadoEm DEFAULT SYSDATETIME(),
    produtoId nvarchar(60)  NULL,
    produtoRef uniqueidentifier NULL,
    item      nvarchar(200) NULL,
    medida    nvarchar(50)  NULL,
    tipo      nvarchar(30)  NULL,
    qtd       int           NOT NULL CONSTRAINT DF_estoque_qtd DEFAULT 0,
    minimo    int           NOT NULL CONSTRAINT DF_estoque_minimo DEFAULT 0,
    [local]   nvarchar(100) NULL
);
GO

IF OBJECT_ID('dbo.producao', 'U') IS NULL
CREATE TABLE dbo.producao (
    id        uniqueidentifier NOT NULL CONSTRAINT DF_producao_id DEFAULT NEWID() CONSTRAINT PK_producao PRIMARY KEY,
    criadoEm  datetime2        NOT NULL CONSTRAINT DF_producao_criadoEm DEFAULT SYSDATETIME(),
    data      date          NULL,
    turno     nvarchar(20)  NULL,
    medida    nvarchar(50)  NULL,
    qtd       int           NOT NULL CONSTRAINT DF_producao_qtd DEFAULT 0,
    carcacas  int           NOT NULL CONSTRAINT DF_producao_carcacas DEFAULT 0,
    banda     nvarchar(100) NULL,
    operador  nvarchar(100) NULL,
    status    nvarchar(30)  NULL
);
GO

IF OBJECT_ID('dbo.cargas', 'U') IS NULL
CREATE TABLE dbo.cargas (
    id        uniqueidentifier NOT NULL CONSTRAINT DF_cargas_id DEFAULT NEWID() CONSTRAINT PK_cargas PRIMARY KEY,
    criadoEm  datetime2        NOT NULL CONSTRAINT DF_cargas_criadoEm DEFAULT SYSDATETIME(),
    tipo      nvarchar(20)  NULL,
    data      date          NULL,
    placa         nvarchar(20)  NULL,
    motorista     nvarchar(100) NULL,
    funcionario   nvarchar(100) NULL,
    transportadora nvarchar(150) NULL,
    pedidoId      uniqueidentifier NULL,
    parceiro      nvarchar(150) NULL,
    nf            nvarchar(30)  NULL,
    qtd           int           NOT NULL CONSTRAINT DF_cargas_qtd DEFAULT 0,
    item          nvarchar(200) NULL,
    status        nvarchar(30)  NULL,
    estoqueMovimentado bit      NOT NULL CONSTRAINT DF_cargas_estoqueMovimentado DEFAULT 0
);
GO

IF OBJECT_ID('dbo.pedidos', 'U') IS NULL
CREATE TABLE dbo.pedidos (
    id         uniqueidentifier NOT NULL CONSTRAINT DF_pedidos_id DEFAULT NEWID() CONSTRAINT PK_pedidos PRIMARY KEY,
    criadoEm   datetime2        NOT NULL CONSTRAINT DF_pedidos_criadoEm DEFAULT SYSDATETIME(),
    numero     nvarchar(20)  NOT NULL,
    data       date          NULL,
    cliente    nvarchar(150) NULL,
    pagamento  nvarchar(30)  NULL,
    status     nvarchar(30)  NULL,
    vendedor   nvarchar(100) NULL,
    previsao   date          NULL,
    obs        nvarchar(500) NULL,
    clienteId uniqueidentifier NULL,
    veiculoId uniqueidentifier NULL,
    descontoPercentual decimal(5,2) NOT NULL CONSTRAINT DF_pedidos_descontoPercentual DEFAULT 0,
    descontoValor decimal(12,2) NOT NULL CONSTRAINT DF_pedidos_descontoValor DEFAULT 0,
    box nvarchar(100) NULL,
    agendamento date NULL,
    horario nvarchar(10) NULL
);
GO

IF OBJECT_ID('dbo.pedido_itens', 'U') IS NULL
CREATE TABLE dbo.pedido_itens (
    id         uniqueidentifier NOT NULL CONSTRAINT DF_pedido_itens_id DEFAULT NEWID() CONSTRAINT PK_pedido_itens PRIMARY KEY,
    criadoEm   datetime2        NOT NULL CONSTRAINT DF_pedido_itens_criadoEm DEFAULT SYSDATETIME(),
    pedidoId   uniqueidentifier NOT NULL CONSTRAINT FK_pedido_itens_pedido REFERENCES dbo.pedidos (id) ON DELETE CASCADE,
    produtoId  nvarchar(50)  NULL,
    descricao  nvarchar(200) NULL,
    medida     nvarchar(50)  NULL,
    qtd        int           NOT NULL CONSTRAINT DF_pedido_itens_qtd DEFAULT 0,
    unitario   decimal(12,2) NOT NULL CONSTRAINT DF_pedido_itens_unitario DEFAULT 0,
    tipo       nvarchar(20) NOT NULL CONSTRAINT DF_pedido_itens_tipo DEFAULT N'pneu',
    produtoRef uniqueidentifier NULL,
    servicoRef uniqueidentifier NULL
);
GO

IF COL_LENGTH('dbo.clientes', 'limiteCredito') IS NULL
    ALTER TABLE dbo.clientes ADD limiteCredito decimal(12,2) NOT NULL CONSTRAINT DF_clientes_limiteCredito DEFAULT 0;
IF COL_LENGTH('dbo.pedidos', 'clienteId') IS NULL
    ALTER TABLE dbo.pedidos ADD clienteId uniqueidentifier NULL;
IF COL_LENGTH('dbo.pedidos', 'veiculoId') IS NULL
    ALTER TABLE dbo.pedidos ADD veiculoId uniqueidentifier NULL;
IF COL_LENGTH('dbo.pedidos', 'descontoPercentual') IS NULL
    ALTER TABLE dbo.pedidos ADD descontoPercentual decimal(5,2) NOT NULL CONSTRAINT DF_pedidos_descontoPercentual DEFAULT 0;
IF COL_LENGTH('dbo.pedidos', 'descontoValor') IS NULL
    ALTER TABLE dbo.pedidos ADD descontoValor decimal(12,2) NOT NULL CONSTRAINT DF_pedidos_descontoValor DEFAULT 0;
IF COL_LENGTH('dbo.pedidos', 'box') IS NULL
    ALTER TABLE dbo.pedidos ADD box nvarchar(100) NULL;
IF COL_LENGTH('dbo.pedidos', 'agendamento') IS NULL
    ALTER TABLE dbo.pedidos ADD agendamento date NULL;
IF COL_LENGTH('dbo.pedidos', 'horario') IS NULL
    ALTER TABLE dbo.pedidos ADD horario nvarchar(10) NULL;
IF COL_LENGTH('dbo.pedido_itens', 'tipo') IS NULL
    ALTER TABLE dbo.pedido_itens ADD tipo nvarchar(20) NOT NULL CONSTRAINT DF_pedido_itens_tipo DEFAULT N'pneu';
IF COL_LENGTH('dbo.pedido_itens', 'produtoRef') IS NULL
    ALTER TABLE dbo.pedido_itens ADD produtoRef uniqueidentifier NULL;
IF COL_LENGTH('dbo.pedido_itens', 'servicoRef') IS NULL
    ALTER TABLE dbo.pedido_itens ADD servicoRef uniqueidentifier NULL;
IF COL_LENGTH('dbo.cargas', 'funcionario') IS NULL
    ALTER TABLE dbo.cargas ADD funcionario nvarchar(100) NULL;
IF COL_LENGTH('dbo.cargas', 'transportadora') IS NULL
    ALTER TABLE dbo.cargas ADD transportadora nvarchar(150) NULL;
IF COL_LENGTH('dbo.cargas', 'pedidoId') IS NULL
    ALTER TABLE dbo.cargas ADD pedidoId uniqueidentifier NULL;
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID('dbo.cargas') AND name = 'FK_cargas_pedidos'
)
    ALTER TABLE dbo.cargas ADD CONSTRAINT FK_cargas_pedidos
        FOREIGN KEY (pedidoId) REFERENCES dbo.pedidos(id) ON DELETE SET NULL;
GO

-- financeiro, contas e boletos são as tabelas antigas (legado). Desde a aba
-- Financeiro unificada, os dados vivem em dbo.financeiro_lancamentos; estas
-- tabelas ficam só como cópia de segurança dos registros migrados.
IF OBJECT_ID('dbo.financeiro', 'U') IS NULL
CREATE TABLE dbo.financeiro (
    id         uniqueidentifier NOT NULL CONSTRAINT DF_financeiro_id DEFAULT NEWID() CONSTRAINT PK_financeiro PRIMARY KEY,
    criadoEm   datetime2        NOT NULL CONSTRAINT DF_financeiro_criadoEm DEFAULT SYSDATETIME(),
    data       date          NULL,
    tipo       nvarchar(20)  NULL,
    categoria  nvarchar(30)  NULL,
    descricao  nvarchar(200) NULL,
    valor      decimal(12,2) NOT NULL CONSTRAINT DF_financeiro_valor DEFAULT 0
);
GO

IF OBJECT_ID('dbo.contas', 'U') IS NULL
CREATE TABLE dbo.contas (
    id          uniqueidentifier NOT NULL CONSTRAINT DF_contas_id DEFAULT NEWID() CONSTRAINT PK_contas PRIMARY KEY,
    criadoEm    datetime2        NOT NULL CONSTRAINT DF_contas_criadoEm DEFAULT SYSDATETIME(),
    codigo      nvarchar(20)     NOT NULL CONSTRAINT DF_contas_codigo DEFAULT (N'CTA-' + FORMAT(NEXT VALUE FOR dbo.seq_cliente, '0000')),
    tipo        nvarchar(20)  NULL,
    pessoa      nvarchar(150) NULL,
    descricao   nvarchar(200) NULL,
    valor       decimal(12,2) NOT NULL CONSTRAINT DF_contas_valor DEFAULT 0,
    vencimento  date          NULL,
    boleto      nvarchar(100) NULL,
    status      nvarchar(30)  NULL
);
GO

IF OBJECT_ID('dbo.boletos', 'U') IS NULL
CREATE TABLE dbo.boletos (
    id          uniqueidentifier NOT NULL CONSTRAINT DF_boletos_id DEFAULT NEWID() CONSTRAINT PK_boletos PRIMARY KEY,
    criadoEm    datetime2        NOT NULL CONSTRAINT DF_boletos_criadoEm DEFAULT SYSDATETIME(),
    codigo      nvarchar(20)     NOT NULL CONSTRAINT DF_boletos_codigo DEFAULT (N'BOL-' + FORMAT(NEXT VALUE FOR dbo.seq_cliente, '0000')),
    origem      nvarchar(20)  NULL,
    pessoa      nvarchar(150) NULL,
    numero      nvarchar(100) NULL,
    valor       decimal(12,2) NOT NULL CONSTRAINT DF_boletos_valor DEFAULT 0,
    vencimento  date          NULL,
    ref         nvarchar(150) NULL,
    status      nvarchar(30)  NULL
);
GO

IF OBJECT_ID('dbo.seq_carcaca_ordem', 'SO') IS NULL
    CREATE SEQUENCE dbo.seq_carcaca_ordem START WITH 1 INCREMENT BY 1;
GO

-- Apontamentos de entrada de carcaças: cada ordem seleciona produtos da
-- categoria Carcaça com quantidade e valor unitário, e guarda o total.
IF OBJECT_ID('dbo.carcaca_ordens', 'U') IS NULL
CREATE TABLE dbo.carcaca_ordens (
    id         uniqueidentifier NOT NULL CONSTRAINT DF_carcaca_ordens_id DEFAULT NEWID() CONSTRAINT PK_carcaca_ordens PRIMARY KEY,
    criadoEm   datetime2        NOT NULL CONSTRAINT DF_carcaca_ordens_criadoEm DEFAULT SYSDATETIME(),
    numero     nvarchar(20)     NOT NULL,
    data       date             NULL,
    dono       nvarchar(150)    NULL,
    origem     nvarchar(30)     NULL,
    status     nvarchar(30)     NOT NULL CONSTRAINT DF_carcaca_ordens_status DEFAULT N'registrado',
    obs        nvarchar(500)    NULL,
    total      decimal(12,2)    NOT NULL CONSTRAINT DF_carcaca_ordens_total DEFAULT 0
);
GO

IF OBJECT_ID('dbo.carcaca_ordem_itens', 'U') IS NULL
CREATE TABLE dbo.carcaca_ordem_itens (
    id            uniqueidentifier NOT NULL CONSTRAINT DF_carcaca_ordem_itens_id DEFAULT NEWID() CONSTRAINT PK_carcaca_ordem_itens PRIMARY KEY,
    criadoEm      datetime2        NOT NULL CONSTRAINT DF_carcaca_ordem_itens_criadoEm DEFAULT SYSDATETIME(),
    ordemId       uniqueidentifier NOT NULL CONSTRAINT FK_carcaca_ordem_itens_ordem REFERENCES dbo.carcaca_ordens(id) ON DELETE CASCADE,
    produtoRef    uniqueidentifier NULL,
    produtoId     nvarchar(60)     NULL,
    item          nvarchar(200)    NULL,
    medida        nvarchar(60)     NULL,
    qtd           int              NOT NULL CONSTRAINT DF_carcaca_ordem_itens_qtd DEFAULT 0,
    valorUnitario decimal(12, 2)   NOT NULL CONSTRAINT DF_carcaca_ordem_itens_valorUnitario DEFAULT 0,
    valorTotal    decimal(12, 2)   NOT NULL CONSTRAINT DF_carcaca_ordem_itens_valorTotal DEFAULT 0
);
GO

-- Itens (produtos) de cada movimento de carga/descarga. A descarga dá entrada
-- no estoque e a carga dá saída (exceto carga vinculada a venda, cuja baixa já
-- acontece no faturamento). produtoId/item/medida guardam uma cópia do cadastro.
IF OBJECT_ID('dbo.carga_itens', 'U') IS NULL
CREATE TABLE dbo.carga_itens (
    id         uniqueidentifier NOT NULL CONSTRAINT DF_carga_itens_id DEFAULT NEWID() CONSTRAINT PK_carga_itens PRIMARY KEY,
    criadoEm   datetime2        NOT NULL CONSTRAINT DF_carga_itens_criadoEm DEFAULT SYSDATETIME(),
    cargaId    uniqueidentifier NOT NULL CONSTRAINT FK_carga_itens_carga REFERENCES dbo.cargas (id) ON DELETE CASCADE,
    produtoRef uniqueidentifier NULL,
    produtoId  nvarchar(60)     NULL,
    item       nvarchar(200)    NULL,
    medida     nvarchar(60)     NULL,
    qtd        int              NOT NULL CONSTRAINT DF_carga_itens_qtd DEFAULT 0
);
GO

-- ===== Financeiro unificado =====
-- Categorias dos lançamentos financeiros. tipo = 'receber', 'pagar' ou NULL (serve aos dois).
IF OBJECT_ID('dbo.financeiroCategoria', 'U') IS NULL
CREATE TABLE dbo.financeiroCategoria (
    id       int IDENTITY(1,1) NOT NULL CONSTRAINT PK_financeiroCategoria PRIMARY KEY,
    criadoEm datetime2         NOT NULL CONSTRAINT DF_financeiroCategoria_criadoEm DEFAULT SYSDATETIME(),
    nome     nvarchar(80)      NOT NULL CONSTRAINT UQ_financeiroCategoria_nome UNIQUE,
    tipo     nvarchar(10)      NULL,
    status   nvarchar(30)      NOT NULL CONSTRAINT DF_financeiroCategoria_status DEFAULT N'Ativo'
);
GO

INSERT INTO dbo.financeiroCategoria (nome, tipo)
SELECT v.nome, v.tipo
FROM (VALUES
    (N'Boleto de cliente', N'receber'),
    (N'Venda', N'receber'),
    (N'Recapagem / serviço', N'receber'),
    (N'Boleto da empresa', N'pagar'),
    (N'Despesa com funcionário', N'pagar'),
    (N'Salários / folha', N'pagar'),
    (N'Fornecedor', N'pagar'),
    (N'Insumos / matéria-prima', N'pagar'),
    (N'Frete', N'pagar'),
    (N'Energia / água / internet', N'pagar'),
    (N'Impostos', N'pagar'),
    (N'Aluguel', N'pagar'),
    (N'Outros', NULL)
) v (nome, tipo)
WHERE NOT EXISTS (SELECT 1 FROM dbo.financeiroCategoria c WHERE c.nome = v.nome);
GO

IF OBJECT_ID('dbo.seq_financeiro', 'SO') IS NULL
    CREATE SEQUENCE dbo.seq_financeiro START WITH 1 INCREMENT BY 1;
GO

-- Lançamentos financeiros: contas a receber e a pagar, boletos (de clientes e
-- da empresa), despesas com funcionários e o caixa (lançamentos já pagos).
-- status: pendente | pago | cancelado ("vencido" = pendente com vencimento passado).
-- origem: manual | venda (gerado ao faturar venda a boleto/a prazo) | migrado.
IF OBJECT_ID('dbo.financeiro_lancamentos', 'U') IS NULL
CREATE TABLE dbo.financeiro_lancamentos (
    id             uniqueidentifier NOT NULL CONSTRAINT DF_financeiro_lancamentos_id DEFAULT NEWID() CONSTRAINT PK_financeiro_lancamentos PRIMARY KEY,
    criadoEm       datetime2        NOT NULL CONSTRAINT DF_financeiro_lancamentos_criadoEm DEFAULT SYSDATETIME(),
    codigo         nvarchar(20)     NOT NULL CONSTRAINT DF_financeiro_lancamentos_codigo DEFAULT (N'FIN-' + FORMAT(NEXT VALUE FOR dbo.seq_financeiro, '00000')),
    tipo           nvarchar(10)     NOT NULL,
    categoriaId    int              NULL CONSTRAINT FK_financeiro_lancamentos_categoria REFERENCES dbo.financeiroCategoria (id),
    entidadeId     uniqueidentifier NULL CONSTRAINT FK_financeiro_lancamentos_entidade REFERENCES dbo.clientes (id) ON DELETE SET NULL,
    pessoa         nvarchar(150)    NULL,
    descricao      nvarchar(200)    NULL,
    documento      nvarchar(100)    NULL,
    valor          decimal(12,2)    NOT NULL CONSTRAINT DF_financeiro_lancamentos_valor DEFAULT 0,
    emissao        date             NULL,
    vencimento     date             NULL,
    pagamento      date             NULL,
    formaPagamento nvarchar(30)     NULL,
    status         nvarchar(20)     NOT NULL CONSTRAINT DF_financeiro_lancamentos_status DEFAULT N'pendente',
    origem         nvarchar(20)     NOT NULL CONSTRAINT DF_financeiro_lancamentos_origem DEFAULT N'manual',
    pedidoId       uniqueidentifier NULL CONSTRAINT FK_financeiro_lancamentos_pedido REFERENCES dbo.pedidos (id) ON DELETE SET NULL,
    obs            nvarchar(500)    NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.financeiro_lancamentos') AND name = 'IX_financeiro_lancamentos_status_vencimento')
    CREATE INDEX IX_financeiro_lancamentos_status_vencimento ON dbo.financeiro_lancamentos (status, vencimento);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.financeiro_lancamentos') AND name = 'IX_financeiro_lancamentos_pedidoId')
    CREATE INDEX IX_financeiro_lancamentos_pedidoId ON dbo.financeiro_lancamentos (pedidoId) WHERE pedidoId IS NOT NULL;
GO
