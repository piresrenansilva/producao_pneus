'use strict';

const { sql } = require('../core/sql');
const { badRequest, conflict } = require('../errors');
const { parseGuid, parseNumber, parseCodigo, isSaleCompleted } = require('../core/validators');

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

async function validateProdutoCategoria(transaction, value, currentProductId = null) {
  const text = value == null ? '' : String(value).trim();
  if (!text) throw badRequest('Selecione a categoria do produto.');
  const categoriaId = Number(text);
  if (!Number.isInteger(categoriaId) || categoriaId <= 0) throw badRequest('Categoria do produto inválida.');
  const result = await new sql.Request(transaction)
    .input('id', sql.Int, categoriaId)
    .query('SELECT status FROM dbo.produtoCategoria WHERE id = @id');
  const status = result.recordset[0]?.status;
  if (status == null) throw conflict('A categoria selecionada não existe.');
  if (String(status).toLowerCase() === 'inativo') {
    // Permite salvar um produto que já estava nessa categoria antes de ela ser inativada.
    if (currentProductId) {
      const current = await new sql.Request(transaction)
        .input('id', sql.UniqueIdentifier, currentProductId)
        .query('SELECT categoriaId FROM dbo.produtos WHERE id = @id');
      if (Number(current.recordset[0]?.categoriaId) === categoriaId) return categoriaId;
    }
    throw conflict('A categoria selecionada está inativa.');
  }
  return categoriaId;
}

const VENDEDOR_TIPO_ENTIDADE_ID = 4;

async function validateTipoEntidade(transaction, value, currentEntityId = null) {
  const tipoId = parseNumber(value, 'Tipo da entidade', { integer: true });
  if (tipoId <= 0) throw badRequest('Selecione o tipo da entidade.');

  const result = await new sql.Request(transaction)
    .input('id', sql.Int, tipoId)
    .query('SELECT status FROM dbo.tiposEntidades WHERE id = @id');
  const tipo = result.recordset[0];
  if (!tipo) throw conflict('O tipo de entidade selecionado não existe.');

  if (String(tipo.status || '').toLowerCase() === 'inativo') {
    if (currentEntityId) {
      const current = await new sql.Request(transaction)
        .input('id', sql.UniqueIdentifier, currentEntityId)
        .query('SELECT tipoEntidadeId FROM dbo.clientes WHERE id = @id');
      if (Number(current.recordset[0]?.tipoEntidadeId) === tipoId) return tipoId;
    }
    throw conflict('O tipo de entidade selecionado está inativo.');
  }
  return tipoId;
}

// A venda só pode ser vinculada a uma entidade do tipo Vendedor (id 4).
// Sem seleção explícita, usa a entidade Padrão garantida pela migração — ou o
// primeiro vendedor ativo, apenas como contingência.
async function loadVendedorDaVenda(transaction, vendedorId = null) {
  const request = new sql.Request(transaction).input('tipoId', sql.Int, VENDEDOR_TIPO_ENTIDADE_ID);
  let result;
  if (vendedorId) {
    result = await request.input('id', sql.UniqueIdentifier, vendedorId)
      .query(`SELECT id, LEFT(nome, 100) AS nome
              FROM dbo.clientes
              WHERE id = @id AND tipoEntidadeId = @tipoId AND status <> N'Inativo'`);
    if (!result.recordset[0]) {
      throw conflict('O vendedor selecionado não existe, não é do tipo Vendedor ou está inativo.');
    }
  } else {
    result = await request.query(`SELECT TOP (1) id, LEFT(nome, 100) AS nome
      FROM dbo.clientes
      WHERE tipoEntidadeId = @tipoId AND status <> N'Inativo'
      ORDER BY CASE WHEN nome COLLATE Latin1_General_CI_AI = N'Padrão' COLLATE Latin1_General_CI_AI THEN 0 ELSE 1 END,
               criadoEm, id`);
    if (!result.recordset[0]) {
      throw conflict(
        'Nenhum vendedor ativo foi encontrado. Cadastre uma entidade com tipo de id 4 (Vendedor).'
      );
    }
  }
  return result.recordset[0];
}

// Código do produto: obrigatório e sem repetição (ignora espaços nas pontas e
// maiúsculas/minúsculas, conforme a collation do banco).
async function validateProdutoCodigo(transaction, value, currentProductId = null) {
  const codigo = value == null ? '' : String(value).trim();
  if (!codigo) throw badRequest('Informe o código do produto.');
  if (codigo.length > 60) throw badRequest('O código do produto excede 60 caracteres.');
  const result = await new sql.Request(transaction)
    .input('codigo', sql.NVarChar(60), codigo)
    .input('id', sql.UniqueIdentifier, currentProductId)
    .query(`SELECT TOP (1) nome FROM dbo.produtos WITH (UPDLOCK, HOLDLOCK)
            WHERE LTRIM(RTRIM(produtoId)) = @codigo AND (@id IS NULL OR id <> @id)`);
  const existente = result.recordset[0];
  if (existente) {
    throw conflict(`Já existe um produto com o código ${codigo} (${existente.nome}). Use outro código.`);
  }
  return codigo;
}

async function loadCondicaoPagamento(transaction, value, currentCodigo = null) {
  const codigo = parseCodigo(value, 'Forma de pagamento');
  const result = await new sql.Request(transaction)
    .input('codigo', sql.Int, codigo)
    .query(
      'SELECT Codigo, Descricao, Tipo, QuantidadeParcelas, PrazoMedio, Status FROM dbo.CondicoesPagamento WHERE Codigo = @codigo'
    );
  const condicao = result.recordset[0];
  if (!condicao) throw conflict('A forma de pagamento selecionada não existe.');
  if (String(condicao.Status || '').toLowerCase() === 'inativo' && Number(currentCodigo) !== codigo) {
    throw conflict(`A forma de pagamento "${condicao.Descricao}" está inativa.`);
  }
  return condicao;
}

module.exports = {
  validateCargaPedido,
  validateProdutoCategoria,
  VENDEDOR_TIPO_ENTIDADE_ID,
  validateTipoEntidade,
  loadVendedorDaVenda,
  validateProdutoCodigo,
  loadCondicaoPagamento
};
