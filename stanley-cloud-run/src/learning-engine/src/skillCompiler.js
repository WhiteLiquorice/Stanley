const crypto = require('crypto');
const { stableStringify } = require('../../trust-engine');

const NON_EXECUTABLE_TYPES = new Set(['mission', 'parameter', 'approval', 'assertion']);

function compileVerifiedSkill({ workflow, run, trustReport, name, now = new Date().toISOString() }) {
  if (!trustReport?.verified) throw new Error('Only a verified run can be compiled into a skill.');
  if (!run?.id) throw new Error('Compiled skill requires a source run.');
  const nodes = (workflow.nodes || [])
    .filter((node) => !NON_EXECUTABLE_TYPES.has(node.type))
    .map((node) => ({
      id: node.id,
      type: node.type,
      label: node.label || node.type,
      data: sanitizeNodeData(node.data || {}),
    }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (workflow.edges || [])
    .filter((edge) => edge.kind !== 'context' && nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge) => ({ source: edge.source, target: edge.target, condition: edge.condition || null }));
  const signature = stableStringify({ nodes, edges, assertions: workflow.assertions || [] });
  const fingerprint = crypto.createHash('sha256').update(signature).digest('hex');
  return {
    schemaVersion: 1,
    id: `skill-${fingerprint.slice(0, 16)}`,
    name: name || `${workflow.name || 'Workflow'} skill`,
    workflowId: workflow.id,
    sourceRunId: run.id,
    state: 'draft',
    fingerprint,
    nodes,
    edges,
    assertions: workflow.assertions || [],
    successCount: 1,
    failureCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function sanitizeNodeData(data) {
  if (Array.isArray(data)) return data.map((value) => sanitizeNodeData(value));
  if (!data || typeof data !== 'object') return typeof data === 'function' ? undefined : data;
  const output = {};
  for (const [key, value] of Object.entries(data)) {
    const secretKey = /(password|secret|token|authorization|cookie|api[-_]?key)/i.test(key);
    if (secretKey && !(typeof value === 'string' && value.startsWith('vault:'))) continue;
    const safe = sanitizeNodeData(value);
    if (safe !== undefined) output[key] = safe;
  }
  return output;
}

function promoteSkill(skill, regressionReport, approvedBy, now = new Date().toISOString()) {
  if (!regressionReport?.passed) throw new Error('Skill regression suite must pass before promotion.');
  if (!approvedBy) throw new Error('Skill promotion requires a human approver.');
  return { ...skill, state: 'active', regressionReport, approvedBy, promotedAt: now, updatedAt: now };
}

module.exports = { compileVerifiedSkill, promoteSkill, sanitizeNodeData };
