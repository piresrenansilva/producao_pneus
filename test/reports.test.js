const test = require('node:test');
const assert = require('node:assert/strict');
const { reportFilters } = require('../src/reports');

test('filtros do relatório aceitam período e vendedor válidos', () => {
  assert.deepEqual(
    reportFilters({
      inicio: '2026-10-01',
      fim: '2026-10-31',
      vendedorId: '43faed23-49db-4ca8-a3d8-1a57aa9d7fad'
    }),
    { inicio: '2026-10-01', fim: '2026-10-31', vendedorId: '43faed23-49db-4ca8-a3d8-1a57aa9d7fad' }
  );
});

test('filtros do relatório rejeitam datas, vendedor e intervalo inválidos', () => {
  assert.throws(
    () => reportFilters({ inicio: '2026-02-30', fim: '2026-03-01' }),
    (error) => error.status === 400
  );
  assert.throws(
    () => reportFilters({ inicio: '2026-11-01', fim: '2026-10-01' }),
    (error) => error.status === 400
  );
  assert.throws(
    () => reportFilters({ inicio: '2026-10-01', fim: '2026-10-31', vendedorId: 'Ana' }),
    (error) => error.status === 400
  );
});

test('filtros do relatório limitam período a dez anos', () => {
  assert.throws(
    () => reportFilters({ inicio: '2010-01-01', fim: '2026-10-26' }),
    (error) => error.status === 400
  );
});

test('consulta a procedure com parâmetros e organiza os quatro resultados', async () => {
  const { getSalesReport } = require('../src/reports');
  const inputs = [];
  const pool = {
    request() {
      return {
        input(nome, tipo, valor) {
          inputs.push({ nome, tipo, valor });
          return this;
        },
        async execute(nome) {
          assert.equal(nome, 'dbo.usp_RelatorioVendas');
          return {
            recordsets: [
              [{ quantidadeVendas: 2, valorLiquido: 180 }],
              [{ data: '2026-10-01', quantidadeVendas: 2 }],
              [{ vendedor: 'Ana', quantidadeVendas: 2 }],
              [{ formaPagamento: 'PIX', quantidadeVendas: 2 }]
            ]
          };
        }
      };
    }
  };
  const driver = { Date: 'date', UniqueIdentifier: 'uniqueidentifier' };

  const resultado = await getSalesReport(
    pool,
    {
      inicio: '2026-10-01',
      fim: '2026-10-31',
      vendedorId: '43faed23-49db-4ca8-a3d8-1a57aa9d7fad'
    },
    driver
  );

  assert.deepEqual(inputs, [
    { nome: 'DataInicial', tipo: 'date', valor: '2026-10-01' },
    { nome: 'DataFinal', tipo: 'date', valor: '2026-10-31' },
    { nome: 'VendedorId', tipo: 'uniqueidentifier', valor: '43faed23-49db-4ca8-a3d8-1a57aa9d7fad' }
  ]);
  assert.equal(resultado.resumo.quantidadeVendas, 2);
  assert.equal(resultado.diario[0].data, '2026-10-01');
  assert.equal(resultado.vendedores[0].vendedor, 'Ana');
  assert.equal(resultado.formasPagamento[0].formaPagamento, 'PIX');
});
