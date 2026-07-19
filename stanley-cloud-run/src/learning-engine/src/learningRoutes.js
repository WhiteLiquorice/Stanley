function createLearningRouter({ express, service, requireUser, loadRegressionCases }) {
  const router = express.Router(); const handle = (fn) => async (req, res) => { try { const uid = await requireUser(req); await fn(uid, req, res); } catch (error) { res.status(error.status || 422).json({ success: false, error: error.message, code: error.code }); } };
  router.get('/cases', handle(async (uid, req, res) => res.json({ success: true, cases: await service.store.list(uid, 'learning_cases', { state: req.query.state, limit: req.query.limit }) })));
  router.get('/proposals', handle(async (uid, req, res) => res.json({ success: true, proposals: await service.store.list(uid, 'repair_proposals', { state: req.query.state, limit: req.query.limit }) })));
  router.get('/rollouts', handle(async (uid, req, res) => res.json({ success: true, rollouts: await service.store.list(uid, 'learning_rollouts', { state: req.query.state, limit: req.query.limit }) })));
  router.post('/cases/:caseId/propose', handle(async (uid, req, res) => res.status(201).json({ success: true, proposal: await service.propose(uid, req.params.caseId) })));
  router.post('/proposals/:proposalId/test', handle(async (uid, req, res) => res.json({ success: true, proposal: await service.test(uid, req.params.proposalId, await loadRegressionCases(uid, req.params.proposalId, req.body || {})) })));
  router.post('/proposals/:proposalId/approve', handle(async (uid, req, res) => res.json({ success: true, proposal: await service.approve(uid, req.params.proposalId, { type: 'human', uid, note: req.body?.note || '' }) })));
  router.post('/proposals/:proposalId/reject', handle(async (uid, req, res) => res.json({ success: true, proposal: await service.reject(uid, req.params.proposalId, { type: 'human', uid }, req.body?.reason) })));
  router.post('/proposals/:proposalId/rollout', handle(async (uid, req, res) => res.status(201).json({ success: true, rollout: await service.startRollout(uid, req.params.proposalId, req.body || {}) })));
  router.post('/rollouts/:rolloutId/canary', handle(async (uid, req, res) => res.json({ success: true, rollout: await service.advanceToCanary(uid, req.params.rolloutId, req.body?.percentage) })));
  return router;
}
module.exports = { createLearningRouter };
