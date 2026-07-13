const test = require('node:test');
const assert = require('node:assert/strict');
const { createFailureCase, failureFingerprint } = require('../src/failureCase');

test('groups equivalent failures while removing volatile IDs and query strings', () => {
  const first = failureFingerprint({ workflowId: 'wf', nodeId: 'click', error: new Error('Element 12345 failed at https://example.com/orders/987?token=a'), url: 'https://example.com/orders/987?token=a' });
  const second = failureFingerprint({ workflowId: 'wf', nodeId: 'click', error: new Error('Element 67890 failed at https://example.com/orders/654?token=b'), url: 'https://example.com/orders/654?token=b' });
  assert.equal(first, second);
});

test('creates a redacted learning case', () => {
  const value = createFailureCase({
    workflowId: 'wf', runId: 'run', nodeId: 'node', error: new Error('Not found'),
    nodeData: { selector: '#save', password: 'hidden' },
  }, { now: '2026-07-13T00:00:00.000Z' });
  assert.equal(value.state, 'open');
  assert.equal(value.evidence.nodeData.password, '[REDACTED]');
});
