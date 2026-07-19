const express = require('express');
const admin = require('firebase-admin');
const { runWorkflowWithContext, resolveSecrets } = require('./runnerAdapter');
const { validateWorkflow, WorkflowContractError } = require('./workflowContract');
const {
  EXECUTABLE_STATES,
  RunStore,
  makeRunId,
  prepareApprovedWorkflow,
  publicRun,
  requiresPreflightApproval,
} = require('./runLifecycle');
const { createDispatcher } = require('./dispatcher');
const { RunEntitlementService } = require('./runEntitlements');
const { GoogleOAuthService, installGoogleOAuthRoutes } = require('./googleOAuth');
const { installConnectorOverlay } = require('./runner-integration/src/connectorServerOverlay');
const { installSkillOverlay } = require('./runner-integration/src/skillExecution');
const { installOrchestrationOverlay } = require('./runner-integration/src/orchestrationExecution');
const { installLearningOverlay } = require('./runner-integration/src/learningExecution');
const { installMemoryOverlay } = require('./runner-integration/src/memoryExecution');
const { installMonitoringOverlay } = require('./runner-integration/src/monitoringExecution');
const { executeTrustedWorkflow } = require('./runner-integration/src/trustedExecution');
const { createTrustRouter } = require('./trust-engine');
const { FirestoreTemplateStore, TemplateService, createTemplateRouter } = require('./template-engine');
const { callConnectorModel } = require('./vertexConnectorModel');
const { proposeRepairOperations } = require('./vertexLearningModel');
const { createBrowserRuntimeRouter, getBrowserRuntimeServices } = require('./browser-runtime');
const { ArtifactService, createArtifactRouter } = require('./artifact-engine');
const { WorkflowPlatformStore, WorkflowPlatformService, createWorkflowPlatformRouter, validateWorkflowInput, validateWorkflowOutput } = require('./workflow-platform');
const { McpService, installMcpRoutes } = require('./mcp-engine');
const { createNativeIntegrationRouter } = require('./native-integration-engine');
const { ConversationApplicationService, ConversationService, FirestoreConversationProposalStore, createConversationRouter } = require('./conversation-engine');
const { callConversationModel } = require('./vertexConversationModel');
const { CapabilityRegistry } = require('./capability-engine');
const { applySelectorProposal, collectVaultReferences, emitTelemetry, errorTelemetry, isReliabilityEnabled, lintWorkflow, listSelectorProposals, reliabilitySnapshot, TenantAdmissionController } = require('./reliability');

const projectId = process.env.STANLEY_PROJECT_ID || 'bridgeway-db29e';
const internalKey = process.env.RUNNER_INTERNAL_KEY || '';
const allowLegacyRun = process.env.ALLOW_LEGACY_RUN === 'true';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((origin) => origin.trim()).filter(Boolean);

admin.initializeApp({ projectId });
const db = admin.firestore();
const runs = new RunStore(db);
const entitlements = new RunEntitlementService(db, runs);
const admissionController = new TenantAdmissionController(db, {
  ratePerMinute: Number(process.env.RUN_SUBMISSIONS_PER_MINUTE || 30),
  burst: Number(process.env.RUN_SUBMISSION_BURST || 10),
});
const bucketName = process.env.ARTIFACT_BUCKET || `${projectId}.appspot.com`;
const artifactService = new ArtifactService({ db, bucket: admin.storage().bucket(bucketName) });
const app = express();
const googleOAuth = new GoogleOAuthService(db);
// A 10 MiB binary artifact expands to roughly 13.4 MiB as base64.
app.use('/v1/artifacts', express.json({ limit: '15mb' }));
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Idempotency-Key, X-Stanley-Internal-Key, X-Stanley-Takeover-Token, X-Stanley-MCP-Key');
  if (req.method === 'OPTIONS') return res.status(204).send();
  next();
});

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function errorResponse(res, error) {
  const status = error instanceof WorkflowContractError ? 422 : error.status || 500;
  return res.status(status).json({ success: false, error: error.message || 'Unexpected error.' });
}

