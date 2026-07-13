const fs = require('fs');

const target = process.argv[2] || 'src/server.js';
const raw = fs.readFileSync(target, 'utf8'); const crlf = raw.includes('\r\n'); let source = raw.replace(/\r\n/g, '\n');
const importAnchor = "const { createDispatcher } = require('./dispatcher');";
const importReplacement = `${importAnchor}
const { installConnectorOverlay } = require('../GPT-Additions/runner-integration/src/connectorServerOverlay');
const { installSkillOverlay } = require('../GPT-Additions/runner-integration/src/skillExecution');
const { installOrchestrationOverlay } = require('../GPT-Additions/runner-integration/src/orchestrationExecution');
const { installLearningOverlay } = require('../GPT-Additions/runner-integration/src/learningExecution');
const { installMemoryOverlay } = require('../GPT-Additions/runner-integration/src/memoryExecution');
const { installMonitoringOverlay } = require('../GPT-Additions/runner-integration/src/monitoringExecution');
const { executeTrustedWorkflow } = require('../GPT-Additions/runner-integration/src/trustedExecution');
const { createTrustRouter } = require('../GPT-Additions/trust-engine');
const { callConnectorModel } = require('../GPT-Additions/staging-cloud-run/vertexConnectorModel');
const { proposeRepairOperations } = require('../GPT-Additions/staging-cloud-run/vertexLearningModel');`;
const executeAnchor = 'async function executeRun(uid, runId) {';
const overlayBlock = `const connectorOverlay = installConnectorOverlay({
  app, db, authenticateUser, resolveAllSecrets: resolveSecrets,
  callModel: callConnectorModel,
  logger: (event) => console.log(JSON.stringify({ component: 'connector-engine', ...event })),
});

const skillOverlay = installSkillOverlay({
  app, db, authenticateUser, runWorkflow: runWorkflowWithContext,
  trustStore: connectorOverlay.trustStore, resolveAllSecrets: resolveSecrets,
});

const orchestrationOverlay = installOrchestrationOverlay({
  app, db, authenticateUser, authenticateInternal,
  dispatch: async (uid, runId) => { await runs.patch(uid, runId, { state: 'queued', wait: null, logs: ['[System] Durable wait satisfied; run queued to resume.'] }); return dispatcher.dispatch(uid, runId); },
});

const learningOverlay = installLearningOverlay({ app, express, db, authenticateUser, proposeOperations: proposeRepairOperations });
const memoryOverlay = installMemoryOverlay({ app, express, db, authenticateUser });
const monitoringOverlay = installMonitoringOverlay({ app, express, db, authenticateUser, authenticateInternal, connectorService: connectorOverlay.service, resolveAllSecrets: resolveSecrets, trustStore: connectorOverlay.trustStore });

${executeAnchor}`;
const runnerAnchor = '{ db, uid, runId, policy }';
const runnerReplacement = '{ db, uid, runId, policy, connectorRuntime: connectorOverlay.connectorRuntime }';
const executionAnchor = '    const result = await runWorkflowWithContext(executableWorkflow, secrets, run.input || {}, { db, uid, runId, policy, connectorRuntime: connectorOverlay.connectorRuntime });';
const trustedExecution = `    let skillAttempt;
    try {
      skillAttempt = await skillOverlay.executeBeforeWorkflow({ uid, runId, workflow: executableWorkflow, input: run.input || {}, secrets, mode: executableWorkflow.trustPolicy?.mode || 'live', orchestration });
    } catch (skillError) {
      if (!skillError.safeToFallback) throw skillError;
      skillAttempt = { executed: false, safeToFallback: true, error: skillError.message };
    }
    let result;
    if (skillAttempt.executed) {
      result = {
        logs: [\`[Skill] Executed \${skillAttempt.skillId}@\${skillAttempt.version} with no model calls.\`],
        scraped: skillAttempt.output || {}, trustReport: skillAttempt.trustReport,
        trustState: 'verified', trustMode: executableWorkflow.trustPolicy?.mode || 'live',
        skillExecution: { skillId: skillAttempt.skillId, version: skillAttempt.version, selection: skillAttempt.selection, modelCallsSaved: skillAttempt.modelCallsSaved },
      };
    } else {
      result = await executeTrustedWorkflow({
        store: connectorOverlay.trustStore, uid, runId, workflow: executableWorkflow,
        secrets, input: run.input || {}, runRecord: run, runner: runWorkflowWithContext,
        runnerOptions: { db, uid, runId, policy, connectorRuntime: connectorOverlay.connectorRuntime, orchestration },
        trustMode: executableWorkflow.trustPolicy?.mode || 'live',
        resumeCheckpoint: run.resumeCheckpoint || null,
      });
    }`;
const resultAnchor = '      scraped: result.scraped || {},';
const resultReplacement = `      scraped: result.scraped || {},
      trustState: result.trustState,
      trustMode: result.trustMode,
      trustReport: result.trustReport,`;
const skillResultAnchor = '      trustReport: result.trustReport,';
const skillResultReplacement = `      trustReport: result.trustReport,
      skillExecution: result.skillExecution || null,`;
const dispatcherAnchor = 'const dispatcher = createDispatcher({ projectId, inlineExecutor: executeRun });';
const tryAnchor = `  try {
    const secrets = await resolveSecrets(db, uid);`;
const tryReplacement = `  let orchestration = null;
  let learningRollout = null;
  let memoryIds = [];
  try {
    const secrets = await resolveSecrets(db, uid);
    monitoringOverlay.assertAllowed(executableWorkflow);
    const learningSelection = await learningOverlay.candidateForRun(uid, executableWorkflow, runId);
    executableWorkflow = learningSelection.workflow; learningRollout = learningSelection.rollout;
    const memorySelection = await memoryOverlay.prepareWorkflow(uid, executableWorkflow);
    executableWorkflow = memorySelection.workflow; memoryIds = memorySelection.memoryIds;
    orchestration = await orchestrationOverlay.runtimeFor({ uid, runId, workflow: executableWorkflow });`;
