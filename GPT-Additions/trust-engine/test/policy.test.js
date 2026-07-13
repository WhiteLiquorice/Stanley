const test = require('node:test');
const assert = require('node:assert/strict');
const { isSideEffectNode, prepareTrustWorkflow, validateTrustConfiguration } = require('../src/trustPolicy');

const workflow = {
  id: 'wf-1',
  trustPolicy: { mode: 'shadow' },
  nodes: [
    { id: 'trigger', type: 'trigger', data: {} },
    { id: 'email', type: 'send_email', label: 'Notify', data: { to: 'person@example.com', body: 'Hello' } },
    { id: 'check', type: 'assertion', data: { source: 'scraped', path: 'sent', operator: 'equals', expected: true } },
  ],
  edges: [
    { source: 'trigger', target: 'email' },
    { source: 'email', target: 'check' },
  ],
};

test('classifies reads and writes correctly', () => {
  assert.equal(isSideEffectNode({ type: 'http_request', data: { method: 'GET' } }), false);
  assert.equal(isSideEffectNode({ type: 'http_request', data: { method: 'POST' } }), true);
  assert.equal(isSideEffectNode({ type: 'send_email', data: {} }), true);
});

test('shadow mode converts side effects and assertions into deterministic no-ops', () => {
  const prepared = prepareTrustWorkflow(workflow);
  assert.equal(prepared.policy.mode, 'shadow');
  assert.equal(prepared.workflow.nodes.find((node) => node.id === 'email').type, 'wait');
  assert.equal(prepared.workflow.nodes.find((node) => node.id === 'check').type, 'wait');
  assert.equal(prepared.plannedActions.length, 1);
  assert.equal(prepared.assertions.length, 1);
});

test('live side effects require an immediately preceding approval', () => {
  const live = { ...workflow, trustPolicy: { mode: 'live' } };
  const invalid = validateTrustConfiguration(live);
  assert.equal(invalid.valid, false);
  const approved = {
    ...live,
    nodes: [...live.nodes, { id: 'approval', type: 'approval', data: {} }],
    edges: [
      { source: 'trigger', target: 'approval' },
      { source: 'approval', target: 'email' },
      { source: 'email', target: 'check' },
    ],
  };
  assert.equal(validateTrustConfiguration(approved).valid, true);
});

test('ordinary browser interaction needs approval only when explicitly irreversible', () => {
  const readOnly = {
    trustPolicy: { mode: 'live' },
    nodes: [
      { id: 'trigger', type: 'trigger', data: {} },
      { id: 'click', type: 'click', data: { description: 'Open details' } },
    ],
    edges: [{ source: 'trigger', target: 'click' }],
  };
  assert.equal(validateTrustConfiguration(readOnly).valid, true);
  readOnly.nodes[1].data.sideEffect = true;
  assert.equal(validateTrustConfiguration(readOnly).valid, false);
});
