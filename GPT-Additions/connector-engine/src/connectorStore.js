const { clone } = require('./artifact');

class MemoryConnectorStore {
  constructor() { this.versions = new Map(); this.active = new Map(); this.failures = new Map(); this.repairs = new Map(); }
  key(tenantId, connectorId, version) { return `${tenantId}:${connectorId}:${version}`; }
  connectorKey(tenantId, connectorId) { return `${tenantId}:${connectorId}`; }
  async create(artifact) {
    const key = this.key(artifact.tenantId, artifact.connectorId, artifact.version);
    if (this.versions.has(key)) throw new Error('Connector version already exists.');
    this.versions.set(key, clone(artifact)); return clone(artifact);
  }
  async saveDraft(artifact) {
    const key = this.key(artifact.tenantId, artifact.connectorId, artifact.version); const current = this.versions.get(key);
    if (!current) throw new Error('Connector version not found.');
    if (current.publicationState === 'published' || current.publicationState === 'retired') throw new Error('Published connector versions are immutable.');
    this.versions.set(key, clone(artifact)); return clone(artifact);
  }
  async get(tenantId, connectorId, version) { return clone(this.versions.get(this.key(tenantId, connectorId, version)) || null); }
  async getActive(tenantId, connectorId) { const version = this.active.get(this.connectorKey(tenantId, connectorId)); return version ? this.get(tenantId, connectorId, version) : null; }
  async list(tenantId, { connectorId, state } = {}) {
    return [...this.versions.values()].filter((item) => item.tenantId === tenantId && (!connectorId || item.connectorId === connectorId) && (!state || item.publicationState === state)).map(clone).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }
  async publish(artifact) {
    const current = await this.get(artifact.tenantId, artifact.connectorId, artifact.version);
    if (!current) throw new Error('Connector version not found.');
    const published = { ...clone(artifact), publicationState: 'published', publishedAt: artifact.publishedAt || new Date().toISOString() };
    this.versions.set(this.key(artifact.tenantId, artifact.connectorId, artifact.version), published);
    this.active.set(this.connectorKey(artifact.tenantId, artifact.connectorId), artifact.version);
    return clone(published);
  }
  async setActiveVersion(tenantId, connectorId, version) {
    const target = await this.get(tenantId, connectorId, version);
    if (!target || target.publicationState !== 'published') throw new Error('Rollback target must be a published version.');
    this.active.set(this.connectorKey(tenantId, connectorId), version); return target;
  }
  async recordExecution(tenantId, connectorId, version, record) {
    const key = this.key(tenantId, connectorId, version); const current = this.versions.get(key); if (!current) throw new Error('Connector version not found.');
    current.successCount = Number(current.successCount || 0) + (record.success ? 1 : 0);
    current.failureCount = Number(current.failureCount || 0) + (record.success ? 0 : 1);
    current.latencyMsTotal = Number(current.latencyMsTotal || 0) + Number(record.durationMs || 0);
    current.executionCostMicros = Number(current.executionCostMicros || 0) + Number(record.executionCostMicros || 0);
    current.lastExecutionAt = record.occurredAt; current.lastExecutionState = record.success ? 'succeeded' : 'failed';
    if (!record.success && record.failureFingerprint) current.lastFailureFingerprint = record.failureFingerprint;
    if (!record.success && record.failureFingerprint) this.failures.set(`${tenantId}:${record.failureFingerprint}`, { ...record, occurrenceCount: Number(this.failures.get(`${tenantId}:${record.failureFingerprint}`)?.occurrenceCount || 0) + 1 });
    return clone(current);
  }
  async getFailureGroup(tenantId, _connectorId, fingerprint) { return clone(this.failures.get(`${tenantId}:${fingerprint}`) || null); }
  async saveRepairProposal(tenantId, connectorId, proposal) { this.repairs.set(`${tenantId}:${connectorId}:${proposal.id}`, clone(proposal)); return clone(proposal); }
  async getRepairProposal(tenantId, connectorId, proposalId) { return clone(this.repairs.get(`${tenantId}:${connectorId}:${proposalId}`) || null); }
}

