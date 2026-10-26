const S = (name, size = 200) => ({ name, type: 's', size });
const I = (name) => ({ name, type: 'i' });
const M = (name) => ({ name, type: 'd' });
const T = (name) => ({ name, type: 't' });
const G = (name) => ({ name, type: 'g' });
const RO = (name, type = 's', size = 200) => ({ name, type, size, readOnly: true });

// Lista explícita de rotas, tabelas e campos permitidos. Os identificadores SQL
// nunca são montados a partir de valores enviados pelo navegador.
const tables = {
  clientes: {
    table: 'clientes',
    columns: [S('nome', 200), S('tipo', 30), S('documento', 30), S('telefone', 30), S('email', 150), M('limiteCredito'), S('cep', 12), S('endereco', 200), S('numero', 20), S('complemento', 100), S('bairro', 100), S('cidade', 100), S('estado', 2), S('status', 30), S('obs', 500)],
    extras: ['codigo']
  },
  veiculos: {
    table: 'veiculos',
    columns: [G('clienteId'), S('marca', 80), S('modelo', 120), S('ano', 10), S('placa', 12), S('medidaPneu', 60), S('status', 30)]
  },
  servicos: {
    table: 'servicos',
    columns: [S('nome', 150), S('descricao', 300), M('preco'), S('status', 30)],
    extras: ['codigo']
  },
  produtos: {
    table: 'produtos',
    // A categoria é gravada como categoriaId e lida (nome) da tabela produtoCategoria.
    // O texto antigo de produtos.categoria só é usado quando o produto ainda não tem vínculo.
    joins: 'LEFT JOIN dbo.[produtoCategoria] pc ON pc.[id] = t.[categoriaId]',
    computed: { categoria: 'COALESCE(pc.[nome], t.[categoria])' },
    columns: [S('produtoId', 60), S('nome', 200), I('categoriaId'), S('modelo', 120), S('medida', 60), S('unidade', 20), M('preco'), M('custo'), S('obs', 500), S('status', 30)]
  },
  produtoCategoria: {
    table: 'produtoCategoria',
    // Somente leitura pela API por enquanto (alimenta a lista do cadastro de produtos).
    readOnlyRoute: true,
    orderBy: 't.[id]',
    columns: [S('nome', 80), S('status', 30)]
  },
  carcacas: {
    table: 'carcacas',
    columns: [S('fogo', 50), S('medida', 50), S('dono', 150), S('origem', 30), I('qtd'), M('valorUnitario'), T('entrada'), S('status', 30), S('obs', 500)]
  },
  estoque: {
    table: 'estoque',
    columns: [G('produtoRef'), S('produtoId', 60), S('item', 200), S('medida', 50), S('tipo', 30), I('qtd'), I('minimo'), S('local', 100)]
  },
  producao: {
    table: 'producao',
    columns: [T('data'), S('turno', 20), S('medida', 50), I('qtd'), I('carcacas'), S('banda', 100), S('operador', 100), S('status', 30)]
  },
  cargas: {
    table: 'cargas',
    // Mantemos os campos antigos placa/parceiro/qtd/item para ler registros legados,
    // mas a interface nova usa funcionário, transportadora e o vínculo com a venda.
    // Criação/edição passam pelo fluxo próprio (/api/cargas), que grava os itens e movimenta o estoque.
    columns: [S('tipo', 20), T('data'), S('placa', 20), S('motorista', 100), S('funcionario', 100), S('transportadora', 150), G('pedidoId'), S('parceiro', 150), S('nf', 30), I('qtd'), S('item', 200), S('status', 30), RO('estoqueMovimentado', 'b')]
  },
  cargaItens: {
    table: 'carga_itens',
    readOnlyRoute: true,
    columns: [G('cargaId'), G('produtoRef'), S('produtoId', 60), S('item', 200), S('medida', 60), I('qtd'), M('valorUnitario')]
  },
  pedidos: {
    table: 'pedidos',
    columns: [RO('numero'), T('data'), S('cliente', 150), S('pagamento', 100), I('condicaoPagamentoId'), S('status', 30), S('vendedor', 100), T('previsao'), S('obs', 500), G('clienteId'), G('veiculoId'), M('descontoPercentual'), M('descontoValor'), S('box', 100), T('agendamento'), S('horario', 10)]
  },
  itens: {
    table: 'pedido_itens',
    columns: [G('pedidoId'), S('produtoId', 50), S('descricao', 200), S('medida', 50), I('qtd'), M('unitario'), S('tipo', 20), G('produtoRef'), G('servicoRef')]
  },
  // Formas/condições de pagamento. A chave é Codigo (identity), exposta como id para a tela.
  // Gravação e exclusão passam por saveCondicaoPagamento/deleteCondicaoPagamento.
  condicoesPagamento: {
    table: 'CondicoesPagamento',
    key: 'Codigo',
    orderBy: 't.[Codigo]',
    extras: ['Codigo'],
    columns: [S('Descricao', 100), S('Tipo', 40), I('QuantidadeParcelas'), I('PrazoMedio'), S('Status', 30)]
  },
  // Financeiro unificado (substitui as antigas rotas financeiro, contas e boletos,
  // cujas tabelas continuam no banco apenas como cópia dos dados migrados).
  financeiroCategoria: {
    table: 'financeiroCategoria',
    // Somente leitura pela API (alimenta a lista de categorias do lançamento).
    readOnlyRoute: true,
    orderBy: 't.[id]',
    columns: [S('nome', 80), S('tipo', 10), S('status', 30)]
  },
  lancamentos: {
    table: 'financeiro_lancamentos',
    // Criação/edição passam por saveLancamento (validação de tipo, categoria, entidade e status).
    joins: 'LEFT JOIN dbo.[financeiroCategoria] fc ON fc.[id] = t.[categoriaId] LEFT JOIN dbo.[pedidos] pe ON pe.[id] = t.[pedidoId]',
    computed: { categoria: 'fc.[nome]', pedidoNumero: 'pe.[numero]' },
    extras: ['codigo'],
    columns: [S('tipo', 10), I('categoriaId'), G('entidadeId'), S('pessoa', 150), S('descricao', 200), S('documento', 100), M('valor'), T('emissao'), T('vencimento'), T('pagamento'), S('formaPagamento', 100), I('condicaoPagamentoId'), S('status', 20), S('obs', 500), RO('origem', 's', 20), RO('pedidoId', 'g')]
  },
  carcacaOrdens: {
    table: 'carcaca_ordens',
    columns: [RO('numero'), T('data'), S('dono', 150), S('origem', 30), S('status', 30), S('obs', 500), M('total')]
  },
  carcacaOrdemItens: {
    table: 'carcaca_ordem_itens',
    columns: [G('ordemId'), G('produtoRef'), S('produtoId', 60), S('item', 200), S('medida', 60), I('qtd'), M('valorUnitario'), M('valorTotal')]
  }
};

module.exports = { tables };
