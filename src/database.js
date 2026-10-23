const fs = require('node:fs/promises');
const path = require('node:path');

const authMode = String(process.env.DB_AUTH || 'windows').toLowerCase();
let sql;
try {
  sql = authMode === 'windows' ? require('mssql/msnodesqlv8') : require('mssql');
} catch (error) {
  if (authMode === 'windows') {
    throw new Error('O driver de autenticação integrada do SQL Server não foi carregado. Rode npm install e verifique se o SQL Server ODBC Driver 18 está instalado. Detalhe: ' + error.message);
  }
  throw error;
}

function boolEnv(name, fallback) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'sim'].includes(String(value).toLowerCase());
}

function connectionStringFor(database) {
  const base = String(process.env.DB_CONNECTION_STRING || '').trim();
  if (!base) return '';
  if (!database) return base;
  const destino = `Database=${database}`;
  if (/;\s*Database\s*=/i.test(base) || /^\s*Database\s*=/i.test(base)) {
    return base.replace(/(^|;)(\s*)Database\s*=\s*[^;]*/i, `$1$2${destino}`);
  }
  return base.endsWith(';') ? `${base}${destino};` : `${base};${destino};`;
}

function configFor(database) {
  const config = {
    server: process.env.DB_SERVER || 'localhost',
    database,
    connectionTimeout: 30000,
    requestTimeout: 60000,
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    options: {
      encrypt: boolEnv('DB_ENCRYPT', false),
      trustServerCertificate: boolEnv('DB_TRUST_SERVER_CERT', true),
      enableArithAbort: true
    }
  };
  if (process.env.DB_PORT) config.port = Number(process.env.DB_PORT);
  if (process.env.DB_INSTANCE) config.options.instanceName = process.env.DB_INSTANCE;

  // Connection string completa (opcional). Necessária, por exemplo, para LocalDB,
  // que o driver msnodesqlv8 não alcança quando server/port são montados por partes.
  const connectionString = connectionStringFor(database);
  if (connectionString) {
    config.connectionString = connectionString;
    if (authMode === 'windows') {
      config.driver = process.env.DB_ODBC_DRIVER || 'ODBC Driver 18 for SQL Server';
    }
    return config;
  }

  if (authMode === 'windows') {
    config.driver = process.env.DB_ODBC_DRIVER || 'ODBC Driver 18 for SQL Server';
    config.options.trustedConnection = true;
    // O mssql (msnodesqlv8) não repassa trustServerCertificate para a connection string do
    // ODBC. Sem isso, com DB_ENCRYPT=true o Driver 18 recusa o certificado autoassinado do
    // SQL Server. Acrescentamos o parâmetro na string antes de abrir a conexão.
    config.beforeConnect = (connConfig) => {
      if (!connConfig.conn_str || /TrustServerCertificate\s*=/i.test(connConfig.conn_str)) return;
      connConfig.conn_str = `${connConfig.conn_str};TrustServerCertificate=${
        boolEnv('DB_TRUST_SERVER_CERT', true) ? 'Yes' : 'No'
      }`;
    };
  } else {
    config.user = process.env.DB_USER;
    config.password = process.env.DB_PASSWORD;
    if (!config.user || !config.password) {
      throw new Error('Defina DB_USER e DB_PASSWORD no arquivo .env quando DB_AUTH=sql.');
    }
  }
  return config;
}

