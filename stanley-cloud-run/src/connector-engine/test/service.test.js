const test = require('node:test'); const assert = require('node:assert/strict');
const { ConnectorService, MemoryConnectorStore } = require('../src');
const source = 'result = {"ok": True, "value": inputs.get("value", "default")}';
test('runs the complete local lifecycle and records health', async () => {
  const store = new MemoryConnectorStore(); const service = new ConnectorService({ store, clock: () => '2026-07-13T00:00:00.000Z' });
  await service.createDraft({ connectorId: 'service_test', tenantId: 'tenant-1', version: 'v1', name: 'Service', operationName: 'transform', source, targetDomains: ['api.example.com'], readWrite: 'read', allowedMethods: ['GET'], requiredVaultRefs: [], inputSchema: { type: 'object', properties: { value: { type: 'string' } } }, outputSchema: { type: 'object', required: ['ok', 'value'], properties: { ok: { type: 'boolean' }, value: { type: 'string' } } }, regressionCases: [{ id: 'known-good', input: { value: 'tested' }, expectedOutput: { ok: true, value: 'tested' } }] });
  assert.equal((await service.inspect('tenant-1', 'service_test', 'v1')).publicationState, 'inspected');
  assert.equal((await service.test('tenant-1', 'service_test', 'v1')).publicationState, 'tested');
  assert.equal((await service.publish('tenant-1', 'service_test', 'v1')).publicationState, 'published');
  assert.deepEqual((await service.execute({ tenantId: 'tenant-1', connectorId: 'service_test', input: { value: 'live' } })).output, { ok: true, value: 'live' });
  assert.equal((await store.getActive('tenant-1', 'service_test')).successCount, 1);
});
test('automatically rolls a failing repaired version back to its immutable predecessor', async () => {
  const { createArtifact } = require('../src');
  const store = new MemoryConnectorStore(); const service = new ConnectorService({ store });
  const common = { connectorId: 'rollback_test', tenantId: 'tenant-1', name: 'Rollback', operationName: 'get', targetDomains: ['api.example.com'], readWrite: 'read', allowedMethods: ['GET'], requiredVaultRefs: [], inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, regressionCases: [{ id: 'one', input: {} }] };
  const v1 = { ...createArtifact({ ...common, version: 'v1', source: 'result = {"ok": True}' }), publicationState: 'published' }; await store.create(v1); await store.publish(v1);
  const v2 = { ...createArtifact({ ...common, version: 'v2', source: 'raise Exception("drift")\nresult = {}', rollbackVersion: 'v1', repairProposalId: 'repair-1', healthPolicy: { minRuns: 1, maxFailureRate: 0, autoRollbackRepairs: true } }), publicationState: 'published' }; await store.create(v2); await store.publish(v2);
  await assert.rejects(() => service.execute({ tenantId: 'tenant-1', connectorId: 'rollback_test', version: 'v2' }), /drift/);
  assert.equal((await store.getActive('tenant-1', 'rollback_test')).version, 'v1');
});
test('uses persisted human approval for deterministic write execution', async () => {
  const store = new MemoryConnectorStore(); const service = new ConnectorService({ store });
  await service.createDraft({ connectorId: 'write_service', tenantId: 'tenant-1', version: 'v1', name: 'Write', operationName: 'create', source: 'result = {"created": True}', targetDomains: ['api.example.com'], readWrite: 'write', allowedMethods: ['POST'], requiredVaultRefs: [], approvalPolicy: { required: true }, idempotencyPolicy: { mode: 'required_input_key', inputField: 'idempotencyKey' }, inputSchema: { type: 'object', required: ['idempotencyKey'], properties: { idempotencyKey: { type: 'string' } } }, outputSchema: { type: 'object', required: ['created'], properties: { created: { type: 'boolean' } } }, regressionCases: [{ id: 'shadow', input: { idempotencyKey: 'regression' }, expectedOutput: { created: true } }] });
  await service.inspect('tenant-1', 'write_service', 'v1'); await service.test('tenant-1', 'write_service', 'v1'); await service.approve('tenant-1', 'write_service', 'v1', { uid: 'human-1', type: 'human' }); await service.publish('tenant-1', 'write_service', 'v1');
  assert.equal((await service.execute({ tenantId: 'tenant-1', connectorId: 'write_service', input: { idempotencyKey: 'live-1' } })).success, true);
});
