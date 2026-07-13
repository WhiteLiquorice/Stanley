const { createFailureCase } = require('../../learning-engine');
const { fingerprint } = require('../../connector-engine');
const { createSkillArtifact, validateSkill } = require('./artifact');
const { executeSkill } = require('./executor');
const { selectSkill } = require('./selector');

class SkillService {
  constructor({ store, runner, trustStore = null, learningStore = null, clock = () => new Date().toISOString() }) { if (!store || typeof runner !== 'function') throw new Error('SkillService requires store and deterministic runner.'); this.store = store; this.runner = runner; this.trustStore = trustStore; this.learningStore = learningStore; this.clock = clock; }
  async compile(fields) { return this.store.create(createSkillArtifact(fields, { now: this.clock() })); }
  async test(tenantId, skillId, version, secrets = {}) {
    const skill = await this.requireVersion(tenantId, skillId, version); if (skill.state !== 'draft') throw new Error('Only draft skills may be regression tested.'); if (!skill.regressionCases?.length) throw new Error('At least one skill regression case is required.');
    const results = [];
    for (const testCase of skill.regressionCases) {
      try { const execution = await executeSkill(skill, { input: testCase.input || {}, secrets, runner: this.runner, mode: skill.writeCapable ? 'shadow' : 'live', allowDraftForTest: true }); const matched = testCase.expectedOutput === undefined || JSON.stringify(execution.output) === JSON.stringify(testCase.expectedOutput); results.push({ id: testCase.id, passed: matched, error: matched ? null : 'Output mismatch.', durationMs: execution.durationMs }); }
      catch (error) { results.push({ id: testCase.id, passed: false, error: error.message, code: error.code }); }
    }
    const report = { passed: results.every((item) => item.passed), total: results.length, passedCount: results.filter((item) => item.passed).length, results, completedAt: this.clock() };
    return this.store.saveDraft({ ...skill, state: 'tested', testResults: [report], updatedAt: this.clock() });
  }
  async approve(tenantId, skillId, version, approvedBy) { const skill = await this.requireVersion(tenantId, skillId, version); if (skill.state !== 'tested' || skill.testResults.some((item) => !item.passed)) throw new Error('Skill regressions must pass before approval.'); if (!approvedBy?.uid || approvedBy.type === 'model') throw new Error('Skill approval requires a human identity.'); const now = this.clock(); return this.store.saveDraft({ ...skill, state: 'approved', approvalHistory: [...skill.approvalHistory, { action: 'approved', approvedBy, approvedAt: now, fingerprint: skill.fingerprint }], updatedAt: now }); }
  async activate(tenantId, skillId, version) { const skill = await this.requireVersion(tenantId, skillId, version); if (skill.state !== 'approved') throw new Error('Only approved skill versions may activate.'); return this.store.activate({ ...skill, activatedAt: this.clock() }); }
  async select(context) { const skills = this.store.listActive ? await this.store.listActive(context.tenantId, { workflowId: context.workflowId }) : await this.store.list(context.tenantId, { workflowId: context.workflowId, state: 'active' }); return selectSkill(skills, context); }
  async selectAndExecute(context) {
    const selection = await this.select(context); if (!selection.selected) return { executed: false, safeToFallback: true, selection: selection.explanation };
    const skill = selection.selected; const occurredAt = this.clock();
    try {
      const execution = await executeSkill(skill, { input: context.input || {}, secrets: context.secrets || {}, runner: this.runner, mode: context.mode, trustStore: this.trustStore, tenantId: context.tenantId, runId: context.runId, orchestration: context.orchestration || null });
      await this.store.recordExecution(skill.tenantId, skill.skillId, skill.version, { success: true, durationMs: execution.durationMs, executionCostMicros: 0, modelCallsSaved: execution.modelCallsSaved, occurredAt });
      return { executed: true, skillId: skill.skillId, version: skill.version, selection: selection.explanation, ...execution };
    } catch (error) {
      if (error?.code === 'WORKFLOW_SUSPENDED') throw error;
      const health = await this.store.recordExecution(skill.tenantId, skill.skillId, skill.version, { success: false, drift: Boolean(error.details?.drift), durationMs: Number(error.details?.durationMs || 0), occurredAt });
      if (this.learningStore) await this.learningStore.upsertFailureCase(skill.tenantId, createFailureCase({ workflowId: skill.workflowId, runId: context.runId, nodeType: 'compiled_skill', error, nodeData: { skillId: skill.skillId, version: skill.version }, url: skill.targetDomains[0] ? `https://${skill.targetDomains[0]}` : '' }, { now: occurredAt }));
      const total = Number(health.successCount || 0) + Number(health.failureCount || 0); const failureRate = total ? Number(health.failureCount || 0) / total : 0;
      if (skill.rollbackVersion && skill.healthPolicy?.autoRollback !== false && (Number(health.driftCount || 0) >= Number(skill.healthPolicy.maxDriftCount || 3) || (total >= Number(skill.healthPolicy.minRuns || 5) && failureRate > Number(skill.healthPolicy.maxFailureRate || 0.25)))) await this.store.setActiveVersion(skill.tenantId, skill.skillId, skill.rollbackVersion);
      error.selection = selection.explanation; throw error;
    }
  }
  async nextVersion(tenantId, skillId, version, changes, options = {}) { const current = await this.requireVersion(tenantId, skillId, version); const protectedFields = ['tenantId', 'workflowId', 'writeCapable', 'approvalPolicy', 'requiredVaultRefs', 'targetDomains']; const changed = protectedFields.filter((key) => JSON.stringify(current[key]) !== JSON.stringify((changes[key] === undefined ? current : changes)[key])); if (changed.length && options.elevatedApproval?.scope !== 'protected_policy') throw new Error(`Protected skill policy change requires elevated review: ${changed.join(', ')}`); const next = { ...current, ...changes, version: `v${Number(current.version.slice(1)) + 1}`, state: 'draft', testResults: [], approvalHistory: [], rollbackVersion: current.version, successCount: 0, failureCount: 0, driftCount: 0, createdAt: this.clock(), updatedAt: this.clock(), activatedAt: null }; next.fingerprint = fingerprint(next); return this.store.create(validateSkill(next)); }
  async requireVersion(tenantId, skillId, version) { const skill = await this.store.get(tenantId, skillId, version); if (!skill || skill.tenantId !== tenantId) throw new Error('Skill version not found.'); return skill; }
}

module.exports = { SkillService };
