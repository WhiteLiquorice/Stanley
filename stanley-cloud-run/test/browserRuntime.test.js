const test = require('node:test');
const assert = require('node:assert/strict');
const { SessionCipher } = require('../src/browser-runtime/encryption');
const { BrowserLifecycleManager } = require('../src/browser-runtime/lifecycle');
const { stableRef } = require('../src/browser-runtime/accessibility');
const { sanitizeSnapshot, safeUrl } = require('../src/browser-runtime/trace');
const { TakeoverBroker } = require('../src/browser-runtime/takeover');

class MemoryDoc {
  constructor(path, root) { this.path = path; this.root = root; }
  collection(name) { return new MemoryCollection(`${this.path}/${name}`, this.root); }
  async get() { const value = this.root.get(this.path); return { exists: value !== undefined, data: () => value }; }
  async set(value, options) { this.root.set(this.path, options?.merge ? { ...(this.root.get(this.path) || {}), ...value } : value); }
  async update(value) { if (!this.root.has(this.path)) throw new Error('missing'); this.root.set(this.path, { ...this.root.get(this.path), ...value }); }
}
class MemoryCollection {
  constructor(path, root) { this.path = path; this.root = root; }
  doc(id) { return new MemoryDoc(`${this.path}/${id}`, this.root); }
  async get() {
    const prefix = `${this.path}/`;
    const docs = [...this.root.entries()].filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/')).map(([key, value]) => ({ id: key.slice(prefix.length), data: () => value }));
    return { docs, empty: docs.length === 0 };
  }
}

test('session encryption is authenticated and tenant bound', () => {
  const cipher = new SessionCipher(Buffer.alloc(32, 7));
  const encrypted = cipher.encrypt({ cookies: [{ name: 'sid', value: 'secret' }] }, 'tenant-a:session');
  assert.equal(cipher.decrypt(encrypted, 'tenant-a:session').cookies[0].value, 'secret');
  assert.throws(() => cipher.decrypt(encrypted, 'tenant-b:session'));
});

test('accessibility references are deterministic semantic identities', () => {
  const element = { role: 'button', name: 'Continue', tag: 'button', testId: '', href: '', ordinal: 0 };
  assert.equal(stableRef('https://example.test/path', element), stableRef('https://example.test/path', element));
  assert.notEqual(stableRef('https://example.test/path', element), stableRef('https://example.test/other', element));
});

test('browser lifecycle enforces tenant capacity and reaps expired leases', () => {
  let now = 100;
  const lifecycle = new BrowserLifecycleManager({ maxPerTenant: 1, maxTotal: 2, maxRuntimeMs: 10, clock: () => now });
  lifecycle.acquire({ uid: 'a', runId: 'one' });
  assert.throws(() => lifecycle.acquire({ uid: 'a', runId: 'two' }), /limit/);
  now = 111;
  lifecycle.acquire({ uid: 'a', runId: 'two' });
  assert.equal(lifecycle.stats().active, 1);
});

test('trace snapshots remove page text and URL secrets', () => {
  const safe = sanitizeSnapshot({ schemaVersion: 1, url: 'https://example.test/path?token=secret#x', title: 'Private Account', elements: [{ ref: 'ax-123', role: 'button', name: 'Asher Account', tag: 'button', ordinal: 0 }] });
  assert.equal(safeUrl('https://example.test/path?token=secret'), 'https://example.test/path');
  assert.equal(safe.url, 'https://example.test/path');
  assert.equal(safe.elements[0].name, undefined);
  assert.match(safe.elements[0].nameHash, /^[a-f0-9]{12}$/);
});

test('takeover uses expiring tokens and constrained commands', async () => {
  const root = new Map();
  const store = {
    takeoverRef: (_uid, runId) => new MemoryDoc(`runs/${runId}/takeover`, root),
    commandRef: (_uid, runId, commandId) => new MemoryDoc(`runs/${runId}/takeover/commands/${commandId}`, root),
  };
  let now = 1000;
  const broker = new TakeoverBroker(store, { clock: () => now, leaseMs: 100, waitMs: 1000 });
  await broker.open('tenant-a', 'run-1', { reason: 'captcha' });
  const claim = await broker.claim('tenant-a', 'run-1');
  await assert.rejects(() => broker.command('tenant-a', 'run-1', 'wrong', { type: 'resume' }), /Invalid/);
  await assert.rejects(() => broker.command('tenant-a', 'run-1', claim.token, { type: 'javascript', value: 'alert(1)' }), /Unsupported/);
  const command = await broker.command('tenant-a', 'run-1', claim.token, { type: 'click_ref', ref: 'ax-0123456789ab' });
  assert.equal(command.type, 'click_ref');
  now = 1101;
  await assert.rejects(() => broker.heartbeat('tenant-a', 'run-1', claim.token), /expired/);
});
