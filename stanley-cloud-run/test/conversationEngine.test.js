const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ConversationApplicationService, ConversationService, classifyIntent, createProposal,
  sanitizeMessage, semanticDiff, validateConversationPlan, workflowContext,
} = require('../src/conversation-engine');

class MemoryConversationStore {
  constructor() { this.proposals = new Map(); this.workflows = new Map(); this.archives = []; }
  async saveProposal(_uid, proposal) { this.proposals.set(proposal.id, structuredClone(proposal)); return proposal; }
  async applyProposal(_uid, proposalId, fingerprint, approvedBy, mutate) {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw Object.assign(new Error('Conversation proposal not found.'), { status: 404 });
    if (proposal.fingerprint !== fingerprint) throw Object.assign(new Error('The approved proposal does not match the reviewed changes.'), { status: 409 });
    if (proposal.state === 'applied') return { ...proposal.result, replayed: true };
    const repository = {
      getWorkflow: async (id) => this.workflows.has(id) ? structuredClone(this.workflows.get(id)) : null,
      createWorkflow: (workflow) => { if (this.workflows.has(workflow.id)) throw new Error('duplicate'); this.workflows.set(workflow.id, structuredClone(workflow)); },
      updateWorkflow: (workflow, prior, archiveId) => { this.archives.push({ archiveId, prior: structuredClone(prior) }); this.workflows.set(workflow.id, structuredClone(workflow)); },
    };
    const result = await mutate(repository, proposal);
    proposal.state = 'applied'; proposal.approvedBy = approvedBy; proposal.result = result;
    return { ...result, replayed: false };
  }
}

function mutationProposal(commands, fields = {}) {
  const plan = { intent: fields.intent || 'edit', summary: fields.summary || 'Reviewed changes.', questions: [], commands };
  return createProposal({ conversationId: 'conv-test', plan, diff: semanticDiff(commands), clock: () => '2026-07-18T12:00:00.000Z' });
}

test('intent classifier routes common conversational operations deterministically', () => {
  assert.equal(classifyIntent('Build a daily Gmail summary'), 'create');
  assert.equal(classifyIntent('change the schedule', true), 'edit');
  assert.equal(classifyIntent('run it now', true), 'run');
  assert.equal(classifyIntent('fix the workflow that failed'), 'repair');
  assert.equal(classifyIntent('explain what this does', true), 'explain');
});

