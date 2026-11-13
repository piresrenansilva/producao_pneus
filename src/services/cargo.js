'use strict';

const { sql } = require('../core/sql');
const { badRequest, conflict, notFound } = require('../errors');
const { isObject, getText, parseDate, parseGuid, localToday, parseNumber } = require('../core/validators');
const { normalizeSaleUnitPrice } = require('../sale-prices');
const { withTransaction } = require('../core/transaction');
const { validateCargaPedido } = require('./lookups');
const { cargaMovimentaEstoque, changeStock, revertCargaStock } = require('./stock');

const CARGA_TIPOS = ['carga', 'descarga'];
const CARGA_STATUS = ['aguardando', 'conferida', 'saiu', 'divergente'];

async function createOrUpdateCarga(pool, body, existingCargaId = null, audit = null) {
  if (!isObject(body)) throw badRequest('O corpo do movimento deve ser um objeto JSON.');
  const tipo = getText(body, 'tipo').toLowerCase();
  if (!CARGA_TIPOS.includes(tipo)) throw conflict('Selecione o tipo do movimento (carga ou descarga).');
  const data = parseDate(body.data || localToday(), 'Data');
  const status = getText(body, 'status').toLowerCase();
  if (status && !CARGA_STATUS.includes(status)) throw conflict('Status do movimento inválido.');
  const header = {
    motorista: getText(body, 'motorista'),
    funcionario: getText(body, 'funcionario'),
    transportadora: getText(body, 'transportadora'),
    nf: getText(body, 'nf')
  };
  for (const [name, size] of [
    ['motorista', 100],
    ['funcionario', 100],
    ['transportadora', 150],
    ['nf', 30]
  ]) {
    if (header[name].length > size) throw badRequest(`O campo ${name} excede ${size} caracteres.`);
  }
  const pedidoId = parseGuid(body.pedidoId, 'Venda');

  if (!Array.isArray(body.itens) || body.itens.length === 0) {
    throw conflict('Selecione ao menos um produto para o movimento.');
  }
  // Soma quantidades repetidas do mesmo produto.
  const requested = new Map();
  for (const item of body.itens) {
    const productRef = parseGuid(item?.produtoRef, 'Produto');
    if (!productRef) throw conflict('Um dos produtos do movimento não é válido.');
    const quantity = parseNumber(item.qtd, 'Quantidade', { integer: true });
    if (quantity < 1) throw conflict('Cada produto deve ter uma quantidade inteira maior que zero.');
    // Preço unitário opcional digitado no movimento (vazio ou zero = não informado).
    const informado = item.valorUnitario != null && String(item.valorUnitario).trim() !== '';
    const unitPrice = informado ? normalizeSaleUnitPrice(item.valorUnitario, 0, 'Preço unitário') : null;
    const key = productRef.toLowerCase();
    const anterior = requested.get(key);
    requested.set(key, {
      productRef,
      quantity: (anterior?.quantity || 0) + quantity,
      unitPrice: unitPrice || anterior?.unitPrice || null
    });
  }

  return withTransaction(pool, audit, async (transaction) => {
    const previousRefs = new Set();
    if (existingCargaId) {
      const existing = await new sql.Request(transaction)
        .input('id', sql.UniqueIdentifier, existingCargaId)
        .query('SELECT tipo, estoqueMovimentado FROM dbo.cargas WITH (UPDLOCK, HOLDLOCK) WHERE id = @id');
      const carga = existing.recordset[0];
      if (!carga) throw notFound('O movimento não foi encontrado.');
      const previousItems = await new sql.Request(transaction)
        .input('id', sql.UniqueIdentifier, existingCargaId)
        .query('SELECT produtoRef FROM dbo.carga_itens WHERE cargaId = @id');
      previousItems.recordset.forEach(
        (row) => row.produtoRef && previousRefs.add(String(row.produtoRef).toLowerCase())
      );
      // Desfaz o efeito anterior no estoque antes de aplicar o novo.
      if (carga.estoqueMovimentado) await revertCargaStock(transaction, existingCargaId, carga.tipo);
      await new sql.Request(transaction)
        .input('id', sql.UniqueIdentifier, existingCargaId)
        .query('DELETE FROM dbo.carga_itens WHERE cargaId = @id');
    }
    if (pedidoId) await validateCargaPedido(transaction, pedidoId, existingCargaId);

    const normalizedItems = [];
    for (const { productRef, quantity, unitPrice } of requested.values()) {
      const productResult = await new sql.Request(transaction)
        .input('id', sql.UniqueIdentifier, productRef)
        .query('SELECT produtoId, nome, medida, status FROM dbo.produtos WHERE id = @id');
      const product = productResult.recordset[0];
      if (!product) throw conflict('Um dos produtos selecionados não existe mais.');
      if (
        String(product.status || '').toLowerCase() === 'inativo' &&
        !previousRefs.has(productRef.toLowerCase())
      ) {
        throw conflict(`O produto ${product.nome} está inativo.`);
      }
      normalizedItems.push({
        productRef,
        quantity,
        unitPrice,
        code: product.produtoId || '',
        name: product.nome || '',
        measure: product.medida || ''
      });
    }
    const totalQuantity = normalizedItems.reduce((sum, item) => sum + item.quantity, 0);
    const movimenta = cargaMovimentaEstoque(tipo, pedidoId);

    const request = new sql.Request(transaction)
      .input('tipo', sql.NVarChar(20), tipo)
      .input('data', sql.Date, data)
      .input('motorista', sql.NVarChar(100), header.motorista)
      .input('funcionario', sql.NVarChar(100), header.funcionario)
      .input('transportadora', sql.NVarChar(150), header.transportadora)
      .input('nf', sql.NVarChar(30), header.nf)
      .input('pedidoId', sql.UniqueIdentifier, pedidoId)
      .input('qtd', sql.Int, totalQuantity)
      .input('status', sql.NVarChar(30), status || null)
      .input('movimentado', sql.Bit, movimenta);
    let cargaId;
    if (existingCargaId) {
      request.input('id', sql.UniqueIdentifier, existingCargaId);
      await request.query(`UPDATE dbo.cargas
        SET tipo=@tipo, data=@data, motorista=@motorista, funcionario=@funcionario, transportadora=@transportadora,
            nf=@nf, pedidoId=@pedidoId, qtd=@qtd, status=@status, estoqueMovimentado=@movimentado
        WHERE id=@id`);
      cargaId = existingCargaId;
    } else {
      const inserted = await request.query(`DECLARE @saida TABLE (id uniqueidentifier); INSERT INTO dbo.cargas
          (tipo, data, motorista, funcionario, transportadora, nf, pedidoId, qtd, status, estoqueMovimentado)
        OUTPUT inserted.id INTO @saida
        VALUES (@tipo, @data, @motorista, @funcionario, @transportadora, @nf, @pedidoId, @qtd, @status, @movimentado); SELECT id FROM @saida;`);
      cargaId = inserted.recordset[0].id;
    }

    for (const item of normalizedItems) {
      await new sql.Request(transaction)
        .input('cargaId', sql.UniqueIdentifier, cargaId)
        .input('produtoRef', sql.UniqueIdentifier, item.productRef)
        .input('produtoId', sql.NVarChar(60), item.code)
        .input('item', sql.NVarChar(200), item.name)
        .input('medida', sql.NVarChar(60), item.measure)
        .input('qtd', sql.Int, item.quantity)
        .input('valorUnitario', sql.Decimal(12, 2), item.unitPrice)
        .query(`INSERT INTO dbo.carga_itens (cargaId, produtoRef, produtoId, item, medida, qtd, valorUnitario)
                VALUES (@cargaId, @produtoRef, @produtoId, @item, @medida, @qtd, @valorUnitario)`);
      if (movimenta) {
        await changeStock(
          transaction,
          item.productRef,
          tipo === 'descarga' ? item.quantity : -item.quantity,
          item.name
        );
      }
    }

    return { id: String(cargaId), totalPecas: totalQuantity, estoqueMovimentado: movimenta };
  });
}

