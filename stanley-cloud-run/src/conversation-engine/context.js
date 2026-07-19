const SENSITIVE_KEY = /(authorization|cookie|credential|password|secret|token|api[-_]?key|private[-_]?key)/i;
const SAFE_NODE_DATA_KEYS = new Set([
  'description', 'goal', 'integrationName', 'label', 'maxPages', 'maxSteps', 'method',
  'operationName', 'prompt', 'readOnly', 'role', 'selector', 'url',
]);

function compact(value, limit) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function sanitizeMessage(message) {
  return compact(message, 6000)
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, '[private key removed]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [secret removed]')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[API key removed]')
    .replace(/\b(?:sk|ghp|github_pat)-[A-Za-z0-9_-]{12,}\b/gi, '[secret removed]')
    .replace(/\b(password|passwd|secret|api[-_]?key|access[-_]?token|refresh[-_]?token)\s*[:=]\s*(["']?)[^\s,"'}]+\2/gi, '$1=[secret removed]')
    .replace(/([?&](?:password|secret|api[-_]?key|access[-_]?token|refresh[-_]?token)=)[^&#\s]+/gi, '$1[secret removed]');
}

function sanitizeNodeData(data = {}) {
  const result = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (SENSITIVE_KEY.test(key) || !SAFE_NODE_DATA_KEYS.has(key)) continue;
    if (typeof value === 'string') {
      if (/^vault:/i.test(value)) result[key] = '[vault reference]';
      else result[key] = compact(value, key === 'prompt' || key === 'goal' ? 600 : 240);
    } else if (typeof value === 'boolean' || typeof value === 'number') result[key] = value;
  }
  return result;
}

function workflowContext(workflow) {
  if (!workflow || typeof workflow !== 'object') return null;
  return {
    id: compact(workflow.id, 160),
    name: compact(workflow.name, 160),
    revision: Number.isInteger(workflow.revision) ? workflow.revision : Number(workflow.version || 0),
    executionPolicy: workflow.executionPolicy ? {
      maxNodes: workflow.executionPolicy.maxNodes,
      maxAgentSteps: workflow.executionPolicy.maxAgentSteps,
      maxExecutionMs: workflow.executionPolicy.maxExecutionMs,
      allowCustomCode: workflow.executionPolicy.allowCustomCode === true,
      allowAgenticRecovery: workflow.executionPolicy.allowAgenticRecovery === true,
      requireApprovalForSideEffects: workflow.executionPolicy.requireApprovalForSideEffects !== false,
    } : null,
    nodes: (Array.isArray(workflow.nodes) ? workflow.nodes : []).slice(0, 100).map((node) => ({
      id: compact(node.id, 160), type: compact(node.type, 80), label: compact(node.label, 160), data: sanitizeNodeData(node.data),
    })),
    edges: (Array.isArray(workflow.edges) ? workflow.edges : []).slice(0, 250).map((edge) => ({
      source: compact(edge.source, 160), target: compact(edge.target, 160), kind: compact(edge.kind || 'flow', 40),
    })),
  };
}

function conversationContext(input = {}) {
  return {
    workflow: workflowContext(input.workflow),
    answers: Object.fromEntries(Object.entries(input.answers || {}).slice(0, 20).map(([key, value]) => [compact(key, 80), compact(value, 500)])),
  };
}

module.exports = { conversationContext, sanitizeMessage, sanitizeNodeData, workflowContext };
