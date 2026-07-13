const { assertSchema, redact, selectSecrets } = require('../../connector-engine');
const { evaluateAssertions, TrustRuntime } = require('../../trust-engine');
const { validateSkill } = require('./artifact');

class SkillExecutionError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'SkillExecutionError'; this.code = code; this.details = redact(details); this.safeToFallback = details.safeToFallback === true; }
}

function recordedApproval(skill) {
  const approval = [...(skill.approvalHistory || [])].reverse().find((item) => item.action === 'approved' && item.fingerprint === skill.fingerprint && item.approvedBy?.uid);
  return approval ? { approvedBy: approval.approvedBy.uid, version: skill.version, fingerprint: skill.fingerprint } : null;
}

function skillWorkflow(skill) {
  return { id: `skill:${skill.skillId}:${skill.version}`, name: skill.name, nodes: skill.nodes, edges: skill.edges, assertions: skill.assertions, executionPolicy: { allowAgenticRecovery: false, modelCallsDisabled: true, source: 'compiled_skill' } };
}

async function executeSkill(skillInput, { input = {}, secrets = {}, runner, mode = 'live', allowDraftForTest = false, approval = null, trustStore = null, tenantId, runId = null, orchestration = null } = {}) {
  const skill = validateSkill(skillInput); const uid = tenantId || skill.tenantId;
  if (typeof runner !== 'function') throw new SkillExecutionError('RUNNER_REQUIRED', 'Skill execution requires a deterministic runner.', { safeToFallback: true });
  if (skill.state !== 'active' && !allowDraftForTest) throw new SkillExecutionError('NOT_ACTIVE', 'Skill is not active.', { safeToFallback: true });
  try { assertSchema(input, skill.inputSchema, 'Skill input'); } catch (error) { throw new SkillExecutionError('INPUT_MISMATCH', error.message, { safeToFallback: true }); }
  if (skill.writeCapable && mode === 'live') {
    const authorization = approval || recordedApproval(skill);
    if (!authorization || authorization.fingerprint !== skill.fingerprint || authorization.version !== skill.version) throw new SkillExecutionError('APPROVAL_REQUIRED', 'Skill version requires recorded human approval.', { safeToFallback: true });
  }
  let scopedSecrets;
  try { scopedSecrets = selectSecrets(skill.requiredVaultRefs || [], secrets); } catch (error) { throw new SkillExecutionError('MISSING_SECRET', error.message, { safeToFallback: true }); }
  const startedAt = Date.now();
  if (trustStore && runId) await trustStore.writeReceipt(uid, { runId, workflowId: skill.workflowId, kind: 'skill_selection', outcome: 'selected', mode, evidence: { skillId: skill.skillId, version: skill.version, fingerprint: skill.fingerprint } });
  const workflow = skillWorkflow(skill);
  const trust = trustStore && runId ? new TrustRuntime({ store: trustStore, uid, runId, workflow, overrides: { mode } }) : null;
  try {
    const prepared = trust ? await trust.begin(input) : { workflow };
    const result = await runner(prepared.workflow, scopedSecrets, input, { modelCallsDisabled: true, allowAgenticRecovery: false, skillId: skill.skillId, skillVersion: skill.version, mode, trust, orchestration, tenantId: uid, runId });
    const output = result?.output ?? result?.scraped ?? result ?? {};
    try { assertSchema(output, skill.outputSchema, 'Skill output'); } catch (error) { throw new SkillExecutionError('OUTPUT_DRIFT', error.message, { safeToFallback: result?.sideEffectsStarted !== true, drift: true }); }
    const assertions = evaluateAssertions(skill.assertions || [], { input, output, scraped: result?.scraped || {}, run: result?.run || {} });
    if (!assertions.passed) throw new SkillExecutionError('ASSERTION_DRIFT', 'Skill business assertions failed.', { safeToFallback: result?.sideEffectsStarted !== true, drift: true, assertions });
    const trustReport = trust ? await trust.finish({ input, scraped: result?.scraped || {}, run: result?.run || {} }) : null;
    const execution = { success: true, output: redact(output, scopedSecrets), assertions: redact(assertions, scopedSecrets), trustReport, durationMs: Date.now() - startedAt, mode, modelCalls: 0, modelCallsSaved: Number(skill.expectedModelCallsSaved || 0), executionCostMicros: 0, sideEffectsStarted: result?.sideEffectsStarted === true };
    if (trustStore && runId) await trustStore.writeReceipt(uid, { runId, workflowId: skill.workflowId, kind: 'skill_execution', outcome: mode === 'shadow' ? 'simulated' : 'verified', mode, evidence: { skillId: skill.skillId, version: skill.version, durationMs: execution.durationMs, assertions } });
    return execution;
  } catch (error) {
    if (error?.code === 'WORKFLOW_SUSPENDED') throw error;
    const wrapped = error instanceof SkillExecutionError ? error : new SkillExecutionError('SKILL_FAILED', error.message || 'Skill execution failed.', { safeToFallback: error.sideEffectsStarted !== true, sideEffectsStarted: error.sideEffectsStarted === true });
    if (trust) await trust.runFailed(wrapped, { skillId: skill.skillId, version: skill.version });
    if (trustStore && runId) await trustStore.writeReceipt(uid, { runId, workflowId: skill.workflowId, kind: 'skill_execution', outcome: 'failed', mode, evidence: { skillId: skill.skillId, version: skill.version, code: wrapped.code, safeToFallback: wrapped.safeToFallback } });
    throw wrapped;
  }
}

module.exports = { SkillExecutionError, executeSkill, recordedApproval, skillWorkflow };
