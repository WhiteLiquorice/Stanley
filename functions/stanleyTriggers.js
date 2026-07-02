/**
 * stanleyTriggers.js — automated run triggers for Stanley.
 *
 *   stanleyScheduleTick : runs every minute, fires any due schedules.
 *   stanleyWebhook      : public HTTPS endpoint that runs a workflow on POST.
 *
 * Both authenticate to the headless runner with the shared RUNNER_INTERNAL_KEY
 * and hand it { uid, workflowId, input?, trigger? }; the runner does the rest
 * (load workflow, resolve secrets, license check, run, save run).
 *
 * Schedules live at stanley_users/{uid}/schedules/{id} with nextRunMs as epoch
 * millis (a number — the web REST client can't encode Firestore Timestamps).
 * Webhook triggers live at stanley_users/{uid}/triggers/{id}; the webhook URL
 * carries both the trigger id (?t=) and the uid (?u=), so the public endpoint
 * resolves the doc without a top-level mirror. The unguessable token still gates
 * it, and the run re-checks the license — the uid is not a secret.
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto');
const cronParser = require('cron-parser');

const runnerInternalKey = defineSecret('RUNNER_INTERNAL_KEY');
const RUNNER_URL = (process.env.RUNNER_URL || '').replace(/\/$/, '');

function db() { return admin.firestore(); }

async function invokeRunner(payload) {
  if (!RUNNER_URL) throw new Error('RUNNER_URL is not configured for Functions.');
  const key = runnerInternalKey.value() || process.env.RUNNER_INTERNAL_KEY || '';
  const res = await fetch(`${RUNNER_URL}/run-internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Stanley-Internal-Key': key },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Runner responded ${res.status}`);
  return res.json().catch(() => ({}));
}

/** Next fire time (epoch millis) for a cron + IANA tz, or null if unparseable. */
function computeNextRunMs(cron, timezone) {
  try {
    const interval = cronParser.parseExpression(cron, { tz: timezone || 'UTC', currentDate: new Date() });
    return interval.next().toDate().getTime();
  } catch (e) {
    console.error(`[stanley] bad cron "${cron}":`, e.message);
    return null;
  }
}

// ── Scheduler: fire any due schedules every minute ───────────────────────────
const stanleyScheduleTick = onSchedule(
  { schedule: 'every 1 minutes', secrets: [runnerInternalKey], timeoutSeconds: 300 },
  async () => {
    const nowMs = Date.now();
    // Composite collection-group index required: enabled ASC, nextRunMs ASC.
    const snap = await db().collectionGroup('schedules')
      .where('enabled', '==', true)
      .where('nextRunMs', '<=', nowMs)
      .get();
    if (snap.empty) return;

    for (const doc of snap.docs) {
      const sched = doc.data();
      const uid = doc.ref.parent.parent.id; // stanley_users/{uid}/schedules/{id}
      let status = 'Triggered';
      try {
        await invokeRunner({ uid, workflowId: sched.workflowId, trigger: 'Schedule' });
      } catch (e) {
        status = 'Failed';
        console.error(`[scheduleTick] ${uid}/${sched.workflowId} failed:`, e.message);
      }
      const nextRunMs = computeNextRunMs(sched.cron, sched.timezone);
      await doc.ref.update({
        lastRunMs: nowMs,
        lastStatus: status,
        // An unparseable cron disables the schedule rather than looping forever.
        ...(nextRunMs ? { nextRunMs } : { enabled: false }),
      });
    }
  }
);

// ── Webhook: run a workflow from an external POST (async 202) ─────────────────
const stanleyWebhook = onRequest(
  { secrets: [runnerInternalKey] },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST.' }); return; }

    const triggerId = String(req.query.t || '');
    const uid = String(req.query.u || '');
    const token = String(req.get('X-Stanley-Token') || req.query.token || '');
    if (!triggerId || !uid) { res.status(400).json({ error: 'Missing trigger id (?t=) or user (?u=).' }); return; }

    const trigDoc = await db().collection('stanley_users').doc(uid).collection('triggers').doc(triggerId).get();
    if (!trigDoc.exists) { res.status(404).json({ error: 'Unknown trigger.' }); return; }
    const trig = trigDoc.data();
    if (trig.enabled === false) { res.status(403).json({ error: 'Trigger disabled.' }); return; }

    const hash = crypto.createHash('sha256').update(token).digest('hex');
    if (!token || hash !== trig.secretHash) { res.status(401).json({ error: 'Invalid token.' }); return; }

    // Fire-and-forget: browser runs can take 10–60s, longer than callers wait.
    // The run records to the user's history; we ack immediately.
    invokeRunner({
      uid,
      workflowId: trig.workflowId,
      trigger: 'Webhook',
      input: { body: req.body || {}, query: req.query || {} },
    }).catch((e) => console.error('[webhook] runner invoke failed:', e.message));

    res.status(202).json({ accepted: true });
  }
);

module.exports = { stanleyScheduleTick, stanleyWebhook };