async function authenticateUser(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer (.+)$/);
  if (!match) throw httpError(401, 'Missing Authorization bearer token.');
  let token;
  try {
    token = await admin.auth().verifyIdToken(match[1]);
  } catch {
    throw httpError(401, 'Invalid or expired ID token.');
  }
  const userRef = db.collection('stanley_users').doc(token.uid);
  let user = await userRef.get();
  if (!user.exists) {
    const now = new Date().toISOString();
    await userRef.set({ email: token.email || '', status: 'free', paid: false, runs_used: 0, runs_reserved: 0, createdAt: now, updatedAt: now }, { merge: false });
    user = await userRef.get();
  }
  if (!user.data()?.paid && token.email) {
    const pendingRef = db.collection('pending_payments').doc(String(token.email).toLowerCase().trim());
    const pending = await pendingRef.get();
    if (pending.exists && pending.data()?.paid === true) {
      await userRef.set({ ...pending.data(), email: token.email, status: 'active', paid: true, activatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
      await pendingRef.delete();
      user = await userRef.get();
    }
  }
  if (['disabled', 'suspended'].includes(user.data()?.status)) throw httpError(403, 'This Stanley account is not currently available.');
  return token.uid;
}

installGoogleOAuthRoutes({ app, service: googleOAuth, authenticateUser });

async function resolveRunSecrets(dbInstance, uid, refs = null) {
  const secrets = await resolveSecrets(dbInstance, uid, refs);
  if (!refs || refs.includes('GoogleOAuthToken')) {
    const token = await googleOAuth.accessToken(uid);
    if (token) secrets.GoogleOAuthToken = token;
  }
  return secrets;
}

function authenticateInternal(req) {
  if (!internalKey || req.headers['x-stanley-internal-key'] !== internalKey) {
    throw httpError(401, 'Invalid internal key.');
  }
}

async function loadWorkflow(uid, workflowId) {
  const doc = await db.collection('stanley_users').doc(uid).collection('workflows').doc(workflowId).get();
  if (!doc.exists) throw httpError(404, 'Workflow not found.');
  return { id: doc.id, ...doc.data() };
}

async function createRun(uid, workflowId, { input = {}, trigger = 'Manual', idempotencyKey = '', releaseId = null } = {}) {
  const workflow = await loadWorkflow(uid, workflowId);
  const selectedReleaseId = releaseId || (trigger === 'Manual' ? null : workflow.activeProductionReleaseId || null);
  const executionSource = selectedReleaseId ? await workflowPlatform.store.getRelease(uid, workflowId, selectedReleaseId) : workflow;
  if (!executionSource) throw httpError(409, 'Selected workflow release is unavailable.');
  const { policy } = validateWorkflow(executionSource);
  validateWorkflowInput(executionSource, input);
  const id = makeRunId(uid, workflowId, idempotencyKey);
  const approvalRequired = !isReliabilityEnabled('NODE_SCOPED_APPROVALS') && requiresPreflightApproval(workflow);
  const admission = isReliabilityEnabled('FAIR_QUEUEING') ? await admissionController.reserve(uid) : { delaySeconds: 0 };
  const now = new Date().toISOString();
  return entitlements.create(uid, {
    id,
    workflowId,
    workflowName: workflow.name || 'Workflow',
    trigger,
    state: approvalRequired ? 'pending_approval' : 'queued',
    approvalRequired,
    input,
    logs: approvalRequired ? ['[System] Run is waiting for approval before execution.'] : ['[System] Run queued.'],
    executionPolicy: policy,
    releaseId: selectedReleaseId,
    attempts: 0,
    queueDelaySeconds: admission.delaySeconds,
    createdAt: now,
    updatedAt: now,
    timestamp: new Date().toLocaleString('en-US'),
    duration: '0s',
  });
}

let templateService = null;
const promoteConnectorTemplate = async (uid, connector) => {
  try { return templateService ? await templateService.fromConnector(uid, connector.connectorId, connector.version, { createdBy: uid }) : null; }
  catch (error) { if (!/already exists/i.test(error.message)) console.error('[Templates] Connector promotion failed:', error); return null; }
};
const promoteSkillTemplate = async (uid, skill) => {
  try { return templateService ? await templateService.fromSkill(uid, skill.skillId, skill.version, { createdBy: uid }) : null; }
  catch (error) { if (!/already exists/i.test(error.message)) console.error('[Templates] Skill promotion failed:', error); return null; }
};

const connectorOverlay = installConnectorOverlay({
  app, db, authenticateUser, resolveAllSecrets: resolveRunSecrets,
  callModel: callConnectorModel,
  logger: (event) => console.log(JSON.stringify({ component: 'connector-engine', ...event })),
  onPublished: promoteConnectorTemplate,
});

const skillOverlay = installSkillOverlay({
  app, db, authenticateUser, runWorkflow: runWorkflowWithContext,
  trustStore: connectorOverlay.trustStore, resolveAllSecrets: resolveRunSecrets,
  onActivated: promoteSkillTemplate,
  artifactService,
});

const templateAdmins = new Set((process.env.TEMPLATE_PUBLICATION_ADMINS || '').split(',').map((uid) => uid.trim()).filter(Boolean));
templateService = new TemplateService({ store: new FirestoreTemplateStore(db), connectorStore: connectorOverlay.service.store, skillStore: skillOverlay.service.store, publicPublisher: (uid) => templateAdmins.has(uid) });
app.use('/v1/templates', async (req, res, next) => { try { req.uid = await authenticateUser(req); next(); } catch (error) { res.status(error.status || 401).json({ success: false, error: error.message }); } }, createTemplateRouter({ express, service: templateService, requireUser: (req) => req.uid }));

const orchestrationOverlay = installOrchestrationOverlay({
  app, db, authenticateUser, authenticateInternal,
  dispatch: async (uid, runId) => {
    await runs.patch(uid, runId, { state: 'queued', wait: null, logs: ['[System] Durable wait satisfied; run queued to resume.'] });
    return dispatcher.dispatch(uid, runId, 0, { dispatchKey: `resume:${Date.now()}` });
  },
});

const learningOverlay = installLearningOverlay({ app, express, db, authenticateUser, proposeOperations: proposeRepairOperations });
const memoryOverlay = installMemoryOverlay({ app, express, db, authenticateUser });
const monitoringOverlay = installMonitoringOverlay({ app, express, db, authenticateUser, authenticateInternal, connectorService: connectorOverlay.service, resolveAllSecrets: resolveRunSecrets, trustStore: connectorOverlay.trustStore });
const browserRuntimeServices = getBrowserRuntimeServices(db);
app.use(createBrowserRuntimeRouter({ express, authenticateUser, services: browserRuntimeServices, handleError: errorResponse }));
app.use(createArtifactRouter({ express, authenticateUser, service: artifactService, handleError: errorResponse }));
app.use(createNativeIntegrationRouter({ express, authenticateUser }));
const conversationProposalStore = new FirestoreConversationProposalStore(db);
const capabilityRegistry = new CapabilityRegistry({ connectorStore: connectorOverlay.service.store, skillStore: skillOverlay.service.store });
const conversationService = new ConversationService({ callModel: callConversationModel, loadWorkflow, proposalStore: conversationProposalStore, capabilityRegistry });
const conversationApplicationService = new ConversationApplicationService({ store: conversationProposalStore, loadWorkflow });
app.use(createConversationRouter({ express, authenticateUser, service: conversationService, applicationService: conversationApplicationService, handleError: errorResponse }));
const workflowPlatform = new WorkflowPlatformService({ store: new WorkflowPlatformStore(db), loadWorkflow });

app.get('/v1/workflows/:workflowId/selector-proposals', async (req, res) => {
  try { const uid = await authenticateUser(req); return res.json({ success: true, proposals: await listSelectorProposals(db, uid, req.params.workflowId) }); }
  catch (error) { return errorResponse(res, error); }
});
app.post('/v1/workflows/:workflowId/selector-proposals/:proposalId/apply', async (req, res) => {
  try { const uid = await authenticateUser(req); return res.json({ success: true, proposal: await applySelectorProposal(db, uid, req.params.workflowId, req.params.proposalId, uid) }); }
  catch (error) { return errorResponse(res, error); }
});
app.get('/v1/workflows/:workflowId/preflight', async (req, res) => {
  try { const uid = await authenticateUser(req); const workflow = await loadWorkflow(uid, req.params.workflowId); const report = lintWorkflow(workflow); return res.status(report.valid ? 200 : 422).json({ success: report.valid, report }); }
  catch (error) { return errorResponse(res, error); }
});

async function executeRun(uid, runId) {
  const useRunLeases = isReliabilityEnabled('TRANSACTIONAL_RUN_LEASES');
  let run = await runs.get(uid, runId);
  if (!run) throw httpError(404, 'Run not found.');
  const expiredRunningLease = run.state === 'running' && Number(run.lease?.expiresAtMs || 0) <= Date.now();
  if (!EXECUTABLE_STATES.has(run.state) && !(useRunLeases && expiredRunningLease)) return publicRun(run);

  let workflow = await loadWorkflow(uid, run.workflowId);
  if (run.releaseId) workflow = await workflowPlatform.store.getRelease(uid, run.workflowId, run.releaseId) || workflow;
  const { policy } = validateWorkflow(workflow);
  let executableWorkflow = isReliabilityEnabled('NODE_SCOPED_APPROVALS')
    ? workflow
    : prepareApprovedWorkflow(workflow, Boolean(run.approvedAt));
  const startedAtMs = Date.now();
  let leaseId = null;
  if (useRunLeases) {
    run = await runs.claim(uid, runId);
    if (!run) return publicRun(await runs.get(uid, runId));
    leaseId = run.lease.id;
  } else {
    run = await runs.patch(uid, runId, {
      state: 'running',
      attempts: Number(run.attempts || 0) + 1,
      startedAt: new Date().toISOString(),
      logs: [...(run.logs || []), '[System] Execution started.'],
    });
  }
  const patchExecution = (patch, options = {}) => leaseId
    ? runs.patchClaimed(uid, runId, leaseId, patch, options)
    : runs.patch(uid, runId, patch);
  let lastHeartbeatAt = startedAtMs;
  emitTelemetry('run_started', { uid, runId, workflowId: run.workflowId, state: run.state, attempt: run.attempts, dispatchMode: dispatcher.mode });
  const heartbeat = async () => {
    if (!leaseId || Date.now() - lastHeartbeatAt < 15_000) return;
    await runs.heartbeat(uid, runId, leaseId);
    lastHeartbeatAt = Date.now();
  };

  let orchestration = null;
  let learningRollout = null;
  let memoryIds = [];
  try {
    let secretRefs = null;
    if (isReliabilityEnabled('SCOPED_SECRET_LOADING')) {
      secretRefs = [...collectVaultReferences(executableWorkflow)];
      const preferredSkill = (executableWorkflow.capabilityPlan || []).find((item) => item.kind === 'skill');
      const skillSelection = await skillOverlay.service.select({
        tenantId: uid, workflowId: executableWorkflow.id, operationName: executableWorkflow.operationName,
        tags: executableWorkflow.tags || [], targetDomain: '', skillId: preferredSkill?.id, skillVersion: preferredSkill?.version,
      });
      skillSelection.selected?.requiredVaultRefs?.forEach((ref) => secretRefs.push(ref));
      secretRefs = [...new Set(secretRefs)];
    }
    const secrets = await resolveRunSecrets(db, uid, secretRefs);
    monitoringOverlay.assertAllowed(executableWorkflow);
    const learningSelection = await learningOverlay.candidateForRun(uid, executableWorkflow, runId);
    executableWorkflow = learningSelection.workflow; learningRollout = learningSelection.rollout;
    const memorySelection = await memoryOverlay.prepareWorkflow(uid, executableWorkflow);
    executableWorkflow = memorySelection.workflow; memoryIds = memorySelection.memoryIds;
    orchestration = await orchestrationOverlay.runtimeFor({ uid, runId, workflow: executableWorkflow });
    let skillAttempt;
    try {
      skillAttempt = await skillOverlay.executeBeforeWorkflow({
        uid, runId, workflow: executableWorkflow, input: run.input || {}, secrets,
        mode: executableWorkflow.trustPolicy?.mode || 'live', orchestration,
        runnerOptions: {
          onLeaseHeartbeat: heartbeat,
          effectLedgerEnabled: isReliabilityEnabled('EFFECT_LEDGER'),
          skipCompletedNodes: isReliabilityEnabled('EFFECT_LEDGER') || isReliabilityEnabled('NODE_SCOPED_APPROVALS'),
          twoPhaseMonitors: isReliabilityEnabled('TWO_PHASE_MONITORS'),
          safeEgress: isReliabilityEnabled('SAFE_EGRESS'),
          providerResilience: isReliabilityEnabled('PROVIDER_RESILIENCE'),
          traceBatching: isReliabilityEnabled('TRACE_BATCHING'),
          selectorQuarantine: isReliabilityEnabled('WORKFLOW_REVISIONS'),
          distributedBrowserLeases: isReliabilityEnabled('DISTRIBUTED_BROWSER_LEASES'),
        },
      });
    } catch (skillError) {
      if (!skillError.safeToFallback) throw skillError;
      skillAttempt = { executed: false, safeToFallback: true, error: skillError.message };
    }
    let result;
    if (skillAttempt.executed) {
      result = {
        logs: [`[Skill] Executed ${skillAttempt.skillId}@${skillAttempt.version} with no model calls.`],
        scraped: skillAttempt.output || {}, trustReport: skillAttempt.trustReport,
        trustState: 'verified', trustMode: executableWorkflow.trustPolicy?.mode || 'live',
        skillExecution: { skillId: skillAttempt.skillId, version: skillAttempt.version, selection: skillAttempt.selection, modelCallsSaved: skillAttempt.modelCallsSaved },
      };
    } else {
      result = await executeTrustedWorkflow({
        store: connectorOverlay.trustStore, uid, runId, workflow: executableWorkflow,
        secrets, input: run.input || {}, runRecord: run, runner: runWorkflowWithContext,
        runnerOptions: {
          db, uid, runId, policy, connectorRuntime: connectorOverlay.connectorRuntime, orchestration, artifactService,
          onLeaseHeartbeat: heartbeat,
          effectLedgerEnabled: isReliabilityEnabled('EFFECT_LEDGER'),
          skipCompletedNodes: isReliabilityEnabled('EFFECT_LEDGER') || isReliabilityEnabled('NODE_SCOPED_APPROVALS'),
          twoPhaseMonitors: isReliabilityEnabled('TWO_PHASE_MONITORS'),
          safeEgress: isReliabilityEnabled('SAFE_EGRESS'),
          providerResilience: isReliabilityEnabled('PROVIDER_RESILIENCE'),
          traceBatching: isReliabilityEnabled('TRACE_BATCHING'),
          selectorQuarantine: isReliabilityEnabled('WORKFLOW_REVISIONS'),
          distributedBrowserLeases: isReliabilityEnabled('DISTRIBUTED_BROWSER_LEASES'),
        },
        trustMode: executableWorkflow.trustPolicy?.mode || 'live',
        resumeCheckpoint: run.resumeCheckpoint || null,
      });
    }
    const latest = await runs.get(uid, runId);
    const cancelRequested = latest?.state === 'cancel_requested';
    if (cancelRequested) await orchestrationOverlay.coordinator.cancelRun(uid, runId);
    else await orchestrationOverlay.coordinator.completeRun(uid, runId);
    if (learningRollout) await learningOverlay.recordOutcome(uid, learningRollout.id, { success: !cancelRequested, runId });
    if (memoryIds.length) await memoryOverlay.recordOutcome(uid, memoryIds, !cancelRequested);
    await monitoringOverlay.record(uid, { workflowId: executableWorkflow.id, runId, success: !cancelRequested, verified: result.trustState !== 'needs_attention', durationMs: Date.now() - startedAtMs, costMicros: Number(result.executionCostMicros || 0), modelCalls: Number(result.modelCalls || 0), component: result.skillExecution ? { type: 'skill', ...result.skillExecution } : null });
    run = await patchExecution({
      state: cancelRequested ? 'cancelled' : 'completed',
      success: !cancelRequested,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      duration: `${Math.round((Date.now() - startedAtMs) / 1000)}s`,
      logs: result.logs || [],
      scraped: result.scraped || {},
      output: validateWorkflowOutput(executableWorkflow, result.scraped || {}),
      trustState: result.trustState,
      trustMode: result.trustMode,
      trustReport: result.trustReport,
      skillExecution: result.skillExecution || null,
      modelUsage: result.modelUsage || null,
    }, { releaseLease: true });
    await entitlements.settle(uid, runId, !cancelRequested);
    emitTelemetry('run_finished', { uid, runId, workflowId: run.workflowId, state: run.state, attempt: run.attempts, durationMs: Date.now() - startedAtMs });
    return publicRun(run);
  } catch (error) {
    if (error?.code === 'WORKFLOW_SUSPENDED') {
      const wait = { ...(error.wait || {}) }; delete wait.tokenHash;
      run = await patchExecution({ state: 'waiting', success: false, wait, logs: error.logs || [`[System] Waiting for ${wait.type || 'external event'}.`] }, { releaseLease: true });
      emitTelemetry('run_suspended', { uid, runId, workflowId: run.workflowId, state: 'waiting', waitType: wait.type, nodeId: wait.nodeId });
      return publicRun(run);
    }
    if (orchestration) await orchestrationOverlay.coordinator.failRun(uid, runId, error).catch((orchestrationError) => console.error('[Orchestration] Failure finalization error:', orchestrationError));
    if (learningRollout) await learningOverlay.recordOutcome(uid, learningRollout.id, { success: false, runId, code: error.code }).catch((learningError) => console.error('[Learning] Rollout outcome error:', learningError));
    if (memoryIds.length) await memoryOverlay.recordOutcome(uid, memoryIds, false).catch((memoryError) => console.error('[Memory] Outcome error:', memoryError));
    await monitoringOverlay.record(uid, { workflowId: executableWorkflow.id, runId, success: false, verified: false, durationMs: Date.now() - startedAtMs, costMicros: Number(error.costMicros || 0), modelCalls: Number(error.modelCalls || 0), component: error.component || null }).catch((monitoringError) => console.error('[Monitoring] Outcome error:', monitoringError));
    await learningOverlay.observeFailure(uid, { workflowId: executableWorkflow.id, runId, nodeId: error.nodeId || null, nodeType: error.nodeType || null, error, url: error.url || '', nodeData: error.nodeData || null }).catch((learningError) => console.error('[Learning] Failure capture error:', learningError));
    const attempts = Number(run.attempts || 1);
    const canRetry = !orchestration && policy.retrySafe && attempts < policy.maxRunAttempts;
    run = await patchExecution({
      state: canRetry ? 'retrying' : 'failed',
      success: false,
      completedAt: canRetry ? null : new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      duration: `${Math.round((Date.now() - startedAtMs) / 1000)}s`,
      error: error.message || 'Workflow execution failed.',
      logs: error.logs || [`[System] ${error.message || 'Workflow execution failed.'}`],
    }, { releaseLease: true });
    if (!canRetry) await entitlements.settle(uid, runId, false);
    emitTelemetry('run_failed', { uid, runId, workflowId: run.workflowId, state: run.state, attempt: attempts, durationMs: Date.now() - startedAtMs, ...errorTelemetry(error), nodeId: error.nodeId, nodeType: error.nodeType });
    if (canRetry) await dispatcher.dispatch(uid, runId, Math.min(60, 2 ** attempts), { dispatchKey: `attempt:${attempts + 1}` });
    return publicRun(run);
  }
}

const dispatcher = createDispatcher({ projectId, inlineExecutor: executeRun });

app.use(createTrustRouter({
  express, authenticateUser, store: connectorOverlay.trustStore,
  onRetry: async ({ uid, exceptionId }) => {
    const exception = await connectorOverlay.trustStore.getException(uid, exceptionId);
    if (!exception) throw httpError(404, 'Exception not found.');
    const checkpoint = await connectorOverlay.trustStore.latestCheckpoint(uid, exception.runId);
    if (!checkpoint?.resumable) throw httpError(409, 'No safe resumable checkpoint is available.');
    let retry = await createRun(uid, exception.workflowId, { trigger: 'Safe retry', idempotencyKey: `trust-retry:${exceptionId}:${checkpoint.id}` });
    retry = await runs.patch(uid, retry.id, { resumeCheckpoint: checkpoint, retryOfRunId: exception.runId, retryOfExceptionId: exceptionId });
    if (retry.state !== 'pending_approval') await dispatcher.dispatch(uid, retry.id, 0, { dispatchKey: 'trust-retry' });
    return { runId: retry.id, state: retry.state };
  },
  handleError: errorResponse,
}));

async function submitRun(uid, workflowId, options) {
  const run = await createRun(uid, workflowId, options);
  if (run.duplicate || run.state === 'pending_approval') return publicRun(run);
  const dispatched = await dispatcher.dispatch(uid, run.id, Number(run.queueDelaySeconds || 0), { dispatchKey: 'initial' });
  if (dispatcher.mode === 'inline') return dispatched;
  return publicRun(await runs.get(uid, run.id));
}

app.get('/', (_req, res) => res.status(200).send('Stanley cloud runner OK'));
app.get('/health', (_req, res) => res.status(200).json({ ok: true, dispatchMode: dispatcher.mode, reliability: reliabilitySnapshot() }));
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true, dispatchMode: dispatcher.mode }));

