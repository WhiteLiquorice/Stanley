class LearningStore {
  constructor(db, options = {}) {
    if (!db) throw new Error('LearningStore requires a Firestore-compatible database.');
    this.db = db;
    this.clock = options.clock || (() => new Date().toISOString());
  }
  user(uid) { return this.db.collection('stanley_users').doc(uid); }
  collection(uid, name) { return this.user(uid).collection(name); }

  async upsertFailureCase(uid, failureCase) {
    const ref = this.collection(uid, 'learning_cases').doc(failureCase.id);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      await ref.set(failureCase);
      return failureCase;
    }
    const current = snapshot.data();
    const patch = {
      ...failureCase,
      createdAt: current.createdAt,
      occurrenceCount: Number(current.occurrenceCount || 1) + 1,
      updatedAt: this.clock(),
    };
    await ref.set(patch);
    return patch;
  }

  async saveProposal(uid, proposal) {
    await this.collection(uid, 'repair_proposals').doc(proposal.id).set(proposal);
    return proposal;
  }

  async get(uid, name, id) { const snapshot = await this.collection(uid, name).doc(id).get(); return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null; }
  async saveCase(uid, learningCase) { await this.collection(uid, 'learning_cases').doc(learningCase.id).set(learningCase); return learningCase; }
  async saveRollout(uid, rollout) { await this.collection(uid, 'learning_rollouts').doc(rollout.id).set(rollout); return rollout; }
  async activeRollout(uid, workflowId) { const snapshot = await this.collection(uid, 'learning_rollouts').where('workflowId', '==', workflowId).limit(20).get(); return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((rollout) => ['shadow', 'canary'].includes(rollout.state)).sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))[0] || null; }
  async proposalForCase(uid, caseId) { const snapshot = await this.collection(uid, 'repair_proposals').where('caseId', '==', caseId).limit(20).get(); return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((proposal) => !['rejected', 'rolled_back'].includes(proposal.state)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null; }

  async saveMemory(uid, memory) {
    await this.collection(uid, 'learning_memories').doc(memory.id).set(memory);
    return memory;
  }

  async saveSkill(uid, skill) {
    await this.collection(uid, 'compiled_skills').doc(skill.id).set(skill);
    return skill;
  }

  async list(uid, name, { state, limit = 50 } = {}) {
    let query = this.collection(uid, name);
    if (state) query = query.where('state', '==', state);
    const snapshot = await query.limit(Math.min(Number(limit) || 50, 200)).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }
}

module.exports = { LearningStore };
