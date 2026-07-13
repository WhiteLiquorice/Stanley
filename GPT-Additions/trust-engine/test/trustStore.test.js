const test = require('node:test');
const assert = require('node:assert/strict');
const { TrustStore } = require('../src/trustStore');

class FakeSnapshot {
  constructor(path, data) { this.id = path.split('/').at(-1); this.exists = data !== undefined; this._data = data; }
  data() { return this._data; }
}

class FakeQuery {
  constructor(db, path, filters = [], order = null, maximum = Infinity) {
    this.db = db; this.path = path; this.filters = filters; this.order = order; this.maximum = maximum;
  }
  where(field, operator, value) { return new FakeQuery(this.db, this.path, [...this.filters, [field, operator, value]], this.order, this.maximum); }
  orderBy(field, direction = 'asc') { return new FakeQuery(this.db, this.path, this.filters, [field, direction], this.maximum); }
  limit(maximum) { return new FakeQuery(this.db, this.path, this.filters, this.order, maximum); }
  async get() {
    const prefix = `${this.path}/`;
    let rows = [...this.db.records.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path, value]) => new FakeSnapshot(path, value));
    for (const [field, operator, value] of this.filters) {
      if (operator !== '==') throw new Error('Fake only supports equality filters.');
      rows = rows.filter((row) => row.data()[field] === value);
    }
    if (this.order) {
      const [field, direction] = this.order;
      rows.sort((left, right) => String(left.data()[field]).localeCompare(String(right.data()[field])) * (direction === 'desc' ? -1 : 1));
    }
    const docs = rows.slice(0, this.maximum);
    return { docs, empty: docs.length === 0 };
  }
}

class FakeCollection extends FakeQuery {
  doc(id) { return new FakeDocument(this.db, `${this.path}/${id}`); }
}

class FakeDocument {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split('/').at(-1); }
  collection(name) { return new FakeCollection(this.db, `${this.path}/${name}`); }
  async get() { return new FakeSnapshot(this.path, this.db.records.get(this.path)); }
  async set(value, options = {}) {
    const current = this.db.records.get(this.path) || {};
    this.db.records.set(this.path, options.merge ? { ...current, ...value } : value);
  }
  async update(value) {
    if (!this.db.records.has(this.path)) throw new Error('Document does not exist.');
    this.db.records.set(this.path, { ...this.db.records.get(this.path), ...value });
  }
}

class FakeDb {
  constructor() { this.records = new Map(); }
  collection(name) { return new FakeCollection(this, name); }
}

test('persists checkpoints, receipts, and resolvable exceptions in user scope', async () => {
  const db = new FakeDb();
  const store = new TrustStore(db, { clock: () => '2026-07-13T00:00:00.000Z' });
  await store.writeCheckpoint('user-1', 'run-1', {
    id: 'cp-1', sequence: 1, nodeId: 'node-1', phase: 'after',
    workflowFingerprint: 'fingerprint', retentionDays: 7,
    state: { completedNodeIds: ['node-1'] },
  });
  const latest = await store.latestCheckpoint('user-1', 'run-1');
  assert.equal(latest.id, 'cp-1');
  assert.equal(latest.workflowFingerprint, 'fingerprint');
  assert.ok(latest.expiresAt instanceof Date);

  await store.writeReceipt('user-1', {
    id: 'receipt-1', runId: 'run-1', workflowId: 'workflow-1', kind: 'node_execution',
    policy: { evidenceRetentionDays: 7 }, evidence: { password: 'hidden' },
  });
  const receipts = await store.listReceipts('user-1', 'run-1');
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].evidence.password, '[REDACTED]');

  const opened = await store.openException('user-1', {
    id: 'exception-1', runId: 'run-1', workflowId: 'workflow-1', summary: 'Needs review',
  });
  assert.equal(opened.state, 'open');
  assert.equal((await store.listExceptions('user-1')).length, 1);
  const resolved = await store.resolveException('user-1', 'exception-1', { action: 'corrected', note: 'Fixed' });
  assert.equal(resolved.state, 'resolved');
  assert.equal((await store.listExceptions('user-1')).length, 0);
});