app.post('/v1/workflows/:workflowId/runs', async (req, res) => {
  try {
    const uid = await authenticateUser(req);
    const run = await submitRun(uid, req.params.workflowId, {
      input: req.body?.input || {}, trigger: 'Manual', idempotencyKey: String(req.headers['x-idempotency-key'] || ''),
    });
    return res.status(['queued', 'pending_approval', 'retrying'].includes(run.state) ? 202 : 200).json({ success: run.state === 'completed', run });
  } catch (error) { return errorResponse(res, error); }
});

app.get('/v1/runs/:runId', async (req, res) => {
  try {
    const uid = await authenticateUser(req);
    const run = await runs.get(uid, req.params.runId);
    if (!run) throw httpError(404, 'Run not found.');
    return res.json({ success: run.state === 'completed', run: publicRun(run) });
  } catch (error) { return errorResponse(res, error); }
});

app.post('/v1/runs/:runId/approval', async (req, res) => {
  try {
    const uid = await authenticateUser(req);
    const run = await runs.get(uid, req.params.runId);
    if (!run) throw httpError(404, 'Run not found.');
    const decision = req.body?.decision;
    if (isReliabilityEnabled('NODE_SCOPED_APPROVALS') && run.state === 'waiting' && run.wait?.type === 'approval') {
      if (decision === 'reject') {
        await orchestrationOverlay.coordinator.cancelRun(uid, run.id, 'approval_rejected');
        const rejected = await runs.patch(uid, run.id, { state: 'cancelled', rejectedAt: new Date().toISOString(), success: false, wait: null });
        await entitlements.settle(uid, run.id, false);
        return res.json({ success: false, run: publicRun(rejected) });
      }
      if (decision !== 'approve') throw httpError(400, 'Decision must be approve or reject.');
      const eventId = String(req.body?.eventId || `approval:${run.id}:${run.wait.correlationId}`);
      const result = await orchestrationOverlay.coordinator.signal(uid, run.id, {
        correlationId: run.wait.correlationId,
        token: run.wait.token,
        eventId,
        type: 'approval',
        payload: { decision: 'approve', approvedBy: uid, approvedAt: new Date().toISOString() },
      });
      const resumed = await runs.get(uid, run.id);
      return res.status(result.resumed ? 202 : 200).json({ success: resumed?.state === 'completed', run: publicRun(resumed) });
    }
    if (run.state !== 'pending_approval') throw httpError(409, 'Run is not awaiting approval.');
    if (decision === 'reject') {
      const rejected = await runs.patch(uid, run.id, { state: 'cancelled', rejectedAt: new Date().toISOString(), success: false });
      await entitlements.settle(uid, run.id, false);
      return res.json({ success: false, run: publicRun(rejected) });
    }
    if (decision !== 'approve') throw httpError(400, 'Decision must be approve or reject.');
    await runs.patch(uid, run.id, { state: 'approved', approvedAt: new Date().toISOString() });
    const dispatched = await dispatcher.dispatch(uid, run.id, 0, { dispatchKey: `approval:${run.approvedAt || 'approved'}` });
    const finalRun = dispatcher.mode === 'inline' ? dispatched : await runs.get(uid, run.id);
    return res.status(['approved', 'queued', 'running'].includes(finalRun.state) ? 202 : 200).json({ success: finalRun.state === 'completed', run: publicRun(finalRun) });
  } catch (error) { return errorResponse(res, error); }
});

