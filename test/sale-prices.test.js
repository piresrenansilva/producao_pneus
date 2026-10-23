const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSaleUnitPrice } = require('../src/sale-prices');

test('sale unit price uses the catalog value only when no override was sent', () => {
  assert.equal(normalizeSaleUnitPrice(undefined, 129.9, 'Preço unitário'), 129.9);
  assert.equal(normalizeSaleUnitPrice(null, 129.9, 'Preço unitário'), 129.9);
  assert.equal(normalizeSaleUnitPrice(0, 129.9, 'Preço unitário'), 0);
  assert.equal(normalizeSaleUnitPrice('140,75', 129.9, 'Preço unitário'), 140.75);
});

test('sale unit price is rounded to cents and rejects invalid or out-of-range values', () => {
  assert.equal(normalizeSaleUnitPrice(12.345, 0, 'Preço unitário'), 12.35);
  assert.throws(() => normalizeSaleUnitPrice(-0.01, 0, 'Preço unitário'), (error) => error.status === 400);
  assert.throws(() => normalizeSaleUnitPrice('abc', 0, 'Preço unitário'), (error) => error.status === 400);
  assert.throws(() => normalizeSaleUnitPrice(10_000_000_000, 0, 'Preço unitário'), (error) => error.status === 400);
});
