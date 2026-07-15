const test = require('node:test');
const assert = require('node:assert/strict');
const {
  WorkflowPlatformService,
  buildDebugWorkflow,
  generatedClients,
  normalizeModelPolicy,
  releaseSnapshot,
  shadowSideEffects,
  validateWorkflowInput,
  validateWorkflowOutput,
} = require('../src/workflow-platform');

function workflow() {
  return {
    id: 'wf-1', name: 'Typed workflow',
    nodes: [
      { id: 'mission', type: 'mission', label: 'Mission', data: { prompt: 'Test safely' } },
      { id: 'trigger', type: 'trigger', label: 'Start', data: { url: 'https://example.com' } },
      { id: 'extract', type: 'scrape', label: 'Output', data: {} },
      { id: 'post', type: 'http_request', label: 'Write', data: {} },
    ],
    edges: [{ source: 'trigger', target: 'extract' }, { source: 'extract', target: 'post' }],
    contract: {
      inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } }, additionalProperties: false },
      outputSchema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
      outputNodeId: 'extract',
    },
    regressionCases: [{ id: 'happy', input: { query: 'stanley' }, expectedOutput: { ok: true } }],
  };
}

test('validates typed workflow boundaries and selects the declared output node', () => {
  const value = workflow();
  assert.deepEqual(validateWorkflowInput(value, { query: 'x' }), { query: 'x' });
  assert.throws(() => validateWorkflowInput(value, {}), /required/);
  assert.deepEqual(validateWorkflowOutput(value, { extract: { ok: true }, other: 1 }), { ok: true });
  assert.throws(() => validateWorkflowOutput(value, { extract: { ok: 'yes' } }), /expected boolean/);
});

test('debug and regression workflows shadow every side effect', () => {
  const debug = buildDebugWorkflow(workflow(), { nodeId: 'post', mode: 'through' });
  assert.equal(debug.nodes.find((node) => node.id === 'post').type, 'wait');
  assert.equal(shadowSideEffects(workflow()).nodes.find((node) => node.id === 'post').type, 'wait');
});

test('release snapshots are immutable fingerprints and clients carry the input contract', () => {
  const first = releaseSnapshot(workflow(), { createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'u' });
  const second = releaseSnapshot(workflow(), { createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'u' });
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(normalizeModelPolicy({ modelPolicy: { profile: 'deterministic' } }).maxModelCalls, 0);
  const clients = generatedClients('https://runner.example', workflow(), workflow().contract);
  assert.equal(clients.openapi.paths['/v1/workflows/wf-1/invoke'].post.requestBody.content['application/json'].schema.properties.input.required[0], 'query');
  assert.match(clients.curl, /\/invoke/);
});

test('promotion enforces test then staging then production', async () => {
  const current = workflow();
  const releases = new Map();
  const store = {
    async saveRelease(_uid, _workflowId, release) { releases.set(release.id, release); return release; },
    async getRelease(_uid, _workflowId, id) { return releases.get(id) || null; },
    async patchWorkflow(_uid, _workflowId, patch) { Object.assign(current, patch); return current; },
    releases() { return { doc: (id) => ({ set: async (patch) => releases.set(id, { ...releases.get(id), ...patch }) }) }; },
  };
  const service = new WorkflowPlatformService({ store, loadWorkflow: async () => current, clock: () => '2026-01-01T00:00:00.000Z' });
  const release = await service.createRelease('u', current.id);
  await service.recordRegression('u', current.id, release.id, { passed: true, total: 1, passedCount: 1 });
  await assert.rejects(() => service.promote('u', current.id, release.id, 'production'), /staging/);
  await service.promote('u', current.id, release.id, 'test');
  await service.promote('u', current.id, release.id, 'staging');
  await service.promote('u', current.id, release.id, 'production');
  assert.equal(current.activeProductionReleaseId, release.id);
});
