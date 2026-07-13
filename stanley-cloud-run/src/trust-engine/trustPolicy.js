const { ASSERTION_OPERATORS } = require('./assertions');

const TRUST_MODES = new Set(['live', 'shadow']);
const SIDE_EFFECT_TYPES = new Set(['click', 'type', 'js_code', 'integration', 'send_email', 'send_slack']);

function isSideEffectNode(node) {
  if (node?.data?.shadowSafe === true) return false;
  if (!node || !SIDE_EFFECT_TYPES.has(node.type) && node.type !== 'http_request') return false;
  if (node.type !== 'http_request') return true;
  return !['GET', 'HEAD', 'OPTIONS'].includes(String(node.data?.method || 'GET').toUpperCase());
}

function requiresApprovalNode(node) {
  if (!node) return false;
  if (node.type === 'http_request') return !['GET', 'HEAD', 'OPTIONS'].includes(String(node.data?.method || 'GET').toUpperCase());
  if (['js_code', 'integration', 'send_email', 'send_slack'].includes(node.type)) return true;
  return ['click', 'type'].includes(node.type) && node.data?.sideEffect === true;
}

function normalizeTrustPolicy(workflow = {}, overrides = {}) {
  const requested = { ...(workflow.trustPolicy || {}), ...overrides };
  const mode = TRUST_MODES.has(requested.mode) ? requested.mode : 'live';
  return {
    mode,
    checkpointEveryNode: requested.checkpointEveryNode !== false,
    requireProofReceipts: requested.requireProofReceipts !== false,
    openExceptionOnFailure: requested.openExceptionOnFailure !== false,
    openExceptionOnAssertionFailure: requested.openExceptionOnAssertionFailure !== false,
    requireApprovalForSideEffects: requested.requireApprovalForSideEffects !== false,
    evidenceRetentionDays: clampInteger(requested.evidenceRetentionDays, 1, 90, 14),
  };
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function collectAssertions(workflow = {}) {
  const topLevel = Array.isArray(workflow.assertions) ? workflow.assertions : [];
  const nodeAssertions = (workflow.nodes || [])
    .filter((node) => node.type === 'assertion')
    .map((node) => ({ id: node.id, label: node.label, ...(node.data || {}) }));
  return [...topLevel, ...nodeAssertions];
}

function prepareTrustWorkflow(workflow, overrides = {}) {
  const policy = normalizeTrustPolicy(workflow, overrides);
  const plannedActions = [];
  const nodes = (workflow.nodes || []).map((node) => {
    if (node.type === 'assertion') {
      return {
        ...node,
        type: 'wait',
        label: `${node.label || 'Assertion'} (evaluated by Trust Engine)`,
        data: { ms: '0', trustOriginalType: 'assertion' },
      };
    }
    if (policy.mode !== 'shadow' || !isSideEffectNode(node)) return node;
    plannedActions.push({
      nodeId: node.id,
      nodeType: node.type,
      label: node.label || node.type,
      intendedAction: node.data || {},
    });
    return {
      ...node,
      type: 'wait',
      label: `${node.label || node.type} (shadowed)`,
      data: { ms: '0', trustOriginalType: node.type, trustShadowed: true },
    };
  });
  return {
    workflow: { ...workflow, nodes, trustPolicy: policy },
    policy,
    assertions: collectAssertions(workflow),
    plannedActions,
  };
}

function validateTrustConfiguration(workflow = {}, overrides = {}) {
  const policy = normalizeTrustPolicy(workflow, overrides);
  const issues = [];
  for (const node of workflow.nodes || []) {
    if (node.type === 'assertion') {
      if (!node.data?.source) issues.push(`Assertion node "${node.id}" requires data.source.`);
      if (!node.data?.operator) issues.push(`Assertion node "${node.id}" requires data.operator.`);
      else if (!ASSERTION_OPERATORS.has(node.data.operator)) issues.push(`Assertion node "${node.id}" uses an unsupported operator.`);
    }
  }
  for (const [index, assertion] of (workflow.assertions || []).entries()) {
    if (!assertion?.source) issues.push(`Top-level assertion ${index + 1} requires source.`);
    if (!ASSERTION_OPERATORS.has(assertion?.operator || '')) issues.push(`Top-level assertion ${index + 1} uses an unsupported operator.`);
  }
  if (policy.mode === 'live' && policy.requireApprovalForSideEffects) {
    const nodesById = Object.fromEntries((workflow.nodes || []).map((node) => [node.id, node]));
    for (const node of workflow.nodes || []) {
      if (!requiresApprovalNode(node)) continue;
      const approved = (workflow.edges || []).some((edge) =>
        edge.kind !== 'context' && edge.target === node.id && nodesById[edge.source]?.type === 'approval');
      if (!approved) issues.push(`Live side effect "${node.id}" requires an approval immediately before it.`);
    }
  }
  return { valid: issues.length === 0, issues, policy };
}

module.exports = {
  SIDE_EFFECT_TYPES,
  TRUST_MODES,
  collectAssertions,
  isSideEffectNode,
  normalizeTrustPolicy,
  prepareTrustWorkflow,
  requiresApprovalNode,
  validateTrustConfiguration,
};