app.post('/v1/runs/:runId/cancel', async (req, res) => {
  try {
    const uid = await authenticateUser(req);
    const run = await runs.get(uid, req.params.runId);
    if (!run) throw httpError(404, 'Run not found.');
    if (['completed', 'failed', 'cancelled'].includes(run.state)) throw httpError(409, 'Run has already finished.');
    const state = run.state === 'running' ? 'cancel_requested' : 'cancelled';
    const updated = await runs.patch(uid, run.id, { state, cancelRequestedAt: new Date().toISOString(), success: false });
    if (state === 'cancelled') await entitlements.settle(uid, run.id, false);
    return res.status(state === 'cancel_requested' ? 202 : 200).json({ success: false, run: publicRun(updated) });
  } catch (error) { return errorResponse(res, error); }
});

app.post('/v1/internal/runs/:runId/execute', async (req, res) => {
  try {
    authenticateInternal(req);
    if (!req.body?.uid) throw httpError(400, 'Missing uid.');
    const run = await executeRun(req.body.uid, req.params.runId);
    return res.json({ success: run.state === 'completed', run });
  } catch (error) { return errorResponse(res, error); }
});

app.post('/v1/internal/workflows/:workflowId/runs', async (req, res) => {
  try {
    authenticateInternal(req);
    if (!req.body?.uid) throw httpError(400, 'Missing uid.');
    const run = await submitRun(req.body.uid, req.params.workflowId, {
      input: req.body.input || {}, trigger: req.body.trigger || 'Automated', idempotencyKey: req.body.idempotencyKey || '',
    });
    return res.status(['queued', 'pending_approval', 'retrying'].includes(run.state) ? 202 : 200).json({ success: run.state === 'completed', run });
  } catch (error) { return errorResponse(res, error); }
});

