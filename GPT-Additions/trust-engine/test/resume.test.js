const test = require('node:test');
const assert = require('node:assert/strict');
const { buildResumePlan, shouldSkipCompletedNode, workflowFingerprint } = require('../src/resume');

const workflow = {
  id: 'wf-1',
  nodes: [{ id: 'a', type: 'trigger', data: {} }, { id: 'b', type: 'navigate', data: { url: 'https://example.com' } }],
  edges: [{ source: 'a', target: 'b' }],
};

test('resumes only against the exact workflow version', () => {
  const checkpoint = {
    id: 'cp-1', sequence: 4, nodeId: 'a', phase: 'after', resumable: true,
    workflowFingerprint: workflowFingerprint(workflow),
    state: { completedNodeIds: ['a'] },
  };
  const plan = buildResumePlan(workflow, checkpoint);
  assert.equal(plan.resumeAfterNodeId, 'a');
  assert.equal(shouldSkipCompletedNode(workflow.nodes[0], plan), true);
  assert.equal(shouldSkipCompletedNode(workflow.nodes[1], plan), false);
  assert.throws(() => buildResumePlan({ ...workflow, nodes: [...workflow.nodes, { id: 'c', type: 'wait', data: {} }] }, checkpoint), /Workflow changed/);
});
