const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
class MemoryOrchestrationStore {
  constructor() { this.runs = new Map(); this.effects = new Set(); }
  key(uid, id) { return `${uid}:${id}`; }
  async create(uid, run) { const key = this.key(uid, run.id); if (this.runs.has(key)) return clone(this.runs.get(key)); this.runs.set(key, clone(run)); return clone(run); }
  async get(uid, runId) { return clone(this.runs.get(this.key(uid, runId)) || null); }
  async save(uid, run) { this.runs.set(this.key(uid, run.id), clone(run)); return clone(run); }
  async claimResume(uid, runId, leaseId, now = Date.now(), leaseMs = 60000) { const run = await this.get(uid, runId); if (!run || run.state !== 'queued') return null; if (run.lease?.expiresAtMs > now && run.lease.id !== leaseId) return null; run.lease = { id: leaseId, expiresAtMs: now + leaseMs }; run.state = 'running'; await this.save(uid, run); return run; }
  async claimEffect(uid, runId, effectKey) { const key = `${uid}:${runId}:${effectKey}`; if (this.effects.has(key)) return false; this.effects.add(key); return true; }
  async listDue(uid, nowIso, limit = 100) { return [...this.runs.values()].filter((run) => run.tenantId === uid && run.state === 'waiting' && Object.values(run.waits || {}).some((wait) => wait.state === 'pending' && ((wait.wakeAt && wait.wakeAt <= nowIso) || (wait.timeoutAt && wait.timeoutAt <= nowIso)))).slice(0, limit).map(clone); }
}
class FirestoreOrchestrationStore {
  constructor(db) { if (!db) throw new Error('FirestoreOrchestrationStore requires database.'); this.db = db; }
  ref(uid, runId) { return this.db.collection('stanley_users').doc(uid).collection('orchestrations').doc(runId); }
  async create(uid, run) { const ref = this.ref(uid, run.id); const snap = await ref.get(); if (snap.exists) return { id: snap.id, ...snap.data() }; await ref.create(clone(run)); return clone(run); }
  async get(uid, runId) { const snap = await this.ref(uid, runId).get(); return snap.exists ? { id: snap.id, ...snap.data() } : null; }
  async save(uid, run) { await this.ref(uid, run.id).set(clone(run)); return clone(run); }
  async claimResume(uid, runId, leaseId, now = Date.now(), leaseMs = 60000) { return this.db.runTransaction(async (tx) => { const ref = this.ref(uid, runId); const snap = await tx.get(ref); if (!snap.exists) return null; const run = { id: snap.id, ...snap.data() }; if (run.state !== 'queued' || run.lease?.expiresAtMs > now && run.lease.id !== leaseId) return null; run.lease = { id: leaseId, expiresAtMs: now + leaseMs }; run.state = 'running'; tx.set(ref, run); return run; }); }
  async claimEffect(uid, runId, effectKey) { return this.db.runTransaction(async (tx) => { const ref = this.ref(uid, runId).collection('effects').doc(effectKey); const snap = await tx.get(ref); if (snap.exists) return false; tx.create(ref, { claimedAt: new Date().toISOString() }); return true; }); }
  async listDue(uid, nowIso, limit = 100) { const snap = await this.db.collection('stanley_users').doc(uid).collection('orchestrations').where('state', '==', 'waiting').limit(Math.min(limit, 200)).get(); return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((run) => Object.values(run.waits || {}).some((wait) => wait.state === 'pending' && ((wait.wakeAt && wait.wakeAt <= nowIso) || (wait.timeoutAt && wait.timeoutAt <= nowIso)))); }
  async dueTenants(nowIso, limit = 500) { const snap = await this.db.collectionGroup('orchestrations').where('state', '==', 'waiting').limit(Math.min(limit, 1000)).get(); const due = snap.docs.map((doc) => doc.data()).filter((run) => Object.values(run.waits || {}).some((wait) => wait.state === 'pending' && ((wait.wakeAt && wait.wakeAt <= nowIso) || (wait.timeoutAt && wait.timeoutAt <= nowIso)))); return [...new Set(due.map((run) => run.tenantId).filter(Boolean))]; }
}
module.exports = { FirestoreOrchestrationStore, MemoryOrchestrationStore };
