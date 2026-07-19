const test = require('node:test');
const assert = require('node:assert/strict');
const contract = require('../../shared/workflow-command-contract.json');

test('shared workflow commands are unique and idempotency-aware', () => {
  assert.equal(contract.version, 1);
  assert.ok(contract.commands.length >= 20);
  const types = contract.commands.map((command) => command.type);
  assert.equal(new Set(types).size, types.length);
  for (const command of contract.commands) {
    assert.ok(command.required.includes('requestId'), `${command.type} must require requestId`);
    assert.match(command.type, /^[a-z]+\.[a-z_]+$/);
  }
});

test('mutating workflow commands require revision preconditions', () => {
  const mutations = contract.commands.filter((command) =>
    command.type.startsWith('step.') || ['workflow.rename', 'workflow.set_mission', 'workflow.set_trigger', 'workflow.set_policy'].includes(command.type)
  );
  assert.ok(mutations.length > 0);
  for (const command of mutations) {
    assert.ok(command.required.includes('workflowId'), `${command.type} must bind a workflow`);
    assert.ok(command.required.includes('baseRevision'), `${command.type} must prevent stale writes`);
  }
});

test('command contract covers the mobile capability control plane', () => {
  const categories = new Set(contract.commands.map((command) => command.category));
  for (const category of ['workflow', 'step', 'lifecycle', 'run', 'trust', 'connection', 'connector', 'skill']) {
    assert.ok(categories.has(category), `missing ${category} commands`);
  }
});
