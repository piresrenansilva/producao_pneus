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

IF OBJECT_ID('dbo.produtos', 'U') IS NULL
CREATE TABLE dbo.produtos (
    id uniqueidentifier NOT NULL CONSTRAINT DF_produtos_id DEFAULT NEWID() CONSTRAINT PK_produtos PRIMARY KEY,
    criadoEm datetime2 NOT NULL CONSTRAINT DF_produtos_criadoEm DEFAULT SYSDATETIME(),
    produtoId nvarchar(60) NULL,
    nome nvarchar(200) NOT NULL,
    categoria nvarchar(80) NULL,
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
    status        nvarchar(30)  NULL
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
