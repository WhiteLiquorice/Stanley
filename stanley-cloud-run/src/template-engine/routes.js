function createTemplateRouter({ express, service, requireUser }) {
  const router = express.Router();
  const handle = (fn) => async (req, res) => { try { const uid = await requireUser(req); await fn(uid, req, res); } catch (error) { res.status(error.status || 422).json({ success: false, error: error.message }); } };
  router.get('/', handle(async (uid, req, res) => res.json({ success: true, templates: await service.list(uid, { state: req.query.state, visibility: req.query.visibility, limit: req.query.limit }) })));
  router.post('/from-connector', handle(async (uid, req, res) => res.status(201).json({ success: true, template: await service.fromConnector(uid, req.body?.connectorId, req.body?.version, { ...req.body, createdBy: uid }) })));
  router.post('/from-skill', handle(async (uid, req, res) => res.status(201).json({ success: true, template: await service.fromSkill(uid, req.body?.skillId, req.body?.version, { ...req.body, createdBy: uid }) })));
  router.post('/:templateId/versions/:version/settings', handle(async (uid, req, res) => res.json({ success: true, template: await service.updateDraft(uid, req.params.templateId, req.params.version, req.body || {}) })));
  router.post('/:templateId/versions/:version/approve', handle(async (uid, req, res) => res.json({ success: true, template: await service.approve(uid, req.params.templateId, req.params.version, { type: 'human', uid }, req.body?.note || '') })));
  router.post('/:templateId/versions/:version/publish', handle(async (uid, req, res) => res.json({ success: true, template: await service.publish(uid, req.params.templateId, req.params.version, uid) })));
  router.post('/:templateId/versions/:version/retire', handle(async (uid, req, res) => res.json({ success: true, template: await service.retire(uid, req.params.templateId, req.params.version, uid) })));
  router.post('/:templateId/versions/:version/use', handle(async (uid, req, res) => res.json({ success: true, template: await service.recordUse(uid, req.params.templateId, req.params.version) })));
  return router;
}
module.exports = { createTemplateRouter };