// Compatibility route for the existing scheduler/webhook Functions.
app.post('/run-internal', async (req, res) => {
  try {
    authenticateInternal(req);
    if (!req.body?.uid || !req.body?.workflowId) throw httpError(400, 'Missing uid or workflowId.');
    const run = await submitRun(req.body.uid, req.body.workflowId, {
      input: req.body.input || {}, trigger: req.body.trigger || 'Automated', idempotencyKey: req.body.idempotencyKey || '',
    });
    return res.status(['queued', 'pending_approval', 'retrying'].includes(run.state) ? 202 : 200).json({ success: run.state === 'completed', run, runId: run.id });
  } catch (error) { return errorResponse(res, error); }
});

// Compatibility route for the current frontend. Submitted secrets are ignored.
app.post('/run', async (req, res) => {
  if (!allowLegacyRun) return res.status(410).json({ success: false, error: 'Legacy run endpoint is disabled.' });
  try {
    const uid = await authenticateUser(req);
    const workflowId = req.body?.workflow?.id;
    if (!workflowId) throw httpError(400, 'Persist the workflow before running it.');
    const run = await submitRun(uid, workflowId, { input: req.body?.input || {}, trigger: 'Manual' });
    return res.status(200).json({
      success: run.state === 'completed', runId: run.id, logs: run.logs || [], scraped: run.scraped, paused: run.state === 'pending_approval', error: run.error,
    });
  } catch (error) { return errorResponse(res, error); }
});

