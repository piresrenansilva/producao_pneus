const { sql } = require('./database');
const { tables } = require('./definitions');
const { badRequest, conflict, notFound } = require('./errors');
const { normalizeSaleUnitPrice } = require('./sale-prices');

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function getText(obj, key) {
  const value = obj?.[key];
  if (value == null) return '';
  return String(value).trim();
}

function parseDate(value, label = 'Data') {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw badRequest(`${label} inválida.`);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw badRequest(`${label} inválida.`);
  }
  return date;
}

function parseGuid(value, label = 'Identificador') {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
    throw badRequest(`${label} inválido.`);
  }
  return text;
}

function localToday() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function parseNumber(value, label, { integer = false, nullable = false } = {}) {
  if (value == null || value === '') {
    if (nullable) return null;
    return 0;
  }
  const number = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(number)) throw badRequest(`${label} inválido.`);
  if (integer && !Number.isInteger(number)) throw badRequest(`${label} deve ser um número inteiro.`);
  return number;
}

function sqlType(column) {
  switch (column.type) {
    case 'i': return sql.Int;
    case 'd': return sql.Decimal(12, 2);
    case 't': return sql.Date;
    case 'g': return sql.UniqueIdentifier;
    default: return sql.NVarChar(column.size || 200);
  }
}

function convertValue(column, value) {
  if (value == null) return null;
  if (column.type === 'i') return parseNumber(value, column.name, { integer: true });
  if (column.type === 'd') {
    const amount = parseNumber(value, column.name);
    if (column.name === 'valorUnitario') {
      if (amount < 0) throw badRequest('O custo unitário de entrada da carcaça não pode ser negativo.');
      if (amount > 9_999_999_999.99) throw badRequest('O custo unitário de entrada da carcaça excede o limite permitido.');
    }
    return amount;
  }
  if (column.type === 't') return parseDate(value, column.name);
  if (column.type === 'g') return parseGuid(value, column.name);
  const text = String(value);
  if (column.size && text.length > column.size) throw badRequest(`O campo ${column.name} excede ${column.size} caracteres.`);
  return text;
}

function bindColumn(request, column, value) {
  request.input(column.name, sqlType(column), convertValue(column, value));
}

function dateSelect(column) {
  return column.type === 't'
    ? `CONVERT(nvarchar(10), [${column.name}], 23) AS [${column.name}]`
    : `[${column.name}]`;
}

async function readTable(pool, definition) {
  const columns = [...definition.columns.map(dateSelect), ...(definition.extras || []).map((name) => `[${name}]`)];
  const selected = ['[id]', ...columns].join(', ');
  const result = await pool.request().query(`SELECT ${selected} FROM dbo.[${definition.table}] ORDER BY [criadoEm] DESC`);
  return result.recordset.map((row) => {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = value == null ? '' : value;
    }
    return normalized;
  });
}

function embedItems(rows, items, fk) {
  const byParent = new Map();
  for (const item of items) {
    const parentId = String(item[fk] || '').toLowerCase();
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId).push(item);
  }
  for (const row of rows || []) {
    row.itens = byParent.get(String(row.id || '').toLowerCase()) || [];
  }
}

async function getAllData(pool) {
  const data = {};
  const embedOnly = new Set(['itens', 'carcacaOrdemItens']);
  for (const [route, definition] of Object.entries(tables)) {
    if (!embedOnly.has(route)) data[route] = await readTable(pool, definition);
  }
  embedItems(data.pedidos, await readTable(pool, tables.itens), 'pedidoId');
  embedItems(data.carcacaOrdens, await readTable(pool, tables.carcacaOrdemItens), 'ordemId');
  return data;
}

