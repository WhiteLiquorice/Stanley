const { StanleyFoundationEnhanced } = require('../foundationAgent.enhanced.js');
const { executeGraph } = require('../branchingEngine.js');
const visionResolver = require('../visionResolver.js');

class WorkflowPausedForApproval extends Error {
  constructor(message, logs) {
    super(message);
    this.name = 'WorkflowPausedForApproval';
    this.logs = logs;
  }
}

function createEngineDb(db, uid) {
  const user = db.collection('stanley_users').doc(uid);
  return {
    collection(name) {
      if (name === 'runs' || name === 'workflows') return user.collection(name);
      return db.collection(name);
    },
  };
}

async function runWorkflowWithContext(workflow, secrets, input, { db, uid, runId, policy = {}, onLog: reportLog, connectorRuntime = null, connectorApproval = null, trust = null, orchestration = null } = {}) {
  const logs = [];
  const onLog = (line) => {
    logs.push(line);
    console.log(line);
    reportLog?.(line);
  };

  const hasStartUrl = (workflow.nodes || []).some((node) =>
    ['trigger', 'navigate', 'open_tab'].includes(node.type) &&
    node.data?.url && !['https://', 'http://'].includes(node.data.url)
  );
  if (!hasStartUrl) throw new Error('Workflow has no valid starting URL.');

  const agent = new StanleyFoundationEnhanced({
    headless: true,
    channel: '',
    statePath: null,
    extraArgs: [
      '--disable-blink-features=AutomationControlled', '--no-sandbox',
      '--disable-dev-shm-usage', '--disable-infobars', '--window-size=1280,800',
      '--disable-extensions', '--disable-gpu', '--lang=en-US,en',
      '--disable-features=IsolateOrigins,site-per-process', '--flag-switches-begin',
      '--disable-site-isolation-trials', '--flag-switches-end',
    ],
  });

  try {
    const ensureBrowser = async () => {
      if (agent.page) return;
      onLog('[Runner] Initializing cloud browser…');
      await agent.initialize();
    };

    const engineDb = db && uid ? createEngineDb(db, uid) : null;
    const scraped = await executeGraph(agent, workflow, {
      onLog,
      secrets,
      input,
      visionResolver,
      ensureBrowser,
      db: engineDb,
      uid,
      runId,
      connectorRuntime,
      connectorApproval,
      trust,
      orchestration,
      allowAgenticRecovery: policy.allowAgenticRecovery === true,
      maxSteps: 1000,
      onSelfHealed: async (nodeId, healedSelector) => {
        if (!db || !uid || !workflow.id) return;
        const ref = db.collection('stanley_users').doc(uid).collection('workflows').doc(workflow.id);
        const snapshot = await ref.get();
        if (!snapshot.exists) return;
        const nodes = snapshot.data().nodes || [];
        const index = nodes.findIndex((node) => node.id === nodeId);
        if (index < 0) return;
        nodes[index] = { ...nodes[index], data: { ...(nodes[index].data || {}), selector: healedSelector } };
        await ref.update({ nodes });
        onLog(`[Memory] Persisted healed selector for node "${nodeId}".`);
      },
      onBlocked: async (block, label) => {
        throw new Error(`${label} Blocked by ${block.hint}.`);
      },
    });
    onLog('[Runner] Workflow completed successfully.');
    return { logs, scraped };
  } catch (error) {
    if (error.message === 'WORKFLOW_PAUSED_FOR_APPROVAL') {
      throw new WorkflowPausedForApproval(error.message, logs);
    }
    onLog(`[Runner] ERROR: ${error.message}`);
    error.logs = logs;
    throw error;
  } finally {
    onLog('[Runner] Cleaning up browser…');
    await agent.cleanup().catch(() => {});
  }
}

module.exports = { WorkflowPausedForApproval, runWorkflowWithContext };
