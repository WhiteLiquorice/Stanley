function createBrowserRuntimeRouter({ express, authenticateUser, services, handleError }) {
  const router = express.Router();
  const respond = (res, next, error) => handleError ? handleError(res, error) : res.status(error.status || 500).json({ success: false, error: error.message });
  const token = (req) => String(req.headers['x-stanley-takeover-token'] || '');

  router.get('/v1/runs/:runId/takeover', async (req, res, next) => {
    try { const uid = await authenticateUser(req); const takeover = await services.takeover.get(uid, req.params.runId); if (!takeover) return res.status(404).json({ success: false, error: 'Takeover not found.' }); return res.json({ success: true, takeover }); }
    catch (error) { return respond(res, next, error); }
  });
  router.get('/v1/runs/:runId/browser-trace', async (req, res, next) => {
    try {
      const uid = await authenticateUser(req); const events = await services.store.listTrace(uid, req.params.runId, req.query.limit);
      return res.json({ success: true, trace: { schemaVersion: 1, runId: req.params.runId, privacyMode: 'metadata_only', events } });
    } catch (error) { return respond(res, next, error); }
  });
  router.post('/v1/runs/:runId/takeover/claim', async (req, res, next) => {
    try { const uid = await authenticateUser(req); return res.json({ success: true, ...(await services.takeover.claim(uid, req.params.runId)) }); }
    catch (error) { return respond(res, next, error); }
  });
  router.post('/v1/runs/:runId/takeover/heartbeat', async (req, res, next) => {
    try { const uid = await authenticateUser(req); return res.json({ success: true, ...(await services.takeover.heartbeat(uid, req.params.runId, token(req))) }); }
    catch (error) { return respond(res, next, error); }
  });
  router.post('/v1/runs/:runId/takeover/commands', async (req, res, next) => {
    try { const uid = await authenticateUser(req); const command = await services.takeover.command(uid, req.params.runId, token(req), req.body || {}); return res.status(202).json({ success: true, command }); }
    catch (error) { return respond(res, next, error); }
  });
  return router;
}

module.exports = { createBrowserRuntimeRouter };
