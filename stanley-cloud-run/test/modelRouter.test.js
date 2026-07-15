const test = require('node:test');
const assert = require('node:assert/strict');
const { compactText, createRoutedResolver, extractStructuredJson } = require('../visionResolver');

test('context compaction preserves both the beginning and end', () => {
  const compacted = compactText(`START${'x'.repeat(5000)}END`, 2000);
  assert.match(compacted, /^START/);
  assert.match(compacted, /END$/);
  assert.match(compacted, /CONTEXT COMPACTED/);
});

test('structured extraction parser accepts objects, arrays and JSON fences', () => {
  assert.deepEqual(extractStructuredJson('{"ok":true}'), { ok: true });
  assert.deepEqual(extractStructuredJson('```json\n[1,2]\n```'), [1, 2]);
});

test('deterministic profiles fail closed before making a model request', async () => {
  const resolver = createRoutedResolver({ profile: 'deterministic', maxModelCalls: 0 });
  await assert.rejects(() => resolver.generateText('hello'), (error) => error.code === 'MODEL_BUDGET_EXHAUSTED');
  assert.equal(resolver.usage.calls, 0);
});

