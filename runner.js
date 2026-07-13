/**
 * runner.js — branching-aware workflow runner for server-side (Playwright) execution.
 */

const path = require('path');
const { StanleyFoundationEnhanced } = require('./stanley-daemon/foundationAgent.enhanced.js');
const { executeGraph } = require('./stanley-daemon/branchingEngine.js');

async function runWorkflow(workflow, onLog, secrets = {}, input = {}) {
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
    const ensureBrowser = async () => {
      if (agent.page) return;
      onLog(`[Runner] Initializing headful browser (Lazy Boot)...`);
      await agent.initialize();
    };

    const scraped = await executeGraph(agent, workflow, {
      onLog,
      secrets,
      ensureBrowser,
      input,
      onSelfHealed: async (nodeId, healedSelector) => {
        try {
          const fs = require('fs');
          const wfFile = path.join(__dirname, 'workflows.json');
          const workflows = JSON.parse(fs.readFileSync(wfFile, 'utf-8'));
          const wfIndex = workflows.findIndex(w => w.id === workflow.id);
          if (wfIndex !== -1) {
            const nodeIndex = workflows[wfIndex].nodes.findIndex(n => n.id === nodeId);
            if (nodeIndex !== -1) {
              workflows[wfIndex].nodes[nodeIndex].data = workflows[wfIndex].nodes[nodeIndex].data || {};
              workflows[wfIndex].nodes[nodeIndex].data.selector = healedSelector;
              // Clear intentFallback since it's hardcoded now
              delete workflows[wfIndex].nodes[nodeIndex].data.intentFallback;
              fs.writeFileSync(wfFile, JSON.stringify(workflows, null, 2));
              onLog(`[Memory] Persisted healed selector for node "${nodeId}" to workflows.json.`);
            }
          }
        } catch (e) {
          onLog(`[Memory] Error saving healed selector: ${e.message}`);
        }
      },
      onBlocked: async (block, label) => {
        onLog(`${label} ${block.hint} — pausing 10s for manual resolution...`);
        if (agent.page) await agent.wait(10000);
      },
    });

    if (agent.page) {
      onLog(`[Runner] Workflow completed successfully! Saving session state...`);
      await agent.saveState();
    } else {
      onLog(`[Runner] API-first workflow completed successfully without launching browser!`);
    }
    return scraped;
  } catch (error) {
    onLog(`[Runner] ERROR: ${error.message}`);
    throw error;
  } finally {
    if (agent.page) {
      onLog(`[Runner] Cleaning up browser processes...`);
      await agent.cleanup();
    }
  }
}

module.exports = { runWorkflow };
