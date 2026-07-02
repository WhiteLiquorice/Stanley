/**
 * index.js — Stanley headless runner HTTP service (Cloud Run).
 *
 * POST /run
 *   Headers: Authorization: Bearer <Firebase ID token>
 *   Body:    { workflow: {...}, secrets: { name: value, ... } }
 *   Returns: { success: true, logs: string[], scraped: any }
 *         or { success: false, error: string, logs: string[] }
 *
 * Auth: verifies the Firebase ID token and confirms the user holds an active
 * Stanley license (stanley_users/{uid}.status === 'active'), mirroring askStanleyAI.
 */

const express = require('express');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { runWorkflowHeadless } = require('./cloudRunner.js');
const { resolveSecrets } = require('./secretsResolver.js');

// Stanley data + auth live in this Firebase project (see src/lib/firestore.ts).
const PROJECT_ID = process.env.STANLEY_PROJECT_ID || 'bridgeway-db29e';

// Shared secret for trusted server-to-server calls (scheduler / webhook → runner).
// Set as a Cloud Run env var; the dispatcher/webhook Functions hold the same value.
const INTERNAL_KEY = process.env.RUNNER_INTERNAL_KEY || '';

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

function genId() {
  return crypto.randomBytes(5).toString('hex');
}

// Persist a finished run under stanley_users/{uid}/runs (Admin SDK, native types).
// Shape mirrors the web app's Run so the dashboard lists triggered runs uniformly.
async function saveRun(uid, run) {
  await db.collection('stanley_users').doc(uid).collection('runs').doc(run.id).set(run);
}

const app = express();
app.use(express.json({ limit: '2mb' }));

// CORS — allow the hosted dashboard (and localhost during dev) to call us.

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const isFirebase = /^https:\/\/[a-z0-9-]+(subdomain)?\.(web\.app|firebaseapp\.com)$/.test(origin) || origin.includes('bridgeway-db29e');
    
    if (isLocalhost || isFirebase) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
    }
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  next();
});

// Health check
app.get('/', (_req, res) => res.status(200).send('Stanley headless runner OK'));

async function authenticate(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) throw { code: 401, message: 'Missing Authorization bearer token.' };

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(match[1]);
  } catch (_) {
    throw { code: 401, message: 'Invalid or expired ID token.' };
  }

  const uid = decoded.uid;
  if (decoded.email !== 'stanley-reviewer@bridgewayapps.com') {
    const userDoc = await db.collection('stanley_users').doc(uid).get();
    if (!userDoc.exists || userDoc.data().status !== 'active') {
      throw { code: 403, message: 'No active Stanley license for this user.' };
    }
  }
  return uid;
}

app.post('/run', async (req, res) => {
  let uid;
  try {
    uid = await authenticate(req);
  } catch (e) {
    return res.status(e.code || 401).json({ success: false, error: e.message });
  }

  const { workflow, secrets } = req.body || {};
  if (!workflow || typeof workflow !== 'object') {
    return res.status(400).json({ success: false, error: 'Missing workflow in request body.' });
  }

  console.log(`[run] uid=${uid} workflow="${workflow.name || 'Workflow'}"`);

  try {
    const { logs, scraped } = await runWorkflowHeadless(workflow, secrets || {}, {}, db);
    return res.status(200).json({ success: true, logs, scraped });
  } catch (err) {
    return res.status(200).json({
      success: false,
      error: err.message || 'Workflow execution failed.',
      logs: err.logs || [],
    });
  }
});

/**
 * POST /run-internal — trusted server-to-server entry for automated runs
 * (scheduler / webhook). No user token: the caller proves trust with the shared
 * internal key, and the runner does everything server-side.
 *
 *   Headers: X-Stanley-Internal-Key: <RUNNER_INTERNAL_KEY>
 *   Body:    { uid, workflowId, input?, trigger? }
 *   Returns: { success, runId, logs, scraped? } | { success:false, error, runId }
 */
app.post('/run-internal', async (req, res) => {
  if (!INTERNAL_KEY || req.headers['x-stanley-internal-key'] !== INTERNAL_KEY) {
    return res.status(401).json({ success: false, error: 'Invalid internal key.' });
  }

  const { uid, workflowId, input, trigger } = req.body || {};
  if (!uid || !workflowId) {
    return res.status(400).json({ success: false, error: 'Missing uid or workflowId.' });
  }

  // License check — an expired account stops firing.
  const userDoc = await db.collection('stanley_users').doc(uid).get();
  if (!userDoc.exists || userDoc.data().status !== 'active') {
    return res.status(403).json({ success: false, error: 'No active Stanley license for this user.' });
  }

  // Load the workflow + resolve secrets, both server-side.
  const wfDoc = await db.collection('stanley_users').doc(uid).collection('workflows').doc(workflowId).get();
  if (!wfDoc.exists) {
    return res.status(404).json({ success: false, error: `Workflow ${workflowId} not found.` });
  }
  const workflow = { id: wfDoc.id, ...wfDoc.data() };
  const secrets = await resolveSecrets(db, uid);

  const runId = genId();
  const startedAt = Date.now();
  const triggerLabel = trigger || 'Automated';
  const baseRun = {
    id: runId,
    workflowId,
    workflowName: workflow.name || 'Workflow',
    trigger: triggerLabel,
    timestamp: new Date().toLocaleString('en-US'),
  };

  console.log(`[run-internal] uid=${uid} wf="${workflow.name}" trigger="${triggerLabel}"`);

  try {
    const { logs, scraped } = await runWorkflowHeadless(workflow, secrets, input || {}, db);
    await saveRun(uid, {
      ...baseRun,
      status: 'Success',
      duration: `${Math.round((Date.now() - startedAt) / 1000)}s`,
      logs: logs && logs.length ? logs : ['[System] Completed.'],
      scraped: scraped || {},
    });
    return res.status(200).json({ success: true, runId, logs, scraped });
  } catch (err) {
    await saveRun(uid, {
      ...baseRun,
      status: 'Failed',
      duration: `${Math.round((Date.now() - startedAt) / 1000)}s`,
      logs: (err.logs && err.logs.length) ? err.logs : [`[System] ❌ ${err.message}`],
    }).catch((e) => console.error('Failed to save run:', e));
    return res.status(200).json({ success: false, runId, error: err.message || 'Workflow execution failed.' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Stanley headless runner listening on :${PORT}`));
