'use strict';

const { sql } = require('../core/sql');
const { tables } = require('../definitions');
const { badRequest, conflict, notFound } = require('../errors');
const { isObject, parseGuid, isSaleCompleted } = require('../core/validators');
const { bindColumn, dateSelect } = require('../core/columns');
const { withTransaction } = require('../core/transaction');
const {
  validateCargaPedido,
  validateTipoEntidade,
  validateProdutoCodigo,
  validateProdutoCategoria,
  loadCondicaoPagamento
} = require('./lookups');
const { syncProductStock, adjustOrderStock, revertCargaStock } = require('./stock');
const { saveLancamento, createSaleReceivable, cancelSaleReceivables } = require('./finance');
const { saveCondicaoPagamento, deleteCondicaoPagamento } = require('./payment-terms');

async function readTable(pool, definition) {
  const columns = [
    ...definition.columns.map(dateSelect),
    ...(definition.extras || []).map((name) => `t.[${name}]`),
    ...Object.entries(definition.computed || {}).map(([name, expression]) => `${expression} AS [${name}]`)
  ];
  const selected = [`t.[${definition.key || 'id'}] AS [id]`, ...columns].join(', ');
  const result = await pool
    .request()
    .query(
      `SELECT ${selected} FROM dbo.[${definition.table}] t ${definition.joins || ''} ORDER BY ${definition.orderBy || 't.[criadoEm] DESC'}`
    );
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
  const embedOnly = new Set(['itens', 'carcacaOrdemItens', 'cargaItens']);
  for (const [route, definition] of Object.entries(tables)) {
    if (!embedOnly.has(route)) data[route] = await readTable(pool, definition);
  }
  embedItems(data.pedidos, await readTable(pool, tables.itens), 'pedidoId');
  embedItems(data.carcacaOrdens, await readTable(pool, tables.carcacaOrdemItens), 'ordemId');
  embedItems(data.cargas, await readTable(pool, tables.cargaItens), 'cargaId');
  return data;
}

function ensureWritableRoute(definition) {
  if (definition.readOnlyRoute) throw conflict('Este cadastro é somente leitura.');
}

async function createRow(pool, route, body, audit = null) {
  const definition = tables[route];
  if (!definition) throw notFound('Rota não encontrada.');
  ensureWritableRoute(definition);
  if (!isObject(body)) throw badRequest('O corpo da requisição deve ser um objeto JSON.');
  if (route === 'pedidos' || route === 'itens') {
    throw conflict(
      'Pedidos e itens devem ser criados pelo fluxo de vendas para preservar o estoque e os preços.'
    );
  }
  if (route === 'carcacaOrdens' || route === 'carcacaOrdemItens') {
    throw conflict('Apontamentos de carcaças e seus itens devem ser criados pelo fluxo de apontamentos.');
  }
  if (route === 'cargas') {
    throw conflict('Movimentos de carga e descarga devem ser salvos pelo fluxo próprio, com os produtos.');
  }
  if (route === 'lancamentos') return saveLancamento(pool, body, null, audit);
  if (route === 'condicoesPagamento') return saveCondicaoPagamento(pool, body, null, audit);

  const fields = definition.columns.filter(
    (column) => !column.readOnly && Object.prototype.hasOwnProperty.call(body, column.name)
  );
  if (fields.length === 0) throw badRequest('Informe ao menos um campo para salvar.');

  return withTransaction(pool, audit, async (transaction) => {
    if (route === 'cargas' && Object.prototype.hasOwnProperty.call(body, 'pedidoId')) {
      await validateCargaPedido(transaction, body.pedidoId);
    }
    if (route === 'clientes') {
      body.tipoEntidadeId = await validateTipoEntidade(transaction, body.tipoEntidadeId);
      if (!fields.some((field) => field.name === 'tipoEntidadeId')) {
        fields.push(definition.columns.find((column) => column.name === 'tipoEntidadeId'));
      }
    }
    if (route === 'produtos') {
      body.produtoId = await validateProdutoCodigo(transaction, body.produtoId);
      if (!fields.some((field) => field.name === 'produtoId')) {
        fields.push(definition.columns.find((column) => column.name === 'produtoId'));
      }
      body.categoriaId = await validateProdutoCategoria(transaction, body.categoriaId);
      if (!fields.some((field) => field.name === 'categoriaId')) {
        fields.push(definition.columns.find((column) => column.name === 'categoriaId'));
      }
    }
    const request = new sql.Request(transaction);
    for (const field of fields) bindColumn(request, field, body[field.name]);
    const names = fields.map((field) => `[${field.name}]`).join(', ');
    const values = fields.map((field) => `@${field.name}`).join(', ');
    const result = await request.query(
      `DECLARE @saida TABLE (id uniqueidentifier); INSERT INTO dbo.[${definition.table}] (${names}) OUTPUT inserted.id INTO @saida VALUES (${values}); SELECT id FROM @saida;`
    );
    const id = result.recordset[0].id;
    if (route === 'produtos') await syncProductStock(transaction, id);
    return { id: String(id) };
  });
}

