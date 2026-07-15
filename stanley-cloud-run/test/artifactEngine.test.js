const test = require('node:test');
const assert = require('node:assert/strict');
const { ArtifactService } = require('../src/artifact-engine');
const { safeName } = require('../src/artifact-engine/service');

test('artifact names are storage-safe and bounded', () => {
  assert.equal(safeName('../../private report?.csv'), '.._.._private_report_.csv');
  assert.ok(safeName('x'.repeat(500)).length <= 120);
});

test('artifact service rejects empty and oversized payloads before storage', async () => {
  const service = new ArtifactService({ db: {}, bucket: {}, maxBytes: 3 });
  await assert.rejects(() => service.create('u', { name: 'empty', buffer: Buffer.alloc(0) }), /required/);
  await assert.rejects(() => service.create('u', { name: 'large', buffer: Buffer.alloc(4) }), (error) => error.status === 413);
});