const completionAnchor = `    const cancelRequested = latest?.state === 'cancel_requested';`;
const completionReplacement = `${completionAnchor}
    if (cancelRequested) await orchestrationOverlay.coordinator.cancelRun(uid, runId);
    else await orchestrationOverlay.coordinator.completeRun(uid, runId);
    if (learningRollout) await learningOverlay.recordOutcome(uid, learningRollout.id, { success: !cancelRequested, runId });
    if (memoryIds.length) await memoryOverlay.recordOutcome(uid, memoryIds, !cancelRequested);
    await monitoringOverlay.record(uid, { workflowId: executableWorkflow.id, runId, success: !cancelRequested, verified: result.trustState !== 'needs_attention', durationMs: Date.now() - startedAtMs, costMicros: Number(result.executionCostMicros || 0), modelCalls: Number(result.modelCalls || 0), component: result.skillExecution ? { type: 'skill', ...result.skillExecution } : null });`;
const catchAnchor = `  } catch (error) {
    const attempts = Number(run.attempts || 1);
    const canRetry = policy.retrySafe && attempts < policy.maxRunAttempts;`;
const catchReplacement = `  } catch (error) {
    if (error?.code === 'WORKFLOW_SUSPENDED') {
      const wait = { ...(error.wait || {}) }; delete wait.tokenHash;
      run = await runs.patch(uid, runId, { state: 'waiting', success: false, wait, logs: error.logs || [\`[System] Waiting for \${wait.type || 'external event'}.\`] });
      return publicRun(run);
    }
    if (orchestration) await orchestrationOverlay.coordinator.failRun(uid, runId, error).catch((orchestrationError) => console.error('[Orchestration] Failure finalization error:', orchestrationError));
    if (learningRollout) await learningOverlay.recordOutcome(uid, learningRollout.id, { success: false, runId, code: error.code }).catch((learningError) => console.error('[Learning] Rollout outcome error:', learningError));
    if (memoryIds.length) await memoryOverlay.recordOutcome(uid, memoryIds, false).catch((memoryError) => console.error('[Memory] Outcome error:', memoryError));
    await monitoringOverlay.record(uid, { workflowId: executableWorkflow.id, runId, success: false, verified: false, durationMs: Date.now() - startedAtMs, costMicros: Number(error.costMicros || 0), modelCalls: Number(error.modelCalls || 0), component: error.component || null }).catch((monitoringError) => console.error('[Monitoring] Outcome error:', monitoringError));
    await learningOverlay.observeFailure(uid, { workflowId: executableWorkflow.id, runId, nodeId: error.nodeId || null, nodeType: error.nodeType || null, error, url: error.url || '', nodeData: error.nodeData || null }).catch((learningError) => console.error('[Learning] Failure capture error:', learningError));
    const attempts = Number(run.attempts || 1);
    const canRetry = !orchestration && policy.retrySafe && attempts < policy.maxRunAttempts;`;
const trustRoutes = `${dispatcherAnchor}

app.use(createTrustRouter({
  express, authenticateUser, store: connectorOverlay.trustStore,
  onRetry: async ({ uid, exceptionId }) => {
    const exception = await connectorOverlay.trustStore.getException(uid, exceptionId);
    if (!exception) throw httpError(404, 'Exception not found.');
    const checkpoint = await connectorOverlay.trustStore.latestCheckpoint(uid, exception.runId);
    if (!checkpoint?.resumable) throw httpError(409, 'No safe resumable checkpoint is available.');
    let retry = await createRun(uid, exception.workflowId, { trigger: 'Safe retry', idempotencyKey: \`trust-retry:\${exceptionId}:\${checkpoint.id}\` });
    retry = await runs.patch(uid, retry.id, { resumeCheckpoint: checkpoint, retryOfRunId: exception.runId, retryOfExceptionId: exceptionId });
    if (retry.state !== 'pending_approval') await dispatcher.dispatch(uid, retry.id);
    return { runId: retry.id, state: retry.state };
  },
  handleError: errorResponse,
}));`;
if (!source.includes('installConnectorOverlay')) {
  if (!source.includes(importAnchor) || !source.includes(executeAnchor) || !source.includes(runnerAnchor)) throw new Error('Server integration anchors changed; refusing a fuzzy patch.');
  source = source.replace(importAnchor, importReplacement).replace(executeAnchor, overlayBlock).replace(runnerAnchor, runnerReplacement).replace('  const executableWorkflow = prepareApprovedWorkflow(workflow, Boolean(run.approvedAt));', '  let executableWorkflow = prepareApprovedWorkflow(workflow, Boolean(run.approvedAt));');
  if (!source.includes(executionAnchor) || !source.includes(resultAnchor) || !source.includes(dispatcherAnchor) || !source.includes(tryAnchor) || !source.includes(completionAnchor) || !source.includes(catchAnchor)) throw new Error('Trusted execution anchors changed; refusing a fuzzy patch.');
  source = source.replace(executionAnchor, trustedExecution).replace(resultAnchor, resultReplacement).replace(skillResultAnchor, skillResultReplacement).replace(tryAnchor, tryReplacement).replace(completionAnchor, completionReplacement).replace(catchAnchor, catchReplacement).replace(dispatcherAnchor, trustRoutes);
}
fs.writeFileSync(target, crlf ? source.replace(/\n/g, '\r\n') : source);
console.log(`Applied staging connector server overlay to ${target}.`);
