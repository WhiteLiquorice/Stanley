const { FirestoreMonitoringStore, MonitoringService, OutcomeMonitoringService, createMonitoringRouter } = require('../../monitoring-engine');

function installMonitoringOverlay({ app, express, db, authenticateUser, authenticateInternal = null, connectorService = null, resolveAllSecrets = null, trustStore = null }) {
  if (!app || !express || !db || !authenticateUser) throw new Error('Monitoring overlay requires app, Express, database, and auth.');
  const workflowRef = (uid, workflowId) => db.collection('stanley_users').doc(uid).collection('workflows').doc(workflowId);
  const store = new FirestoreMonitoringStore(db);
  const service = new MonitoringService({
    store,
    policyFor: async (uid, workflowId) => { const snap = await workflowRef(uid, workflowId).get(); return snap.exists ? snap.data().monitoringPolicy || {} : {}; },
    onBreach: async (uid, { alert, evaluation }) => { if (alert.severity !== 'critical' || !evaluation.policy.autoPause) return; await workflowRef(uid, alert.workflowId).set({ monitoringState: 'paused', monitoringPause: { alertId: alert.id, reason: alert.breaches.map((breach) => breach.code).join(', '), pausedAt: new Date().toISOString(), automatic: true } }, { merge: true }); },
  });
  const outcomes = connectorService && resolveAllSecrets ? new OutcomeMonitoringService({ store, executeSource: async (uid, source) => { if (source.type && source.type !== 'connector') throw new Error('Only approved read connector sources are supported.'); const artifact = await connectorService.store.getActive(uid, source.connectorId); if (!artifact || artifact.readWrite !== 'read') throw new Error('Outcome sources must be active read-only connectors.'); const all = await resolveAllSecrets(db, uid); const secrets = Object.fromEntries((artifact.requiredVaultRefs || []).map((ref) => [ref, all[ref]]).filter(([, value]) => value !== undefined)); const result = await connectorService.execute({ tenantId: uid, connectorId: source.connectorId, input: source.input || {}, secrets, mode: 'live', workflowId: `monitor:${source.connectorId}` }); return source.outputPath ? String(source.outputPath).split('.').reduce((value, key) => value?.[key], result.output) : result.output; }, openException: async (uid, exception) => trustStore?.openException(uid, exception) }) : null;
  app.use('/v1/monitoring', async (req, res, next) => { try { req.uid = await authenticateUser(req); next(); } catch (error) { res.status(error.status || 401).json({ success: false, error: error.message }); } }, createMonitoringRouter({ express, service, requireUser: async (req) => req.uid }));
  if (outcomes) {
    app.get('/v1/outcome-monitors', async (req, res) => { try { const uid = await authenticateUser(req); res.json({ success: true, monitors: await store.listMonitors(uid) }); } catch (error) { res.status(422).json({ success: false, error: error.message }); } });
    app.post('/v1/outcome-monitors', async (req, res) => { try { const uid = await authenticateUser(req); res.status(201).json({ success: true, monitor: await outcomes.create(uid, req.body || {}) }); } catch (error) { res.status(422).json({ success: false, error: error.message }); } });
    app.post('/v1/outcome-monitors/:id/approve', async (req, res) => { try { const uid = await authenticateUser(req); res.json({ success: true, monitor: await outcomes.approve(uid, req.params.id, { type: 'human', uid }) }); } catch (error) { res.status(422).json({ success: false, error: error.message }); } });
    app.post('/v1/outcome-monitors/:id/evaluate', async (req, res) => { try { const uid = await authenticateUser(req); res.json({ success: true, evaluation: await outcomes.evaluate(uid, req.params.id) }); } catch (error) { res.status(422).json({ success: false, error: error.message }); } });
    app.post('/internal/outcome-monitors/process-due', async (req, res) => { try { if (!authenticateInternal) throw Object.assign(new Error('Internal authentication is not configured.'), { status: 503 }); authenticateInternal(req); const results = await outcomes.evaluateDue(); res.json({ success: true, processed: results.length, results }); } catch (error) { res.status(error.status || 422).json({ success: false, error: error.message }); } });
  }
  return { service, outcomes, assertAllowed(workflow) { if (workflow.monitoringState === 'paused') throw Object.assign(new Error('Workflow is automatically paused by outcome monitoring.'), { code: 'MONITORING_PAUSED' }); }, record: (uid, fields) => service.record(uid, fields) };
}

module.exports = { installMonitoringOverlay };
