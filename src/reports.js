const { badRequest } = require('./errors');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PERIOD_DAYS = 3660;

function parseReportDate(value, label) {
  if (Array.isArray(value) || typeof value !== 'string' || !ISO_DATE.test(value)) {
    throw badRequest(`${label} inválida. Use o formato AAAA-MM-DD.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw badRequest(`${label} inválida.`);
  }
  return { value, date };
}

function reportFilters(query = {}) {
  const inicio = parseReportDate(query.inicio, 'Data inicial');
  const fim = parseReportDate(query.fim, 'Data final');
  const elapsedDays = Math.floor((fim.date.getTime() - inicio.date.getTime()) / 86_400_000);
  if (elapsedDays < 0) throw badRequest('A data inicial não pode ser posterior à data final.');
  if (elapsedDays > MAX_PERIOD_DAYS) {
    throw badRequest('O período máximo para este relatório é de 10 anos.');
  }

  if (Array.isArray(query.vendedorId)) throw badRequest('Vendedor inválido.');
  const vendedorId = String(query.vendedorId || '').trim();
  if (vendedorId && !GUID.test(vendedorId)) throw badRequest('Vendedor inválido.');

  return { inicio: inicio.value, fim: fim.value, vendedorId: vendedorId || null };
}

function rowOrEmpty(rows) {
  return Array.isArray(rows) && rows[0] ? rows[0] : {};
}

async function getSalesReport(pool, query, driver = null) {
  const filters = reportFilters(query);
  // Carrega o driver somente na execução da rota. Assim, a validação do
  // relatório pode ser testada sem abrir/depender da conexão SQL Server.
  const sql = driver || require('./database').sql;
  const result = await pool.request()
    .input('DataInicial', sql.Date, filters.inicio)
    .input('DataFinal', sql.Date, filters.fim)
    .input('VendedorId', sql.UniqueIdentifier, filters.vendedorId)
    .execute('dbo.usp_RelatorioVendas');

  const recordsets = Array.isArray(result.recordsets) ? result.recordsets : [];
  return {
    periodo: { inicio: filters.inicio, fim: filters.fim, vendedorId: filters.vendedorId || '' },
    resumo: rowOrEmpty(recordsets[0]),
    diario: recordsets[1] || [],
    vendedores: recordsets[2] || [],
    formasPagamento: recordsets[3] || []
  };
}

module.exports = { reportFilters, getSalesReport };
