'use strict';

const { sql } = require('../core/sql');
const { badRequest, conflict, notFound } = require('../errors');
const { isObject, parseNumber, normalizeKey, parseCodigo, limitedText } = require('../core/validators');
const { withTransaction } = require('../core/transaction');

const CONDICAO_TIPOS = [
  'Dinheiro',
  'PIX',
  'Cartão de crédito',
  'Cartão de débito',
  'Boleto',
  'Transferência',
  'Cheque',
  'Crediário',
  'Outros'
];

function diasParcelas(quantidade, prazoMedio) {
  const n = Math.max(1, Number(quantidade) || 1);
  const prazo = Math.max(0, Number(prazoMedio) || 0);
  if (prazo === 0) return [];
  const intervalo = Math.max(1, Math.round((2 * prazo) / (n + 1)));
  return Array.from({ length: n }, (_, indice) => intervalo * (indice + 1));
}

async function saveCondicaoPagamento(pool, body, existingCodigo = null, audit = null) {
  if (!isObject(body)) throw badRequest('O corpo da forma de pagamento deve ser um objeto JSON.');
  const codigoAtual = existingCodigo == null ? null : parseCodigo(existingCodigo);
  return withTransaction(pool, audit, async (transaction) => {
    let current = null;
    if (codigoAtual) {
      const result = await new sql.Request(transaction)
        .input('codigo', sql.Int, codigoAtual)
        .query(
          'SELECT Descricao, Tipo, QuantidadeParcelas, PrazoMedio, Status FROM dbo.CondicoesPagamento WITH (UPDLOCK, HOLDLOCK) WHERE Codigo = @codigo'
        );
      current = result.recordset[0];
      if (!current) throw notFound('Forma de pagamento não encontrada.');
    }
    const pick = (key) => (Object.prototype.hasOwnProperty.call(body, key) ? body[key] : current?.[key]);

    const descricao = limitedText(pick('Descricao'), 100, 'A descrição');
    if (!descricao) throw badRequest('Informe a descrição da forma de pagamento.');
    const tipo = CONDICAO_TIPOS.find((item) => normalizeKey(item) === normalizeKey(pick('Tipo')));
    if (!tipo) throw badRequest(`Tipo inválido. Use: ${CONDICAO_TIPOS.join(', ')}.`);
    const parcelas = parseNumber(pick('QuantidadeParcelas') ?? 1, 'Quantidade de parcelas', {
      integer: true
    });
    if (parcelas < 1 || parcelas > 120) {
      throw badRequest('A quantidade de parcelas deve estar entre 1 e 120.');
    }
    const prazo = parseNumber(pick('PrazoMedio') ?? 0, 'Prazo médio', { integer: true });
    if (prazo < 0 || prazo > 3650) throw badRequest('O prazo médio deve estar entre 0 e 3650 dias.');
    const statusTexto = normalizeKey(pick('Status') || 'Ativo');
    if (!['ativo', 'inativo'].includes(statusTexto)) throw badRequest('Status inválido.');
    const status = statusTexto === 'ativo' ? 'Ativo' : 'Inativo';

    const repetida = await new sql.Request(transaction)
      .input('descricao', sql.NVarChar(100), descricao)
      .input('codigo', sql.Int, codigoAtual)
      .query(`SELECT TOP (1) Codigo FROM dbo.CondicoesPagamento WITH (UPDLOCK, HOLDLOCK)
              WHERE LTRIM(RTRIM(Descricao)) = @descricao AND (@codigo IS NULL OR Codigo <> @codigo)`);
    if (repetida.recordset[0]) {
      throw conflict(`Já existe uma forma de pagamento com a descrição "${descricao}".`);
    }

    const request = new sql.Request(transaction)
      .input('descricao', sql.NVarChar(100), descricao)
      .input('tipo', sql.NVarChar(40), tipo)
      .input('parcelas', sql.Int, parcelas)
      .input('prazo', sql.Int, prazo)
      .input('status', sql.NVarChar(30), status);
    let codigo = codigoAtual;
    if (codigoAtual) {
      await request.input('codigo', sql.Int, codigoAtual).query(`UPDATE dbo.CondicoesPagamento
        SET Descricao = @descricao, Tipo = @tipo, QuantidadeParcelas = @parcelas, PrazoMedio = @prazo, Status = @status
        WHERE Codigo = @codigo`);
    } else {
      const inserted =
        await request.query(`DECLARE @saida TABLE (Codigo int); INSERT INTO dbo.CondicoesPagamento (Descricao, Tipo, QuantidadeParcelas, PrazoMedio, Status)
        OUTPUT inserted.Codigo INTO @saida VALUES (@descricao, @tipo, @parcelas, @prazo, @status); SELECT Codigo FROM @saida;`);
      codigo = inserted.recordset[0].Codigo;
    }
    return { id: String(codigo) };
  });
}

async function deleteCondicaoPagamento(pool, value, audit = null) {
  const codigo = parseCodigo(value);
  return withTransaction(pool, audit, async (transaction) => {
    const uso = await new sql.Request(transaction).input('codigo', sql.Int, codigo)
      .query(`SELECT (SELECT COUNT(1) FROM dbo.pedidos WHERE condicaoPagamentoId = @codigo) AS vendas,
                     (SELECT COUNT(1) FROM dbo.financeiro_lancamentos WHERE condicaoPagamentoId = @codigo) AS lancamentos`);
    const { vendas, lancamentos } = uso.recordset[0];
    if (Number(vendas) || Number(lancamentos)) {
      throw conflict(
        `Esta forma de pagamento já foi usada (${vendas} venda(s) e ${lancamentos} lançamento(s)) e não pode ser excluída. Altere o status para Inativo.`
      );
    }
    const result = await new sql.Request(transaction)
      .input('codigo', sql.Int, codigo)
      .query('DELETE FROM dbo.CondicoesPagamento WHERE Codigo = @codigo');
    if (result.rowsAffected[0] === 0) throw notFound('Forma de pagamento não encontrada.');
  });
}

module.exports = { CONDICAO_TIPOS, diasParcelas, saveCondicaoPagamento, deleteCondicaoPagamento };
