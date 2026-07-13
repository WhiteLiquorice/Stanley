function createTrustRouter({ express, authenticateUser, store, onRetry, handleError }) {
  if (!express || !authenticateUser || !store) throw new Error('Trust routes require express, authenticateUser, and store.');
  const router = express.Router();

  router.get('/v1/exceptions', async (req, res, next) => {
    try {
      const uid = await authenticateUser(req);
      const exceptions = await store.listExceptions(uid, {
        state: String(req.query.state || 'open'),
        limit: Number(req.query.limit || 50),
      });
      res.json({ success: true, exceptions });
    } catch (error) { respondError(res, next, error, handleError); }
  });

  router.post('/v1/exceptions/:exceptionId/resolve', async (req, res, next) => {
    try {
      const uid = await authenticateUser(req);
      const exception = await store.resolveException(uid, req.params.exceptionId, req.body || {});
      if (!exception) return res.status(404).json({ success: false, error: 'Exception not found.' });
      return res.json({ success: true, exception });
    } catch (error) { return respondError(res, next, error, handleError); }
  });

  router.post('/v1/exceptions/:exceptionId/retry', async (req, res, next) => {
    try {
      const uid = await authenticateUser(req);
      if (!onRetry) return res.status(501).json({ success: false, error: 'Checkpoint retry is not connected.' });
      const result = await onRetry({ uid, exceptionId: req.params.exceptionId, body: req.body || {} });
      return res.status(202).json({ success: true, ...result });
    } catch (error) { return respondError(res, next, error, handleError); }
  });

  router.get('/v1/runs/:runId/receipts', async (req, res, next) => {
    try {
      const uid = await authenticateUser(req);
      const receipts = await store.listReceipts(uid, req.params.runId, Number(req.query.limit || 100));
      res.json({ success: true, receipts });
    } catch (error) { respondError(res, next, error, handleError); }
  });

  router.get('/v1/runs/:runId/checkpoint', async (req, res, next) => {
    try {
      const uid = await authenticateUser(req);
      const checkpoint = await store.latestCheckpoint(uid, req.params.runId);
      if (!checkpoint) return res.status(404).json({ success: false, error: 'Checkpoint not found.' });
      return res.json({ success: true, checkpoint });
    } catch (error) { return respondError(res, next, error, handleError); }
  });

  return router;
}

function respondError(res, next, error, handleError) {
  if (handleError) return handleError(res, error);
  if (res.headersSent) return next(error);
  return res.status(Number(error.status || 500)).json({ success: false, error: error.message || 'Unexpected error.' });
}

module.exports = { createTrustRouter, respondError };
