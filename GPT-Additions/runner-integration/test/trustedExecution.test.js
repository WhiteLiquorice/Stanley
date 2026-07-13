const test = require('node:test');
const assert = require('node:assert/strict');
const { executeTrustedWorkflow } = require('../src/trustedExecution');

class MemoryStore {
  constructor() { this.checkpoints = []; this.receipts = []; this.exceptions = []; }
  async writeCheckpoint(_uid, _runId, value) { this.checkpoints.push(value); return value; }
  async writeReceipt(_uid, value) { this.receipts.push(value); return value; }
  async openException(_uid, value) { this.exceptions.push(value); return value; }
}

const workflow = {
  id: 'workflow-1',
  name: 'Verify customer',
  nodes: [{ id: 'trigger', type: 'trigger', data: {} }],
  edges: [],
  assertions: [{ source: 'scraped', path: 'customer.id', operator: 'exists' }],
};

test('wraps a runner with checkpoints and business verification', async () => {
  const store = new MemoryStore();
  const result = await executeTrustedWorkflow({
    store, uid: 'user-1', runId: 'run-1', workflow,
    runner: async (preparedWorkflow, _secrets, _input, options) => {
      const node = preparedWorkflow.nodes[0];
      await options.trust.beforeNode(node, {});
      await options.trust.afterNode(node, { id: 'C-1' }, {});
      return { logs: ['complete'], scraped: { customer: { id: 'C-1' } } };
    },
  });
  assert.equal(result.trustState, 'verified');
  assert.equal(result.trustReport.verified, true);
  assert.ok(store.checkpoints.length >= 4);
  assert.equal(store.exceptions.length, 0);
});

test('converts an uncaught runner failure into one run exception', async () => {
  const store = new MemoryStore();
  await assert.rejects(() => executeTrustedWorkflow({
    store, uid: 'user-1', runId: 'run-1', workflow,
    runner: async () => { throw new Error('Browser did not start'); },
  }), /Browser did not start/);
  assert.equal(store.exceptions.length, 1);
  assert.equal(store.exceptions[0].kind, 'run_failure');
});
