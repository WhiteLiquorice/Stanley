const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateAssertions, getPath } = require('../src/assertions');

test('reads nested and indexed paths', () => {
  const value = { customer: { orders: [{ total: 42 }] } };
  assert.equal(getPath(value, '$.customer.orders[0].total'), 42);
});

test('evaluates deterministic outcome assertions', () => {
  const result = evaluateAssertions([
    { source: 'scraped', path: 'order.id', operator: 'exists' },
    { source: 'scraped', path: 'order.total', operator: 'equals', expected: 125 },
    { source: 'input', path: 'email', operator: 'matches', expected: '^[^@]+@[^@]+$' },
  ], {
    input: { email: 'person@example.com' },
    scraped: { order: { id: 'A-1', total: 125 } },
  });
  assert.equal(result.passed, true);
  assert.equal(result.failures.length, 0);
});

test('warning failures do not fail the verified outcome', () => {
  const result = evaluateAssertions([
    { source: 'scraped', path: 'optional', operator: 'exists', severity: 'warning' },
  ], { scraped: {} });
  assert.equal(result.passed, true);
  assert.equal(result.failures.length, 1);
});
