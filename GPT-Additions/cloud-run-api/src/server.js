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

const projectId = process.env.STANLEY_PROJECT_ID || 'bridgeway-db29e';
const internalKey = process.env.RUNNER_INTERNAL_KEY || '';
const allowLegacyRun = process.env.ALLOW_LEGACY_RUN !== 'false';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((origin) => origin.trim()).filter(Boolean);

admin.initializeApp({ projectId });
const db = admin.firestore();
const runs = new RunStore(db);
const app = express();
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Idempotency-Key, X-Stanley-Internal-Key');
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
  const user = await db.collection('stanley_users').doc(token.uid).get();
  if (!user.exists || user.data().status !== 'active') throw httpError(403, 'No active Stanley license for this account.');
  return token.uid;
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

async function createRun(uid, workflowId, { input = {}, trigger = 'Manual', idempotencyKey = '' } = {}) {
  const workflow = await loadWorkflow(uid, workflowId);
  const { policy } = validateWorkflow(workflow);
  const id = makeRunId(uid, workflowId, idempotencyKey);
  const approvalRequired = requiresPreflightApproval(workflow);
  const now = new Date().toISOString();
  return runs.create(uid, {
    id,
    workflowId,
    workflowName: workflow.name || 'Workflow',
    trigger,
    state: approvalRequired ? 'pending_approval' : 'queued',
    approvalRequired,
    input,
    logs: approvalRequired ? ['[System] Run is waiting for approval before execution.'] : ['[System] Run queued.'],
    executionPolicy: policy,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    timestamp: new Date().toLocaleString('en-US'),
    duration: '0s',
  });
}

async function executeRun(uid, runId) {
  let run = await runs.get(uid, runId);
  if (!run) throw httpError(404, 'Run not found.');
  if (!EXECUTABLE_STATES.has(run.state)) return publicRun(run);

  const workflow = await loadWorkflow(uid, run.workflowId);
  const { policy } = validateWorkflow(workflow);
  const executableWorkflow = prepareApprovedWorkflow(workflow, Boolean(run.approvedAt));
  const startedAtMs = Date.now();
  run = await runs.patch(uid, runId, {
    state: 'running',
    attempts: Number(run.attempts || 0) + 1,
    startedAt: new Date().toISOString(),
    logs: [...(run.logs || []), '[System] Execution started.'],
  });

  try {
    const secrets = await resolveSecrets(db, uid);
    const result = await runWorkflowWithContext(executableWorkflow, secrets, run.input || {}, { db, uid, runId, policy });
    const latest = await runs.get(uid, runId);
    const cancelRequested = latest?.state === 'cancel_requested';
    run = await runs.patch(uid, runId, {
      state: cancelRequested ? 'cancelled' : 'completed',
      success: !cancelRequested,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      duration: `${Math.round((Date.now() - startedAtMs) / 1000)}s`,
      logs: result.logs || [],
      scraped: result.scraped || {},
    });
    return publicRun(run);
  } catch (error) {
    const attempts = Number(run.attempts || 1);
    const canRetry = policy.retrySafe && attempts < policy.maxRunAttempts;
    run = await runs.patch(uid, runId, {
      state: canRetry ? 'retrying' : 'failed',
      success: false,
      completedAt: canRetry ? null : new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      duration: `${Math.round((Date.now() - startedAtMs) / 1000)}s`,
      error: error.message || 'Workflow execution failed.',
      logs: error.logs || [`[System] ${error.message || 'Workflow execution failed.'}`],
    });
    if (canRetry) await dispatcher.dispatch(uid, runId, Math.min(60, 2 ** attempts));
    return publicRun(run);
  }
}

const dispatcher = createDispatcher({ projectId, inlineExecutor: executeRun });

async function submitRun(uid, workflowId, options) {
  const run = await createRun(uid, workflowId, options);
  if (run.duplicate || run.state === 'pending_approval') return publicRun(run);
  const dispatched = await dispatcher.dispatch(uid, run.id);
  if (dispatcher.mode === 'inline') return dispatched;
  return publicRun(await runs.get(uid, run.id));
}

app.get('/', (_req, res) => res.status(200).send('Stanley cloud runner OK'));
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
    if (run.state !== 'pending_approval') throw httpError(409, 'Run is not awaiting approval.');
    const decision = req.body?.decision;
    if (decision === 'reject') {
      const rejected = await runs.patch(uid, run.id, { state: 'cancelled', rejectedAt: new Date().toISOString(), success: false });
      return res.json({ success: false, run: publicRun(rejected) });
    }
    if (decision !== 'approve') throw httpError(400, 'Decision must be approve or reject.');
    await runs.patch(uid, run.id, { state: 'approved', approvedAt: new Date().toISOString() });
    const dispatched = await dispatcher.dispatch(uid, run.id);
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

const port = Number(process.env.PORT || 8080);
app.listen(port, () => console.log(`Stanley cloud API listening on :${port} (${dispatcher.mode})`));
