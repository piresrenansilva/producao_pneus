'use strict';

const { badRequest } = require('../errors');

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function getText(obj, key) {
  const value = obj?.[key];
  if (value == null) return '';
  return String(value).trim();
}

function parseDate(value, label = 'Data') {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw badRequest(`${label} inválida.`);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw badRequest(`${label} inválida.`);
  }
  return date;
}

function parseGuid(value, label = 'Identificador') {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
    throw badRequest(`${label} inválido.`);
  }
  return text;
}

function localToday() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function parseNumber(value, label, { integer = false, nullable = false } = {}) {
  if (value == null || value === '') {
    if (nullable) return null;
    return 0;
  }
  const number = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(number)) throw badRequest(`${label} inválido.`);
  if (integer && !Number.isInteger(number)) throw badRequest(`${label} deve ser um número inteiro.`);
  return number;
}

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function parseCodigo(value, label = 'Código') {
  const codigo = Number(String(value ?? '').trim());
  if (!Number.isInteger(codigo) || codigo <= 0) throw badRequest(`${label} inválido.`);
  return codigo;
}

// Dias de vencimento de cada parcela: parcelas iguais, a primeira após o
// intervalo e as demais a cada intervalo, de modo que a média dê PrazoMedio.

function limitedText(value, max, label) {
  const text = value == null ? '' : String(value).trim();
  if (text.length > max) throw badRequest(`${label} pode ter no máximo ${max} caracteres.`);
  return text;
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Cria ou altera um lançamento financeiro. Na edição, os campos não enviados

function isSaleCompleted(status) {
  return ['faturado', 'pago'].includes(String(status || '').toLowerCase());
}

module.exports = {
  isObject,
  getText,
  parseDate,
  parseGuid,
  localToday,
  parseNumber,
  normalizeKey,
  parseCodigo,
  limitedText,
  addDays,
  isSaleCompleted
};
