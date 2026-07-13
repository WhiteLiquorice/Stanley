const test = require('node:test');
const assert = require('node:assert/strict');
const { TrustRuntime } = require('../src/trustRuntime');

class MemoryStore {
  constructor() {
    this.checkpoints = [];
    this.receipts = [];
    this.exceptions = [];
  }
  async writeCheckpoint(_uid, _runId, value) { this.checkpoints.push(value); return value; }
  async writeReceipt(_uid, value) { this.receipts.push(value); return value; }
  async openException(_uid, value) { this.exceptions.push(value); return value; }
}

function shadowWorkflow() {
  return {
    id: 'wf-1',
    trustPolicy: { mode: 'shadow' },
    nodes: [
      { id: 'trigger', type: 'trigger', data: {} },
      { id: 'send', type: 'send_email', data: { to: 'person@example.com' } },
    ],
    edges: [{ source: 'trigger', target: 'send' }],
    assertions: [{ id: 'has-id', source: 'scraped', path: 'record.id', operator: 'exists', message: 'Record ID must exist.' }],
  };
}

test('records shadow plans, checkpoints, and verified outcomes', async () => {
  const store = new MemoryStore();
  const runtime = new TrustRuntime({ store, uid: 'user', runId: 'run', workflow: shadowWorkflow() });
  const prepared = await runtime.begin({ authorization: 'Bearer hidden' });
  assert.equal(prepared.plannedActions.length, 1);
  assert.equal(prepared.workflow.nodes[1].type, 'wait');
  await runtime.beforeNode(prepared.workflow.nodes[0], {});
  await runtime.afterNode(prepared.workflow.nodes[0], { ok: true }, {});
  const result = await runtime.finish({ scraped: { record: { id: 'R-1' } } });
  assert.equal(result.verified, true);
  assert.equal(store.exceptions.length, 0);
  assert.ok(store.checkpoints.length >= 4);
  assert.ok(store.receipts.some((receipt) => receipt.kind === 'planned_side_effect'));
});

test('opens an exception when an outcome assertion fails', async () => {
  const store = new MemoryStore();
  const runtime = new TrustRuntime({ store, uid: 'user', runId: 'run', workflow: shadowWorkflow() });
  await runtime.begin({});
  const result = await runtime.finish({ scraped: {} });
  assert.equal(result.verified, false);
  assert.equal(store.exceptions.length, 1);
  assert.equal(store.exceptions[0].kind, 'assertion_failure');
});

test('captures a failed node as an actionable exception', async () => {
  const store = new MemoryStore();
  const runtime = new TrustRuntime({ store, uid: 'user', runId: 'run', workflow: shadowWorkflow() });
  const node = { id: 'navigate', type: 'navigate', label: 'Open portal' };
  await runtime.nodeFailed(node, new Error('Portal unavailable'), { authorization: 'secret' });
  assert.equal(store.exceptions[0].kind, 'execution_failure');
  assert.equal(store.exceptions[0].summary, 'Portal unavailable');
});

test('turns completed nodes into zero-time waits when resuming', async () => {
  const store = new MemoryStore();
  const workflow = shadowWorkflow();
  const { workflowFingerprint } = require('../src/resume');
  const runtime = new TrustRuntime({
    store, uid: 'user', runId: 'run', workflow,
    resumeCheckpoint: {
      id: 'cp', sequence: 3, nodeId: 'trigger', phase: 'after', resumable: true,
      workflowFingerprint: workflowFingerprint(workflow),
      state: { completedNodeIds: ['trigger'] },
    },
  });
  assert.equal(runtime.workflow.nodes.find((node) => node.id === 'trigger').type, 'wait');
  assert.equal(runtime.shouldSkip({ id: 'trigger' }), true);
});
