const test = require('node:test');
const assert = require('node:assert/strict');
const { CapabilityRegistry, capabilityPlanForCommand, normalizeCapabilityPlan } = require('../src/capability-engine');
const { ConversationService } = require('../src/conversation-engine');
const { SkillService, MemorySkillStore } = require('../src/skill-engine');
const { executeGraph } = require('../branchingEngine');
const { workflowNeedsBrowser } = require('../src/contextualRunner');

function activeSkill() {
  return {
    skillId: 'skill_gmail_digest', version: 'v3', name: 'Verified Gmail digest', description: 'Summarize unread Gmail messages',
    operationName: 'gmail_digest', state: 'active', match: { tags: ['gmail', 'digest'] }, targetDomains: [],
    inputSchema: { type: 'object', properties: { audience: { type: 'string' } } }, requiredVaultRefs: ['GoogleOAuthToken'],
    writeCapable: false, confidence: 0.98, successCount: 20, failureCount: 1,
  };
}

function publishedConnector() {
  return {
    connectorId: 'school_grades', version: 'v2', name: 'School grade exporter', description: 'Export grades from a school system API',
    operationName: 'export_grades', publicationState: 'published', targetDomains: ['school.example'], readWrite: 'read',
    inputSchema: { type: 'object', required: ['classId'], properties: { classId: { type: 'string' } } }, requiredVaultRefs: ['SchoolApi'],
    source: 'SECRET IMPLEMENTATION MUST NOT ENTER A MODEL PROMPT', successCount: 8, failureCount: 0,
  };
}

test('capability retrieval prefers verified reusable abilities and keeps connector source out of prompts', async () => {
  const registry = new CapabilityRegistry({
    skillStore: { listActive: async () => [activeSkill()] },
    connectorStore: { list: async () => [publishedConnector()] },
    limits: { total: 8, native: 3, connector: 2, skill: 2 },
  });
  const context = await registry.contextFor('tenant-1', 'Summarize unread Gmail messages every morning');
  assert.equal(context.manifest.capabilities[0].kind, 'skill');
  assert.equal(context.manifest.capabilities[0].id, 'skill_gmail_digest');
  assert.ok(context.manifest.capabilities.some((item) => item.kind === 'native_integration' && item.app === 'Gmail'));
  assert.ok(context.manifest.capabilities.some((item) => item.kind === 'browser'));
  assert.doesNotMatch(JSON.stringify(context.manifest), /SECRET IMPLEMENTATION/);
  assert.ok(context.estimatedInputTokens < 4000);
});

test('capability plans infer exact native and browser abilities from generated steps', async () => {
  const registry = new CapabilityRegistry({ nativeOperations: [{ id: 'grades_list', operationName: 'grades_list', name: 'Grades: List', app: 'Grades', readWrite: 'read', approvalRequired: false, requiredVaultRefs: [], inputSchema: {} }] });
  const context = await registry.contextFor('tenant-1', 'List grades on the school website');
  const plan = capabilityPlanForCommand({ steps: [
    { type: 'native_integration', data: { integrationName: 'grades_list' } },
    { type: 'navigate', data: { url: 'https://school.example' } },
  ] }, context);
  assert.deepEqual(plan, [{ kind: 'native_integration', id: 'grades_list' }, { kind: 'browser', id: 'browser_workflow' }]);
});

test('unavailable capability identifiers are rejected instead of becoming executable nodes', async () => {
  const registry = new CapabilityRegistry({ nativeOperations: [] });
  const context = await registry.contextFor('tenant-1', 'Do a browser task');
  assert.throws(() => normalizeCapabilityPlan([{ kind: 'connector', id: 'invented' }], context), /unavailable capability/);
});

test('conversation planning supplies a compact manifest and records the selected skill', async () => {
  let request;
  const registry = new CapabilityRegistry({ skillStore: { listActive: async () => [activeSkill()] }, nativeOperations: [] });
  const service = new ConversationService({
    capabilityRegistry: registry,
    callModel: async (input) => {
      request = input;
      return { text: JSON.stringify({ intent: 'create', summary: 'Use the verified digest skill.', questions: [], commands: [{
        type: 'workflow.create', requestId: 'replaced', name: 'Gmail Digest', mission: 'Summarize unread Gmail.',
        trigger: { type: 'schedule_trigger', schedule: '0 8 * * *' },
        capabilityPlan: [{ kind: 'skill', id: 'skill_gmail_digest', version: 'v3' }],
        steps: [{ localId: 'fallback', type: 'agent', data: { goal: 'Summarize unread Gmail.', maxSteps: 4 } }],
      }] }) };
    },
  });
  const result = await service.plan('tenant-1', { message: 'Summarize unread Gmail every morning' });
  assert.match(request.user, /capabilityManifest/);
  assert.deepEqual(result.plan.commands[0].capabilityPlan, [
    { kind: 'skill', id: 'skill_gmail_digest', version: 'v3' },
    { kind: 'browser', id: 'browser_workflow' },
  ]);
  assert.ok(result.capabilityContextTokens > 0);
});

test('an explicitly planned active skill can be selected for a newly generated workflow', async () => {
  const store = new MemorySkillStore();
  await store.activate({ ...activeSkill(), tenantId: 'tenant-1', workflowId: 'original-workflow', fingerprint: 'a'.repeat(64) });
  const service = new SkillService({ store, runner: async () => ({}) });
  const selection = await service.select({ tenantId: 'tenant-1', workflowId: 'new-workflow', skillId: 'skill_gmail_digest', skillVersion: 'v3', input: { audience: 'teachers' } });
  assert.equal(selection.selected.skillId, 'skill_gmail_digest');
  assert.equal(selection.explanation.selectedVersion, 'v3');
});

test('an explicit connector node executes without opening a browser', async () => {
  let browserStarts = 0;
  const workflow = {
    id: 'connector-only', name: 'Connector only',
    nodes: [
      { id: 'mission', type: 'mission', data: { prompt: 'Export grades.' } },
      { id: 'trigger', type: 'trigger', data: {} },
      { id: 'connector', type: 'connector', data: { connectorId: 'school_grades', readOnly: true } },
    ],
    edges: [{ source: 'mission', target: 'trigger', kind: 'context' }, { source: 'trigger', target: 'connector' }],
  };
  assert.equal(workflowNeedsBrowser(workflow), false);
  const scraped = await executeGraph({ page: null }, workflow, {
    ensureBrowser: async () => { browserStarts += 1; }, uid: 'tenant-1', runId: 'run-1',
    connectorRuntime: { executeForNode: async ({ node }) => ({ executed: true, connectorId: node.data.connectorId, version: 'v2', result: { rows: 17 } }) },
  });
  assert.equal(browserStarts, 0);
  assert.deepEqual(scraped.connector, { rows: 17 });
});