test('workflow context strips secrets and nonessential data before model use', () => {
  const context = workflowContext({
    id: 'wf-1', name: 'Mail helper', revision: 3,
    nodes: [{ id: 'n1', type: 'type', label: 'Login', data: { password: 'raw-password', value: 'private-value', selector: '#email', authorization: 'Bearer secret', description: 'Email field' } }],
    edges: [],
  });
  const serialized = JSON.stringify(context);
  assert.doesNotMatch(serialized, /raw-password|private-value|Bearer secret/);
  assert.match(serialized, /#email|Email field/);
});

test('conversation messages redact common raw secret formats before model use', () => {
  const sanitized = sanitizeMessage('use password=hunter2 and Bearer abc.def.ghi plus AIza123456789012345678901234567890');
  assert.doesNotMatch(sanitized, /hunter2|abc\.def\.ghi|AIza123/);
  assert.match(sanitized, /secret removed|API key removed/);
  assert.equal(sanitizeMessage('Use vault:GmailPrimary.password'), 'Use vault:GmailPrimary.password');
});

test('conversation planner returns validated commands and a human-readable diff without persistence', async () => {
  let modelRequest;
  const service = new ConversationService({
    loadWorkflow: async () => ({ id: 'wf-1', name: 'Digest', revision: 4, nodes: [], edges: [] }),
    callModel: async (request) => {
      modelRequest = request;
      return { model: 'test-model', durationMs: 12, text: JSON.stringify({
        intent: 'edit', summary: 'Rename the workflow.', questions: [],
        commands: [{ type: 'workflow.rename', requestId: 'model-supplied-is-replaced', workflowId: 'wf-1', baseRevision: 4, name: 'Morning Digest' }],
      }) };
    },
  });
  const result = await service.plan('tenant-1', { conversationId: 'c1', workflowId: 'wf-1', message: 'Rename this Morning Digest' });
  assert.equal(result.plan.commands[0].type, 'workflow.rename');
  assert.match(result.plan.commands[0].requestId, /^chat:/);
  assert.equal(result.diff[0].description, 'Rename the workflow to “Morning Digest”.');
  assert.equal(result.persisted, false);
  assert.equal(result.executed, false);
  assert.equal(result.proposal.canApply, true);
  assert.equal(result.proposalStored, false);
  assert.match(modelRequest.system, /never execute, persist/);
});

test('conversation planner stores the exact reviewable proposal without saving a workflow', async () => {
  const store = new MemoryConversationStore();
  const service = new ConversationService({ proposalStore: store, callModel: async () => ({ text: JSON.stringify({
    intent: 'create', summary: 'Create a safe browser flow.', questions: [], commands: [{
      type: 'workflow.create', requestId: 'model-request', name: 'News', mission: 'Open the news site.',
      trigger: { type: 'trigger', url: 'https://example.com' },
      steps: [{ localId: 'open-news', type: 'navigate', data: { url: 'https://example.com/news' } }],
    }],
  }) }) });
  const result = await service.plan('tenant-1', { conversationId: 'conv-1', message: 'Open the news' });
  assert.equal(result.proposalStored, true);
  assert.equal(store.proposals.get(result.proposal.id).fingerprint, result.proposal.fingerprint);
  assert.equal(store.workflows.size, 0);
  assert.equal(result.persisted, false);
});

test('conversation planner accepts clarification instead of speculative commands', async () => {
  const service = new ConversationService({ callModel: async () => ({ text: JSON.stringify({
    intent: 'create', summary: 'A destination is required.', commands: [],
    questions: [{ id: 'destination', prompt: 'Which Google Sheet should receive the rows?', required: true, options: [] }],
  }) }) });
  const result = await service.plan('tenant-1', { message: 'Put the messages in a sheet' });
  assert.equal(result.plan.questions.length, 1);
  assert.equal(result.plan.commands.length, 0);
});

test('new workflow planning is atomic and does not require a nonexistent workflow id', async () => {
  const service = new ConversationService({ callModel: async () => ({ text: JSON.stringify({
    intent: 'create', summary: 'Create a bounded Gmail digest.', questions: [], commands: [{
      type: 'workflow.create', requestId: 'model-request', name: 'Gmail Digest', mission: 'Summarize important unread email.',
      trigger: { type: 'schedule_trigger', schedule: '0 8 * * 1-5' },
      steps: [{ localId: 'list-mail', type: 'native_integration', label: 'List unread Gmail', data: { integrationName: 'gmail_list_messages' } }],
    }],
  }) }) });
  const result = await service.plan('tenant-1', { message: 'Every weekday morning summarize unread Gmail' });
  const command = result.plan.commands[0];
  assert.equal(command.type, 'workflow.create');
  assert.equal(command.workflowId, undefined);
  assert.equal(command.steps.length, 1);
});

test('conversation contract rejects commands mixed with clarification questions', () => {
  assert.throws(() => validateConversationPlan({
    intent: 'edit', summary: '',
    questions: [{ id: 'q', prompt: 'Which schedule?' }],
    commands: [{ type: 'workflow.rename', requestId: 'request-123', workflowId: 'wf', baseRevision: 1, name: 'New' }],
  }), /ask questions or propose commands/);
});

test('conversation contract rejects malformed mutation payloads before storage', () => {
  assert.throws(() => validateConversationPlan({
    intent: 'edit', summary: '', questions: [], commands: [{
      type: 'step.update', requestId: 'request-malformed', workflowId: 'wf-1', baseRevision: 1, stepId: 'step-1', changes: 'replace everything',
    }],
  }), /changes object/);
  assert.throws(() => validateConversationPlan({
    intent: 'create', summary: '', questions: [], commands: [{
      type: 'workflow.create', requestId: 'request-malformed-create', name: 'Bad', mission: 'Bad step', trigger: { type: 'trigger' },
      steps: [{ localId: 'bad', type: 'unknown_power', data: {} }],
    }],
  }), /supported type/);
});

test('semantic diff marks external control-plane effects for approval', () => {
  const diff = semanticDiff([
    { type: 'step.update', stepId: 'n1' },
    { type: 'connector.publish', connectorId: 'c1', version: 2 },
  ]);
  assert.equal(diff[0].requiresApproval, false);
  assert.equal(diff[1].requiresApproval, true);
});

test('approved creation is atomic, validated, and idempotent', async () => {
  const store = new MemoryConversationStore();
  const command = {
    type: 'workflow.create', requestId: 'request-create-123', name: 'News', mission: 'Open the news site.',
    trigger: { type: 'trigger', url: 'https://example.com' },
    steps: [{ localId: 'open-news', type: 'navigate', label: 'Open news', data: { url: 'https://example.com/news' } }],
  };
  const proposal = mutationProposal([command], { intent: 'create' });
  await store.saveProposal('tenant-1', proposal);
  const loadWorkflow = async (_uid, id) => structuredClone(store.workflows.get(id));
  const service = new ConversationApplicationService({ store, loadWorkflow, clock: () => '2026-07-18T12:01:00.000Z' });
  const first = await service.apply('tenant-1', proposal.id, { approved: true, fingerprint: proposal.fingerprint });
  const second = await service.apply('tenant-1', proposal.id, { approved: true, fingerprint: proposal.fingerprint });
  assert.equal(first.created, true);
  assert.equal(first.workflow.revision, 1);
  assert.equal(first.workflow.nodes.filter((node) => node.type === 'mission').length, 1);
  assert.equal(second.replayed, true);
  assert.equal(store.workflows.size, 1);
});

test('proposal application requires explicit approval and the reviewed fingerprint', async () => {
  const store = new MemoryConversationStore();
  const proposal = mutationProposal([{ type: 'workflow.rename', requestId: 'request-rename-1', workflowId: 'wf-1', baseRevision: 2, name: 'New' }]);
  await store.saveProposal('tenant-1', proposal);
  const service = new ConversationApplicationService({ store, loadWorkflow: async () => null });
  await assert.rejects(() => service.apply('tenant-1', proposal.id, { fingerprint: proposal.fingerprint }), /Explicit approval/);
  await assert.rejects(() => service.apply('tenant-1', proposal.id, { approved: true, fingerprint: 'a'.repeat(64) }), /does not match/);
  assert.equal(store.proposals.get(proposal.id).state, 'proposed');
});

test('stored proposal commands are revalidated against their review fingerprint', async () => {
  const store = new MemoryConversationStore();
  const proposal = mutationProposal([{ type: 'workflow.rename', requestId: 'request-integrity-1', workflowId: 'wf-1', baseRevision: 2, name: 'Reviewed name' }]);
  await store.saveProposal('tenant-1', proposal);
  store.proposals.get(proposal.id).commands[0].name = 'Unreviewed name';
  const service = new ConversationApplicationService({ store, loadWorkflow: async () => null });
  await assert.rejects(() => service.apply('tenant-1', proposal.id, { approved: true, fingerprint: proposal.fingerprint }), /integrity validation/);
  assert.equal(store.proposals.get(proposal.id).state, 'proposed');
});

test('stale revisions are rejected before any workflow write', async () => {
  const store = new MemoryConversationStore();
  store.workflows.set('wf-1', {
    id: 'wf-1', name: 'Current', revision: 3, version: 3,
    nodes: [
      { id: 'mission', type: 'mission', label: 'Mission', data: { prompt: 'Open a page.' } },
      { id: 'trigger', type: 'trigger', label: 'Trigger', data: { url: 'https://example.com' } },
      { id: 'navigate', type: 'navigate', label: 'Open', data: { url: 'https://example.com' } },
    ],
    edges: [{ source: 'mission', target: 'trigger', kind: 'context' }, { source: 'trigger', target: 'navigate' }],
  });
  const proposal = mutationProposal([{ type: 'workflow.rename', requestId: 'request-rename-2', workflowId: 'wf-1', baseRevision: 2, name: 'Stale' }]);
  await store.saveProposal('tenant-1', proposal);
  const service = new ConversationApplicationService({ store, loadWorkflow: async (_uid, id) => store.workflows.get(id) });
  await assert.rejects(() => service.apply('tenant-1', proposal.id, { approved: true, fingerprint: proposal.fingerprint }), /changed from revision 2 to 3/);
  assert.equal(store.workflows.get('wf-1').name, 'Current');
  assert.equal(store.archives.length, 0);
});

test('valid edits increment revision and archive the prior graph', async () => {
  const store = new MemoryConversationStore();
  store.workflows.set('wf-1', {
    id: 'wf-1', name: 'Current', revision: 3, version: 3,
    nodes: [
      { id: 'mission', type: 'mission', label: 'Mission', data: { prompt: 'Open a page.' } },
      { id: 'trigger', type: 'trigger', label: 'Trigger', data: { url: 'https://example.com' } },
      { id: 'navigate', type: 'navigate', label: 'Open', data: { url: 'https://example.com' } },
    ],
    edges: [{ source: 'mission', target: 'trigger', kind: 'context' }, { source: 'trigger', target: 'navigate' }],
  });
  const proposal = mutationProposal([
    { type: 'workflow.rename', requestId: 'request-rename-3', workflowId: 'wf-1', baseRevision: 3, name: 'Morning News' },
    { type: 'step.update', requestId: 'request-update-3', workflowId: 'wf-1', baseRevision: 3, stepId: 'navigate', changes: { label: 'Open morning news' } },
  ]);
  await store.saveProposal('tenant-1', proposal);
  const service = new ConversationApplicationService({ store, loadWorkflow: async (_uid, id) => structuredClone(store.workflows.get(id)), clock: () => '2026-07-18T12:05:00.000Z' });
  const result = await service.apply('tenant-1', proposal.id, { approved: true, fingerprint: proposal.fingerprint });
  assert.equal(result.workflow.name, 'Morning News');
  assert.equal(result.workflow.revision, 4);
  assert.equal(result.workflow.nodes.find((node) => node.id === 'navigate').label, 'Open morning news');
  assert.equal(store.archives.length, 1);
  assert.equal(store.archives[0].prior.revision, 3);
});

test('approved creation preserves the reviewed automatic capability plan', async () => {
  const store = new MemoryConversationStore();
  const command = {
    type: 'workflow.create', requestId: 'request-capability-plan', name: 'Mail', mission: 'List mail.',
    trigger: { type: 'trigger' }, capabilityPlan: [{ kind: 'native_integration', id: 'gmail_list_messages' }],
    steps: [{ localId: 'mail', type: 'native_integration', data: { integrationName: 'gmail_list_messages' } }],
  };
  const proposal = mutationProposal([command], { intent: 'create' });
  await store.saveProposal('tenant-1', proposal);
  const service = new ConversationApplicationService({ store, loadWorkflow: async (_uid, id) => structuredClone(store.workflows.get(id)) });
  const result = await service.apply('tenant-1', proposal.id, { approved: true, fingerprint: proposal.fingerprint });
  assert.deepEqual(result.workflow.capabilityPlan, command.capabilityPlan);
});

test('resulting graphs cannot introduce unapproved external side effects', async () => {
  const store = new MemoryConversationStore();
  const proposal = mutationProposal([{
    type: 'workflow.create', requestId: 'request-create-write', name: 'Send mail', mission: 'Send an email.',
    trigger: { type: 'trigger', url: 'https://mail.google.com' },
    steps: [{ localId: 'send', type: 'native_integration', data: { integrationName: 'gmail_send_message' } }],
  }], { intent: 'create' });
  await store.saveProposal('tenant-1', proposal);
  const service = new ConversationApplicationService({ store, loadWorkflow: async (_uid, id) => store.workflows.get(id) });
  await assert.rejects(() => service.apply('tenant-1', proposal.id, { approved: true, fingerprint: proposal.fingerprint }), /requires an approval node/);
  assert.equal(store.workflows.size, 0);
  assert.equal(store.proposals.get(proposal.id).state, 'proposed');
});
