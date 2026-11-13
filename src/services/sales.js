'use strict';

const { sql } = require('../core/sql');
const { badRequest, conflict, notFound } = require('../errors');
const { isObject, getText, parseDate, parseGuid, localToday, parseNumber } = require('../core/validators');
const { normalizeSaleUnitPrice } = require('../sale-prices');
const { withTransaction } = require('../core/transaction');
const { loadVendedorDaVenda, loadCondicaoPagamento } = require('./lookups');
const { adjustOrderStock } = require('./stock');
const { createSaleReceivable } = require('./finance');
const { diasParcelas } = require('./payment-terms');

function parseSalesItems(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw conflict('Adicione ao menos um pneu ou serviço antes de concluir.');
  }
  return value;
}

async function createOrUpdateSale(pool, body, existingOrderId = null, audit = null) {
  if (!isObject(body)) throw badRequest('O corpo da venda deve ser um objeto JSON.');
  const clientId = parseGuid(body.clienteId, 'Cliente');
  if (!clientId) throw conflict('Selecione um cliente cadastrado.');
  const vehicleId = parseGuid(body.veiculoId, 'Veículo');
  const orderDate = parseDate(body.data || localToday(), 'Data');
  const forecast = parseDate(body.previsao, 'Previsão');
  const appointment = parseDate(body.agendamento, 'Agendamento');
  const status = existingOrderId ? 'orçamento' : getText(body, 'status');
  const requestedSellerId = parseGuid(body.vendedorId, 'Vendedor');
  const notes = getText(body, 'obs');
  const box = getText(body, 'box');
  const time = getText(body, 'horario');
  if (body.condicaoPagamentoId == null || String(body.condicaoPagamentoId).trim() === '') {
    throw conflict('Selecione a forma de pagamento.');
  }
  if (notes.length > 500) throw badRequest('A observação do pedido pode ter no máximo 500 caracteres.');
  if (!['orçamento', 'faturado', 'pago'].includes(status)) throw conflict('Status de venda inválido.');

  const items = parseSalesItems(body.itens);
  let percentage = parseNumber(body.descontoPercentual ?? 0, 'Percentual de desconto');
  if (percentage < 0 || percentage > 100) throw conflict('O desconto deve estar entre 0% e 100%.');

  return withTransaction(pool, audit, async (transaction) => {
    const seller = await loadVendedorDaVenda(transaction, requestedSellerId);
    let currentCondicao = null;
    if (existingOrderId) {
      const existing = await new sql.Request(transaction)
        .input('id', sql.UniqueIdentifier, existingOrderId)
        .query('SELECT status, condicaoPagamentoId FROM dbo.pedidos WITH (UPDLOCK, HOLDLOCK) WHERE id = @id');
      const currentStatus = existing.recordset[0]?.status;
      if (!currentStatus) throw notFound('O orçamento não foi encontrado.');
      currentCondicao = existing.recordset[0].condicaoPagamentoId;
      if (String(currentStatus).toLowerCase() !== 'orçamento') {
        throw conflict('Somente orçamentos podem ser editados. Pedidos faturados não podem ser alterados.');
      }
    }

    const condicao = await loadCondicaoPagamento(transaction, body.condicaoPagamentoId, currentCondicao);
    const payment = String(condicao.Descricao || '').slice(0, 100);

    const clientResult = await new sql.Request(transaction)
      .input('id', sql.UniqueIdentifier, clientId)
      .query("SELECT nome FROM dbo.clientes WHERE id = @id AND status <> N'Inativo'");
    const clientName = clientResult.recordset[0]?.nome;
    if (!clientName) throw conflict('O cliente selecionado não existe ou está inativo.');

    if (vehicleId) {
      const vehicleResult = await new sql.Request(transaction)
        .input('veiculoId', sql.UniqueIdentifier, vehicleId)
        .input('clienteId', sql.UniqueIdentifier, clientId)
        .query(
          "SELECT COUNT(1) AS quantidade FROM dbo.veiculos WHERE id = @veiculoId AND clienteId = @clienteId AND status <> N'Inativo'"
        );
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
          .query(
            "SELECT produtoId, nome, medida, preco FROM dbo.produtos WHERE id = @id AND status <> N'Inativo'"
          );
        const product = productResult.recordset[0];
        if (!product) throw conflict('Um dos pneus selecionados não existe ou está inativo.');
        const unitPrice = normalizeSaleUnitPrice(item.unitario, product.preco, 'Preço unitário do pneu');
        normalizedItems.push({
          type,
          productRef,
          serviceRef: null,
          code: product.produtoId || '',
          name: product.nome,
          measure: product.medida || '',
          quantity,
          unitPrice
        });
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
        normalizedItems.push({
          type,
          productRef: null,
          serviceRef,
          code: service.codigo || '',
          name: service.nome,
          measure: '',
          quantity,
          unitPrice
        });
        subtotal += quantity * unitPrice;
      } else {
        throw conflict('Tipo de item inválido.');
      }
    }

    let discount = Math.round(((subtotal * percentage) / 100 + Number.EPSILON) * 100) / 100;
    if (Object.prototype.hasOwnProperty.call(body, 'descontoValor')) {
      discount = parseNumber(body.descontoValor, 'Valor do desconto');
      if (discount < 0 || discount > subtotal) {
        throw conflict('O desconto deve estar entre zero e o subtotal.');
      }
      discount = Math.round((discount + Number.EPSILON) * 100) / 100;
      percentage =
        subtotal === 0 ? 0 : Math.round(((discount / subtotal) * 100 + Number.EPSILON) * 100) / 100;
    }

    let orderId;
    let orderNumber;
    if (existingOrderId) {
      const update = await new sql.Request(transaction)
        .input('id', sql.UniqueIdentifier, existingOrderId)
        .input('data', sql.Date, orderDate)
        .input('cliente', sql.NVarChar(150), clientName)
        .input('pagamento', sql.NVarChar(100), payment)
        .input('condicaoPagamentoId', sql.Int, condicao.Codigo)
        .input('vendedor', sql.NVarChar(100), seller.nome)
        .input('vendedorId', sql.UniqueIdentifier, seller.id)
        .input('previsao', sql.Date, forecast)
        .input('obs', sql.NVarChar(500), notes)
        .input('clienteId', sql.UniqueIdentifier, clientId)
        .input('veiculoId', sql.UniqueIdentifier, vehicleId)
        .input('percentual', sql.Decimal(5, 2), percentage)
        .input('desconto', sql.Decimal(12, 2), discount)
        .input('box', sql.NVarChar(100), box)
        .input('agendamento', sql.Date, appointment)
        .input('horario', sql.NVarChar(10), time)
        .query(`DECLARE @saida TABLE (id uniqueidentifier, numero nvarchar(20)); UPDATE dbo.pedidos
                SET data=@data, cliente=@cliente, pagamento=@pagamento, condicaoPagamentoId=@condicaoPagamentoId,
                    vendedor=@vendedor, vendedorId=@vendedorId, previsao=@previsao,
                    obs=@obs, clienteId=@clienteId, veiculoId=@veiculoId, descontoPercentual=@percentual,
                    descontoValor=@desconto, box=@box, agendamento=@agendamento, horario=@horario
                OUTPUT inserted.id, inserted.numero INTO @saida
                WHERE id=@id AND status=N'orçamento'; SELECT id, numero FROM @saida;`);
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
        .input('pagamento', sql.NVarChar(100), payment)
        .input('condicaoPagamentoId', sql.Int, condicao.Codigo)
        .input('status', sql.NVarChar(30), status)
        .input('vendedor', sql.NVarChar(100), seller.nome)
        .input('vendedorId', sql.UniqueIdentifier, seller.id)
        .input('previsao', sql.Date, forecast)
        .input('obs', sql.NVarChar(500), notes)
        .input('clienteId', sql.UniqueIdentifier, clientId)
        .input('veiculoId', sql.UniqueIdentifier, vehicleId)
        .input('percentual', sql.Decimal(5, 2), percentage)
        .input('desconto', sql.Decimal(12, 2), discount)
        .input('box', sql.NVarChar(100), box)
        .input('agendamento', sql.Date, appointment)
        .input('horario', sql.NVarChar(10), time)
        .query(`DECLARE @saida TABLE (id uniqueidentifier, numero nvarchar(20)); INSERT INTO dbo.pedidos
                  (numero, data, cliente, pagamento, condicaoPagamentoId, status, vendedor, vendedorId, previsao, obs, clienteId, veiculoId,
                   descontoPercentual, descontoValor, box, agendamento, horario)
                OUTPUT inserted.id, inserted.numero INTO @saida
                VALUES ('PED-' + FORMAT(NEXT VALUE FOR dbo.seq_pedido, '0000'), @data, @cliente, @pagamento, @condicaoPagamentoId,
                        @status, @vendedor, @vendedorId, @previsao, @obs, @clienteId, @veiculoId,
                        @percentual, @desconto, @box, @agendamento, @horario); SELECT id, numero FROM @saida;`);
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
        .input('servicoRef', sql.UniqueIdentifier, item.serviceRef).query(`INSERT INTO dbo.pedido_itens
                  (pedidoId, produtoId, descricao, medida, qtd, unitario, tipo, produtoRef, servicoRef)
                VALUES (@pedidoId, @produtoId, @descricao, @medida, @qtd, @unitario, @tipo, @produtoRef, @servicoRef)`);
    }

    if (!existingOrderId && ['faturado', 'pago'].includes(status.toLowerCase())) {
      await adjustOrderStock(transaction, orderId, true);
      await createSaleReceivable(transaction, orderId);
    }
    return { id: String(orderId), numero: String(orderNumber) };
  });
}

