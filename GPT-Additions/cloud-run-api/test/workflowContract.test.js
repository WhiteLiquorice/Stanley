const assert = require('node:assert/strict');
const { validateWorkflow, WorkflowContractError } = require('../src/workflowContract');

const base = () => ({
  name: 'Safe workflow',
  nodes: [
    { id: 'mission', type: 'mission', data: { prompt: 'Send a daily summary only after approval.' } },
    { id: 'trigger', type: 'schedule_trigger', data: {} },
    { id: 'approval', type: 'approval', data: { context: 'Review summary before delivery.' } },
    { id: 'email', type: 'send_email', data: { to: 'owner@example.com', subject: 'Daily summary' } }
  ],
  edges: [
    { source: 'mission', target: 'trigger', kind: 'context' },
    { source: 'trigger', target: 'approval' },
    { source: 'approval', target: 'email' }
  ]
});

assert.doesNotThrow(() => validateWorkflow(base()));

const noMission = base();
noMission.nodes = noMission.nodes.filter((node) => node.type !== 'mission');
assert.throws(() => validateWorkflow(noMission), WorkflowContractError);

const unapprovedSideEffect = base();
unapprovedSideEffect.edges = unapprovedSideEffect.edges.filter((edge) => edge.source !== 'approval');
unapprovedSideEffect.edges.push({ source: 'trigger', target: 'email' });
assert.throws(() => validateWorkflow(unapprovedSideEffect), /requires an approval node/);

const arbitraryCode = base();
arbitraryCode.nodes.push({ id: 'code', type: 'js_code', data: { code: 'return 1' } });
arbitraryCode.edges.push({ source: 'email', target: 'code' });
assert.throws(() => validateWorkflow(arbitraryCode), /Custom code node/);

console.log('workflowContract tests passed');
