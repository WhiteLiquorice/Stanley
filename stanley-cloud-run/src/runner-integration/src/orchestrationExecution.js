const { fingerprint } = require('../../connector-engine');
const { FirestoreOrchestrationStore, OrchestrationCoordinator, OrchestrationRuntime, createRun, transition } = require('../../orchestration-engine');

function publicOrchestration(run) {
  if (!run) return null;
  const waits = Object.fromEntries(Object.entries(run.waits || {}).map(([id, wait]) => [id, { ...wait, tokenHash: undefined }]));
  return { ...run, waits, lease: undefined, effectLedger: undefined };
}

function installOrchestrationOverlay({ app, db, authenticateUser, authenticateInternal = null, dispatch }) {
  if (!app || !db || !authenticateUser || typeof dispatch !== 'function') throw new Error('Orchestration overlay requires app, database, auth, and dispatch.');
  const store = new FirestoreOrchestrationStore(db);
  const coordinator = new OrchestrationCoordinator({ store, dispatch });

  app.get('/v1/orchestrations/:runId', async (req, res) => {
    try { const uid = await authenticateUser(req); const run = await store.get(uid, req.params.runId); if (!run) return res.status(404).json({ success: false, error: 'Orchestration not found.' }); return res.json({ success: true, orchestration: publicOrchestration(run) }); }
    catch (error) { return res.status(error.status || 422).json({ success: false, error: error.message, code: error.code }); }
  });
  app.post('/v1/orchestrations/:runId/events/:correlationId', async (req, res) => {
    try { const uid = await authenticateUser(req); const result = await coordinator.signal(uid, req.params.runId, { correlationId: req.params.correlationId, token: req.body?.token, eventId: req.body?.eventId, type: req.body?.type, payload: req.body?.payload }); return res.status(result.resumed ? 202 : 200).json({ success: true, duplicate: Boolean(result.duplicate), resumed: Boolean(result.resumed), remainingEvents: result.remainingEvents, orchestration: publicOrchestration(result.run) }); }
    catch (error) { return res.status(error.status || 422).json({ success: false, error: error.message, code: error.code }); }
  });
  app.post('/internal/orchestrations/process-due', async (req, res) => { try { if (!authenticateInternal) return res.status(503).json({ success: false, error: 'Internal scheduler authentication is not configured.' }); authenticateInternal(req); const results = await coordinator.processAllDue(); return res.json({ success: true, processed: results.length, results }); } catch (error) { return res.status(error.status || 422).json({ success: false, error: error.message }); } });

  return {
    store, coordinator,
    async runtimeFor({ uid, runId, workflow }) {
      const workflowFingerprint = fingerprint({ id: workflow.id, nodes: workflow.nodes || [], edges: workflow.edges || [], assertions: workflow.assertions || [] });
      let run = await store.get(uid, runId);
      if (!run) { run = await store.create(uid, createRun({ id: runId, tenantId: uid, workflowId: workflow.id, workflowFingerprint })); run = transition(run, 'running', { reason: 'execution_started' }); await store.save(uid, run); }
      else if (run.state === 'queued') { run = await coordinator.claimResume(uid, runId, workflowFingerprint); if (!run) throw Object.assign(new Error('Durable run is already leased.'), { code: 'ORCHESTRATION_LEASED' }); }
      else if (run.state !== 'running') throw Object.assign(new Error(`Durable run cannot execute from ${run.state}.`), { code: 'ORCHESTRATION_STATE' });
      return new OrchestrationRuntime({ coordinator, uid, runId, workflowFingerprint });
    },
  };
}

module.exports = { installOrchestrationOverlay, publicOrchestration };
