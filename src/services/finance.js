'use strict';

const { sql } = require('../core/sql');
const { badRequest, conflict, notFound } = require('../errors');
const {
  isObject,
  parseGuid,
  parseNumber,
  parseDate,
  localToday,
  limitedText,
  addDays,
  normalizeKey
} = require('../core/validators');
const { withTransaction } = require('../core/transaction');
const { loadCondicaoPagamento } = require('./lookups');
const { diasParcelas } = require('./payment-terms');

const LANCAMENTO_TIPOS = ['receber', 'pagar'];
const LANCAMENTO_STATUS = ['pendente', 'pago', 'cancelado'];

async function saveLancamento(pool, body, existingId = null, audit = null) {
  if (!isObject(body)) throw badRequest('O corpo do lançamento deve ser um objeto JSON.');
  return withTransaction(pool, audit, async (transaction) => {
    let current = null;
    if (existingId) {
      const result = await new sql.Request(transaction).input('id', sql.UniqueIdentifier, existingId)
        .query(`SELECT tipo, categoriaId, entidadeId, pessoa, descricao, documento, valor, condicaoPagamentoId,
                       CONVERT(nvarchar(10), emissao, 23) AS emissao, CONVERT(nvarchar(10), vencimento, 23) AS vencimento,
                       CONVERT(nvarchar(10), pagamento, 23) AS pagamento, formaPagamento, status, obs
                FROM dbo.financeiro_lancamentos WITH (UPDLOCK, HOLDLOCK) WHERE id = @id`);
      current = result.recordset[0];
      if (!current) throw notFound('Lançamento não encontrado.');
    }
    const pick = (key) => (Object.prototype.hasOwnProperty.call(body, key) ? body[key] : current?.[key]);

    const tipo = String(pick('tipo') ?? '')
      .trim()
      .toLowerCase();
    if (!LANCAMENTO_TIPOS.includes(tipo)) throw badRequest('Informe se o lançamento é a receber ou a pagar.');

    const categoriaId = Number(String(pick('categoriaId') ?? '').trim());
    if (!Number.isInteger(categoriaId) || categoriaId <= 0) {
      throw badRequest('Selecione a categoria do lançamento.');
    }
    const categoriaResult = await new sql.Request(transaction)
      .input('id', sql.Int, categoriaId)
      .query('SELECT nome, tipo, status FROM dbo.financeiroCategoria WHERE id = @id');
    const categoria = categoriaResult.recordset[0];
    if (!categoria) throw conflict('A categoria selecionada não existe.');
    if (
      String(categoria.status || '').toLowerCase() === 'inativo' &&
      Number(current?.categoriaId) !== categoriaId
    ) {
      throw conflict('A categoria selecionada está inativa.');
    }
    if (categoria.tipo && String(categoria.tipo).toLowerCase() !== tipo) {
      throw conflict(`A categoria "${categoria.nome}" é usada somente em lançamentos a ${categoria.tipo}.`);
    }

    const entidadeId = parseGuid(pick('entidadeId'), 'Entidade');
    let pessoa = limitedText(pick('pessoa'), 150, 'O nome do favorecido');
    if (entidadeId) {
      const entidade = await new sql.Request(transaction)
        .input('id', sql.UniqueIdentifier, entidadeId)
        .query('SELECT nome FROM dbo.clientes WHERE id = @id');
      if (!entidade.recordset[0]) throw conflict('A entidade selecionada não existe.');
      pessoa = String(entidade.recordset[0].nome || '').slice(0, 150);
    }
    const descricao = limitedText(pick('descricao'), 200, 'A descrição');
    const documento = limitedText(pick('documento'), 100, 'O número do documento/boleto');
    // Forma de pagamento vem do cadastro de condições; o texto antigo só é mantido
    // em lançamentos migrados que ainda não foram vinculados a uma condição.
    let condicaoPagamentoId = null;
    let formaPagamento = '';
    const condicaoInformada = pick('condicaoPagamentoId');
    if (condicaoInformada != null && String(condicaoInformada).trim() !== '') {
      const condicao = await loadCondicaoPagamento(
        transaction,
        condicaoInformada,
        current?.condicaoPagamentoId
      );
      condicaoPagamentoId = condicao.Codigo;
      formaPagamento = String(condicao.Descricao || '').slice(0, 100);
    } else if (current && !current.condicaoPagamentoId) {
      formaPagamento = String(current.formaPagamento || '').slice(0, 100);
    }
    const obs = limitedText(pick('obs'), 500, 'A observação');
    if (!pessoa && !descricao) throw badRequest('Informe a entidade/favorecido ou uma descrição.');

    const valor = parseNumber(pick('valor'), 'Valor');
    if (!(valor > 0)) throw badRequest('Informe um valor maior que zero.');
    if (valor > 9_999_999_999.99) throw badRequest('O valor excede o limite permitido.');

    const emissao = parseDate(pick('emissao') || localToday(), 'Data de emissão');
    const vencimento = parseDate(pick('vencimento'), 'Vencimento');
    if (!vencimento) throw badRequest('Informe a data de vencimento.');

    const status = String(pick('status') || 'pendente')
      .trim()
      .toLowerCase();
    if (!LANCAMENTO_STATUS.includes(status)) throw badRequest('Situação do lançamento inválida.');
    let pagamento = null;
    if (status === 'pago') {
      pagamento = parseDate(pick('pagamento'), 'Data do pagamento');
      // Ao marcar como pago sem informar a data, usa a data de hoje.
      if (!pagamento && String(current?.status || '').toLowerCase() !== 'pago') {
        pagamento = parseDate(localToday());
      }
    }

    const request = new sql.Request(transaction)
      .input('tipo', sql.NVarChar(10), tipo)
      .input('categoriaId', sql.Int, categoriaId)
      .input('entidadeId', sql.UniqueIdentifier, entidadeId)
      .input('pessoa', sql.NVarChar(150), pessoa || null)
      .input('descricao', sql.NVarChar(200), descricao || null)
      .input('documento', sql.NVarChar(100), documento || null)
      .input('valor', sql.Decimal(12, 2), Math.round((valor + Number.EPSILON) * 100) / 100)
      .input('emissao', sql.Date, emissao)
      .input('vencimento', sql.Date, vencimento)
      .input('pagamento', sql.Date, pagamento)
      .input('formaPagamento', sql.NVarChar(100), formaPagamento || null)
      .input('condicaoPagamentoId', sql.Int, condicaoPagamentoId)
      .input('status', sql.NVarChar(20), status)
      .input('obs', sql.NVarChar(500), obs || null);
    let id = existingId;
    if (existingId) {
      await request.input('id', sql.UniqueIdentifier, existingId).query(`UPDATE dbo.financeiro_lancamentos
                SET tipo=@tipo, categoriaId=@categoriaId, entidadeId=@entidadeId, pessoa=@pessoa, descricao=@descricao,
                    documento=@documento, valor=@valor, emissao=@emissao, vencimento=@vencimento, pagamento=@pagamento,
                    formaPagamento=@formaPagamento, condicaoPagamentoId=@condicaoPagamentoId, status=@status, obs=@obs
                WHERE id=@id`);
    } else {
      const inserted =
        await request.query(`DECLARE @saida TABLE (id uniqueidentifier); INSERT INTO dbo.financeiro_lancamentos
          (tipo, categoriaId, entidadeId, pessoa, descricao, documento, valor, emissao, vencimento, pagamento, formaPagamento, condicaoPagamentoId, status, obs, origem)
        OUTPUT inserted.id INTO @saida
        VALUES (@tipo, @categoriaId, @entidadeId, @pessoa, @descricao, @documento, @valor, @emissao, @vencimento, @pagamento, @formaPagamento, @condicaoPagamentoId, @status, @obs, N'manual'); SELECT id FROM @saida;`);
      id = inserted.recordset[0].id;
    }
    return { id: String(id) };
  });
}

