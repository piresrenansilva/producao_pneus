'use strict';

const { sql } = require('./sql');
const { badRequest } = require('../errors');
const { parseNumber, parseDate, parseGuid } = require('./validators');

function sqlType(column) {
  switch (column.type) {
    case 'i':
      return sql.Int;
    case 'd':
      return sql.Decimal(12, 2);
    case 't':
      return sql.Date;
    case 'g':
      return sql.UniqueIdentifier;
    default:
      return sql.NVarChar(column.size || 200);
  }
}

function convertValue(column, value) {
  if (value == null) return null;
  if (column.type === 'i') return parseNumber(value, column.name, { integer: true });
  if (column.type === 'd') {
    const amount = parseNumber(value, column.name);
    if (column.name === 'valorUnitario') {
      if (amount < 0) throw badRequest('O custo unitário de entrada da carcaça não pode ser negativo.');
      if (amount > 9_999_999_999.99) {
        throw badRequest('O custo unitário de entrada da carcaça excede o limite permitido.');
      }
    }
    return amount;
  }
  if (column.type === 't') return parseDate(value, column.name);
  if (column.type === 'g') return parseGuid(value, column.name);
  const text = String(value);
  if (column.size && text.length > column.size) {
    throw badRequest(`O campo ${column.name} excede ${column.size} caracteres.`);
  }
  return text;
}

function bindColumn(request, column, value) {
  request.input(column.name, sqlType(column), convertValue(column, value));
}

function dateSelect(column) {
  return column.type === 't'
    ? `CONVERT(nvarchar(10), t.[${column.name}], 23) AS [${column.name}]`
    : `t.[${column.name}]`;
}

module.exports = { sqlType, convertValue, bindColumn, dateSelect };
