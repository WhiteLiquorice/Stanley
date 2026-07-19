function createConversationRouter({ express, authenticateUser, service, applicationService = null, handleError }) {
  if (!express || !authenticateUser || !service) throw new Error('Conversation routes require Express, auth, and service.');
  const router = express.Router();
  router.post('/v1/conversations/plan', async (req, res) => {
    try {
      const uid = await authenticateUser(req);
      const result = await service.plan(uid, req.body || {});
      return res.json({ success: true, ...result });
    } catch (error) {
      if (handleError) return handleError(res, error);
      return res.status(error.status || 500).json({ success: false, error: error.message || 'Conversation planning failed.' });
    }
  });
  router.post('/v1/conversations/proposals/:proposalId/apply', async (req, res) => {
    try {
      if (!applicationService) throw Object.assign(new Error('Conversation proposal application is unavailable.'), { status: 503 });
      const uid = await authenticateUser(req);
      const result = await applicationService.apply(uid, req.params.proposalId, req.body || {});
      return res.json({ success: true, ...result });
    } catch (error) {
      if (handleError) return handleError(res, error);
      return res.status(error.status || 500).json({ success: false, error: error.message || 'Conversation proposal application failed.' });
    }
  });
  return router;
}

module.exports = { createConversationRouter };
