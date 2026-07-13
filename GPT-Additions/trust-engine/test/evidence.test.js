const test = require('node:test');
const assert = require('node:assert/strict');
const { createReceipt, proofHash, redactEvidence } = require('../src/evidence');

test('redacts secrets and strips URL query strings', () => {
  const safe = redactEvidence({
    authorization: 'Bearer value',
    nested: { password: 'value' },
    url: 'https://example.com/path?token=secret#section',
  });
  assert.equal(safe.authorization, '[REDACTED]');
  assert.equal(safe.nested.password, '[REDACTED]');
  assert.equal(safe.url, 'https://example.com/path');
});

test('creates deterministic receipt integrity hashes', () => {
  const receipt = createReceipt({
    id: 'receipt-1', runId: 'run-1', workflowId: 'wf-1', kind: 'assertion',
    evidence: { result: true }, occurredAt: '2026-07-13T00:00:00.000Z',
  }, { now: '2026-07-13T00:00:00.000Z' });
  assert.equal(receipt.proofHash, proofHash(receipt));
  assert.notEqual(receipt.proofHash, proofHash({ ...receipt, outcome: 'changed' }));
});
