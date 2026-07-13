const crypto = require('crypto');
const { redactEvidence, stableStringify } = require('../../trust-engine');

const ALLOWED_NODE_DATA_KEYS = new Set([
  'selector', 'description', 'intentFallback', 'expect', 'timeout',
]);
const ALLOWED_OPERATIONS = new Set(['update_node_data', 'add_assertion', 'remove_assertion']);

class RepairProposalError extends Error {
  constructor(issues) {
    super(`Invalid repair proposal: ${issues.join(' ')}`);
    this.name = 'RepairProposalError';
    this.issues = issues;
  }
}

function validateOperations(operations = []) {
  const issues = [];
  if (!Array.isArray(operations) || operations.length === 0) return ['At least one repair operation is required.'];
  if (operations.length > 10) issues.push('A repair may contain at most 10 operations.');
  operations.forEach((operation, index) => {
    if (!operation || !ALLOWED_OPERATIONS.has(operation.type)) {
      issues.push(`Operation ${index + 1} has an unsupported type.`);
      return;
    }
    if (operation.type === 'update_node_data') {
      if (!operation.nodeId) issues.push(`Operation ${index + 1} requires nodeId.`);
      const keys = Object.keys(operation.changes || {});
      if (!keys.length) issues.push(`Operation ${index + 1} requires changes.`);
      for (const key of keys) {
        if (!ALLOWED_NODE_DATA_KEYS.has(key)) issues.push(`Operation ${index + 1} cannot change "${key}".`);
      }
      for (const [key, value] of Object.entries(operation.changes || {})) {
        if (key === 'timeout' && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 120000)) {
          issues.push(`Operation ${index + 1} timeout must be between 0 and 120000ms.`);
        } else if (key !== 'timeout' && (typeof value !== 'string' || value.length > 2000)) {
          issues.push(`Operation ${index + 1} value for "${key}" must be a string of at most 2000 characters.`);
        }
      }
    }
    if (operation.type === 'add_assertion' && (!operation.assertion?.source || !operation.assertion?.operator)) {
      issues.push(`Operation ${index + 1} requires a complete assertion.`);
    }
    if (operation.type === 'remove_assertion' && !operation.assertionId) {
      issues.push(`Operation ${index + 1} requires assertionId.`);
    }
  });
  return issues;
}

function createRepairProposal(fields, options = {}) {
  const issues = validateOperations(fields.operations);
  if (issues.length) throw new RepairProposalError(issues);
  const now = options.now || new Date().toISOString();
  const hash = crypto.createHash('sha256').update(stableStringify({
    caseId: fields.caseId,
    workflowId: fields.workflowId,
    operations: fields.operations,
  })).digest('hex');
  return {
    schemaVersion: 1,
    id: fields.id || `repair-${hash.slice(0, 16)}`,
    caseId: fields.caseId,
    workflowId: fields.workflowId,
    baseWorkflowFingerprint: fields.baseWorkflowFingerprint,
    state: 'draft',
    rationale: String(fields.rationale || '').slice(0, 2000),
    operations: redactEvidence(fields.operations),
    proposedBy: fields.proposedBy || { type: 'system' },
    regressionReport: null,
    createdAt: now,
    updatedAt: now,
  };
}

function applyRepairOperations(workflow, proposal, { allowDraft = false } = {}) {
  if (!allowDraft && proposal.state !== 'approved') throw new RepairProposalError(['Repair must be approved before publication.']);
  const issues = validateOperations(proposal.operations);
  if (issues.length) throw new RepairProposalError(issues);
  const next = {
    ...workflow,
    nodes: (workflow.nodes || []).map((node) => ({ ...node, data: { ...(node.data || {}) } })),
    assertions: [...(workflow.assertions || [])],
  };
  for (const operation of proposal.operations) {
    if (operation.type === 'update_node_data') {
      const node = next.nodes.find((candidate) => candidate.id === operation.nodeId);
      if (!node) throw new RepairProposalError([`Node "${operation.nodeId}" no longer exists.`]);
      Object.assign(node.data, operation.changes);
    } else if (operation.type === 'add_assertion') {
      next.assertions.push({ ...operation.assertion });
    } else if (operation.type === 'remove_assertion') {
      next.assertions = next.assertions.filter((assertion) => assertion.id !== operation.assertionId);
    }
  }
  return next;
}

function approveRepair(proposal, regressionReport, approvedBy, options = {}) {
  if (!regressionReport?.passed) throw new RepairProposalError(['Every required regression case must pass before approval.']);
  if (!approvedBy) throw new RepairProposalError(['A human approver is required.']);
  return {
    ...proposal,
    state: 'approved',
    regressionReport,
    approvedBy,
    approvedAt: options.now || new Date().toISOString(),
    updatedAt: options.now || new Date().toISOString(),
  };
}

function rejectRepair(proposal, rejectedBy, reason = '', options = {}) {
  return {
    ...proposal,
    state: 'rejected',
    rejectedBy,
    rejectionReason: String(reason).slice(0, 1000),
    rejectedAt: options.now || new Date().toISOString(),
    updatedAt: options.now || new Date().toISOString(),
  };
}

module.exports = {
  ALLOWED_NODE_DATA_KEYS,
  ALLOWED_OPERATIONS,
  RepairProposalError,
  applyRepairOperations,
  approveRepair,
  createRepairProposal,
  rejectRepair,
  validateOperations,
};
