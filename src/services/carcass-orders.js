'use strict';

const { sql } = require('../core/sql');
const { badRequest, conflict, notFound } = require('../errors');
const { isObject, getText, parseDate, parseGuid, localToday, parseNumber } = require('../core/validators');
const { normalizeSaleUnitPrice } = require('../sale-prices');
const { withTransaction } = require('../core/transaction');

function normalizeCarcacaCategoria(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

// Apontamento de entrada de carcaças: ordem com itens (produtos da categoria
// Carcaça), valor unitário por carcaça, total por linha e total do apontamento.
async function createOrUpdateCarcacaOrdem(pool, body, existingOrdemId = null, audit = null) {
  if (!isObject(body)) throw badRequest('O corpo do apontamento deve ser um objeto JSON.');
  const data = parseDate(body.data || localToday(), 'Data');
  const dono = getText(body, 'dono');
  const origem = getText(body, 'origem');
  const obs = getText(body, 'obs');
  const status = String(getText(body, 'status') || 'registrado')
    .trim()
    .toLowerCase();
  if (!['registrado', 'conferido'].includes(status)) throw conflict('Status de apontamento inválido.');

  const itens = body.itens;
  if (!Array.isArray(itens) || itens.length === 0) {
    throw conflict('Selecione ao menos uma carcaça antes de salvar o apontamento.');
  }

  return withTransaction(pool, audit, async (transaction) => {
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
      const productResult = await new sql.Request(transaction).input('id', sql.UniqueIdentifier, productRef)
        .query(`SELECT p.produtoId, p.nome, p.medida, p.custo, COALESCE(pc.nome, p.categoria) AS categoria
                FROM dbo.produtos p
                LEFT JOIN dbo.produtoCategoria pc ON pc.id = p.categoriaId
                WHERE p.id = @id AND p.status <> N'Inativo'`);
      const product = productResult.recordset[0];
      if (!product) throw conflict('Uma das carcaças selecionadas não existe ou está inativa.');
      if (!['carcaca', 'carcacas'].includes(normalizeCarcacaCategoria(product.categoria))) {
        throw conflict('Somente produtos da categoria Carcaça podem entrar no apontamento.');
      }
      const unitValue = normalizeSaleUnitPrice(
        item.valorUnitario,
        product.custo,
        'Valor unitário da carcaça'
      );
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
        .query(`DECLARE @saida TABLE (id uniqueidentifier, numero nvarchar(20)); UPDATE dbo.carcaca_ordens
                SET data=@data, dono=@dono, origem=@origem, status=@status, obs=@obs, total=@total
                OUTPUT inserted.id, inserted.numero INTO @saida
                WHERE id=@id AND status=N'registrado'; SELECT id, numero FROM @saida;`);
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
        .query(`DECLARE @saida TABLE (id uniqueidentifier, numero nvarchar(20)); INSERT INTO dbo.carcaca_ordens (numero, data, dono, origem, status, obs, total)
                OUTPUT inserted.id, inserted.numero INTO @saida
                VALUES ('CAR-' + FORMAT(NEXT VALUE FOR dbo.seq_carcaca_ordem, '0000'), @data, @dono, @origem, @status, @obs, @total); SELECT id, numero FROM @saida;`);
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
        .input('valorTotal', sql.Decimal(12, 2), item.lineTotal).query(`INSERT INTO dbo.carcaca_ordem_itens
                  (ordemId, produtoRef, produtoId, item, medida, qtd, valorUnitario, valorTotal)
                VALUES (@ordemId, @produtoRef, @produtoId, @item, @medida, @qtd, @valorUnitario, @valorTotal)`);
    }

    return { id: String(ordemId), numero: String(ordemNumero), total };
  });
}

// ---------------------------------------------------------------------------
// Carga e descarga com vários produtos e movimentação de estoque.
// Regra: descarga = entrada; carga = saída. Carga vinculada a uma venda NÃO
// movimenta, porque o estoque dessa venda já foi baixado no faturamento.
// O campo estoqueMovimentado guarda se aquele movimento alterou o estoque,
// para desfazer corretamente ao editar ou excluir.

async function getCarcacaOrdemForPdf(pool, id) {
  const validId = parseGuid(id, 'Identificador do apontamento');
  const ordemResult = await pool.request().input('id', sql.UniqueIdentifier, validId)
    .query(`SELECT numero, CONVERT(nvarchar(10), data, 23) AS data, dono, origem, status, obs, total
            FROM dbo.carcaca_ordens WHERE id = @id`);
  const ordem = ordemResult.recordset[0];
  if (!ordem) throw notFound('Apontamento não encontrado.');
  const itensResult = await pool.request().input('id', sql.UniqueIdentifier, validId)
    .query(`SELECT produtoId, item, medida, qtd, valorUnitario, valorTotal
            FROM dbo.carcaca_ordem_itens WHERE ordemId = @id ORDER BY criadoEm, id`);
  return { ...ordem, itens: itensResult.recordset };
}

module.exports = { normalizeCarcacaCategoria, createOrUpdateCarcacaOrdem, getCarcacaOrdemForPdf };
