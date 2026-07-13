const FLOW_ONLY_TYPES = new Set([
  'mission', 'parameter', 'trigger', 'navigate', 'click', 'type', 'wait',
  'scrape', 'open_tab', 'switch_tab', 'close_tab', 'if', 'condition', 'goto',
  'label', 'ai_prompt', 'js_code', 'integration', 'ai_agent', 'agent',
  'vision', 'approval', 'http_request', 'loop', 'transform', 'send_slack',
  'send_email', 'monitor', 'router', 'extract', 'extract_list', 'paginate',
  'webhook_trigger', 'schedule_trigger'
]);

const DANGEROUS_TYPES = new Set(['js_code', 'send_email', 'send_slack', 'http_request', 'integration']);

class WorkflowContractError extends Error {
  constructor(issues) {
    super(`Workflow violates Stanley's execution contract: ${issues.join(' ')}`);
    this.name = 'WorkflowContractError';
    this.issues = issues;
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function buildExecutionPolicy(workflow) {
  const requested = isObject(workflow.executionPolicy) ? workflow.executionPolicy : {};
  return {
    maxNodes: clampInt(requested.maxNodes, 1, 100, 60),
    maxAgentSteps: clampInt(requested.maxAgentSteps, 1, 20, 8),
    maxRunAttempts: requested.retrySafe === true ? clampInt(requested.maxRunAttempts, 1, 3, 1) : 1,
    retrySafe: requested.retrySafe === true,
    allowCustomCode: requested.allowCustomCode === true,
    allowAgenticRecovery: requested.allowAgenticRecovery === true,
    requireApprovalForSideEffects: requested.requireApprovalForSideEffects !== false,
  };
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function hasApprovalImmediatelyBefore(nodeId, edges, nodesById) {
  return edges.some((edge) => edge.kind !== 'context' && edge.target === nodeId && nodesById[edge.source]?.type === 'approval');
}

/**
 * Validates the symbolic graph before any browser or model call can happen.
 * This is deliberately deterministic: the model can propose a graph, but it
 * cannot expand the runtime capability set or bypass an authored approval step.
 */
function validateWorkflow(workflow) {
  const issues = [];
  if (!isObject(workflow)) throw new WorkflowContractError(['Expected a workflow object.']);
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const edges = Array.isArray(workflow.edges) ? workflow.edges : [];
  const policy = buildExecutionPolicy(workflow);

  if (!workflow.name || typeof workflow.name !== 'string') issues.push('Workflow requires a name.');
  if (nodes.length === 0) issues.push('Workflow requires at least one node.');
  if (nodes.length > policy.maxNodes) issues.push(`Workflow exceeds its ${policy.maxNodes}-node limit.`);

  const nodesById = Object.create(null);
  for (const node of nodes) {
    if (!isObject(node) || typeof node.id !== 'string' || !node.id.trim()) {
      issues.push('Every node requires a non-empty string id.');
      continue;
    }
    if (nodesById[node.id]) issues.push(`Duplicate node id "${node.id}".`);
    nodesById[node.id] = node;
    if (!FLOW_ONLY_TYPES.has(node.type)) issues.push(`Node "${node.id}" uses unsupported type "${node.type}".`);
    if (!isObject(node.data)) issues.push(`Node "${node.id}" requires a data object.`);
    if (node.type === 'mission' && !String(node.data?.prompt || '').trim()) issues.push('Mission node requires a non-empty prompt.');
    if (node.type === 'ai_agent' || node.type === 'agent') {
      const requestedSteps = clampInt(node.data?.maxSteps, 1, 1000, policy.maxAgentSteps);
      if (requestedSteps > policy.maxAgentSteps) issues.push(`Agent node "${node.id}" exceeds the ${policy.maxAgentSteps}-step policy.`);
    }
    if (node.type === 'js_code' && !policy.allowCustomCode) issues.push(`Custom code node "${node.id}" is disallowed by policy.`);
  }

  const missions = nodes.filter((node) => node.type === 'mission');
  const triggers = nodes.filter((node) => node.type === 'trigger' || node.type === 'webhook_trigger' || node.type === 'schedule_trigger');
  if (missions.length !== 1) issues.push('Workflow must contain exactly one mission node.');
  if (triggers.length !== 1) issues.push('Workflow must contain exactly one trigger node.');

  const seenEdges = new Set();
  for (const edge of edges) {
    if (!isObject(edge) || typeof edge.source !== 'string' || typeof edge.target !== 'string') {
      issues.push('Every edge requires string source and target ids.');
      continue;
    }
    if (!nodesById[edge.source] || !nodesById[edge.target]) issues.push(`Edge ${edge.source} → ${edge.target} references a missing node.`);
    const key = `${edge.source}:${edge.target}:${edge.kind || 'flow'}`;
    if (seenEdges.has(key)) issues.push(`Duplicate edge ${edge.source} → ${edge.target}.`);
    seenEdges.add(key);

    const source = nodesById[edge.source];
    const target = nodesById[edge.target];
    if (edge.kind === 'context') {
      if (source && target && !['mission', 'parameter'].includes(source.type) && !['mission', 'parameter'].includes(target.type)) {
        issues.push(`Context edge ${edge.source} → ${edge.target} must attach a mission or parameter node.`);
      }
    } else if (source && target && (['mission', 'parameter'].includes(source.type) || ['mission', 'parameter'].includes(target.type))) {
      issues.push(`Mission and parameter nodes may only use context edges (${edge.source} → ${edge.target}).`);
    }
  }

  if (missions.length === 1 && triggers.length === 1) {
    const hasMissionContext = edges.some((edge) => edge.kind === 'context' && edge.source === missions[0].id && edge.target === triggers[0].id);
    if (!hasMissionContext) issues.push('Mission node must be attached to the trigger with a context edge.');
  }

  if (policy.requireApprovalForSideEffects) {
    for (const node of nodes) {
      if (!DANGEROUS_TYPES.has(node.type)) continue;
      const method = String(node.data?.method || 'GET').toUpperCase();
      const requiresApproval = node.type !== 'http_request' || method !== 'GET';
      if (requiresApproval && !hasApprovalImmediatelyBefore(node.id, edges, nodesById)) {
        issues.push(`Side-effect node "${node.id}" requires an approval node immediately before it.`);
      }
    }
  }

  if (issues.length) throw new WorkflowContractError(issues);
  return { workflow, policy };
}

module.exports = { WorkflowContractError, buildExecutionPolicy, validateWorkflow };
