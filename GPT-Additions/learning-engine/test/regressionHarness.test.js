const test = require('node:test');
const assert = require('node:assert/strict');
const { createRepairProposal } = require('../src/repairProposal');
const { runRegressionSuite } = require('../src/regressionHarness');

test('tests a draft repair against every required case', async () => {
  const workflow = { id: 'wf', nodes: [{ id: 'save', type: 'click', data: { selector: '#old' } }], assertions: [] };
  const proposal = createRepairProposal({
    id: 'repair', caseId: 'case', workflowId: 'wf',
    operations: [{ type: 'update_node_data', nodeId: 'save', changes: { selector: '#new' } }],
  });
  const report = await runRegressionSuite({
    workflow,
    proposal,
    cases: [
      { id: 'failed-case', assertions: [{ source: 'scraped', path: 'saved', operator: 'equals', expected: true }] },
      { id: 'known-good', assertions: [{ source: 'scraped', path: 'saved', operator: 'equals', expected: true }] },
    ],
    executeCase: async ({ workflow: candidate }) => ({
      success: candidate.nodes[0].data.selector === '#new',
      scraped: { saved: true },
    }),
  });
  assert.equal(report.passed, true);
  assert.equal(report.passedCount, 2);
});
