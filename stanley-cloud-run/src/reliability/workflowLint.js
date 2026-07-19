const { WorkflowContractError, validateWorkflow } = require('../workflowContract');

function lintWorkflow(workflow) {
  const errors = [];
  const warnings = [];
  try { validateWorkflow(workflow); } catch (error) {
    if (error instanceof WorkflowContractError) errors.push(...error.issues);
    else errors.push(error.message);
  }
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
  const edges = (Array.isArray(workflow?.edges) ? workflow.edges : []).filter((edge) => edge.kind !== 'context');
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const triggers = nodes.filter((node) => ['trigger', 'webhook_trigger', 'schedule_trigger'].includes(node.type));
  if (triggers.length === 1) {
    const reachable = new Set([triggers[0].id]);
    const queue = [triggers[0].id];
    while (queue.length) {
      const source = queue.shift();
      for (const edge of edges.filter((item) => item.source === source)) if (!reachable.has(edge.target)) { reachable.add(edge.target); queue.push(edge.target); }
    }
    for (const node of nodes) if (!['mission', 'parameter'].includes(node.type) && !reachable.has(node.id)) warnings.push(`Node "${node.id}" is unreachable from the trigger.`);
  }
  for (const node of nodes) {
    const outgoing = edges.filter((edge) => edge.source === node.id);
    const unconditional = outgoing.filter((edge) => !edge.condition || edge.condition === 'always' || edge.condition?.type === 'always');
    if (unconditional.length > 1) warnings.push(`Node "${node.id}" has multiple unconditional exits; only the first matching edge will execute.`);
    if (['trigger', 'navigate', 'open_tab'].includes(node.type) && ['https://', 'http://', ''].includes(String(node.data?.url || ''))) warnings.push(`Browser entry node "${node.id}" has no usable URL.`);
  }
  const visiting = new Set(); const visited = new Set(); const cycles = new Set();
  const walk = (id, path = []) => {
    if (visiting.has(id)) { cycles.add([...path.slice(path.indexOf(id)), id].join(' -> ')); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const edge of edges.filter((item) => item.source === id)) walk(edge.target, [...path, id]);
    visiting.delete(id); visited.add(id);
  };
  for (const node of nodes) walk(node.id);
  for (const cycle of cycles) {
    const ids = cycle.split(' -> ');
    if (!ids.some((id) => ['loop', 'paginate'].includes(byId.get(id)?.type))) warnings.push(`Unbounded graph cycle detected: ${cycle}.`);
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

module.exports = { lintWorkflow };
