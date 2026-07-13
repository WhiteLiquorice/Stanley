const test = require('node:test');
const assert = require('node:assert/strict');
const {
  RepairProposalError,
  applyRepairOperations,
  approveRepair,
  createRepairProposal,
} = require('../src/repairProposal');

const workflow = {
  id: 'wf',
  nodes: [{ id: 'save', type: 'click', data: { selector: '#old' } }],
  assertions: [],
};

test('permits narrow selector repairs but rejects executable code changes', () => {
  const proposal = createRepairProposal({
    caseId: 'case', workflowId: 'wf',
    operations: [{ type: 'update_node_data', nodeId: 'save', changes: { selector: '[data-testid="save"]' } }],
  });
  const candidate = applyRepairOperations(workflow, proposal, { allowDraft: true });
  assert.equal(candidate.nodes[0].data.selector, '[data-testid="save"]');
  assert.equal(workflow.nodes[0].data.selector, '#old');
  assert.throws(() => createRepairProposal({
    caseId: 'case', workflowId: 'wf',
    operations: [{ type: 'update_node_data', nodeId: 'save', changes: { code: 'dangerous()' } }],
  }), RepairProposalError);
  assert.throws(() => createRepairProposal({
    caseId: 'case', workflowId: 'wf',
    operations: [{ type: 'update_node_data', nodeId: 'save', changes: { sideEffect: false } }],
  }), RepairProposalError);
});

test('requires passing regressions and a human approver', () => {
  const proposal = createRepairProposal({
    caseId: 'case', workflowId: 'wf',
    operations: [{ type: 'update_node_data', nodeId: 'save', changes: { selector: '#new' } }],
  });
  assert.throws(() => approveRepair(proposal, { passed: false }, 'user'));
  assert.throws(() => approveRepair(proposal, { passed: true }, ''));
  assert.equal(approveRepair(proposal, { passed: true }, 'user').state, 'approved');
});