const stockMigration = String.raw`
DECLARE @fk sysname;
DECLARE @sql nvarchar(max);
SELECT TOP (1) @fk = fk.name
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
WHERE fk.parent_object_id = OBJECT_ID('dbo.estoque')
  AND fk.referenced_object_id = OBJECT_ID('dbo.produtos')
  AND c.name = 'produtoId';

IF @fk IS NOT NULL
BEGIN
  SET @sql = N'ALTER TABLE dbo.estoque DROP CONSTRAINT ' + QUOTENAME(@fk);
  EXEC(@sql);
  IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.estoque') AND name = 'UX_estoque_produtoId')
    DROP INDEX UX_estoque_produtoId ON dbo.estoque;
  EXEC(N'UPDATE dbo.estoque
        SET produtoRef = TRY_CONVERT(uniqueidentifier, produtoId)
        WHERE produtoRef IS NULL AND TRY_CONVERT(uniqueidentifier, produtoId) IS NOT NULL');

  IF COL_LENGTH('dbo.estoque', 'sku') IS NOT NULL
  BEGIN
    ALTER TABLE dbo.estoque DROP COLUMN produtoId;
    EXEC sp_rename 'dbo.estoque.sku', 'produtoId', 'COLUMN';
  END
  ELSE
    EXEC(N'UPDATE e SET produtoId = p.produtoId
          FROM dbo.estoque e
          JOIN dbo.produtos p ON p.id = e.produtoRef');
END
ELSE IF COL_LENGTH('dbo.estoque', 'sku') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.estoque', 'produtoId') IS NULL
    EXEC sp_rename 'dbo.estoque.sku', 'produtoId', 'COLUMN';
  ELSE
  BEGIN
    EXEC(N'UPDATE dbo.estoque
          SET produtoId = sku
          WHERE (produtoId IS NULL OR produtoId = N'''') AND sku IS NOT NULL');
    ALTER TABLE dbo.estoque DROP COLUMN sku;
  END
END;

DECLARE @tipoId sysname;
DECLARE @tamanhoId smallint;
DECLARE @tipoRef sysname;
DECLARE @tamanhoRef smallint;
SELECT @tipoId = t.name, @tamanhoId = c.max_length
FROM sys.columns c
JOIN sys.types t ON t.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID('dbo.produtos') AND c.name = 'id';
SELECT @tipoRef = t.name, @tamanhoRef = c.max_length
FROM sys.columns c
JOIN sys.types t ON t.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID('dbo.estoque') AND c.name = 'produtoRef';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.estoque') AND name = 'UX_estoque_produtoRef')
  DROP INDEX UX_estoque_produtoRef ON dbo.estoque;

IF @tipoId IN ('char', 'varchar', 'nchar', 'nvarchar')
  AND (@tipoRef <> @tipoId OR @tamanhoRef <> @tamanhoId)
BEGIN
  SET @sql = N'ALTER TABLE dbo.estoque ALTER COLUMN produtoRef ' + @tipoId + N'(' +
    CASE WHEN @tamanhoId = -1 THEN N'MAX'
         WHEN @tipoId IN ('nchar', 'nvarchar') THEN CONVERT(nvarchar(10), @tamanhoId / 2)
         ELSE CONVERT(nvarchar(10), @tamanhoId) END + N') NULL';
  EXEC(@sql);
END
ELSE IF @tipoId = 'uniqueidentifier' AND @tipoRef <> 'uniqueidentifier'
  ALTER TABLE dbo.estoque ALTER COLUMN produtoRef uniqueidentifier NULL;

IF COL_LENGTH('dbo.estoque', 'produtoId') IS NULL
  ALTER TABLE dbo.estoque ADD produtoId nvarchar(60) NULL;
`;

const syncStockMigration = String.raw`
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_estoque_produtos')
  ALTER TABLE dbo.estoque ADD CONSTRAINT FK_estoque_produtos
    FOREIGN KEY (produtoRef) REFERENCES dbo.produtos(id) ON DELETE CASCADE;
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes i
  JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
  JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
  WHERE i.object_id = OBJECT_ID('dbo.estoque') AND i.is_unique = 1 AND c.name = 'produtoRef')
  CREATE UNIQUE INDEX UX_estoque_produtoRef ON dbo.estoque(produtoRef) WHERE produtoRef IS NOT NULL;
UPDATE e
SET produtoId = p.produtoId, item = p.nome, medida = p.medida
FROM dbo.estoque e
JOIN dbo.produtos p ON p.id = e.produtoRef
WHERE e.tipo = N'produto';
INSERT INTO dbo.estoque (produtoRef, produtoId, item, medida, tipo, qtd, minimo)
SELECT p.id, p.produtoId, p.nome, p.medida, N'produto', 0, 0
FROM dbo.produtos p
WHERE NOT EXISTS (SELECT 1 FROM dbo.estoque e WHERE e.produtoRef = p.id);
`;

