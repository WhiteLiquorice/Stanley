const { fingerprint: connectorFingerprint, hash, stableStringify } = require('../../connector-engine');
const { sanitizeNodeData } = require('../../learning-engine');

const DETERMINISTIC_NODE_TYPES = new Set([
  'trigger', 'navigate', 'click', 'type', 'wait', 'scrape', 'extract', 'extract_list',
  'open_tab', 'switch_tab', 'close_tab', 'condition', 'branch', 'loop', 'transform',
  'http_request', 'native_integration', 'connector', 'assertion', 'approval',
]);
const SIDE_EFFECT_TYPES = new Set(['click', 'type', 'http_request', 'native_integration', 'connector']);

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

function vaultReferences(value, found = new Set()) {
  if (typeof value === 'string' && value.startsWith('vault:')) found.add(value.slice(6));
  else if (Array.isArray(value)) value.forEach((item) => vaultReferences(item, found));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => vaultReferences(item, found));
  return [...found].sort();
}

function traceToNodes(agentNode, trace = []) {
  if (!Array.isArray(trace) || !trace.length) throw new Error(`Agent node ${agentNode.id} has no verified trace to compile.`);
  return trace.map((step, index) => {
    const type = step.action === 'finish' ? 'wait' : step.action;
    if (!DETERMINISTIC_NODE_TYPES.has(type) || type === 'approval') throw new Error(`Agent trace contains unsupported action: ${step.action}`);
    return { id: `${agentNode.id}__trace_${index + 1}`, type, label: step.description || `${agentNode.label || 'Agent'} step ${index + 1}`, data: sanitizeNodeData({ ...step, action: undefined, ms: type === 'wait' ? Number(step.ms || 0) : step.ms }) };
  });
}

function compileNodes(workflow, run) {
  const nodes = []; const replacements = new Map();
  for (const node of workflow.nodes || []) {
    if (['mission', 'parameter'].includes(node.type)) continue;
    if (node.type === 'agent') {
      const trace = run.nodeTraces?.[node.id] || run.scraped?.[node.id]?.trace || run.scraped?.[node.id]?.executionTrace;
      const compiled = traceToNodes(node, trace); nodes.push(...compiled); replacements.set(node.id, compiled.map((item) => item.id)); continue;
    }
    if (!DETERMINISTIC_NODE_TYPES.has(node.type)) throw new Error(`Node type ${node.type} cannot be compiled into a deterministic skill.`);
    nodes.push({ id: node.id, type: node.type, label: node.label || node.type, data: sanitizeNodeData(node.data || {}) });
  }
  const edges = [];
  for (const edge of workflow.edges || []) {
    if (edge.kind === 'context') continue;
    const sources = replacements.get(edge.source) || [edge.source]; const targets = replacements.get(edge.target) || [edge.target];
    edges.push({ source: sources[sources.length - 1], target: targets[0], condition: edge.condition || null });
  }
  for (const ids of replacements.values()) for (let index = 0; index < ids.length - 1; index++) edges.push({ source: ids[index], target: ids[index + 1], condition: null });
  return { nodes, edges };
}

function createSkillArtifact(fields, options = {}) {
  if (!fields.trustReport?.verified) throw new Error('Only a verified run can become a skill.');
  if (!fields.tenantId || !fields.workflow?.id || !fields.run?.id) throw new Error('Skill compilation requires tenant, workflow, and source run.');
  const { nodes, edges } = compileNodes(fields.workflow, fields.run);
  if (!nodes.length) throw new Error('Skill contains no executable nodes.');
  const now = options.now || new Date().toISOString(); const version = fields.version || 'v1';
  const requiredVaultRefs = vaultReferences(nodes);
  const targetDomains = [...new Set(nodes.flatMap((node) => { try { return node.data?.url ? [new URL(node.data.url).hostname.toLowerCase()] : []; } catch { return []; } }))].sort();
  const writeCapable = nodes.some((node) => SIDE_EFFECT_TYPES.has(node.type) && node.data?.readOnly !== true);
  const expectedModelCallsSaved = (fields.workflow.nodes || []).filter((node) => node.type === 'agent' || node.type === 'ai_prompt').length;
  const base = {
    schemaVersion: 1, skillId: fields.skillId || `skill_${fields.workflow.id}`.replace(/[^a-zA-Z0-9_-]/g, '_'), tenantId: fields.tenantId,
    version, name: fields.name || `${fields.workflow.name || 'Workflow'} skill`, description: fields.description || '',
    workflowId: fields.workflow.id, operationName: fields.operationName || fields.workflow.operationName || 'execute',
    state: 'draft', visibility: fields.visibility || 'tenant', nodes, edges,
    inputSchema: fields.inputSchema || fields.workflow.inputSchema || { type: 'object' }, outputSchema: fields.outputSchema || fields.workflow.outputSchema || {},
    assertions: clone(fields.workflow.assertions || []), regressionCases: clone(fields.regressionCases || []),
    match: clone(fields.match || { tags: fields.workflow.tags || [] }), preconditions: clone(fields.preconditions || []),
    targetDomains, requiredVaultRefs, writeCapable,
    approvalPolicy: clone(fields.approvalPolicy || { required: writeCapable, scope: writeCapable ? 'version' : 'none' }),
    sourceRunId: fields.run.id, sourceWorkflowFingerprint: fields.trustReport.workflowFingerprint || null,
    confidence: Math.max(0, Math.min(1, Number(fields.confidence ?? 1))), successCount: 1, failureCount: 0, driftCount: 0,
    latencyMsTotal: 0, executionCostMicros: 0, modelCallsSaved: 0, expectedModelCallsSaved, testResults: [], approvalHistory: [], rollbackVersion: fields.rollbackVersion || null,
    healthPolicy: clone(fields.healthPolicy || { minRuns: 5, maxFailureRate: 0.25, maxDriftCount: 3, autoRollback: true }), createdAt: now, updatedAt: now,
  };
  base.protectedPolicyHash = hash({ tenantId: base.tenantId, workflowId: base.workflowId, writeCapable, approvalPolicy: base.approvalPolicy, requiredVaultRefs, targetDomains: base.targetDomains });
  base.fingerprint = connectorFingerprint(base);
  return Object.freeze(base);
}

function validateSkill(skill) {
  for (const key of ['skillId', 'tenantId', 'version', 'workflowId', 'fingerprint']) if (!skill?.[key]) throw new Error(`Missing skill field: ${key}`);
  if (!/^v[1-9]\d*$/.test(skill.version)) throw new Error('Skill version must use vN format.');
  if (!Array.isArray(skill.nodes) || !skill.nodes.length || skill.nodes.some((node) => !DETERMINISTIC_NODE_TYPES.has(node.type) || node.type === 'agent')) throw new Error('Skill contains a non-deterministic node.');
  if (skill.writeCapable && skill.approvalPolicy?.required !== true) throw new Error('Write-capable skills require approval.');
  if (!/^[a-f0-9]{64}$/.test(skill.fingerprint) || !stableStringify(skill.nodes)) throw new Error('Skill fingerprint is invalid.');
  return clone(skill);
}

module.exports = { DETERMINISTIC_NODE_TYPES, SIDE_EFFECT_TYPES, compileNodes, createSkillArtifact, traceToNodes, validateSkill, vaultReferences };