async function updateRow(pool, route, id, body, audit = null) {
  const definition = tables[route];
  if (!definition) throw notFound('Rota não encontrada.');
  ensureWritableRoute(definition);
  if (!isObject(body)) throw badRequest('O corpo da requisição deve ser um objeto JSON.');
  if (route === 'condicoesPagamento') {
    await saveCondicaoPagamento(pool, body, id, audit);
    return;
  }
  const validId = parseGuid(id, 'Identificador');
  if (route === 'lancamentos') {
    await saveLancamento(pool, body, validId, audit);
    return;
  }

  return withTransaction(pool, audit, async (transaction) => {
    if (route === 'cargas' && Object.prototype.hasOwnProperty.call(body, 'pedidoId')) {
      await validateCargaPedido(transaction, body.pedidoId, validId);
    }
    if (route === 'cargas') {
      throw conflict('Movimentos de carga e descarga devem ser salvos pelo fluxo próprio, com os produtos.');
    }
    if (route === 'clientes' && Object.prototype.hasOwnProperty.call(body, 'tipoEntidadeId')) {
      body.tipoEntidadeId = await validateTipoEntidade(transaction, body.tipoEntidadeId, validId);
    }
    if (route === 'produtos' && Object.prototype.hasOwnProperty.call(body, 'produtoId')) {
      body.produtoId = await validateProdutoCodigo(transaction, body.produtoId, validId);
    }
    if (route === 'produtos' && Object.prototype.hasOwnProperty.call(body, 'categoriaId')) {
      body.categoriaId = await validateProdutoCategoria(transaction, body.categoriaId, validId);
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
      if (
        Object.prototype.hasOwnProperty.call(body, 'status') &&
        !['orçamento', 'faturado', 'pago', 'cancelado'].includes(String(body.status).toLowerCase())
      ) {
        throw conflict('Status de pedido inválido.');
      }
      // A forma de pagamento sempre vem do cadastro CondicoesPagamento; o texto é só cópia da descrição.
      delete body.pagamento;
      if (Object.prototype.hasOwnProperty.call(body, 'condicaoPagamentoId')) {
        const atual = await new sql.Request(transaction)
          .input('id', sql.UniqueIdentifier, validId)
          .query('SELECT condicaoPagamentoId FROM dbo.pedidos WHERE id = @id');
        const condicao = await loadCondicaoPagamento(
          transaction,
          body.condicaoPagamentoId,
          atual.recordset[0]?.condicaoPagamentoId
        );
        body.condicaoPagamentoId = condicao.Codigo;
        body.pagamento = String(condicao.Descricao || '').slice(0, 100);
      }
    }

    const fields = definition.columns.filter(
      (column) => !column.readOnly && Object.prototype.hasOwnProperty.call(body, column.name)
    );
    if (fields.length > 0) {
      const request = new sql.Request(transaction).input('id', sql.UniqueIdentifier, validId);
      for (const field of fields) bindColumn(request, field, body[field.name]);
      const assignments = fields.map((field) => `[${field.name}] = @${field.name}`).join(', ');
      const result = await request.query(
        `UPDATE dbo.[${definition.table}] SET ${assignments} WHERE id = @id`
      );
      if (result.rowsAffected[0] === 0) throw notFound('Registro não encontrado.');
    }

    if (
      route === 'pedidos' &&
      previousOrderStatus != null &&
      Object.prototype.hasOwnProperty.call(body, 'status')
    ) {
      const newStatus = String(body.status || '');
      if (!isSaleCompleted(previousOrderStatus) && isSaleCompleted(newStatus)) {
        await adjustOrderStock(transaction, validId, true);
        await createSaleReceivable(transaction, validId);
      } else if (isSaleCompleted(previousOrderStatus) && !isSaleCompleted(newStatus)) {
        await adjustOrderStock(transaction, validId, false);
        await cancelSaleReceivables(transaction, validId);
      }
    }

    if (route === 'produtos') await syncProductStock(transaction, validId);
  });
}

async function deleteRow(pool, route, id, audit = null) {
  const definition = tables[route];
  if (!definition) throw notFound('Rota não encontrada.');
  ensureWritableRoute(definition);
  if (route === 'condicoesPagamento') return deleteCondicaoPagamento(pool, id, audit);
  if (route === 'pedidos') {
    throw conflict('Pedidos não são excluídos. Use "Cancelar pedido" para manter o histórico.');
  }
  const validId = parseGuid(id, 'Identificador');
  return withTransaction(pool, audit, async (transaction) => {
    if (route === 'cargas') {
      const existing = await new sql.Request(transaction)
        .input('id', sql.UniqueIdentifier, validId)
        .query('SELECT tipo, estoqueMovimentado FROM dbo.cargas WITH (UPDLOCK, HOLDLOCK) WHERE id = @id');
      const carga = existing.recordset[0];
      if (!carga) throw notFound('Movimento não encontrado.');
      if (carga.estoqueMovimentado) await revertCargaStock(transaction, validId, carga.tipo);
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
  });
}

module.exports = { readTable, embedItems, getAllData, ensureWritableRoute, createRow, updateRow, deleteRow };
