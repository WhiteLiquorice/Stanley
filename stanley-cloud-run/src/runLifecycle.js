const crypto = require('crypto');
const { ERROR_CODES, ReliabilityError } = require('./reliability');

const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled']);
const EXECUTABLE_STATES = new Set(['queued', 'approved', 'retrying']);
const DEFAULT_LEASE_MS = 90_000;

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

function claimRunRecord(run, {
  leaseId,
  owner = 'runner',
  nowMs = Date.now(),
  leaseMs = DEFAULT_LEASE_MS,
} = {}) {
  if (!run || !leaseId) return null;
  const leaseExpiresAtMs = Number(run.lease?.expiresAtMs || 0);
  const leaseIsActive = Boolean(run.lease?.id) && leaseExpiresAtMs > nowMs;
  const abandonedRun = run.state === 'running' && !leaseIsActive;
  if (!EXECUTABLE_STATES.has(run.state) && !abandonedRun) return null;
  if (leaseIsActive && run.lease.id !== leaseId) return null;

  const now = new Date(nowMs).toISOString();
  return {
    ...run,
    state: 'running',
    status: legacyStatusForState('running'),
    attempts: Number(run.attempts || 0) + 1,
    startedAt: run.startedAt || now,
    updatedAt: now,
    lease: {
      id: leaseId,
      owner,
      claimedAt: now,
      heartbeatAt: now,
      expiresAtMs: nowMs + leaseMs,
    },
    logs: [...(run.logs || []), abandonedRun
      ? '[System] Recovered an abandoned execution lease.'
      : '[System] Execution started.'],
  };
}

class RunStore {
  constructor(db) {
    this.db = db;
  }

  ref(uid, runId) {
    return this.db.collection('stanley_users').doc(uid).collection('runs').doc(runId);
  }

  legacyStatusForState(state) {
    return legacyStatusForState(state);
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

  async claim(uid, runId, {
    leaseId = crypto.randomUUID(),
    owner = process.env.K_REVISION || process.env.HOSTNAME || 'runner',
    nowMs = Date.now(),
    leaseMs = DEFAULT_LEASE_MS,
  } = {}) {
    const ref = this.ref(uid, runId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw Object.assign(new Error('Run not found.'), { status: 404 });
      const claimed = claimRunRecord({ id: snapshot.id, ...snapshot.data() }, { leaseId, owner, nowMs, leaseMs });
      if (!claimed) return null;
      const { id: _id, ...stored } = claimed;
      transaction.update(ref, stored);
      return claimed;
    });
  }

  async heartbeat(uid, runId, leaseId, { nowMs = Date.now(), leaseMs = DEFAULT_LEASE_MS } = {}) {
    const ref = this.ref(uid, runId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const run = snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
      if (!run || run.lease?.id !== leaseId || !['running', 'cancel_requested'].includes(run.state)) {
        throw new ReliabilityError(ERROR_CODES.RUN_LEASE_LOST, 'Run execution lease is no longer owned by this worker.', { retryable: true });
      }
      const now = new Date(nowMs).toISOString();
      const lease = { ...run.lease, heartbeatAt: now, expiresAtMs: nowMs + leaseMs };
      transaction.update(ref, { lease, updatedAt: now });
      return { ...run, lease, updatedAt: now };
    });
  }

  async patchClaimed(uid, runId, leaseId, patch, { releaseLease = false } = {}) {
    const ref = this.ref(uid, runId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const run = snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
      if (!run || run.lease?.id !== leaseId) {
        throw new ReliabilityError(ERROR_CODES.RUN_LEASE_LOST, 'Run execution lease is no longer owned by this worker.', { retryable: true });
      }
      const compatible = patch.state ? { ...patch, status: legacyStatusForState(patch.state) } : patch;
      const update = { ...compatible, updatedAt: new Date().toISOString() };
      if (releaseLease) update.lease = null;
      transaction.update(ref, update);
      return { ...run, ...update };
    });
  }
}

module.exports = {
  EXECUTABLE_STATES,
  TERMINAL_STATES,
  DEFAULT_LEASE_MS,
  RunStore,
  claimRunRecord,
  makeRunId,
  legacyStatusForState,
  prepareApprovedWorkflow,
  publicRun,
  requiresPreflightApproval,
};