class FirestoreConnectorStore {
  constructor(db, options = {}) { if (!db) throw new Error('FirestoreConnectorStore requires a database.'); this.db = db; this.clock = options.clock || (() => new Date().toISOString()); }
  root(tenantId) { return this.db.collection('stanley_users').doc(tenantId).collection('connectors'); }
  meta(tenantId, connectorId) { return this.root(tenantId).doc(connectorId); }
  version(tenantId, connectorId, version) { return this.meta(tenantId, connectorId).collection('versions').doc(version); }
  async create(artifact) {
    const ref = this.version(artifact.tenantId, artifact.connectorId, artifact.version); const snap = await ref.get();
    if (snap.exists) throw new Error('Connector version already exists.');
    await ref.set(clone(artifact));
    await this.meta(artifact.tenantId, artifact.connectorId).set({ connectorId: artifact.connectorId, tenantId: artifact.tenantId, name: artifact.name, updatedAt: this.clock() }, { merge: true });
    return clone(artifact);
  }
  async saveDraft(artifact) {
    const ref = this.version(artifact.tenantId, artifact.connectorId, artifact.version); const snap = await ref.get();
    if (!snap.exists) throw new Error('Connector version not found.');
    if (['published', 'retired'].includes(snap.data().publicationState)) throw new Error('Published connector versions are immutable.');
    await ref.set(clone(artifact)); return clone(artifact);
  }
  async get(tenantId, connectorId, version) { const snap = await this.version(tenantId, connectorId, version).get(); return snap.exists ? { ...snap.data(), version: snap.id } : null; }
  async getActive(tenantId, connectorId) { const meta = await this.meta(tenantId, connectorId).get(); return meta.exists && meta.data().activeVersion ? this.get(tenantId, connectorId, meta.data().activeVersion) : null; }
  async list(tenantId, { connectorId, state, limit = 100 } = {}) {
    if (connectorId) { let query = this.meta(tenantId, connectorId).collection('versions'); if (state) query = query.where('publicationState', '==', state); const snap = await query.limit(Math.min(limit, 200)).get(); return snap.docs.map((doc) => ({ ...doc.data(), version: doc.id })); }
    const metas = await this.root(tenantId).limit(Math.min(limit, 200)).get(); const items = [];
    for (const doc of metas.docs) { const item = await this.getActive(tenantId, doc.id); if (item && (!state || item.publicationState === state)) items.push(item); }
    return items;
  }
  async publish(artifact) {
    const published = { ...clone(artifact), publicationState: 'published', publishedAt: artifact.publishedAt || this.clock() };
    await this.version(artifact.tenantId, artifact.connectorId, artifact.version).set(published);
    await this.meta(artifact.tenantId, artifact.connectorId).set({ activeVersion: artifact.version, name: artifact.name, updatedAt: this.clock() }, { merge: true });
    return published;
  }
  async setActiveVersion(tenantId, connectorId, version) { const target = await this.get(tenantId, connectorId, version); if (!target || target.publicationState !== 'published') throw new Error('Rollback target must be a published version.'); await this.meta(tenantId, connectorId).set({ activeVersion: version, rollbackAt: this.clock(), updatedAt: this.clock() }, { merge: true }); return target; }
  async recordExecution(tenantId, connectorId, version, record) {
    const ref = this.version(tenantId, connectorId, version); const snap = await ref.get(); if (!snap.exists) throw new Error('Connector version not found.'); const current = snap.data();
    const patch = { successCount: Number(current.successCount || 0) + (record.success ? 1 : 0), failureCount: Number(current.failureCount || 0) + (record.success ? 0 : 1), latencyMsTotal: Number(current.latencyMsTotal || 0) + Number(record.durationMs || 0), executionCostMicros: Number(current.executionCostMicros || 0) + Number(record.executionCostMicros || 0), lastExecutionAt: record.occurredAt, lastExecutionState: record.success ? 'succeeded' : 'failed', ...(record.failureFingerprint ? { lastFailureFingerprint: record.failureFingerprint } : {}) };
    await ref.set(patch, { merge: true });
    if (!record.success && record.failureFingerprint) await this.meta(tenantId, connectorId).collection('failure_groups').doc(record.failureFingerprint).set({ ...record, occurrenceCount: Number(record.occurrenceCount || 1), updatedAt: this.clock() }, { merge: true });
    return { ...current, ...patch };
  }
  async getFailureGroup(tenantId, connectorId, fingerprint) { const snap = await this.meta(tenantId, connectorId).collection('failure_groups').doc(fingerprint).get(); return snap.exists ? snap.data() : null; }
  async saveRepairProposal(tenantId, connectorId, proposal) { await this.meta(tenantId, connectorId).collection('repair_proposals').doc(proposal.id).set(clone(proposal)); return clone(proposal); }
  async getRepairProposal(tenantId, connectorId, proposalId) { const snap = await this.meta(tenantId, connectorId).collection('repair_proposals').doc(proposalId).get(); return snap.exists ? snap.data() : null; }
}

module.exports = { FirestoreConnectorStore, MemoryConnectorStore };
