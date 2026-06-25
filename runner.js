/**
 * runner.js — branching-aware workflow runner for server-side (Playwright) execution.
 */

const path = require('path');
const { StanleyFoundationEnhanced } = require('./stanley-daemon/foundationAgent.enhanced.js');
const { executeGraph } = require('./stanley-daemon/branchingEngine.js');

async function runWorkflow(workflow, onLog, secrets = {}) {
  onLog(`[Runner] Starting workflow execution: "${workflow.name}"`);

  if (!workflow.nodes || !workflow.nodes.find(n => n.type === 'trigger')) {
    throw new Error('Workflow has no trigger node');
  }

  // Validate trigger URL before launching a browser
  const triggerNode = workflow.nodes.find(n => n.type === 'trigger');
  const triggerUrl = triggerNode?.data?.url || '';
  if (!triggerUrl || triggerUrl === 'https://' || triggerUrl === 'http://' || triggerUrl.length < 8) {
    throw new Error(
      `Workflow trigger URL is empty or invalid ("${triggerUrl}"). ` +
      `Please set a valid starting URL on the trigger node before running.`
    );
  }

  const agent = new StanleyFoundationEnhanced({
    headless: false,
    statePath: path.join(__dirname, '..', 'session_state.json'),
  });

  try {
    onLog(`[Runner] Initializing headful browser...`);
    await agent.initialize();

    const scraped = await executeGraph(agent, workflow, {
      onLog,
      secrets,
      onBlocked: async (block, label) => {
        onLog(`${label} ${block.hint} — pausing 10s for manual resolution...`);
        await agent.wait(10000);
      },
    });

    onLog(`[Runner] Workflow completed successfully! Saving session state...`);
    await agent.saveState();
    return scraped;
  } catch (error) {
    onLog(`[Runner] ERROR: ${error.message}`);
    throw error;
  } finally {
    onLog(`[Runner] Cleaning up browser processes...`);
    await agent.cleanup();
  }
}

module.exports = { runWorkflow };
