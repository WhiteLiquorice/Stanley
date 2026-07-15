const express = require('express');

function createSkillRouter({ service, requireUser = (req) => req.uid, loadCompilationSource, resolveSecrets, onActivated = null }) {
  if (!service || typeof loadCompilationSource !== 'function') throw new Error('Skill router requires service and compilation source loader.');
  const router = express.Router(); router.use(express.json({ limit: '512kb' }));
  const handle = (fn) => async (req, res) => { try { const uid = await requireUser(req); if (!uid) return res.status(401).json({ success: false, error: 'Authentication required.' }); await fn(uid, req, res); } catch (error) { res.status(422).json({ success: false, error: error.message, code: error.code }); } };
  router.get('/', handle(async (uid, req, res) => res.json({ success: true, skills: await service.store.list(uid, { workflowId: req.query.workflowId, state: req.query.state }) })));
  router.post('/compile', handle(async (uid, req, res) => { const source = await loadCompilationSource(uid, req.body?.runId); const skill = await service.compile({ tenantId: uid, ...source, name: req.body?.name, operationName: req.body?.operationName, inputSchema: req.body?.inputSchema, outputSchema: req.body?.outputSchema, match: req.body?.match, regressionCases: req.body?.regressionCases || source.regressionCases || [] }); res.status(201).json({ success: true, skill }); }));
  router.post('/:skillId/versions/:version/test', handle(async (uid, req, res) => { const skill = await service.requireVersion(uid, req.params.skillId, req.params.version); const secrets = resolveSecrets ? await resolveSecrets(uid, skill.requiredVaultRefs) : {}; res.json({ success: true, skill: await service.test(uid, req.params.skillId, req.params.version, secrets) }); }));
  router.post('/:skillId/versions/:version/approve', handle(async (uid, req, res) => res.json({ success: true, skill: await service.approve(uid, req.params.skillId, req.params.version, { uid, type: 'human', note: req.body?.note || '' }) })));
  router.post('/:skillId/versions/:version/activate', handle(async (uid, req, res) => { const skill = await service.activate(uid, req.params.skillId, req.params.version); const template = onActivated ? await onActivated(uid, skill) : null; res.json({ success: true, skill, template }); }));
  router.post('/:skillId/rollback/:version', handle(async (uid, req, res) => res.json({ success: true, skill: await service.store.setActiveVersion(uid, req.params.skillId, req.params.version) })));
  return router;
}

module.exports = { createSkillRouter };
