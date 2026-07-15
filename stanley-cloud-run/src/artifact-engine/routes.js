function createArtifactRouter({ express, authenticateUser, service, handleError }) {
  const router = express.Router(); const fail = (res, error) => handleError ? handleError(res, error) : res.status(error.status || 500).json({ success: false, error: error.message });
  router.post('/v1/artifacts', async (req, res) => { try { const uid = await authenticateUser(req); const encoded = String(req.body?.base64 || '').replace(/\s/g, ''); if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 !== 0) throw Object.assign(new Error('Artifact base64 is invalid.'), { status: 400 }); const buffer = Buffer.from(encoded, 'base64'); const artifact = await service.create(uid, { name: req.body?.name, mimeType: req.body?.mimeType, buffer }); return res.status(201).json({ success: true, artifact }); } catch (error) { return fail(res, error); } });
  router.get('/v1/artifacts', async (req, res) => { try { const uid = await authenticateUser(req); return res.json({ success: true, artifacts: await service.list(uid, req.query.limit) }); } catch (error) { return fail(res, error); } });
  router.get('/v1/artifacts/:artifactId', async (req, res) => { try { const uid = await authenticateUser(req); const result = await service.signedUrl(uid, req.params.artifactId); return res.json({ success: true, ...result }); } catch (error) { return fail(res, error); } });
  router.delete('/v1/artifacts/:artifactId', async (req, res) => { try { const uid = await authenticateUser(req); return res.json({ success: true, artifact: await service.delete(uid, req.params.artifactId) }); } catch (error) { return fail(res, error); } });
  return router;
}
module.exports = { createArtifactRouter };
