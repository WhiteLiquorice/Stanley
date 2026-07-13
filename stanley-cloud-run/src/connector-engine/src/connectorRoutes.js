const express = require('express');

function createConnectorRouter({ service, resolveSecrets, requireUser = (req) => req.uid }) {
  if (!service) throw new Error('Connector router requires a service.');
  const router = express.Router();
  router.use(express.json({ limit: '512kb' }));
  const handler = (fn) => async (req, res) => { try { const uid = await requireUser(req); if (!uid) return res.status(401).json({ success: false, error: 'Authentication required.' }); await fn(uid, req, res); } catch (error) { res.status(error.code === 'APPROVAL_REQUIRED' ? 409 : 422).json({ success: false, error: error.message, code: error.code }); } };
  router.get('/', handler(async (uid, req, res) => res.json({ success: true, connectors: await service.store.list(uid, { state: req.query.state }) })));
  router.post('/generate', handler(async (uid, req, res) => { const discovery = service.discover(uid, { ...req.body, tenantId: uid }); res.status(201).json({ success: true, connector: await service.generate(discovery) }); }));
  router.get('/:connectorId/versions', handler(async (uid, req, res) => res.json({ success: true, connectors: await service.store.list(uid, { connectorId: req.params.connectorId }) })));
  router.post('/', handler(async (uid, req, res) => res.status(201).json({ success: true, connector: await service.createDraft({ ...req.body, tenantId: uid }) })));
  router.post('/:connectorId/versions/:version/inspect', handler(async (uid, req, res) => res.json({ success: true, connector: await service.inspect(uid, req.params.connectorId, req.params.version) })));
  router.post('/:connectorId/versions/:version/test', handler(async (uid, req, res) => { const artifact = await service.requireVersion(uid, req.params.connectorId, req.params.version); const secrets = resolveSecrets ? await resolveSecrets(uid, artifact.requiredVaultRefs) : {}; res.json({ success: true, connector: await service.test(uid, req.params.connectorId, req.params.version, secrets) }); }));
  router.post('/:connectorId/versions/:version/approve', handler(async (uid, req, res) => res.json({ success: true, connector: await service.approve(uid, req.params.connectorId, req.params.version, { uid, type: 'human', note: req.body?.note || '' }) })));
  router.post('/:connectorId/versions/:version/publish', handler(async (uid, req, res) => res.json({ success: true, connector: await service.publish(uid, req.params.connectorId, req.params.version) })));
  router.post('/:connectorId/versions/:version/execute', handler(async (uid, req, res) => { const artifact = await service.requireVersion(uid, req.params.connectorId, req.params.version); const secrets = resolveSecrets ? await resolveSecrets(uid, artifact.requiredVaultRefs) : {}; const result = await service.execute({ tenantId: uid, connectorId: req.params.connectorId, version: req.params.version, input: req.body?.input || {}, secrets, mode: req.body?.mode }); res.json({ success: true, result }); }));
  router.post('/:connectorId/versions/:version/repairs', handler(async (uid, req, res) => res.status(201).json({ success: true, proposal: await service.proposeRepair(uid, req.params.connectorId, req.params.version, req.body?.failureFingerprint) })));
  router.post('/:connectorId/versions/:version/repairs/:proposalId/apply', handler(async (uid, req, res) => res.status(201).json({ success: true, connector: await service.applyStoredRepair(uid, req.params.connectorId, req.params.version, req.params.proposalId) })));
  router.post('/:connectorId/rollback/:version', handler(async (uid, req, res) => res.json({ success: true, connector: await service.rollback(uid, req.params.connectorId, req.params.version, { uid, type: 'human' }) })));
  return router;
}

module.exports = { createConnectorRouter };
