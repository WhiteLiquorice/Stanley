const test = require('node:test');
const assert = require('node:assert/strict');
const { createLearningMemory, selectMemories } = require('../src/learningMemory');
const { compileVerifiedSkill, promoteSkill } = require('../src/skillCompiler');

test('uses only approved, matching, unexpired memories', () => {
  const active = createLearningMemory({
    workflowId: 'wf', scope: 'workflow', key: 'account', value: 'Business',
    match: { 'vendor.id': 'V-1' }, approvedBy: 'user', confidence: 0.9,
  });
  const pending = createLearningMemory({
    workflowId: 'wf', scope: 'workflow', key: 'account', value: 'Personal',
    match: { 'vendor.id': 'V-1' },
  });
  const selected = selectMemories([pending, active], { vendor: { id: 'V-1' } }, { workflowId: 'wf' });
  assert.deepEqual(selected.map((memory) => memory.value), ['Business']);
});

test('compiles and promotes only a verified successful path', () => {
  const workflow = {
    id: 'wf', name: 'Create record',
    nodes: [
      { id: 'mission', type: 'mission', data: { prompt: 'Create record' } },
      { id: 'trigger', type: 'trigger', data: {} },
      { id: 'api', type: 'http_request', data: { method: 'POST', url: 'https://example.com', authorization: 'hidden', headers: { Authorization: 'also-hidden', Accept: 'application/json' } } },
    ],
    edges: [{ source: 'trigger', target: 'api' }],
    assertions: [{ id: 'created', source: 'scraped', path: 'api.id', operator: 'exists' }],
  };
  assert.throws(() => compileVerifiedSkill({ workflow, run: { id: 'run' }, trustReport: { verified: false } }));
  const skill = compileVerifiedSkill({ workflow, run: { id: 'run' }, trustReport: { verified: true } });
  assert.equal(skill.nodes.some((node) => node.type === 'mission'), false);
  assert.equal(Object.hasOwn(skill.nodes.find((node) => node.id === 'api').data, 'authorization'), false);
  assert.equal(Object.hasOwn(skill.nodes.find((node) => node.id === 'api').data.headers, 'Authorization'), false);
  assert.equal(skill.nodes.find((node) => node.id === 'api').data.headers.Accept, 'application/json');
  assert.equal(promoteSkill(skill, { passed: true }, 'user').state, 'active');
});
