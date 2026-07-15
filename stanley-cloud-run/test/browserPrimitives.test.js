const test = require('node:test');
const assert = require('node:assert/strict');
const { executeGraph } = require('../branchingEngine');

test('nested pagination executes its target node with full graph context', async () => {
  const agent = {
    page: { url: () => 'https://example.com' },
    openTab: async () => 'tab-1',
    scrapeContent: async () => 'page text',
  };
  const workflow = {
    id: 'wf',
    nodes: [
      { id: 'trigger', type: 'trigger', data: {} },
      { id: 'paginate', type: 'paginate', data: { maxPages: 1, actionNodeId: 'scrape' } },
      { id: 'scrape', type: 'scrape', data: {} },
    ],
    edges: [{ source: 'trigger', target: 'paginate' }],
  };
  const output = await executeGraph(agent, workflow);
  assert.deepEqual(output.paginate, ['page text']);
});

test('legacy autonomous agent handler stores output under the current node', async () => {
  const agent = { page: { url: () => 'https://example.com' }, openTab: async () => 'tab-1', clickByNaturalLocator: async () => ({ status: 'ok' }) };
  const workflow = { id: 'wf', nodes: [{ id: 'trigger', type: 'trigger', data: {} }, { id: 'agent', type: 'ai_agent', data: { goal: 'Click it' } }], edges: [{ source: 'trigger', target: 'agent' }] };
  const output = await executeGraph(agent, workflow);
  assert.equal(output.agent.status, 'ok');
});

