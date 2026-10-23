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
    columns: [S('produtoId', 60), S('nome', 200), S('categoria', 80), S('medida', 60), S('unidade', 20), M('preco'), M('custo'), S('obs', 500), S('status', 30)]
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
    columns: [S('tipo', 20), T('data'), S('placa', 20), S('motorista', 100), S('funcionario', 100), S('transportadora', 150), G('pedidoId'), S('parceiro', 150), S('nf', 30), I('qtd'), S('item', 200), S('status', 30)]
  },
  pedidos: {
    table: 'pedidos',
    columns: [RO('numero'), T('data'), S('cliente', 150), S('pagamento', 30), S('status', 30), S('vendedor', 100), T('previsao'), S('obs', 500), G('clienteId'), G('veiculoId'), M('descontoPercentual'), M('descontoValor'), S('box', 100), T('agendamento'), S('horario', 10)]
  },
  itens: {
    table: 'pedido_itens',
    columns: [G('pedidoId'), S('produtoId', 50), S('descricao', 200), S('medida', 50), I('qtd'), M('unitario'), S('tipo', 20), G('produtoRef'), G('servicoRef')]
  },
  financeiro: {
    table: 'financeiro',
    columns: [T('data'), S('tipo', 20), S('categoria', 30), S('descricao', 200), M('valor')]
  },
  contas: {
    table: 'contas',
    columns: [S('tipo', 20), S('pessoa', 150), S('descricao', 200), M('valor'), T('vencimento'), S('boleto', 100), S('status', 30)]
  },
  boletos: {
    table: 'boletos',
    columns: [S('origem', 20), S('pessoa', 150), S('numero', 100), M('valor'), T('vencimento'), S('ref', 150), S('status', 30)]
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
