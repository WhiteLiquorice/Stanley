const { FirestoreSkillStore, SkillService, createSkillRouter } = require('../../skill-engine');
const { LearningStore } = require('../../learning-engine');

function installSkillOverlay({ app, db, authenticateUser, runWorkflow, trustStore, resolveAllSecrets, onActivated, artifactService = null }) {
  if (!app || !db || !authenticateUser || !runWorkflow || !trustStore || !resolveAllSecrets) throw new Error('Skill overlay requires app, db, auth, runner, Trust, and vault resolution.');
  const store = new FirestoreSkillStore(db);
  const runner = (workflow, secrets, input, options) => runWorkflow(workflow, secrets, input, { db, uid: options.tenantId, runId: options.runId, policy: { allowAgenticRecovery: false }, artifactService, ...options });
  const service = new SkillService({ store, runner, trustStore, learningStore: new LearningStore(db) });
  const resolveDeclared = async (uid, refs = []) => resolveAllSecrets(db, uid, refs);
  const loadCompilationSource = async (uid, runId) => {
    if (!runId) throw new Error('Source runId is required.');
    const runSnap = await db.collection('stanley_users').doc(uid).collection('runs').doc(runId).get(); if (!runSnap.exists) throw new Error('Source run not found.');
    const run = { id: runSnap.id, ...runSnap.data() }; if (!run.trustReport?.verified) throw new Error('Source run is not verified.');
    const workflowSnap = await db.collection('stanley_users').doc(uid).collection('workflows').doc(run.workflowId).get(); if (!workflowSnap.exists) throw new Error('Source workflow not found.');
    return { workflow: { id: workflowSnap.id, ...workflowSnap.data() }, run, trustReport: run.trustReport, regressionCases: run.regressionCases || [] };
  };
  app.use('/v1/skills', async (req, res, next) => { try { req.uid = await authenticateUser(req); next(); } catch (error) { res.status(error.status || 401).json({ success: false, error: error.message }); } }, createSkillRouter({ service, loadCompilationSource, resolveSecrets: resolveDeclared, requireUser: (req) => req.uid, onActivated }));
  return {
    service,
    async executeBeforeWorkflow({ uid, runId, workflow, input, secrets, mode = 'live', orchestration = null, runnerOptions = {} }) {
      let targetDomain = ''; const urlNode = (workflow.nodes || []).find((node) => node.data?.url); try { targetDomain = new URL(urlNode?.data?.url).hostname; } catch {}
      const preferred = (workflow.capabilityPlan || []).find((item) => item.kind === 'skill');
      return service.selectAndExecute({ tenantId: uid, runId, workflowId: workflow.id, operationName: workflow.operationName, tags: workflow.tags || [], targetDomain, input, secrets, mode, orchestration, runnerOptions, skillId: preferred?.id, skillVersion: preferred?.version });
    },
  };
}

module.exports = { installSkillOverlay };
