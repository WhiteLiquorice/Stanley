const { OPERATIONS } = require('./catalog');
function createNativeIntegrationRouter({ express, authenticateUser }) {
  const router = express.Router();
  router.get('/v1/native-integrations', async (req, res) => { try { await authenticateUser(req); return res.json({ success: true, operations: OPERATIONS }); } catch (error) { return res.status(error.status || 401).json({ success: false, error: error.message }); } });
  return router;
}
module.exports = { createNativeIntegrationRouter };
