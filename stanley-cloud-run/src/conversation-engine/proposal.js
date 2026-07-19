const crypto = require('crypto');

const WORKFLOW_MUTATION_TYPES = new Set([
  'workflow.create', 'workflow.rename', 'workflow.set_mission', 'workflow.set_trigger',
  'workflow.set_policy', 'step.add', 'step.update', 'step.move', 'step.delete',
]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function proposalFingerprint(fields) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(fields))).digest('hex');
}

function createProposal({ conversationId, plan, diff, clock = () => new Date().toISOString() }) {
  const createdAt = clock();
  const review = { conversationId, intent: plan.intent, summary: plan.summary, commands: plan.commands, diff };
  const fingerprint = proposalFingerprint(review);
  return {
    id: `proposal_${fingerprint.slice(0, 24)}`,
    ...review,
    fingerprint,
    state: 'proposed',
    canApply: plan.commands.length > 0 && plan.commands.every((command) => WORKFLOW_MUTATION_TYPES.has(command.type)),
    createdAt,
    expiresAt: new Date(Date.parse(createdAt) + 24 * 60 * 60 * 1000).toISOString(),
  };
}

module.exports = { WORKFLOW_MUTATION_TYPES, canonicalize, createProposal, proposalFingerprint };