async function executeMigrations(pool) {
  const migrations = [
    String.raw`IF OBJECT_ID('dbo.seq_servico', 'SO') IS NULL CREATE SEQUENCE dbo.seq_servico START WITH 1 INCREMENT BY 1;`,
    String.raw`IF COL_LENGTH('dbo.servicos', 'codigo') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM sys.default_constraints dc
        JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
        WHERE dc.parent_object_id = OBJECT_ID('dbo.servicos') AND c.name = 'codigo')
      ALTER TABLE dbo.servicos ADD CONSTRAINT DF_servicos_codigo
      DEFAULT (N'SRV-' + FORMAT(NEXT VALUE FOR dbo.seq_servico, '0000')) FOR codigo;`,
    String.raw`IF OBJECT_ID('dbo.seq_cliente', 'SO') IS NULL CREATE SEQUENCE dbo.seq_cliente START WITH 1 INCREMENT BY 1;
      IF COL_LENGTH('dbo.clientes', 'codigo') IS NULL ALTER TABLE dbo.clientes ADD codigo nvarchar(20) NULL;`,
    String.raw`IF COL_LENGTH('dbo.clientes', 'codigo') IS NOT NULL
      AND EXISTS (SELECT 1 FROM dbo.clientes WHERE codigo IS NULL)
      BEGIN
        DECLARE @i int = 1;
        DECLARE @id uniqueidentifier;
        DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT id FROM dbo.clientes WHERE codigo IS NULL ORDER BY criadoEm;
        OPEN cur; FETCH NEXT FROM cur INTO @id;
        WHILE @@FETCH_STATUS = 0
        BEGIN
          UPDATE dbo.clientes SET codigo = N'CLI-' + FORMAT(@i, '0000') WHERE id = @id;
          SET @i += 1; FETCH NEXT FROM cur INTO @id;
        END
        CLOSE cur; DEALLOCATE cur;
      END`,
    String.raw`IF COL_LENGTH('dbo.clientes', 'codigo') IS NOT NULL
      AND EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.clientes') AND name = 'codigo' AND is_nullable = 1)
      BEGIN
        ALTER TABLE dbo.clientes ALTER COLUMN codigo nvarchar(20) NOT NULL;
        DECLARE @max int = ISNULL((SELECT MAX(TRY_CONVERT(int, SUBSTRING(codigo, 5, 20))) FROM dbo.clientes WHERE codigo LIKE 'CLI-%'), 0);
        DECLARE @sql nvarchar(200) = N'ALTER SEQUENCE dbo.seq_cliente RESTART WITH ' + CAST(@max + 1 AS nvarchar(10));
        EXEC(@sql);
        IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID('dbo.clientes') AND name = 'DF_clientes_codigo')
          ALTER TABLE dbo.clientes ADD CONSTRAINT DF_clientes_codigo DEFAULT (N'CLI-' + FORMAT(NEXT VALUE FOR dbo.seq_cliente, '0000')) FOR codigo;
      END`,
    String.raw`IF COL_LENGTH('dbo.produtos', 'produtoId') IS NULL AND COL_LENGTH('dbo.produtos', 'codigo') IS NOT NULL
        EXEC sp_rename 'dbo.produtos.codigo', 'produtoId', 'COLUMN';
      IF COL_LENGTH('dbo.produtos', 'obs') IS NULL AND COL_LENGTH('dbo.produtos', 'descricao') IS NOT NULL
        EXEC sp_rename 'dbo.produtos.descricao', 'obs', 'COLUMN';`,
    String.raw`IF COL_LENGTH('dbo.pedido_itens', 'produtoId') IS NULL AND COL_LENGTH('dbo.pedido_itens', 'codigo') IS NOT NULL
        EXEC sp_rename 'dbo.pedido_itens.codigo', 'produtoId', 'COLUMN';`,
    String.raw`IF COL_LENGTH('dbo.estoque', 'produtoRef') IS NULL ALTER TABLE dbo.estoque ADD produtoRef uniqueidentifier NULL;`,
    stockMigration,
    syncStockMigration,
    String.raw`IF COL_LENGTH('dbo.carcacas', 'valorUnitario') IS NULL
      ALTER TABLE dbo.carcacas ADD valorUnitario decimal(12, 2) NOT NULL
        CONSTRAINT DF_carcacas_valorUnitario DEFAULT (0) WITH VALUES;`
  ];
  for (const [index, statement] of migrations.entries()) {
    await pool.request().query(statement);
    if (process.env.LOG_SQL_MIGRATIONS === 'true') console.log(`Migração SQL ${index + 1}/${migrations.length} aplicada.`);
  }
}

async function initializeDatabase() {
  const dbName = process.env.DB_NAME || 'FabricaPneus2';
  if (!/^[A-Za-z0-9_ -]{1,128}$/.test(dbName)) {
    throw new Error('DB_NAME contém caracteres não permitidos. Use letras, números, espaços, hífen ou sublinhado.');
  }

  const masterPool = await new sql.ConnectionPool(configFor('master')).connect();
  try {
    await masterPool.request()
      .input('db', sql.NVarChar(128), dbName)
      .query("IF DB_ID(@db) IS NULL BEGIN DECLARE @sql nvarchar(400) = N'CREATE DATABASE ' + QUOTENAME(@db); EXEC(@sql); END");
  } finally {
    await masterPool.close();
  }

  const pool = await new sql.ConnectionPool(configFor(dbName)).connect();
  try {
    const schemaPath = path.join(__dirname, '..', 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');
    const batches = schema.split(/^\s*GO\s*$/gim).filter((batch) => batch.trim());
    for (let i = 0; i < batches.length; i += 1) {
      try {
        await pool.request().query(batches[i]);
      } catch (error) {
        error.message = `Falha ao aplicar o lote ${i + 1}/${batches.length} de schema.sql: ${error.message}`;
        throw error;
      }
    }
    await executeMigrations(pool);
    return pool;
  } catch (error) {
    await pool.close().catch(() => {});
    throw error;
  }
}

module.exports = { sql, initializeDatabase, configFor };