// Venda faturada: cria os lançamentos a receber no Financeiro (uma vez por venda).
// A prazo (PrazoMedio > 0): um título por parcela. À vista: um lançamento vencendo hoje.
// Venda "pago e faturado": um lançamento único já recebido.
async function createSaleReceivable(transaction, orderId) {
  const result = await new sql.Request(transaction).input('id', sql.UniqueIdentifier, orderId)
    .query(`SELECT p.numero, p.clienteId, p.cliente, p.pagamento, p.status, ISNULL(p.descontoValor, 0) AS desconto,
                   (SELECT ISNULL(SUM(i.qtd * i.unitario), 0) FROM dbo.pedido_itens i WHERE i.pedidoId = p.id) AS subtotal,
                   (SELECT COUNT(1) FROM dbo.financeiro_lancamentos l WHERE l.pedidoId = p.id AND l.status <> N'cancelado') AS existentes,
                   cp.Codigo AS condicaoCodigo, cp.Descricao AS condicaoDescricao, cp.Tipo AS condicaoTipo,
                   cp.QuantidadeParcelas, cp.PrazoMedio
            FROM dbo.pedidos p
            LEFT JOIN dbo.CondicoesPagamento cp ON cp.Codigo = p.condicaoPagamentoId
            WHERE p.id = @id`);
  const order = result.recordset[0];
  if (!order || Number(order.existentes) > 0 || !order.condicaoCodigo) return;
  // À vista (prazo médio 0) gera um único lançamento vencendo no dia do faturamento.
  const dias = diasParcelas(order.QuantidadeParcelas, order.PrazoMedio);
  const valorTotal =
    Math.round((Math.max(0, Number(order.subtotal) - Number(order.desconto)) + Number.EPSILON) * 100) / 100;
  if (valorTotal <= 0) return;

  const hoje = localToday();
  const pago = String(order.status || '').toLowerCase() === 'pago';
  const centavos = Math.round(valorTotal * 100);
  // Venda "pago e faturado" entra como recebida; "faturado" fica pendente
  // (à vista vencendo hoje; a prazo uma parcela por vencimento).
  const parcelas =
    pago || !dias.length
      ? [{ dias: 0, centavos }]
      : dias.map((dia, indice) => {
          const base = Math.floor(centavos / dias.length);
          return {
            dias: dia,
            centavos: indice === dias.length - 1 ? centavos - base * (dias.length - 1) : base
          };
        });
  for (const [indice, parcela] of parcelas.entries()) {
    const descricao =
      parcelas.length > 1
        ? `Venda ${order.numero} · parcela ${indice + 1}/${parcelas.length}`
        : `Venda ${order.numero}`;
    await new sql.Request(transaction)
      .input(
        'categoria',
        sql.NVarChar(80),
        normalizeKey(order.condicaoTipo) === 'boleto' ? 'Boleto de cliente' : 'Venda'
      )
      .input('entidadeId', sql.UniqueIdentifier, order.clienteId || null)
      .input('pessoa', sql.NVarChar(150), String(order.cliente || '').slice(0, 150) || null)
      .input('descricao', sql.NVarChar(200), descricao)
      .input('valor', sql.Decimal(12, 2), parcela.centavos / 100)
      .input('emissao', sql.Date, parseDate(hoje))
      .input('vencimento', sql.Date, parseDate(addDays(hoje, parcela.dias)))
      .input('pagamento', sql.Date, pago ? parseDate(hoje) : null)
      .input('formaPagamento', sql.NVarChar(100), String(order.condicaoDescricao || '').slice(0, 100))
      .input('condicaoPagamentoId', sql.Int, order.condicaoCodigo)
      .input('status', sql.NVarChar(20), pago ? 'pago' : 'pendente')
      .input('pedidoId', sql.UniqueIdentifier, orderId).query(`INSERT INTO dbo.financeiro_lancamentos
                (tipo, categoriaId, entidadeId, pessoa, descricao, valor, emissao, vencimento, pagamento, formaPagamento,
                 condicaoPagamentoId, status, origem, pedidoId)
              VALUES (N'receber', (SELECT id FROM dbo.financeiroCategoria WHERE nome = @categoria),
                      (SELECT id FROM dbo.clientes WHERE id = @entidadeId), @pessoa, @descricao, @valor, @emissao,
                      @vencimento, @pagamento, @formaPagamento, @condicaoPagamentoId, @status, N'venda', @pedidoId)`);
  }
}

// Venda que deixa de estar faturada (ex.: cancelada): cancela os títulos pendentes gerados por ela.
async function cancelSaleReceivables(transaction, orderId) {
  await new sql.Request(transaction).input('id', sql.UniqueIdentifier, orderId)
    .query(`UPDATE dbo.financeiro_lancamentos SET status = N'cancelado'
            WHERE pedidoId = @id AND origem = N'venda' AND status = N'pendente'`);
}

module.exports = {
  LANCAMENTO_TIPOS,
  LANCAMENTO_STATUS,
  saveLancamento,
  createSaleReceivable,
  cancelSaleReceivables
};
