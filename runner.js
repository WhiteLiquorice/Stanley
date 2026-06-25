/**
 * runner.js — branching-aware workflow runner.
 *
 * The original walked exactly one edge per node (`edges.find(e => e.source === id)`),
 * so a workflow that forked, had a fallback path, or looped only ever ran the first
 * branch. This version delegates traversal to branchingEngine.executeGraph, which:
 *   - follows conditional edges (success / failure / contains / exists / true / false)
 *   - routes to an `onFailure` edge instead of aborting when a step throws
 *   - supports `condition`/`if` decision nodes (true/false edges)
 *   - allows intentional loops, capped by maxSteps to catch runaways
 *
 * Public signature is unchanged so server.js can swap this in directly:
 *   runWorkflow(workflow, onLog, secrets)
 *
 * NOTE: uses StanleyFoundationEnhanced so stable tab ids and elementExists() work.
 */

const path = require('path');
const { StanleyFoundationEnhanced } = require('./stanley-daemon/foundationAgent.enhanced.js');
const { executeGraph } = require('./stanley-daemon/branchingEngine.js');

async function runWorkflow(workflow, onLog, secrets = {}) {
  onLog(`[Runner] Starting workflow execution: "${workflow.name}"`);

  if (!workflow.nodes || !workflow.nodes.find(n => n.type === 'trigger')) {
    throw new Error('Workflow has no trigger node');
  }

  const agent = new StanleyFoundationEnhanced({
    headless: false, // Keep it visible so the user can watch / solve CAPTCHAs.
    statePath: path.join(__dirname, '..', 'session_state.json'),
  });

  try {
    onLog(`[Runner] Initializing headful browser...`);
    await agent.initialize();

    const scraped = await executeGraph(agent, workflow, {
      onLog,
      secrets,
      // Branching graph runs headful, so a block just pauses for manual resolution.
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
