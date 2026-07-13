const assert = require('node:assert/strict');
const { makeRunId, prepareApprovedWorkflow, publicRun, requiresPreflightApproval } = require('../src/runLifecycle');

assert.equal(makeRunId('u', 'w', 'same'), makeRunId('u', 'w', 'same'));
assert.notEqual(makeRunId('u', 'w', 'one'), makeRunId('u', 'w', 'two'));

const workflow = {
  nodes: [
    { id: 'a', type: 'approval', label: 'Approve', data: { context: 'Send?' } },
    { id: 'b', type: 'send_email', data: { to: 'a@example.com' } },
  ],
};
assert.equal(requiresPreflightApproval(workflow), true);
const approved = prepareApprovedWorkflow(workflow, true);
assert.equal(approved.nodes[0].type, 'wait');
assert.equal(workflow.nodes[0].type, 'approval');
assert.deepEqual(publicRun({ id: '1', input: { secret: true }, state: 'queued', status: 'Running' }), { id: '1', state: 'queued', status: 'Running' });

console.log('runLifecycle tests passed');