async function syncProductStock(transaction, productId) {
  const productResult = await new sql.Request(transaction)
    .input('id', sql.UniqueIdentifier, productId)
    .query('SELECT produtoId, nome, medida FROM dbo.produtos WHERE id = @id');
  const product = productResult.recordset[0];
  if (!product) throw notFound('Produto não encontrado.');

  await new sql.Request(transaction)
    .input('id', sql.UniqueIdentifier, productId)
    .input('produtoId', sql.NVarChar(60), product.produtoId || '')
    .input('nome', sql.NVarChar(200), product.nome || '')
    .input('medida', sql.NVarChar(60), product.medida || '')
    .query(`
      IF EXISTS (SELECT 1 FROM dbo.estoque WHERE produtoRef = @id)
        UPDATE dbo.estoque SET produtoId=@produtoId, item=@nome, medida=@medida WHERE produtoRef=@id;
      ELSE
        INSERT INTO dbo.estoque (produtoRef, produtoId, item, medida, tipo, qtd, minimo)
        VALUES (@id, @produtoId, @nome, @medida, N'produto', 0, 0);`);
}

async function validateCargaPedido(transaction, value, currentCargaId = null) {
  const pedidoId = parseGuid(value, 'Venda');
  if (!pedidoId) return;
  const result = await new sql.Request(transaction)
    .input('id', sql.UniqueIdentifier, pedidoId)
    .query('SELECT status FROM dbo.pedidos WITH (UPDLOCK, HOLDLOCK) WHERE id = @id');
  const status = result.recordset[0]?.status;
  if (status == null) throw conflict('A venda selecionada não foi encontrada.');
  if (isSaleCompleted(status)) return;

  if (currentCargaId) {
    const current = await new sql.Request(transaction)
      .input('id', sql.UniqueIdentifier, currentCargaId)
      .query('SELECT pedidoId FROM dbo.cargas WHERE id = @id');
    if (String(current.recordset[0]?.pedidoId || '').toLowerCase() === String(pedidoId).toLowerCase()) return;
  }
  throw conflict('Selecione uma venda faturada ou paga.');
}

async function createRow(pool, route, body) {
  const definition = tables[route];
  if (!definition) throw notFound('Rota não encontrada.');
  if (!isObject(body)) throw badRequest('O corpo da requisição deve ser um objeto JSON.');
  if (route === 'pedidos' || route === 'itens') {
    throw conflict('Pedidos e itens devem ser criados pelo fluxo de vendas para preservar o estoque e os preços.');
  }
  if (route === 'carcacaOrdens' || route === 'carcacaOrdemItens') {
    throw conflict('Apontamentos de carcaças e seus itens devem ser criados pelo fluxo de apontamentos.');
  }

  const fields = definition.columns.filter((column) => !column.readOnly && Object.prototype.hasOwnProperty.call(body, column.name));
  if (fields.length === 0) throw badRequest('Informe ao menos um campo para salvar.');

  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    if (route === 'cargas' && Object.prototype.hasOwnProperty.call(body, 'pedidoId')) {
      await validateCargaPedido(transaction, body.pedidoId);
    }
    const request = new sql.Request(transaction);
    for (const field of fields) bindColumn(request, field, body[field.name]);
    const names = fields.map((field) => `[${field.name}]`).join(', ');
    const values = fields.map((field) => `@${field.name}`).join(', ');
    const result = await request.query(`INSERT INTO dbo.[${definition.table}] (${names}) OUTPUT inserted.id VALUES (${values})`);
    const id = result.recordset[0].id;
    if (route === 'produtos') await syncProductStock(transaction, id);
    await transaction.commit();
    return { id: String(id) };
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

async function adjustOrderStock(transaction, orderId, subtract) {
  const result = await new sql.Request(transaction)
    .input('id', sql.UniqueIdentifier, orderId)
    .query(`SELECT produtoRef, SUM(qtd) AS quantidade
            FROM dbo.pedido_itens
            WHERE pedidoId = @id AND tipo = N'pneu' AND produtoRef IS NOT NULL
            GROUP BY produtoRef`);
  for (const row of result.recordset) {
    const quantity = Number(row.quantidade);
    const update = new sql.Request(transaction)
      .input('qtd', sql.Int, quantity)
      .input('produto', sql.UniqueIdentifier, row.produtoRef);
    const query = subtract
      ? 'UPDATE dbo.estoque SET qtd = qtd - @qtd WHERE produtoRef = @produto AND qtd >= @qtd'
      : 'UPDATE dbo.estoque SET qtd = qtd + @qtd WHERE produtoRef = @produto';
    const outcome = await update.query(query);
    if (subtract && outcome.rowsAffected[0] !== 1) {
      throw conflict('Estoque local insuficiente para um dos pneus. Ajuste o estoque e tente faturar novamente.');
    }
  }
}

function parseSalesItems(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw conflict('Adicione ao menos um pneu ou serviço antes de concluir.');
  }
  return value;
}

