const { LearningService, LearningStore, createLearningRouter } = require('../../learning-engine');
const { fingerprint } = require('../../connector-engine/src/artifact');

function installLearningOverlay({ app, express, db, authenticateUser, proposeOperations }) {
  if (!app || !express || !db || !authenticateUser || !proposeOperations) throw new Error('Learning overlay requires app, Express, database, auth, and a constrained proposer.');
  const store = new LearningStore(db);
  const workflowRef = (uid, workflowId) => db.collection('stanley_users').doc(uid).collection('workflows').doc(workflowId);
  const service = new LearningService({
    store, proposeOperations,
    loadWorkflow: async (uid, workflowId) => { const snap = await workflowRef(uid, workflowId).get(); if (!snap.exists) throw new Error('Workflow not found.'); return { id: snap.id, ...snap.data() }; },
    saveWorkflow: async (uid, workflow) => { const { id, ...data } = workflow; const ref = workflowRef(uid, id); await db.runTransaction(async (tx) => { const snap = await tx.get(ref); if (!snap.exists) throw new Error('Workflow not found during learning promotion.'); const current = snap.data(); const priorFingerprint = fingerprint({ id, nodes: current.nodes || [], edges: current.edges || [], assertions: current.assertions || [] }); tx.create(ref.collection('versions').doc(priorFingerprint.slice(0, 24)), { ...current, workflowId: id, fingerprint: priorFingerprint, archivedAt: new Date().toISOString(), source: 'learning_promotion' }); tx.set(ref, { ...data, version: Number(current.version || 1) + 1, updatedAt: new Date().toISOString() }); }); return workflow; },
    executeCase: async ({ regressionCase }) => { if (!regressionCase.replayResult) throw new Error('Production regression testing requires a redacted recorded replay result.'); return regressionCase.replayResult; },
  });
  app.use('/v1/learning', async (req, res, next) => { try { req.uid = await authenticateUser(req); next(); } catch (error) { res.status(error.status || 401).json({ success: false, error: error.message }); } }, createLearningRouter({ express, service, requireUser: async (req) => req.uid, loadRegressionCases: async (uid, proposalId, body) => { if (Array.isArray(body.cases) && body.cases.length) return body.cases; const proposal = await service.requireProposal(uid, proposalId); const snapshot = await db.collection('stanley_users').doc(uid).collection('runs').where('workflowId', '==', proposal.workflowId).limit(50).get(); const cases = snapshot.docs.flatMap((doc) => (doc.data().regressionCases || []).map((item) => ({ ...item, sourceRunId: doc.id }))).filter((item) => item.replayResult); if (!cases.length) throw new Error('No redacted recorded regression replays are available for this workflow.'); return cases; } }));
  return service;
}

module.exports = { installLearningOverlay };