async function getOrderForPdf(pool, id) {
  const validId = parseGuid(id, 'Identificador do pedido');
  const orderResult = await pool.request().input('id', sql.UniqueIdentifier, validId)
    .query(`SELECT p.numero, COALESCE(c.nome, p.cliente, N'') AS cliente,
                   COALESCE(c.documento, N'') AS documento, COALESCE(c.telefone, N'') AS telefone,
                   CONCAT(COALESCE(v.marca + N' ', N''), COALESCE(v.modelo, N''),
                          CASE WHEN v.placa IS NULL THEN N'' ELSE N' · ' + v.placa END) AS veiculo,
                   CONVERT(nvarchar(10), p.data, 23) AS data, COALESCE(cp.Descricao, p.pagamento) AS pagamento,
                   cp.QuantidadeParcelas, cp.PrazoMedio, p.status, p.vendedor,
                   CONVERT(nvarchar(10), p.agendamento, 23) AS agendamento, p.box, p.horario, p.obs,
                   p.descontoPercentual, p.descontoValor,
                   COALESCE(c.cep, N'') AS cep, COALESCE(c.endereco, N'') AS endereco,
                   COALESCE(c.numero, N'') AS numeroEndereco, COALESCE(c.bairro, N'') AS bairro,
                   COALESCE(c.cidade, N'') AS cidade, COALESCE(c.estado, N'') AS estado
            FROM dbo.pedidos p
            LEFT JOIN dbo.clientes c ON c.id = p.clienteId
            LEFT JOIN dbo.veiculos v ON v.id = p.veiculoId
            LEFT JOIN dbo.CondicoesPagamento cp ON cp.Codigo = p.condicaoPagamentoId
            WHERE p.id = @id`);
  const order = orderResult.recordset[0];
  if (order) {
    // Ex.: "3x · vencimentos em 30/60/90 dias" (vazio quando à vista).
    const dias = diasParcelas(order.QuantidadeParcelas, order.PrazoMedio);
    order.parcelasTexto = dias.length
      ? `${dias.length}x · vencimento${dias.length > 1 ? 's' : ''} em ${dias.join('/')} dias`
      : '';
  }
  if (!order) throw notFound('Pedido não encontrado.');
  const itemsResult = await pool
    .request()
    .input('id', sql.UniqueIdentifier, validId)
    .query(
      'SELECT tipo, descricao, medida, qtd, unitario FROM dbo.pedido_itens WHERE pedidoId = @id ORDER BY criadoEm, id'
    );
  return { ...order, itens: itemsResult.recordset };
}

module.exports = { parseSalesItems, createOrUpdateSale, getOrderForPdf };