// Stable external invocation always executes the promoted production release.
app.post('/v1/workflows/:workflowId/invoke', async (req, res) => {
  try {
    const uid = await authenticateUser(req);
    const workflow = await loadWorkflow(uid, req.params.workflowId);
    if (!workflow.activeProductionReleaseId) throw httpError(409, 'Promote a tested release to production before invoking this workflow.');
    const run = await submitRun(uid, req.params.workflowId, {
      input: req.body?.input || {}, trigger: 'API', idempotencyKey: String(req.headers['x-idempotency-key'] || ''),
      releaseId: workflow.activeProductionReleaseId,
    });
    return res.status(['queued', 'pending_approval', 'retrying'].includes(run.state) ? 202 : 200).json({ success: run.state === 'completed', run });
  } catch (error) { return errorResponse(res, error); }
});

async function executeDebugWorkflow(uid, workflow, { input = {}, runId } = {}) {
  const { policy } = validateWorkflow(workflow);
  validateWorkflowInput(workflow, input);
  const secrets = await resolveRunSecrets(db, uid);
  return runWorkflowWithContext(workflow, secrets, input, { db, uid, runId, policy: { ...policy, allowAgenticRecovery: false }, artifactService });
}

app.use(createWorkflowPlatformRouter({
  express, authenticateUser, service: workflowPlatform, loadWorkflow,
  executeDebug: executeDebugWorkflow,
  replayRun: async (uid, sourceRunId) => {
    const source = await runs.get(uid, sourceRunId); if (!source) throw httpError(404, 'Source run not found.');
    return submitRun(uid, source.workflowId, { input: source.input || {}, trigger: 'Replay', idempotencyKey: `replay:${sourceRunId}:${Date.now()}`, releaseId: source.releaseId || null });
  },
  publicBaseUrl: process.env.RUNNER_PUBLIC_URL || process.env.RUNNER_SERVICE_URL || '', handleError: errorResponse,
}));

const mcpService = new McpService({ db, loadWorkflow, submitRun });
installMcpRoutes({ app, authenticateUser, service: mcpService, handleError: errorResponse });

const port = Number(process.env.PORT || 8080);
app.listen(port, () => console.log(`Stanley cloud API listening on :${port} (${dispatcher.mode})`));
