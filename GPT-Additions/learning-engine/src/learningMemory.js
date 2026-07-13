const crypto = require('crypto');
const { redactEvidence, stableStringify } = require('../../trust-engine');

const MEMORY_SCOPES = new Set(['workflow', 'workspace', 'organization']);

function createLearningMemory(fields, options = {}) {
  if (!fields.key || fields.value === undefined) throw new Error('Learning memory requires key and value.');
  const scope = MEMORY_SCOPES.has(fields.scope) ? fields.scope : 'workflow';
  if (scope === 'workflow' && !fields.workflowId) throw new Error('Workflow-scoped memory requires workflowId.');
  const now = options.now || new Date().toISOString();
  const signature = stableStringify({ scope, workflowId: fields.workflowId || null, key: fields.key, match: fields.match || {} });
  return {
    schemaVersion: 1,
    id: fields.id || `memory-${crypto.createHash('sha256').update(signature).digest('hex').slice(0, 16)}`,
    scope,
    workflowId: fields.workflowId || null,
    key: String(fields.key).slice(0, 200),
    value: redactEvidence(fields.value),
    match: redactEvidence(fields.match || {}),
    confidence: Math.max(0, Math.min(1, Number(fields.confidence ?? 1))),
    source: redactEvidence(fields.source || { type: 'user_correction' }),
    state: fields.approvedBy ? 'active' : 'pending_approval',
    approvedBy: fields.approvedBy || null,
    expiresAt: fields.expiresAt || null,
    createdAt: now,
    updatedAt: now,
  };
}

function memoryMatches(memory, context = {}, now = Date.now()) {
  if (memory.state !== 'active') return false;
  if (memory.expiresAt && Date.parse(memory.expiresAt) <= now) return false;
  return Object.entries(memory.match || {}).every(([key, expected]) => {
    const actual = String(key).split('.').reduce((value, part) => value?.[part], context);
    return stableStringify(actual) === stableStringify(expected);
  });
}

function selectMemories(memories = [], context = {}, { workflowId, limit = 20 } = {}) {
  return memories
    .filter((memory) => memory.scope !== 'workflow' || memory.workflowId === workflowId)
    .filter((memory) => memoryMatches(memory, context))
    .sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0))
    .slice(0, Math.min(Number(limit) || 20, 100));
}

module.exports = { MEMORY_SCOPES, createLearningMemory, memoryMatches, selectMemories };
