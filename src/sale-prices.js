const { badRequest } = require('./errors');

const MAX_UNIT_PRICE = 9_999_999_999.99;

function parseUnitPrice(value, label) {
  if (value == null || value === '') return 0;
  const amount = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(amount)) throw badRequest(`${label} inválido.`);
  return amount;
}

function normalizeSaleUnitPrice(value, catalogPrice, label = 'Preço unitário') {
  const amount = parseUnitPrice(value == null ? catalogPrice : value, label);
  if (amount < 0) throw badRequest(`${label} não pode ser negativo.`);
  if (amount > MAX_UNIT_PRICE) throw badRequest(`${label} excede o limite permitido.`);
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

module.exports = { normalizeSaleUnitPrice };
