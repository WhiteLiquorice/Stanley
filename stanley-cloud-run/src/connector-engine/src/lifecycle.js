const { fingerprint, protectedPolicyChanges } = require('./artifact');

const TRANSITIONS = Object.freeze({
  generated: ['inspected', 'rejected'], inspected: ['tested', 'rejected'], tested: ['approved', 'published', 'rejected'],
  approved: ['published', 'rejected'], published: ['retired'], rejected: [], retired: [],
});

function transition(artifact, nextState, fields = {}, options = {}) {
  const current = artifact.publicationState;
  if (!(TRANSITIONS[current] || []).includes(nextState)) throw new Error(`Connector cannot transition from ${current} to ${nextState}.`);
  const now = options.now || new Date().toISOString();
  return { ...artifact, ...fields, publicationState: nextState, updatedAt: now };
}

function approveArtifact(artifact, approvedBy, options = {}) {
  if (!approvedBy?.uid || approvedBy.type === 'model') throw new Error('A human approver identity is required.');
  if (artifact.publicationState !== 'tested') throw new Error('Only tested connectors may be approved.');
  if (!artifact.testResults?.length || artifact.testResults.some((result) => result.passed !== true)) throw new Error('Every required test must pass before approval.');
  const now = options.now || new Date().toISOString();
  return transition(artifact, 'approved', { approvalHistory: [...(artifact.approvalHistory || []), { action: 'approved', approvedBy, approvedAt: now, fingerprint: artifact.fingerprint }] }, { now });
}

function assertPublishable(artifact) {
  const approvalRequired = artifact.approvalPolicy?.required || artifact.readWrite === 'write' || artifact.visibility === 'shared';
  if (!['tested', 'approved'].includes(artifact.publicationState)) throw new Error('Connector must be tested before publication.');
  if (approvalRequired && artifact.publicationState !== 'approved') throw new Error('Connector requires human approval before publication.');
  if (!artifact.inspectionResult?.ok) throw new Error('Connector security inspection has not passed.');
  if (!artifact.testResults?.length || artifact.testResults.some((result) => !result.passed)) throw new Error('Connector regressions have not passed.');
  if (artifact.visibility === 'shared' && artifact.tenantSpecificDataRemoved !== true) throw new Error('Shared connectors must be explicitly sanitized.');
}

function createNextVersion(current, changes, options = {}) {
  const elevated = options.elevatedApproval?.approvedBy?.uid && options.elevatedApproval?.scope === 'protected_policy';
  const changed = protectedPolicyChanges(current, { ...current, ...changes });
  if (changed.length && !elevated) throw new Error(`Protected connector policy change requires elevated review: ${changed.join(', ')}`);
  const versionNumber = Number(current.version.slice(1)) + 1;
  const now = options.now || new Date().toISOString();
  const candidate = { ...current, ...changes, version: `v${versionNumber}`, publicationState: 'generated', approvalHistory: [], testResults: [], inspectionResult: null, rollbackVersion: current.version, successCount: 0, failureCount: 0, latencyMsTotal: 0, executionCostMicros: 0, createdAt: now, updatedAt: now, publishedAt: null };
  candidate.fingerprint = fingerprint(candidate);
  return candidate;
}

module.exports = { TRANSITIONS, approveArtifact, assertPublishable, createNextVersion, transition };
