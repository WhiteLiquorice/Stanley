const crypto = require('crypto');

const ROLLOUT_STATES = new Set(['shadow', 'canary', 'promoted', 'rolled_back', 'paused']);

function createRollout(fields, options = {}) {
  if (!fields.tenantId || !fields.workflowId || !fields.proposalId) throw new Error('Rollout requires tenant, workflow, and proposal.');
  if (!['shadow', 'canary'].includes(fields.mode)) throw new Error('Rollout must start in shadow or canary mode.');
  const now = options.now || new Date().toISOString();
  return {
    schemaVersion: 1, id: fields.id || `rollout-${fields.proposalId}`, tenantId: fields.tenantId,
    workflowId: fields.workflowId, proposalId: fields.proposalId, mode: fields.mode, state: fields.mode,
    percentage: fields.mode === 'shadow' ? 100 : Math.max(1, Math.min(50, Number(fields.percentage || 10))),
    minRuns: Math.max(3, Number(fields.minRuns || 10)), maxFailureRate: Math.max(0, Math.min(1, Number(fields.maxFailureRate ?? 0.1))),
    successCount: 0, failureCount: 0, baselineFailureRate: Number(fields.baselineFailureRate || 0),
    startedAt: now, updatedAt: now, completedAt: null, rollbackReason: null,
  };
}

function rolloutBucket(runId, proposalId) { const value = crypto.createHash('sha256').update(`${runId}:${proposalId}`).digest().readUInt32BE(0); return value % 100; }
function includesRun(rollout, runId) { return ['shadow', 'canary'].includes(rollout?.state) && rolloutBucket(runId, rollout.proposalId) < Number(rollout.percentage || 0); }
function evaluateRollout(rollout, outcome, options = {}) {
  if (!ROLLOUT_STATES.has(rollout.state) || !['shadow', 'canary'].includes(rollout.state)) return rollout;
  const successCount = Number(rollout.successCount || 0) + (outcome.success ? 1 : 0); const failureCount = Number(rollout.failureCount || 0) + (outcome.success ? 0 : 1); const total = successCount + failureCount; const failureRate = total ? failureCount / total : 0; const now = options.now || new Date().toISOString();
  const next = { ...rollout, successCount, failureCount, failureRate, updatedAt: now, lastOutcome: { success: Boolean(outcome.success), runId: outcome.runId, code: outcome.code || null, at: now } };
  if (total >= Math.min(3, rollout.minRuns) && failureRate > rollout.maxFailureRate) return { ...next, state: 'rolled_back', completedAt: now, rollbackReason: `Failure rate ${failureRate.toFixed(3)} exceeded ${rollout.maxFailureRate}.` };
  if (total >= rollout.minRuns && failureRate <= rollout.maxFailureRate) return rollout.state === 'shadow' ? { ...next, state: 'paused', completedAt: now, recommendation: 'ready_for_canary' } : { ...next, state: 'promoted', completedAt: now };
  return next;
}

module.exports = { ROLLOUT_STATES, createRollout, evaluateRollout, includesRun, rolloutBucket };
