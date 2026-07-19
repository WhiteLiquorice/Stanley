function classifyIntent(message, hasWorkflow = false) {
  const text = String(message || '').trim().toLowerCase();
  if (!text) return 'create';
  if (/\b(why|explain|what does|how does)\b/.test(text)) return 'explain';
  if (/\b(show|inspect|review|summarize)\b/.test(text) && hasWorkflow) return 'inspect';
  if (/\b(fix|repair|failed|broken|recover)\b/.test(text)) return 'repair';
  if (/\b(run|start|execute|launch)\b/.test(text) && hasWorkflow) return 'run';
  if (/\b(connect|disconnect|activate|pause|publish|rollback|manage)\b/.test(text)) return 'manage';
  if (hasWorkflow || /\b(change|edit|add|remove|delete|replace|rename|move)\b/.test(text)) return 'edit';
  return 'create';
}

module.exports = { classifyIntent };
