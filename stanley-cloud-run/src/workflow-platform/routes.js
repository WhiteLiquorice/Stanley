const { buildDebugWorkflow, shadowSideEffects } = require('./debug');
const { normalizeContextPolicy, normalizeModelPolicy, normalizeWorkflowContract, validateWorkflowInput, validateWorkflowOutput } = require('./contract');

function createWorkflowPlatformRouter({ express, authenticateUser, service, loadWorkflow, executeDebug, replayRun, publicBaseUrl, handleError }) {
  const router = express.Router(); const fail = (res, error) => handleError ? handleError(res, error) : res.status(error.status || 500).json({ success: false, error: error.message });
  router.get('/v1/workflows/:workflowId/platform', async (req, res) => { try { const uid = await authenticateUser(req); const workflow = await loadWorkflow(uid, req.params.workflowId); return res.json({ success: true, platform: { contract: normalizeWorkflowContract(workflow), modelPolicy: normalizeModelPolicy(workflow), contextPolicy: normalizeContextPolicy(workflow), regressionCases: workflow.regressionCases || [], environments: workflow.environments || {}, activeProductionReleaseId: workflow.activeProductionReleaseId || null } }); } catch (error) { return fail(res, error); } });
  router.put('/v1/workflows/:workflowId/platform', async (req, res) => { try { const uid = await authenticateUser(req); return res.json({ success: true, workflow: await service.configure(uid, req.params.workflowId, req.body || {}) }); } catch (error) { return fail(res, error); } });
  router.get('/v1/workflows/:workflowId/clients', async (req, res) => { try { const uid = await authenticateUser(req); const workflow = await loadWorkflow(uid, req.params.workflowId); return res.json({ success: true, contract: normalizeWorkflowContract(workflow), clients: service.clients(publicBaseUrl || `${req.protocol}://${req.get('host')}`, workflow) }); } catch (error) { return fail(res, error); } });
  router.get('/v1/workflows/:workflowId/releases', async (req, res) => { try { const uid = await authenticateUser(req); return res.json({ success: true, releases: await service.store.listReleases(uid, req.params.workflowId, req.query.limit) }); } catch (error) { return fail(res, error); } });
  router.post('/v1/workflows/:workflowId/releases', async (req, res) => { try { const uid = await authenticateUser(req); return res.status(201).json({ success: true, release: await service.createRelease(uid, req.params.workflowId, req.body || {}) }); } catch (error) { return fail(res, error); } });
  router.post('/v1/workflows/:workflowId/releases/:releaseId/regression', async (req, res) => {
    try {
      const uid = await authenticateUser(req); const release = await service.store.getRelease(uid, req.params.workflowId, req.params.releaseId); if (!release) return res.status(404).json({ success: false, error: 'Release not found.' });
      const cases = Array.isArray(req.body?.cases) ? req.body.cases.slice(0, 50) : release.regressionCases || []; if (!cases.length) throw Object.assign(new Error('At least one regression case is required.'), { status: 400 });
      const results = [];
      for (const item of cases) {
        const startedAt = Date.now();
        try { validateWorkflowInput(release, item.input || {}); const execution = await executeDebug(uid, shadowSideEffects(release), { input: item.input || {}, runId: `reg-${release.id}-${String(item.id || results.length)}` }); const output = validateWorkflowOutput(release, execution.scraped || {}); const passed = item.expectedOutput === undefined || JSON.stringify(output) === JSON.stringify(item.expectedOutput); results.push({ id: item.id || `case-${results.length + 1}`, passed, durationMs: Date.now() - startedAt, output: passed ? output : undefined, error: passed ? null : 'Output did not match expectedOutput.' }); }
        catch (error) { results.push({ id: item.id || `case-${results.length + 1}`, passed: false, durationMs: Date.now() - startedAt, error: error.message }); }
      }
      const regression = await service.recordRegression(uid, req.params.workflowId, release.id, { passed: results.every((item) => item.passed), total: results.length, passedCount: results.filter((item) => item.passed).length, results }); return res.json({ success: regression.passed, regression });
    } catch (error) { return fail(res, error); }
  });
  router.post('/v1/workflows/:workflowId/releases/:releaseId/promote', async (req, res) => { try { const uid = await authenticateUser(req); return res.json({ success: true, release: await service.promote(uid, req.params.workflowId, req.params.releaseId, req.body?.environment) }); } catch (error) { return fail(res, error); } });
  router.post('/v1/workflows/:workflowId/releases/:releaseId/rollback', async (req, res) => { try { const uid = await authenticateUser(req); return res.json({ success: true, release: await service.rollback(uid, req.params.workflowId, req.params.releaseId) }); } catch (error) { return fail(res, error); } });
  router.post('/v1/workflows/:workflowId/debug', async (req, res) => { try { const uid = await authenticateUser(req); const workflow = await loadWorkflow(uid, req.params.workflowId); validateWorkflowInput(workflow, req.body?.input || {}); const debugWorkflow = buildDebugWorkflow(workflow, { nodeId: req.body?.nodeId, mode: req.body?.mode || 'through', allowSideEffects: false }); const result = await executeDebug(uid, debugWorkflow, { input: req.body?.input || {}, runId: `debug-${Date.now().toString(36)}` }); return res.json({ success: true, debug: { workflow: { id: debugWorkflow.id, nodeIds: debugWorkflow.nodes.map((node) => node.id) }, logs: result.logs, scraped: result.scraped } }); } catch (error) { return fail(res, error); } });
  router.post('/v1/runs/:runId/replay', async (req, res) => { try { const uid = await authenticateUser(req); return res.status(202).json({ success: true, run: await replayRun(uid, req.params.runId) }); } catch (error) { return fail(res, error); } });
  return router;
}
module.exports = { createWorkflowPlatformRouter };
