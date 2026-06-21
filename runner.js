const { StanleyFoundation } = require('./foundationAgent.js');
const path = require('path');

/**
 * Runs a serialized workflow configuration.
 * @param {object} workflow - The workflow object containing nodes and edges.
 * @param {function} onLog - Callback function for streaming real-time execution logs.
 * @param {object} secrets - Map of vault secret IDs to their decrypted values.
 */
async function runWorkflow(workflow, onLog, secrets = {}) {
  onLog(`[Runner] Starting workflow execution: "${workflow.name}"`);

  // Build a map of nodes by ID for traversal
  const nodesMap = {};
  workflow.nodes.forEach(n => {
    nodesMap[n.id] = n;
  });

  // Find start node (trigger node)
  const triggerNode = workflow.nodes.find(n => n.type === 'trigger');
  if (!triggerNode) {
    throw new Error('Workflow has no trigger node');
  }

  // Basic sequence finder: we follow the edges in order
  const executionOrder = [triggerNode];
  let currentNode = triggerNode;

  while (true) {
    const edge = workflow.edges.find(e => e.source === currentNode.id);
    if (!edge) break;
    const nextNode = nodesMap[edge.target];
    if (!nextNode) break;
    executionOrder.push(nextNode);
    currentNode = nextNode;
  }

  onLog(`[Runner] Identified ${executionOrder.length} steps in sequence.`);

  // Initialize StanleyFoundation
  const agent = new StanleyFoundation({
    headless: false, // Let's keep it visible so they can see the automation running!
    statePath: path.join(__dirname, 'session_state.json')
  });

  try {
    onLog(`[Runner] Initializing headful browser...`);
    await agent.initialize();

    for (let i = 0; i < executionOrder.length; i++) {
      const node = executionOrder[i];
      const stepLabel = `[Step ${i + 1}/${executionOrder.length}] (${node.label || node.type})`;
      
      onLog(`${stepLabel} Executing...`);

      switch (node.type) {
        case 'trigger': {
          const url = node.data?.url;
          if (url) {
            onLog(`${stepLabel} Triggering navigation to: ${url}`);
            await agent.navigate(url);
          } else {
            onLog(`${stepLabel} Trigger node executed (no initial URL).`);
          }
          break;
        }

        case 'navigate': {
          const url = node.data?.url;
          if (!url) throw new Error('Navigate node missing URL');
          onLog(`${stepLabel} Navigating to: ${url}`);
          await agent.navigate(url);
          break;
        }

        case 'click': {
          const selector = node.data?.selector;
          if (!selector) throw new Error('Click node missing selector');
          onLog(`${stepLabel} Clicking element: "${selector}"`);
          
          // Try clicking by selector
          await agent.click(selector);
          break;
        }

        case 'type': {
          const selector = node.data?.selector;
          let value = node.data?.value || '';
          
          if (!selector) throw new Error('Type node missing selector');

          // If the value is a reference to a secret in the vault
          if (value.startsWith('vault:')) {
            const secretId = value.replace('vault:', '');
            value = secrets[secretId] || '********';
            onLog(`${stepLabel} Injected secret from vault into input.`);
          }

          onLog(`${stepLabel} Typing value into element "${selector}"`);
          await agent.type(selector, value);
          break;
        }

        case 'wait': {
          const ms = parseInt(node.data?.ms || '1000', 10);
          onLog(`${stepLabel} Waiting for ${ms}ms...`);
          await agent.wait(ms);
          break;
        }

        case 'scrape': {
          const selector = node.data?.selector || 'body';
          onLog(`${stepLabel} Scraping text content from selector: "${selector}"`);
          const text = await agent.scrapeContent(selector);
          onLog(`${stepLabel} Scraped content snippet: ${text.slice(0, 150)}...`);
          break;
        }

        default:
          onLog(`${stepLabel} Unknown node type: ${node.type}. Skipping.`);
      }

      await agent.waitForPageStable(1000);
    }

    onLog(`[Runner] Workflow completed successfully! Saving session state...`);
    await agent.saveState();
  } catch (error) {
    onLog(`[Runner] ERROR: ${error.message}`);
    throw error;
  } finally {
    onLog(`[Runner] Cleaning up browser processes...`);
    await agent.cleanup();
  }
}

module.exports = { runWorkflow };
