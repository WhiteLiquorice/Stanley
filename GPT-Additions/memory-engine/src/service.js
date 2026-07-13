const { createMemory } = require('./artifact'); const { retrieveMemories } = require('./retrieval');
class MemoryService {
  constructor({ store, clock = () => new Date().toISOString() }) { if (!store) throw new Error('MemoryService requires store.'); this.store = store; this.clock = clock; }
  async create(uid, fields) { return this.store.save(uid, createMemory({ ...fields, tenantId: uid }, { now: this.clock() })); }
  async approve(uid, id, approvedBy) { const memory = await this.require(uid, id); if (memory.state !== 'pending_approval') throw new Error('Memory is not pending approval.'); if (!approvedBy?.uid || approvedBy.type === 'model') throw new Error('Human approval required.'); return this.store.save(uid, { ...memory, state: 'active', approvedBy, updatedAt: this.clock() }); }
  async retrieve(uid, context, options) { return retrieveMemories(await this.store.list(uid), { ...context, tenantId: uid }, options); }
  async recordOutcome(uid, ids, success) { const output = []; for (const id of new Set(ids || [])) { const memory = await this.require(uid, id); const successes = Number(memory.successCount || 0) + (success ? 1 : 0); const failures = Number(memory.failureCount || 0) + (success ? 0 : 1); const confidence = Math.max(0.05, Math.min(1, (successes + 1) / (successes + failures + 2))); output.push(await this.store.save(uid, { ...memory, useCount: Number(memory.useCount || 0) + 1, successCount: successes, failureCount: failures, confidence, lastUsedAt: this.clock(), updatedAt: this.clock(), state: failures >= 3 && failures > successes ? 'quarantined' : memory.state })); } return output; }
  async revise(uid, id, changes, approvedBy = null) { const memory = await this.require(uid, id); return this.create(uid, { ...memory, ...changes, id: `${memory.id}-r${memory.revision + 1}`, revision: memory.revision + 1, provenance: { type: 'revision', previousId: memory.id, actor: approvedBy }, approvedBy: memory.type === 'procedural' || memory.scope === 'organization' ? approvedBy : memory.approvedBy }); }
  async delete(uid, id) { await this.require(uid, id); return this.store.delete(uid, id); }
  async deleteByProvenance(uid, predicate) { const memories = await this.store.list(uid); let deleted = 0; for (const memory of memories) if (predicate(memory.provenance || {})) { await this.store.delete(uid, memory.id); deleted += 1; } return deleted; }
  async require(uid, id) { const memory = await this.store.get(uid, id); if (!memory || memory.tenantId !== uid) throw new Error('Memory not found.'); return memory; }
}
module.exports = { MemoryService };
