const { stableStringify } = require('../../trust-engine');
function getPath(value, path) { return String(path).split('.').reduce((current, key) => current?.[key], value); }
function eligible(memory, context, now) { if (memory.state !== 'active' || memory.tenantId !== context.tenantId || memory.expiresAt && Date.parse(memory.expiresAt) <= now) return false; if (memory.scope === 'workflow' && memory.workflowId !== context.workflowId) return false; return Object.entries(memory.match || {}).every(([key, expected]) => stableStringify(getPath(context, key)) === stableStringify(expected)); }
function retrieveMemories(memories, context, options = {}) {
  const now = options.now || Date.now(); const candidates = memories.filter((memory) => eligible(memory, context, now)).map((memory) => { const specificity = Object.keys(memory.match || {}).length + (memory.scope === 'workflow' ? 3 : memory.scope === 'workspace' ? 2 : 1); const score = Number(memory.confidence || 0) * 100 + specificity * 5 + Math.min(5, Number(memory.successCount || 0)); return { memory, score, specificity }; }).sort((a, b) => b.score - a.score || String(b.memory.updatedAt).localeCompare(String(a.memory.updatedAt)));
  const selected = []; const seen = new Set(); const conflicts = [];
  for (const item of candidates) { const key = `${item.memory.type}:${item.memory.key}`; if (seen.has(key)) { conflicts.push({ key, rejectedId: item.memory.id, reason: 'Lower confidence or specificity than selected memory.' }); continue; } seen.add(key); selected.push(item); if (selected.length >= Math.min(50, Number(options.limit || 20))) break; }
  return { memories: selected.map(({ memory, score, specificity }) => ({ ...memory, retrieval: { score, specificity, reason: `Matched ${Object.keys(memory.match || {}).length} structured conditions at ${memory.scope} scope.` } })), conflicts };
}
module.exports = { eligible, retrieveMemories };
