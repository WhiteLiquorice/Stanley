const crypto = require('crypto');

const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled']);
const EXECUTABLE_STATES = new Set(['queued', 'approved', 'retrying']);

function makeRunId(uid, workflowId, idempotencyKey) {
  if (!idempotencyKey) return crypto.randomBytes(10).toString('hex');
  return crypto.createHash('sha256').update(`${uid}:${workflowId}:${idempotencyKey}`).digest('hex').slice(0, 20);
}

function requiresPreflightApproval(workflow) {
  return (workflow.nodes || []).some((node) => node.type === 'approval');
}

function prepareApprovedWorkflow(workflow, approved) {
  if (!approved) return workflow;
  return {
    ...workflow,
    nodes: (workflow.nodes || []).map((node) => node.type === 'approval'
      ? { ...node, type: 'wait', label: `${node.label || 'Approval'} (approved)`, data: { ms: '0' } }
      : node),
  };
}

function publicRun(run) {
  if (!run) return null;
  const { input: _input, ...safe } = run;
  return safe;
}

function legacyStatusForState(state) {
  if (state === 'completed') return 'Success';
  if (state === 'failed' || state === 'cancelled') return 'Failed';
  if (state === 'pending_approval') return 'Pending Approval';
  return 'Running';
}

class RunStore {
  constructor(db) {
    this.db = db;
  }

  ref(uid, runId) {
    return this.db.collection('stanley_users').doc(uid).collection('runs').doc(runId);
  }

  async get(uid, runId) {
    const snapshot = await this.ref(uid, runId).get();
    return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
  }

  async create(uid, run) {
    const ref = this.ref(uid, run.id);
    const existing = await ref.get();
    if (existing.exists) return { id: existing.id, ...existing.data(), duplicate: true };
    const compatible = run.state ? { ...run, status: legacyStatusForState(run.state) } : run;
    await ref.create(compatible);
    return compatible;
  }

  async patch(uid, runId, patch) {
    const compatible = patch.state ? { ...patch, status: legacyStatusForState(patch.state) } : patch;
    await this.ref(uid, runId).update({ ...compatible, updatedAt: new Date().toISOString() });
    return this.get(uid, runId);
  }
}

module.exports = {
  EXECUTABLE_STATES,
  TERMINAL_STATES,
  RunStore,
  makeRunId,
  legacyStatusForState,
  prepareApprovedWorkflow,
  publicRun,
  requiresPreflightApproval,
};
