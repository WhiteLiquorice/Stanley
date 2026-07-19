const { StanleyFoundationEnhanced } = require('../foundationAgent.enhanced.js');
const { executeGraph } = require('../branchingEngine.js');
const visionResolver = require('../visionResolver.js');
const { BrowserRunRuntime, getBrowserRuntimeServices } = require('./browser-runtime');
const { normalizeModelPolicy } = require('./workflow-platform');
const { commitMonitorCandidates, recordSelectorProposal } = require('./reliability');

class WorkflowPausedForApproval extends Error {
  constructor(message, logs) {
    super(message);
    this.name = 'WorkflowPausedForApproval';
    this.logs = logs;
  }
}

const BROWSER_NODE_TYPES = new Set(['navigate', 'click', 'type', 'scrape', 'open_tab', 'switch_tab', 'close_tab', 'extract', 'extract_list', 'paginate', 'agent', 'ai_agent', 'scroll', 'find_text', 'go_back', 'go_forward', 'send_keys', 'select_dropdown', 'hover', 'drag_drop', 'upload_file', 'download_file', 'monitor', 'vision']);
function workflowNeedsBrowser(workflow) {
  return (workflow.nodes || []).some((node) => BROWSER_NODE_TYPES.has(node.type) || (node.type === 'trigger' && Boolean(node.data?.url)));
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

async function runWorkflowWithContext(workflow, secrets, input, { db, uid, runId, policy = {}, onLog: reportLog, connectorRuntime = null, connectorApproval = null, trust = null, orchestration = null, artifactService = null, onLeaseHeartbeat = null, effectLedgerEnabled = false, skipCompletedNodes = false, twoPhaseMonitors = false, safeEgress = false, providerResilience = false, traceBatching = false, selectorQuarantine = false, distributedBrowserLeases = false } = {}) {
  const logs = [];
  const onLog = (line) => {
    logs.push(line);
    console.log(line);
    reportLog?.(line);
  };
  const routedVision = visionResolver.createRoutedResolver(normalizeModelPolicy(workflow), (usage) => onLog(`[Model] ${usage.purpose} via ${usage.model}${usage.fallback ? ' (fallback)' : ''} in ${usage.durationMs}ms.`));

  const needsBrowser = workflowNeedsBrowser(workflow);
  const hasStartUrl = (workflow.nodes || []).some((node) =>
    ['trigger', 'navigate', 'open_tab'].includes(node.type) &&
    node.data?.url && !['https://', 'http://'].includes(node.data.url)
  );
  if (needsBrowser && !hasStartUrl) throw new Error('Browser workflow has no valid starting URL.');

  const browserRuntime = db && uid && runId ? new BrowserRunRuntime({
    services: getBrowserRuntimeServices(db), uid, runId, workflowId: workflow.id,
    sessionId: workflow.browserSessionId || workflow.id,
    sessionRetentionDays: workflow.browserPolicy?.sessionRetentionDays || 30,
    traceBatching,
    distributedBrowserLeases,
  }) : null;
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

  let runtimeOutcome = 'failed';
  try {
    const ensureBrowser = async () => {
      if (agent.page) return;
      if (browserRuntime) agent.config.storageState = await browserRuntime.prepare();
      onLog('[Runner] Initializing cloud browser…');
      await agent.initialize();
      if (browserRuntime) await browserRuntime.attach(agent);
    };

    const engineDb = db && uid ? createEngineDb(db, uid) : null;
    const scraped = await executeGraph(agent, workflow, {
      onLog,
      secrets,
      input,
      visionResolver: routedVision,
      ensureBrowser,
      db: engineDb,
      uid,
      runId,
      connectorRuntime,
      connectorApproval,
      trust,
      orchestration,
      browserRuntime,
      artifactService,
      onLeaseHeartbeat,
      effectLedgerEnabled,
      skipCompletedNodes,
      twoPhaseMonitors,
      safeEgress,
      providerResilience,
      allowAgenticRecovery: policy.allowAgenticRecovery === true,
      maxSteps: policy.maxGraphSteps || 500,
      deadlineAtMs: Date.now() + Number(policy.maxExecutionMs || 5 * 60 * 1000),
      onSelfHealed: async (nodeId, healedSelector) => {
        if (!db || !uid || !workflow.id) return;
        if (selectorQuarantine) {
          const proposal = await recordSelectorProposal(db, uid, workflow.id, nodeId, healedSelector, runId);
          onLog(`[Memory] Observed selector candidate for node "${nodeId}" (${proposal.observations} successful recovery observation(s)); awaiting promotion.`);
          return;
        }
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
        if (browserRuntime) {
          let takeoverException = null;
          if (trust?.store) {
            takeoverException = await trust.store.openException(uid, {
              runId, workflowId: workflow.id, kind: 'browser_takeover', severity: 'warning',
              title: 'Browser needs your help', summary: `${label}: ${block.hint}`,
              evidence: { takeoverAvailable: true, reason: block.hint },
            });
            trust.failureRecorded = true;
          }
          await browserRuntime.handleBlocked(agent, block, label);
          if (takeoverException) await trust.store.resolveException(uid, takeoverException.id, { action: 'interactive_takeover_resumed', note: 'The operator safely resumed the browser run.' });
          return;
        }
        throw new Error(`${label} Blocked by ${block.hint}.`);
      },
    });
    onLog('[Runner] Workflow completed successfully.');
    if (twoPhaseMonitors) {
      const commits = await commitMonitorCandidates(db, uid, runId);
      if (commits.length) onLog(`[Monitor] Committed ${commits.filter((item) => item.status === 'committed').length} successful baseline update(s).`);
    }
    runtimeOutcome = 'completed';
    return { logs, scraped, modelUsage: routedVision.usage, modelCalls: routedVision.usage.calls };
  } catch (error) {
    if (error.message === 'WORKFLOW_PAUSED_FOR_APPROVAL') {
      throw new WorkflowPausedForApproval(error.message, logs);
    }
    onLog(`[Runner] ERROR: ${error.message}`);
    error.logs = logs;
    throw error;
  } finally {
    onLog('[Runner] Cleaning up browser…');
    if (browserRuntime) await browserRuntime.close(agent, runtimeOutcome).catch((error) => onLog(`[Runner] Browser runtime finalization warning: ${error.message}`));
    await agent.cleanup().catch(() => {});
  }
}

module.exports = { BROWSER_NODE_TYPES, WorkflowPausedForApproval, runWorkflowWithContext, workflowNeedsBrowser };
