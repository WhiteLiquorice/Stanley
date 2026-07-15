const SIDE_EFFECTS = new Set(['send_email', 'send_slack', 'integration', 'connector', 'native_integration', 'http_request', 'mcp_tool', 'upload_file', 'download_file', 'js_code']);
function flowEdges(workflow) { return (workflow.edges || []).filter((edge) => edge.kind !== 'context'); }
function ancestors(workflow, nodeId) { const keep = new Set([nodeId]); let changed = true; while (changed) { changed = false; for (const edge of flowEdges(workflow)) if (keep.has(edge.target) && !keep.has(edge.source)) { keep.add(edge.source); changed = true; } } return keep; }
function descendants(workflow, nodeId) { const keep = new Set([nodeId]); let changed = true; while (changed) { changed = false; for (const edge of flowEdges(workflow)) if (keep.has(edge.source) && !keep.has(edge.target)) { keep.add(edge.target); changed = true; } } return keep; }
function shadowSideEffects(workflow) { return { ...workflow, nodes: (workflow.nodes || []).map((node) => SIDE_EFFECTS.has(node.type) ? { ...node, type: 'wait', label: `${node.label || node.type} (regression shadow)`, data: { ms: '0', debugOriginalType: node.type } } : node) }; }
function buildDebugWorkflow(workflow, { nodeId, mode = 'through', allowSideEffects = false } = {}) {
  if (!(workflow.nodes || []).some((node) => node.id === nodeId)) throw new Error('Debug node not found.');
  const missionIds = new Set((workflow.nodes || []).filter((node) => node.type === 'mission' || node.type === 'parameter').map((node) => node.id));
  const trigger = (workflow.nodes || []).find((node) => ['trigger', 'webhook_trigger', 'schedule_trigger'].includes(node.type));
  const selected = mode === 'from' ? descendants(workflow, nodeId) : ancestors(workflow, nodeId); missionIds.forEach((id) => selected.add(id)); if (trigger) selected.add(trigger.id);
  let edges = (workflow.edges || []).filter((edge) => selected.has(edge.source) && selected.has(edge.target));
  if (mode === 'from' && trigger && nodeId !== trigger.id && !edges.some((edge) => edge.kind !== 'context' && edge.target === nodeId)) edges.push({ source: trigger.id, target: nodeId });
  const nodes = (workflow.nodes || []).filter((node) => selected.has(node.id)).map((node) => !allowSideEffects && SIDE_EFFECTS.has(node.type) ? { ...node, type: 'wait', label: `${node.label || node.type} (debug shadow)`, data: { ms: '0', debugOriginalType: node.type } } : node);
  return { ...workflow, id: `${workflow.id}:debug:${nodeId}`, name: `${workflow.name} — debug`, nodes, edges, debug: { nodeId, mode, sideEffects: allowSideEffects } };
}
module.exports = { SIDE_EFFECTS, ancestors, buildDebugWorkflow, descendants, shadowSideEffects };
