const { ConnectorService, FirestoreConnectorStore, createConnectorRouter } = require('../../connector-engine');
const { TrustStore } = require('../../trust-engine');
const { LearningStore } = require('../../learning-engine');
const { createConnectorRuntime } = require('./connectorExecution');

function installConnectorOverlay({ app, db, authenticateUser, resolveAllSecrets, callModel, logger }) {
  if (!app || !db || !authenticateUser || !resolveAllSecrets) throw new Error('Connector overlay requires app, db, authentication, and vault resolution.');
  const store = new FirestoreConnectorStore(db);
  const trustStore = new TrustStore(db);
  const service = new ConnectorService({ store, trustStore, learningStore: new LearningStore(db), callModel });
  const resolveDeclaredSecrets = async (uid, refs = []) => { const all = await resolveAllSecrets(db, uid); return Object.fromEntries(refs.filter((ref) => Object.prototype.hasOwnProperty.call(all, ref)).map((ref) => [ref, all[ref]])); };
  app.use('/v1/connectors', async (req, res, next) => { try { req.uid = await authenticateUser(req); next(); } catch (error) { res.status(error.status || 401).json({ success: false, error: error.message }); } }, createConnectorRouter({ service, resolveSecrets: (uid) => resolveDeclaredSecrets(uid), requireUser: (req) => req.uid }));
  return { service, trustStore, connectorRuntime: createConnectorRuntime({ service, resolveSecrets: resolveDeclaredSecrets, logger }) };
}

module.exports = { installConnectorOverlay };