async function getCargaForPdf(pool, id) {
  const validId = parseGuid(id, 'Identificador do movimento');
  const cargaResult = await pool.request().input('id', sql.UniqueIdentifier, validId)
    .query(`SELECT c.id, c.tipo, CONVERT(nvarchar(10), c.data, 23) AS data, c.placa, c.motorista, c.funcionario,
                   c.transportadora, c.parceiro, c.nf, c.qtd, c.item, c.status, c.estoqueMovimentado,
                   p.id AS pedidoId, p.numero AS pedidoNumero, COALESCE(cl.nome, p.cliente) AS cliente,
                   cl.documento AS clienteDocumento
            FROM dbo.cargas c
            LEFT JOIN dbo.pedidos p ON p.id = c.pedidoId
            LEFT JOIN dbo.clientes cl ON cl.id = p.clienteId
            WHERE c.id = @id`);
  const carga = cargaResult.recordset[0];
  if (!carga) throw notFound('Movimento não encontrado.');
  const itensResult = await pool.request().input('id', sql.UniqueIdentifier, validId)
    .query(`SELECT ci.produtoId, ci.item, ci.medida, ci.qtd,
                   COALESCE(ci.valorUnitario, NULLIF(pr.preco, 0)) AS valorUnitario
            FROM dbo.carga_itens ci
            LEFT JOIN dbo.produtos pr ON pr.id = ci.produtoRef
            WHERE ci.cargaId = @id ORDER BY ci.criadoEm, ci.id`);
  let itens = itensResult.recordset;
  let itensDaVenda = false;
  if (!itens.length && carga.item) {
    // Registro antigo: um único produto gravado no próprio movimento.
    itens = [{ produtoId: '', item: carga.item, medida: '', qtd: carga.qtd }];
  } else if (!itens.length && carga.pedidoId) {
    // Movimento antigo vinculado à venda, sem produtos próprios: usa os pneus da venda.
    const vendaResult = await pool.request().input('id', sql.UniqueIdentifier, carga.pedidoId)
      .query(`SELECT produtoId, descricao AS item, medida, qtd, NULLIF(unitario, 0) AS valorUnitario FROM dbo.pedido_itens
              WHERE pedidoId = @id AND ISNULL(tipo, N'pneu') <> N'servico' ORDER BY criadoEm, id`);
    itens = vendaResult.recordset;
    itensDaVenda = itens.length > 0;
  }
  return { ...carga, itens, itensDaVenda };
}

module.exports = { CARGA_TIPOS, CARGA_STATUS, createOrUpdateCarga, getCargaForPdf };
