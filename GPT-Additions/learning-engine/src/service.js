const { fingerprint } = require('../../connector-engine/src/artifact');
const { createFailureCase } = require('./failureCase');
const { applyRepairOperations, approveRepair, createRepairProposal, rejectRepair } = require('./repairProposal');
const { runRegressionSuite } = require('./regressionHarness');
const { createRollout, evaluateRollout, includesRun } = require('./rollout');

class LearningService {
  constructor({ store, loadWorkflow, saveWorkflow, executeCase, proposeOperations = null, clock = () => new Date().toISOString(), proposalThreshold = 3 }) { if (!store || !loadWorkflow || !saveWorkflow || !executeCase) throw new Error('LearningService requires store, workflow access, and regression execution.'); Object.assign(this, { store, loadWorkflow, saveWorkflow, executeCase, proposeOperations, clock, proposalThreshold }); }
  workflowFingerprint(workflow) { return fingerprint({ id: workflow.id, nodes: workflow.nodes || [], edges: workflow.edges || [], assertions: workflow.assertions || [] }); }
  async observeFailure(uid, fields) {
    const learningCase = await this.store.upsertFailureCase(uid, createFailureCase(fields, { now: this.clock() }));
    let proposal = await this.store.proposalForCase(uid, learningCase.id);
    if (!proposal && learningCase.occurrenceCount >= this.proposalThreshold && this.proposeOperations) proposal = await this.propose(uid, learningCase.id);
    return { learningCase, proposal };
  }
  async propose(uid, caseId) {
    const learningCase = await this.store.get(uid, 'learning_cases', caseId); if (!learningCase) throw new Error('Learning case not found.');
    const existing = await this.store.proposalForCase(uid, caseId); if (existing) return existing;
    if (!this.proposeOperations) throw new Error('No constrained repair proposer is configured.');
    const workflow = await this.loadWorkflow(uid, learningCase.workflowId);
    const response = await this.proposeOperations({ learningCase, workflow: { id: workflow.id, nodes: workflow.nodes, assertions: workflow.assertions || [] }, allowedOperations: ['update_node_data', 'add_assertion', 'remove_assertion'], allowedNodeDataKeys: ['selector', 'description', 'intentFallback', 'expect', 'timeout'] });
    const proposal = createRepairProposal({ caseId, workflowId: workflow.id, baseWorkflowFingerprint: this.workflowFingerprint(workflow), operations: response.operations, rationale: response.rationale, proposedBy: { type: 'model', model: response.model || 'configured', callId: response.callId || null } }, { now: this.clock() });
    learningCase.state = 'proposal_ready'; learningCase.proposalId = proposal.id; learningCase.updatedAt = this.clock(); await this.store.saveCase(uid, learningCase); return this.store.saveProposal(uid, proposal);
  }
  async test(uid, proposalId, cases) {
    const proposal = await this.requireProposal(uid, proposalId); if (!['draft', 'tested'].includes(proposal.state)) throw new Error('Only a draft proposal may be tested.');
    const workflow = await this.loadWorkflow(uid, proposal.workflowId); if (this.workflowFingerprint(workflow) !== proposal.baseWorkflowFingerprint) throw new Error('Workflow changed since proposal creation.');
    const report = await runRegressionSuite({ workflow, proposal, cases, executeCase: this.executeCase, now: this.clock() });
    return this.store.saveProposal(uid, { ...proposal, state: 'tested', regressionReport: report, updatedAt: this.clock() });
  }
  async approve(uid, proposalId, approvedBy) { const proposal = await this.requireProposal(uid, proposalId); if (proposal.state !== 'tested') throw new Error('Proposal must be tested before approval.'); if (!approvedBy?.uid || approvedBy.type === 'model') throw new Error('A human identity is required.'); return this.store.saveProposal(uid, approveRepair(proposal, proposal.regressionReport, approvedBy, { now: this.clock() })); }
  async reject(uid, proposalId, rejectedBy, reason) { const proposal = await this.requireProposal(uid, proposalId); return this.store.saveProposal(uid, rejectRepair(proposal, rejectedBy, reason, { now: this.clock() })); }
  async startRollout(uid, proposalId, options = {}) { const proposal = await this.requireProposal(uid, proposalId); if (proposal.state !== 'approved') throw new Error('Only an approved proposal may roll out.'); const active = await this.store.activeRollout(uid, proposal.workflowId); if (active) throw new Error('Workflow already has an active learning rollout.'); const rollout = createRollout({ tenantId: uid, workflowId: proposal.workflowId, proposalId, ...options }, { now: this.clock() }); await this.store.saveProposal(uid, { ...proposal, state: 'rolling_out', rolloutId: rollout.id, updatedAt: this.clock() }); return this.store.saveRollout(uid, rollout); }
  async advanceToCanary(uid, rolloutId, percentage = 10) { const rollout = await this.store.get(uid, 'learning_rollouts', rolloutId); if (!rollout || rollout.tenantId !== uid) throw new Error('Rollout not found.'); if (rollout.state !== 'paused' || rollout.recommendation !== 'ready_for_canary') throw new Error('Only a healthy completed shadow may advance to canary.'); return this.store.saveRollout(uid, { ...rollout, mode: 'canary', state: 'canary', percentage: Math.max(1, Math.min(50, Number(percentage || 10))), successCount: 0, failureCount: 0, failureRate: 0, recommendation: null, startedAt: this.clock(), completedAt: null, updatedAt: this.clock() }); }
  async candidateForRun(uid, workflow, runId) { const rollout = await this.store.activeRollout(uid, workflow.id); if (!rollout || !includesRun(rollout, runId)) return { workflow, rollout: null, candidate: false }; const proposal = await this.requireProposal(uid, rollout.proposalId); if (this.workflowFingerprint(workflow) !== proposal.baseWorkflowFingerprint) { rollout.state = 'rolled_back'; rollout.rollbackReason = 'Base workflow changed.'; rollout.completedAt = this.clock(); await this.store.saveRollout(uid, rollout); return { workflow, rollout, candidate: false }; } const candidate = applyRepairOperations(workflow, proposal, { allowDraft: true }); return rollout.state === 'shadow' ? { workflow, shadowWorkflow: candidate, rollout, candidate: false } : { workflow: candidate, rollout, candidate: true }; }
  async recordOutcome(uid, rolloutId, outcome) { const rollout = await this.store.get(uid, 'learning_rollouts', rolloutId); if (!rollout) throw new Error('Rollout not found.'); const next = evaluateRollout(rollout, outcome, { now: this.clock() }); await this.store.saveRollout(uid, next); if (next.state === 'promoted' && rollout.state !== 'promoted') { const proposal = await this.requireProposal(uid, next.proposalId); const workflow = await this.loadWorkflow(uid, next.workflowId); if (this.workflowFingerprint(workflow) !== proposal.baseWorkflowFingerprint) { next.state = 'rolled_back'; next.rollbackReason = 'Base workflow changed before promotion.'; await this.store.saveRollout(uid, next); return next; } const promoted = applyRepairOperations(workflow, proposal, { allowDraft: true }); promoted.learningRevision = { proposalId: proposal.id, promotedAt: this.clock(), previousFingerprint: proposal.baseWorkflowFingerprint }; await this.saveWorkflow(uid, promoted); await this.store.saveProposal(uid, { ...proposal, state: 'published', publishedAt: this.clock(), updatedAt: this.clock() }); } if (next.state === 'rolled_back') { const proposal = await this.requireProposal(uid, next.proposalId); await this.store.saveProposal(uid, { ...proposal, state: 'rolled_back', rollbackReason: next.rollbackReason, updatedAt: this.clock() }); } return next; }
  async requireProposal(uid, id) { const proposal = await this.store.get(uid, 'repair_proposals', id); if (!proposal) throw new Error('Repair proposal not found.'); return proposal; }
}

module.exports = { LearningService };