async function createOrUpdateSale(pool, body, existingOrderId = null) {
  if (!isObject(body)) throw badRequest('O corpo da venda deve ser um objeto JSON.');
  const clientId = parseGuid(body.clienteId, 'Cliente');
  if (!clientId) throw conflict('Selecione um cliente cadastrado.');
  const vehicleId = parseGuid(body.veiculoId, 'Veículo');
  const orderDate = parseDate(body.data || localToday(), 'Data');
  const forecast = parseDate(body.previsao, 'Previsão');
  const appointment = parseDate(body.agendamento, 'Agendamento');
  const payment = getText(body, 'pagamento');
  const status = existingOrderId ? 'orçamento' : getText(body, 'status');
  const seller = getText(body, 'vendedor');
  const notes = getText(body, 'obs');
  const box = getText(body, 'box');
  const time = getText(body, 'horario');
  if (!payment) throw conflict('Selecione a forma de pagamento.');
  if (!['orçamento', 'faturado', 'pago'].includes(status)) throw conflict('Status de venda inválido.');

  const items = parseSalesItems(body.itens);
  let percentage = parseNumber(body.descontoPercentual ?? 0, 'Percentual de desconto');
  if (percentage < 0 || percentage > 100) throw conflict('O desconto deve estar entre 0% e 100%.');

  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    if (existingOrderId) {
      const existing = await new sql.Request(transaction)
        .input('id', sql.UniqueIdentifier, existingOrderId)
        .query('SELECT status FROM dbo.pedidos WITH (UPDLOCK, HOLDLOCK) WHERE id = @id');
      const currentStatus = existing.recordset[0]?.status;
      if (!currentStatus) throw notFound('O orçamento não foi encontrado.');
      if (String(currentStatus).toLowerCase() !== 'orçamento') {
        throw conflict('Somente orçamentos podem ser editados. Pedidos faturados não podem ser alterados.');
      }
    }

    const clientResult = await new sql.Request(transaction)
      .input('id', sql.UniqueIdentifier, clientId)
      .query("SELECT nome FROM dbo.clientes WHERE id = @id AND status <> N'Inativo'");
    const clientName = clientResult.recordset[0]?.nome;
    if (!clientName) throw conflict('O cliente selecionado não existe ou está inativo.');

    if (vehicleId) {
      const vehicleResult = await new sql.Request(transaction)
        .input('veiculoId', sql.UniqueIdentifier, vehicleId)
        .input('clienteId', sql.UniqueIdentifier, clientId)
        .query("SELECT COUNT(1) AS quantidade FROM dbo.veiculos WHERE id = @veiculoId AND clienteId = @clienteId AND status <> N'Inativo'");
      if (!Number(vehicleResult.recordset[0]?.quantidade)) {
        throw conflict('O veículo selecionado não pertence ao cliente ou está inativo.');
      }
    }

    const normalizedItems = [];
    let subtotal = 0;
    for (const item of items) {
      const type = getText(item, 'tipo');
      const quantity = parseNumber(item.qtd, 'Quantidade', { integer: true });
      if (quantity < 1) throw conflict('Cada item deve ter uma quantidade inteira maior que zero.');

      if (type === 'pneu') {
        const productRef = parseGuid(item.produtoRef, 'Produto');
        if (!productRef) throw conflict('Um pneu do pedido não tem produto válido.');
        const productResult = await new sql.Request(transaction)
          .input('id', sql.UniqueIdentifier, productRef)
          .query("SELECT produtoId, nome, medida, preco FROM dbo.produtos WHERE id = @id AND status <> N'Inativo'");
        const product = productResult.recordset[0];
        if (!product) throw conflict('Um dos pneus selecionados não existe ou está inativo.');
        const unitPrice = normalizeSaleUnitPrice(item.unitario, product.preco, 'Preço unitário do pneu');
        normalizedItems.push({ type, productRef, serviceRef: null, code: product.produtoId || '', name: product.nome, measure: product.medida || '', quantity, unitPrice });
        subtotal += quantity * unitPrice;
      } else if (type === 'servico') {
        const serviceRef = parseGuid(item.servicoRef, 'Serviço');
        if (!serviceRef) throw conflict('Um serviço do pedido não tem cadastro válido.');
        const serviceResult = await new sql.Request(transaction)
          .input('id', sql.UniqueIdentifier, serviceRef)
          .query("SELECT codigo, nome, preco FROM dbo.servicos WHERE id = @id AND status <> N'Inativo'");
        const service = serviceResult.recordset[0];
        if (!service) throw conflict('Um dos serviços selecionados não existe ou está inativo.');
        const unitPrice = normalizeSaleUnitPrice(item.unitario, service.preco, 'Preço unitário do serviço');
        normalizedItems.push({ type, productRef: null, serviceRef, code: service.codigo || '', name: service.nome, measure: '', quantity, unitPrice });
        subtotal += quantity * unitPrice;
      } else {
        throw conflict('Tipo de item inválido.');
      }
    }

    let discount = Math.round((subtotal * percentage / 100 + Number.EPSILON) * 100) / 100;
    if (Object.prototype.hasOwnProperty.call(body, 'descontoValor')) {
      discount = parseNumber(body.descontoValor, 'Valor do desconto');
      if (discount < 0 || discount > subtotal) throw conflict('O desconto deve estar entre zero e o subtotal.');
      discount = Math.round((discount + Number.EPSILON) * 100) / 100;
      percentage = subtotal === 0 ? 0 : Math.round((discount / subtotal * 100 + Number.EPSILON) * 100) / 100;
    }

    let orderId;
    let orderNumber;
    if (existingOrderId) {
      const update = await new sql.Request(transaction)
        .input('id', sql.UniqueIdentifier, existingOrderId)
        .input('data', sql.Date, orderDate)
        .input('cliente', sql.NVarChar(150), clientName)
        .input('pagamento', sql.NVarChar(30), payment)
        .input('vendedor', sql.NVarChar(100), seller)
        .input('previsao', sql.Date, forecast)
        .input('obs', sql.NVarChar(500), notes)
        .input('clienteId', sql.UniqueIdentifier, clientId)
        .input('veiculoId', sql.UniqueIdentifier, vehicleId)
        .input('percentual', sql.Decimal(5, 2), percentage)
        .input('desconto', sql.Decimal(12, 2), discount)
        .input('box', sql.NVarChar(100), box)
        .input('agendamento', sql.Date, appointment)
        .input('horario', sql.NVarChar(10), time)
        .query(`UPDATE dbo.pedidos
                SET data=@data, cliente=@cliente, pagamento=@pagamento, vendedor=@vendedor, previsao=@previsao,
                    obs=@obs, clienteId=@clienteId, veiculoId=@veiculoId, descontoPercentual=@percentual,
                    descontoValor=@desconto, box=@box, agendamento=@agendamento, horario=@horario
                OUTPUT inserted.id, inserted.numero
                WHERE id=@id AND status=N'orçamento'`);
      const order = update.recordset[0];
      if (!order) throw conflict('O pedido deixou de ser um orçamento e não pode ser alterado.');
      orderId = order.id;
      orderNumber = order.numero;
      await new sql.Request(transaction)
        .input('id', sql.UniqueIdentifier, orderId)
        .query('DELETE FROM dbo.pedido_itens WHERE pedidoId = @id');
    } else {
      const inserted = await new sql.Request(transaction)
        .input('data', sql.Date, orderDate)
        .input('cliente', sql.NVarChar(150), clientName)
        .input('pagamento', sql.NVarChar(30), payment)
        .input('status', sql.NVarChar(30), status)
        .input('vendedor', sql.NVarChar(100), seller)
        .input('previsao', sql.Date, forecast)
        .input('obs', sql.NVarChar(500), notes)
        .input('clienteId', sql.UniqueIdentifier, clientId)
        .input('veiculoId', sql.UniqueIdentifier, vehicleId)
        .input('percentual', sql.Decimal(5, 2), percentage)
        .input('desconto', sql.Decimal(12, 2), discount)
        .input('box', sql.NVarChar(100), box)
        .input('agendamento', sql.Date, appointment)
        .input('horario', sql.NVarChar(10), time)
        .query(`INSERT INTO dbo.pedidos
                  (numero, data, cliente, pagamento, status, vendedor, previsao, obs, clienteId, veiculoId,
                   descontoPercentual, descontoValor, box, agendamento, horario)
                OUTPUT inserted.id, inserted.numero
                VALUES ('PED-' + FORMAT(NEXT VALUE FOR dbo.seq_pedido, '0000'), @data, @cliente, @pagamento,
                        @status, @vendedor, @previsao, @obs, @clienteId, @veiculoId,
                        @percentual, @desconto, @box, @agendamento, @horario)`);
      orderId = inserted.recordset[0].id;
      orderNumber = inserted.recordset[0].numero;
    }

    for (const item of normalizedItems) {
      await new sql.Request(transaction)
        .input('pedidoId', sql.UniqueIdentifier, orderId)
        .input('produtoId', sql.NVarChar(50), item.code)
        .input('descricao', sql.NVarChar(200), item.name)
        .input('medida', sql.NVarChar(50), item.measure)
        .input('qtd', sql.Int, item.quantity)
        .input('unitario', sql.Decimal(12, 2), item.unitPrice)
        .input('tipo', sql.NVarChar(20), item.type)
        .input('produtoRef', sql.UniqueIdentifier, item.productRef)
        .input('servicoRef', sql.UniqueIdentifier, item.serviceRef)
        .query(`INSERT INTO dbo.pedido_itens
                  (pedidoId, produtoId, descricao, medida, qtd, unitario, tipo, produtoRef, servicoRef)
                VALUES (@pedidoId, @produtoId, @descricao, @medida, @qtd, @unitario, @tipo, @produtoRef, @servicoRef)`);
    }

    if (!existingOrderId && ['faturado', 'pago'].includes(status.toLowerCase())) {
      await adjustOrderStock(transaction, orderId, true);
    }
    await transaction.commit();
    return { id: String(orderId), numero: String(orderNumber) };
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

function isSaleCompleted(status) {
  return ['faturado', 'pago'].includes(String(status || '').toLowerCase());
}

async function updateRow(pool, route, id, body) {
  const definition = tables[route];
  if (!definition) throw notFound('Rota não encontrada.');
  if (!isObject(body)) throw badRequest('O corpo da requisição deve ser um objeto JSON.');
  const validId = parseGuid(id, 'Identificador');

  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    if (route === 'cargas' && Object.prototype.hasOwnProperty.call(body, 'pedidoId')) {
      await validateCargaPedido(transaction, body.pedidoId, validId);
    }
    let previousOrderStatus = null;
    if (route === 'pedidos') {
      const existing = await new sql.Request(transaction)
        .input('id', sql.UniqueIdentifier, validId)
        .query('SELECT status FROM dbo.pedidos WITH (UPDLOCK, HOLDLOCK) WHERE id = @id');
      previousOrderStatus = existing.recordset[0]?.status;
      if (previousOrderStatus == null) throw notFound('Pedido não encontrado.');
      if (isSaleCompleted(previousOrderStatus) && Object.keys(body).some((key) => key !== 'status')) {
        throw conflict('Pedidos faturados não podem ser editados.');
      }
      if (isSaleCompleted(previousOrderStatus) && String(body.status || '').toLowerCase() === 'orçamento') {
        throw conflict('Um pedido faturado não pode voltar ao status de orçamento.');
      }
      if (Object.prototype.hasOwnProperty.call(body, 'status') && !['orçamento', 'faturado', 'pago', 'cancelado'].includes(String(body.status).toLowerCase())) {
        throw conflict('Status de pedido inválido.');
      }
    }

    const fields = definition.columns.filter((column) => !column.readOnly && Object.prototype.hasOwnProperty.call(body, column.name));
    if (fields.length > 0) {
      const request = new sql.Request(transaction).input('id', sql.UniqueIdentifier, validId);
      for (const field of fields) bindColumn(request, field, body[field.name]);
      const assignments = fields.map((field) => `[${field.name}] = @${field.name}`).join(', ');
      const result = await request.query(`UPDATE dbo.[${definition.table}] SET ${assignments} WHERE id = @id`);
      if (result.rowsAffected[0] === 0) throw notFound('Registro não encontrado.');
    }

    if (route === 'pedidos' && previousOrderStatus != null && Object.prototype.hasOwnProperty.call(body, 'status')) {
      const newStatus = String(body.status || '');
      if (!isSaleCompleted(previousOrderStatus) && isSaleCompleted(newStatus)) {
        await adjustOrderStock(transaction, validId, true);
      } else if (isSaleCompleted(previousOrderStatus) && !isSaleCompleted(newStatus)) {
        await adjustOrderStock(transaction, validId, false);
      }
    }

    if (route === 'produtos') await syncProductStock(transaction, validId);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

async function deleteRow(pool, route, id) {
  const definition = tables[route];
  if (!definition) throw notFound('Rota não encontrada.');
  const validId = parseGuid(id, 'Identificador');
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    if (route === 'pedidos') {
      const existing = await new sql.Request(transaction)
        .input('id', sql.UniqueIdentifier, validId)
        .query('SELECT status FROM dbo.pedidos WITH (UPDLOCK, HOLDLOCK) WHERE id = @id');
      const status = existing.recordset[0]?.status;
      if (status == null) throw notFound('Pedido não encontrado.');
      if (isSaleCompleted(status)) await adjustOrderStock(transaction, validId, false);
    }
    if (route === 'carcacaOrdens') {
      const existing = await new sql.Request(transaction)
        .input('id', sql.UniqueIdentifier, validId)
        .query('SELECT status FROM dbo.carcaca_ordens WITH (UPDLOCK, HOLDLOCK) WHERE id = @id');
      const status = existing.recordset[0]?.status;
      if (status == null) throw notFound('Apontamento não encontrado.');
      if (String(status).toLowerCase() === 'conferido') {
        throw conflict('Apontamentos conferidos não podem ser excluídos.');
      }
    }

    const result = await new sql.Request(transaction)
      .input('id', sql.UniqueIdentifier, validId)
      .query(`DELETE FROM dbo.[${definition.table}] WHERE id = @id`);
    if (result.rowsAffected[0] === 0) throw notFound('Registro não encontrado.');
    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

async function getOrderForPdf(pool, id) {
  const validId = parseGuid(id, 'Identificador do pedido');
  const orderResult = await pool.request()
    .input('id', sql.UniqueIdentifier, validId)
    .query(`SELECT p.numero, COALESCE(c.nome, p.cliente, N'') AS cliente,
                   COALESCE(c.documento, N'') AS documento, COALESCE(c.telefone, N'') AS telefone,
                   CONCAT(COALESCE(v.marca + N' ', N''), COALESCE(v.modelo, N''),
                          CASE WHEN v.placa IS NULL THEN N'' ELSE N' · ' + v.placa END) AS veiculo,
                   CONVERT(nvarchar(10), p.data, 23) AS data, p.pagamento, p.status, p.vendedor,
                   CONVERT(nvarchar(10), p.agendamento, 23) AS agendamento, p.box, p.horario, p.obs,
                   p.descontoPercentual, p.descontoValor,
                   COALESCE(c.cep, N'') AS cep, COALESCE(c.endereco, N'') AS endereco,
                   COALESCE(c.numero, N'') AS numeroEndereco, COALESCE(c.bairro, N'') AS bairro,
                   COALESCE(c.cidade, N'') AS cidade, COALESCE(c.estado, N'') AS estado
            FROM dbo.pedidos p
            LEFT JOIN dbo.clientes c ON c.id = p.clienteId
            LEFT JOIN dbo.veiculos v ON v.id = p.veiculoId
            WHERE p.id = @id`);
  const order = orderResult.recordset[0];
  if (!order) throw notFound('Pedido não encontrado.');
  const itemsResult = await pool.request()
    .input('id', sql.UniqueIdentifier, validId)
    .query('SELECT tipo, descricao, medida, qtd, unitario FROM dbo.pedido_itens WHERE pedidoId = @id ORDER BY criadoEm, id');
  return { ...order, itens: itemsResult.recordset };
}

function normalizeCarcacaCategoria(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

// Apontamento de entrada de carcaças: ordem com itens (produtos da categoria
// Carcaça), valor unitário por carcaça, total por linha e total do apontamento.
async function createOrUpdateCarcacaOrdem(pool, body, existingOrdemId = null) {
  if (!isObject(body)) throw badRequest('O corpo do apontamento deve ser um objeto JSON.');
  const data = parseDate(body.data || localToday(), 'Data');
  const dono = getText(body, 'dono');
  const origem = getText(body, 'origem');
  const obs = getText(body, 'obs');
  const status = String(getText(body, 'status') || 'registrado').trim().toLowerCase();
  if (!['registrado', 'conferido'].includes(status)) throw conflict('Status de apontamento inválido.');

  const itens = body.itens;
  if (!Array.isArray(itens) || itens.length === 0) {
    throw conflict('Selecione ao menos uma carcaça antes de salvar o apontamento.');
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    if (existingOrdemId) {
      const existing = await new sql.Request(transaction)
        .input('id', sql.UniqueIdentifier, existingOrdemId)
        .query('SELECT status FROM dbo.carcaca_ordens WITH (UPDLOCK, HOLDLOCK) WHERE id = @id');
      const currentStatus = existing.recordset[0]?.status;
      if (!currentStatus) throw notFound('O apontamento não foi encontrado.');
      if (String(currentStatus).toLowerCase() !== 'registrado') {
        throw conflict('Somente apontamentos registrados podem ser editados.');
      }
    }

    const normalizedItems = [];
    let total = 0;
    for (const item of itens) {
      const productRef = parseGuid(item.produtoRef, 'Carcaça');
      if (!productRef) throw conflict('Uma carcaça do apontamento não tem produto válido.');
      const quantity = parseNumber(item.qtd, 'Quantidade', { integer: true });
      if (quantity < 1) throw conflict('Cada carcaça deve ter uma quantidade inteira maior que zero.');
      const productResult = await new sql.Request(transaction)
        .input('id', sql.UniqueIdentifier, productRef)
        .query("SELECT produtoId, nome, medida, custo, categoria FROM dbo.produtos WHERE id = @id AND status <> N'Inativo'");
      const product = productResult.recordset[0];
      if (!product) throw conflict('Uma das carcaças selecionadas não existe ou está inativa.');
      if (!['carcaca', 'carcacas'].includes(normalizeCarcacaCategoria(product.categoria))) {
        throw conflict('Somente produtos da categoria Carcaça podem entrar no apontamento.');
      }
      const unitValue = normalizeSaleUnitPrice(item.valorUnitario, product.custo, 'Valor unitário da carcaça');
      const lineTotal = Math.round((quantity * unitValue + Number.EPSILON) * 100) / 100;
      total = Math.round((total + lineTotal + Number.EPSILON) * 100) / 100;
      normalizedItems.push({
        productRef,
        code: product.produtoId || '',
        name: product.nome,
        measure: product.medida || '',
        quantity,
        unitValue,
        lineTotal
      });
    }

    let ordemId;
    let ordemNumero;
    if (existingOrdemId) {
      const update = await new sql.Request(transaction)
        .input('id', sql.UniqueIdentifier, existingOrdemId)
        .input('data', sql.Date, data)
        .input('dono', sql.NVarChar(150), dono)
        .input('origem', sql.NVarChar(30), origem)
        .input('status', sql.NVarChar(30), status)
        .input('obs', sql.NVarChar(500), obs)
        .input('total', sql.Decimal(12, 2), total)
        .query(`UPDATE dbo.carcaca_ordens
                SET data=@data, dono=@dono, origem=@origem, status=@status, obs=@obs, total=@total
                OUTPUT inserted.id, inserted.numero
                WHERE id=@id AND status=N'registrado'`);
      const ordem = update.recordset[0];
      if (!ordem) throw conflict('O apontamento deixou de ser registrado e não pode ser alterado.');
      ordemId = ordem.id;
      ordemNumero = ordem.numero;
      await new sql.Request(transaction)
        .input('id', sql.UniqueIdentifier, ordemId)
        .query('DELETE FROM dbo.carcaca_ordem_itens WHERE ordemId = @id');
    } else {
      const inserted = await new sql.Request(transaction)
        .input('data', sql.Date, data)
        .input('dono', sql.NVarChar(150), dono)
        .input('origem', sql.NVarChar(30), origem)
        .input('status', sql.NVarChar(30), status)
        .input('obs', sql.NVarChar(500), obs)
        .input('total', sql.Decimal(12, 2), total)
        .query(`INSERT INTO dbo.carcaca_ordens (numero, data, dono, origem, status, obs, total)
                OUTPUT inserted.id, inserted.numero
                VALUES ('CAR-' + FORMAT(NEXT VALUE FOR dbo.seq_carcaca_ordem, '0000'), @data, @dono, @origem, @status, @obs, @total)`);
      ordemId = inserted.recordset[0].id;
      ordemNumero = inserted.recordset[0].numero;
    }

    for (const item of normalizedItems) {
      await new sql.Request(transaction)
        .input('ordemId', sql.UniqueIdentifier, ordemId)
        .input('produtoRef', sql.UniqueIdentifier, item.productRef)
        .input('produtoId', sql.NVarChar(60), item.code)
        .input('item', sql.NVarChar(200), item.name)
        .input('medida', sql.NVarChar(60), item.measure)
        .input('qtd', sql.Int, item.quantity)
        .input('valorUnitario', sql.Decimal(12, 2), item.unitValue)
        .input('valorTotal', sql.Decimal(12, 2), item.lineTotal)
        .query(`INSERT INTO dbo.carcaca_ordem_itens
                  (ordemId, produtoRef, produtoId, item, medida, qtd, valorUnitario, valorTotal)
                VALUES (@ordemId, @produtoRef, @produtoId, @item, @medida, @qtd, @valorUnitario, @valorTotal)`);
    }

    await transaction.commit();
    return { id: String(ordemId), numero: String(ordemNumero), total };
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

module.exports = {
  getAllData,
  createRow,
  updateRow,
  deleteRow,
  createOrUpdateSale,
  createOrUpdateCarcacaOrdem,
  getOrderForPdf,
  parseGuid,
  normalizeSaleUnitPrice
};
