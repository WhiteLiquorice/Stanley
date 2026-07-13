const crypto = require('crypto');
const { redactEvidence, stableStringify } = require('../../trust-engine');
const TYPES = new Set(['procedural', 'semantic', 'episodic']); const SCOPES = new Set(['workflow', 'workspace', 'organization']);
function createMemory(fields, options = {}) {
  if (!fields.tenantId || !TYPES.has(fields.type) || !fields.key || fields.value === undefined) throw new Error('Memory requires tenant, valid type, key, and value.');
  const scope = SCOPES.has(fields.scope) ? fields.scope : 'workflow'; if (scope === 'workflow' && !fields.workflowId) throw new Error('Workflow memory requires workflowId.'); if (!fields.provenance?.type) throw new Error('Memory requires provenance.');
  const now = options.now || new Date().toISOString(); const ttlDays = fields.ttlDays === null ? null : Number(fields.ttlDays ?? (fields.type === 'episodic' ? 30 : fields.type === 'semantic' ? 180 : 0));
  const signature = stableStringify({ tenantId: fields.tenantId, type: fields.type, scope, workflowId: fields.workflowId || null, key: fields.key, match: fields.match || {} });
  const approvalRequired = fields.type === 'procedural' || scope === 'organization';
  return { schemaVersion: 1, id: fields.id || `mem-${crypto.createHash('sha256').update(signature).digest('hex').slice(0, 20)}`, tenantId: fields.tenantId, type: fields.type, scope, workflowId: fields.workflowId || null, key: String(fields.key).slice(0, 200), value: redactEvidence(fields.value), match: redactEvidence(fields.match || {}), provenance: redactEvidence(fields.provenance), confidence: Math.max(0, Math.min(1, Number(fields.confidence ?? 0.7))), state: approvalRequired && !fields.approvedBy ? 'pending_approval' : 'active', approvedBy: fields.approvedBy || null, revision: Number(fields.revision || 1), useCount: 0, successCount: 0, failureCount: 0, expiresAt: fields.expiresAt || (ttlDays > 0 ? new Date(Date.parse(now) + ttlDays * 86400000).toISOString() : null), createdAt: now, updatedAt: now, lastUsedAt: null };
}
function validateMemory(memory) { if (!memory || !memory.id || !memory.tenantId || !TYPES.has(memory.type) || !SCOPES.has(memory.scope)) throw new Error('Invalid memory artifact.'); return memory; }
module.exports = { SCOPES, TYPES, createMemory, validateMemory };
