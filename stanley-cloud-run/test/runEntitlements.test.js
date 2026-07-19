const test = require('node:test');
const assert = require('node:assert/strict');
const { FREE_SUCCESSFUL_RUN_LIMIT, isPaidAccount, usageSnapshot } = require('../src/runEntitlements');
test('free usage includes reservations and never goes negative', () => { assert.equal(FREE_SUCCESSFUL_RUN_LIMIT, 10); assert.deepEqual(usageSnapshot({ status: 'free', runs_used: 7, runs_reserved: 2 }), { paid: false, runsUsed: 7, runsReserved: 2, remaining: 1 }); assert.equal(usageSnapshot({ status: 'free', runs_used: 12 }).remaining, 0); });
test('paid and legacy active accounts bypass the free limit', () => { assert.equal(isPaidAccount({ paid: true, status: 'free' }), true); assert.equal(isPaidAccount({ status: 'active' }), true); assert.equal(usageSnapshot({ paid: true, runs_used: 999 }).remaining, null); });

function fakeDb(seed = {}) {
  const docs = new Map(Object.entries(seed));
  const ref = (path) => ({ path });
  const snapshot = (reference) => ({ exists: docs.has(reference.path), id: reference.path.split('/').at(-1), data: () => structuredClone(docs.get(reference.path)) });
  return {
    docs,
    collection(name) { return { doc(id) { const base = `${name}/${id}`; return { ...ref(base), collection(child) { return { doc(childId) { return ref(`${base}/${child}/${childId}`); } }; } }; } }; },
    async runTransaction(fn) { return fn({ get: async (reference) => snapshot(reference), create(reference, value) { if (docs.has(reference.path)) throw new Error('exists'); docs.set(reference.path, structuredClone(value)); }, update(reference, value) { docs.set(reference.path, { ...docs.get(reference.path), ...structuredClone(value) }); } }); },
  };
}

test('reservation, duplicate submission, and successful settlement are atomic and idempotent', async () => {
  const { RunEntitlementService } = require('../src/runEntitlements');
  const db = fakeDb({ 'stanley_users/u': { status: 'free', paid: false, runs_used: 0, runs_reserved: 0 } });
  const runs = { ref: (uid, id) => db.collection('stanley_users').doc(uid).collection('runs').doc(id), legacyStatusForState: () => 'Running' };
  const service = new RunEntitlementService(db, runs);
  const created = await service.create('u', { id: 'r', state: 'queued' });
  assert.equal(created.quotaReservation.tier, 'free');
  assert.equal(db.docs.get('stanley_users/u').runs_reserved, 1);
  assert.equal((await service.create('u', { id: 'r', state: 'queued' })).duplicate, true);
  assert.equal(db.docs.get('stanley_users/u').runs_reserved, 1);
  await service.settle('u', 'r', true); await service.settle('u', 'r', true);
  assert.equal(db.docs.get('stanley_users/u').runs_reserved, 0);
  assert.equal(db.docs.get('stanley_users/u').runs_used, 1);
});
