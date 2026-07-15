class WorkflowPlatformStore {
  constructor(db, clock = () => new Date().toISOString()) { this.db = db; this.clock = clock; }
  workflow(uid, workflowId) { return this.db.collection('stanley_users').doc(uid).collection('workflows').doc(workflowId); }
  releases(uid, workflowId) { return this.workflow(uid, workflowId).collection('releases'); }
  async saveRelease(uid, workflowId, release) { const ref = this.releases(uid, workflowId).doc(release.id); const existing = await ref.get(); if (existing.exists) throw new Error('Release already exists and is immutable.'); await ref.create(release); return release; }
  async getRelease(uid, workflowId, id) { const snap = await this.releases(uid, workflowId).doc(id).get(); return snap.exists ? { id: snap.id, ...snap.data() } : null; }
  async listReleases(uid, workflowId, limit = 100) { const snap = await this.releases(uid, workflowId).limit(Math.min(Number(limit || 100), 200)).get(); return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); }
  async patchWorkflow(uid, workflowId, patch) { await this.workflow(uid, workflowId).set({ ...patch, updatedAt: this.clock() }, { merge: true }); const snap = await this.workflow(uid, workflowId).get(); return { id: snap.id, ...snap.data() }; }
}
module.exports = { WorkflowPlatformStore };
