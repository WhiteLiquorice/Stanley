const test = require('node:test');
const assert = require('node:assert/strict');
const { MemoryTemplateStore, TemplateService, templateFromConnector, templateFromSkill } = require('../src/template-engine');
const { validateWorkflow } = require('../src/workflowContract');

const connector = {
  tenantId: 'tenant-a', connectorId: 'crm_create_contact', version: 'v1', name: 'Create CRM contact', description: 'Create a contact in the CRM.', operationName: 'create_contact',
  publicationState: 'published', readWrite: 'write', targetDomains: ['api.example.com'], requiredVaultRefs: ['crm.token'], inputSchema: { type: 'object' }, outputSchema: { type: 'object' },
  testResults: [{ passed: true }], successCount: 3, failureCount: 1, fingerprint: 'abc123',
};

test('published connector becomes a canonical approval-gated template', () => {
  const template = templateFromConnector(connector, { now: '2026-07-14T00:00:00.000Z' });
  assert.equal(template.state, 'draft');
  assert.equal(template.provenance.type, 'connector');
  assert.deepEqual(template.requiredVaultRefs, ['crm.token']);
  assert.equal(template.version, connector.version);
  const types = template.workflow.nodes.map((node) => node.type);
  assert.deepEqual(types, ['mission', 'trigger', 'approval', 'connector']);
  assert.doesNotThrow(() => validateWorkflow({ name: template.name, ...template.workflow }));
});

test('unverified connector cannot enter the catalog', () => {
  assert.throws(() => templateFromConnector({ ...connector, successCount: 0, testResults: [] }), /passing regression|verified execution/);
});

test('active deterministic skill becomes a template with provenance', () => {
  const skill = { tenantId: 'tenant-a', skillId: 'research', version: 'v2', name: 'Research', description: 'Collect a result.', state: 'active', successCount: 2, failureCount: 0, nodes: [{ id: 'trigger', type: 'trigger', label: 'Start', data: { url: 'https://example.com' } }, { id: 'extract', type: 'scrape', label: 'Extract', data: {} }], edges: [{ source: 'trigger', target: 'extract' }], requiredVaultRefs: [], fingerprint: 'skill-fingerprint' };
  const template = templateFromSkill(skill);
  assert.equal(template.provenance.id, 'research');
  assert.equal(template.workflow.nodes.filter((node) => node.type === 'mission').length, 1);
  assert.doesNotThrow(() => validateWorkflow({ name: template.name, ...template.workflow }));
});

test('template lifecycle requires human approval before publication and counts use', async () => {
  const store = new MemoryTemplateStore();
  const connectorStore = { get: async () => connector };
  const skillStore = { get: async () => null };
  const service = new TemplateService({ store, connectorStore, skillStore, clock: () => '2026-07-14T00:00:00.000Z' });
  const draft = await service.fromConnector('tenant-a', connector.connectorId, connector.version, { createdBy: 'tenant-a' });
  await assert.rejects(() => service.publish('tenant-a', draft.templateId, draft.version, 'tenant-a'), /approved/);
  const approved = await service.approve('tenant-a', draft.templateId, draft.version, { type: 'human', uid: 'tenant-a' });
  assert.equal(approved.state, 'approved');
  const published = await service.publish('tenant-a', draft.templateId, draft.version, 'tenant-a');
  assert.equal(published.state, 'published');
  const used = await service.recordUse('tenant-a', draft.templateId, draft.version);
  assert.equal(used.health.usageCount, 1);
});

test('public publication is admin-gated', async () => {
  const store = new MemoryTemplateStore();
  const service = new TemplateService({ store, connectorStore: { get: async () => connector }, skillStore: { get: async () => null }, publicPublisher: () => false });
  const draft = await service.fromConnector('tenant-a', connector.connectorId, connector.version, { visibility: 'public' });
  await service.approve('tenant-a', draft.templateId, draft.version, { type: 'human', uid: 'tenant-a' });
  await assert.rejects(() => service.publish('tenant-a', draft.templateId, draft.version, 'tenant-a'), /administrator/);
});

test('published public templates are visible and usable by another tenant', async () => {
  const store = new MemoryTemplateStore();
  const service = new TemplateService({ store, connectorStore: { get: async () => connector }, skillStore: { get: async () => null }, publicPublisher: () => true });
  const draft = await service.fromConnector('tenant-a', connector.connectorId, connector.version, { visibility: 'public' });
  await service.approve('tenant-a', draft.templateId, draft.version, { type: 'human', uid: 'tenant-a' });
  await service.publish('tenant-a', draft.templateId, draft.version, 'tenant-a');
  const visible = await service.list('tenant-b', { state: 'published' });
  assert.equal(visible.length, 1);
  const used = await service.recordUse('tenant-b', draft.templateId, draft.version);
  assert.equal(used.health.usageCount, 1);
});

test('draft settings update visibility and refresh the content fingerprint', async () => {
  const store = new MemoryTemplateStore();
  const service = new TemplateService({ store, connectorStore: { get: async () => connector }, skillStore: { get: async () => null }, publicPublisher: () => true });
  const draft = await service.fromConnector('tenant-a', connector.connectorId, connector.version);
  const updated = await service.updateDraft('tenant-a', draft.templateId, draft.version, { visibility: 'public', name: 'Shared CRM contact' });
  assert.equal(updated.visibility, 'public');
  assert.equal(updated.name, 'Shared CRM contact');
  assert.notEqual(updated.fingerprint, draft.fingerprint);
});
