'use strict';

const { sql } = require('../core/sql');
const { conflict, notFound } = require('../errors');

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
    .input('medida', sql.NVarChar(60), product.medida || '').query(`
      IF EXISTS (SELECT 1 FROM dbo.estoque WHERE produtoRef = @id)
        UPDATE dbo.estoque SET produtoId=@produtoId, item=@nome, medida=@medida WHERE produtoRef=@id;
      ELSE
        INSERT INTO dbo.estoque (produtoRef, produtoId, item, medida, tipo, qtd, minimo)
        VALUES (@id, @produtoId, @nome, @medida, N'produto', 0, 0);`);
}

async function adjustOrderStock(transaction, orderId, subtract) {
  const result = await new sql.Request(transaction).input('id', sql.UniqueIdentifier, orderId)
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
      throw conflict(
        'Estoque local insuficiente para um dos pneus. Ajuste o estoque e tente faturar novamente.'
      );
    }
  }
}

function cargaMovimentaEstoque(tipo, pedidoId) {
  return tipo === 'descarga' || (tipo === 'carga' && !pedidoId);
}

async function ensureStockRow(transaction, productRef) {
  await new sql.Request(transaction).input('id', sql.UniqueIdentifier, productRef)
    .query(`IF NOT EXISTS (SELECT 1 FROM dbo.estoque WHERE produtoRef = @id)
              INSERT INTO dbo.estoque (produtoRef, produtoId, item, medida, tipo, qtd, minimo)
              SELECT p.id, p.produtoId, p.nome, p.medida, N'produto', 0, 0 FROM dbo.produtos p WHERE p.id = @id;`);
}

// delta > 0 soma no estoque; delta < 0 subtrai (bloqueando saldo negativo).
async function changeStock(
  transaction,
  productRef,
  delta,
  label,
  { skipMissing = false, reverting = false } = {}
) {
  if (!delta) return;
  if (delta > 0) {
    await ensureStockRow(transaction, productRef);
    const outcome = await new sql.Request(transaction)
      .input('qtd', sql.Int, delta)
      .input('produto', sql.UniqueIdentifier, productRef)
      .query('UPDATE dbo.estoque SET qtd = qtd + @qtd WHERE produtoRef = @produto');
    if (outcome.rowsAffected[0] !== 1 && !skipMissing) {
      throw conflict(`Produto ${label} não encontrado no estoque.`);
    }
    return;
  }
  const quantity = -delta;
  const outcome = await new sql.Request(transaction)
    .input('qtd', sql.Int, quantity)
    .input('produto', sql.UniqueIdentifier, productRef)
    .query('UPDATE dbo.estoque SET qtd = qtd - @qtd WHERE produtoRef = @produto AND qtd >= @qtd');
  if (outcome.rowsAffected[0] === 1) return;
  const exists = await new sql.Request(transaction)
    .input('produto', sql.UniqueIdentifier, productRef)
    .query('SELECT qtd FROM dbo.estoque WHERE produtoRef = @produto');
  const row = exists.recordset[0];
  if (!row && skipMissing) return;
  if (!row) throw conflict(`Produto ${label} não encontrado no estoque.`);
  throw conflict(
    reverting
      ? `Não é possível desfazer o movimento: o estoque de ${label} tem ${row.qtd} un. e seriam retiradas ${quantity}.`
      : `Estoque insuficiente para ${label}: disponível ${row.qtd} un., solicitado ${quantity}.`
  );
}

async function revertCargaStock(transaction, cargaId, tipo) {
  const result = await new sql.Request(transaction).input('id', sql.UniqueIdentifier, cargaId)
    .query(`SELECT produtoRef, MAX(COALESCE(item, produtoId, N'')) AS item, SUM(qtd) AS quantidade
            FROM dbo.carga_itens WHERE cargaId = @id AND produtoRef IS NOT NULL
            GROUP BY produtoRef`);
  const sign = String(tipo || '').toLowerCase() === 'descarga' ? -1 : 1; // desfaz o efeito original
  for (const row of result.recordset) {
    await changeStock(transaction, row.produtoRef, sign * Number(row.quantidade), row.item || 'produto', {
      skipMissing: true,
      reverting: true
    });
  }
}

module.exports = {
  syncProductStock,
  adjustOrderStock,
  cargaMovimentaEstoque,
  ensureStockRow,
  changeStock,
  revertCargaStock
};
