/**
 * branchingEngine.js — shared branching/conditional-flow logic for Stanley.
 *
 * The original engines (runner.js, foundationAgent.runWorkflow, daemon.runWorkflow)
 * only ever followed the FIRST outgoing edge of a node, so any workflow with a
 * fork, a fallback path, or a loop silently dropped every branch but one.
 *
 * This module adds:
 *   - Conditional edge evaluation (success / failure / contains / exists / true / false)
 *   - Failure-path routing (an `onFailure` edge runs instead of aborting)
 *   - A reusable graph executor (executeGraph) for node/edge workflows
 *   - Flat-array control flow helpers (buildLabelMap) for the daemon's action list
 *   - A hard max-step cap so intentional loops are allowed but runaways are caught
 *
 * CommonJS — consumed by daemon.js / runner.js (Node, no bundler).
 */

const MAX_STEPS_DEFAULT = 500;

/**
 * Condition schema (used on edges via `edge.condition`, on `if`/`condition`
 * nodes via `node.data.condition`, and on flat `if` actions via `step.condition`):
 *
 *   undefined | 'always'            -> always taken
 *   'onSuccess'                     -> taken only if the source node succeeded
 *   'onFailure'                     -> taken only if the source node threw
 *   'true' | 'false'               -> taken to match a preceding condition node result
 *   { type: 'contains',    value } -> last scraped text includes value (case-insensitive)
 *   { type: 'notContains', value }
 *   { type: 'exists',      value } -> an element matching `value` exists on the page (async)
 *   { type: 'notExists',   value }
 *   { type: 'onSuccess' | 'onFailure' | 'always' | 'true' | 'false' }
 */
async function evaluateCondition(condition, ctx) {
  if (condition === undefined || condition === null) return true;

  const type = typeof condition === 'string' ? condition : condition.type;
  const value = typeof condition === 'string' ? undefined : condition.value;
  const hay = (ctx.lastScrape || '').toLowerCase();
  const needle = String(value == null ? '' : value).toLowerCase();

  switch (type) {
    case 'always':
      return true;
    case 'onSuccess':
      return !ctx.lastError;
    case 'onFailure':
      return !!ctx.lastError;
    case 'true':
      return ctx.lastConditionResult === true;
    case 'false':
      return ctx.lastConditionResult === false;
    case 'contains':
      return hay.includes(needle);
    case 'notContains':
      return !hay.includes(needle);
    case 'exists':
      return ctx.agent && ctx.agent.elementExists ? await ctx.agent.elementExists(value) : false;
    case 'notExists':
      return ctx.agent && ctx.agent.elementExists ? !(await ctx.agent.elementExists(value)) : true;
    default:
      // Unknown condition types are treated as unconditional so a typo never
      // strands the workflow.
      return true;
  }
}

/** True when an edge/condition is meant to fire only on a failed source node. */
function isFailureCondition(condition) {
  const type = typeof condition === 'string' ? condition : (condition && condition.type);
  return type === 'onFailure';
}

/**
 * Picks the next edge to follow out of a node's outgoing edges.
 *
 *  - If the node FAILED: only edges explicitly marked `onFailure` are eligible.
 *    (Returning null tells the caller the failure is unhandled → abort.)
 *  - If the node SUCCEEDED: failure-only edges are skipped, and the first edge
 *    whose condition evaluates truthy (in array order) wins.
 */
async function pickNextEdge(outgoingEdges, ctx) {
  if (!outgoingEdges || outgoingEdges.length === 0) return null;

  if (ctx.lastError) {
    for (const edge of outgoingEdges) {
      if (isFailureCondition(edge.condition)) return edge;
    }
    return null; // no failure handler → caller re-throws
  }

  for (const edge of outgoingEdges) {
    if (isFailureCondition(edge.condition)) continue;
    if (await evaluateCondition(edge.condition, ctx)) return edge;
  }
  return null;
}

/** Maps `{ action:'label', label:'x' }` markers to their index for flat-array goto/if. */
function buildLabelMap(actions) {
  const map = {};
  actions.forEach((step, i) => {
    if (step && (step.action === 'label' || step.label) && typeof step.label === 'string') {
      // A dedicated label marker, OR any action carrying a `label` becomes a jump target.
      if (map[step.label] === undefined) map[step.label] = i;
    }
  });
  return map;
}

/**
 * Generic node/edge graph executor with conditional branching.
 * Used by runner.js and the enhanced foundation's runWorkflow.
 *
 * @param {object} agent  StanleyFoundationEnhanced instance (already initialized)
 * @param {object} workflow { nodes:[], edges:[] }
 * @param {object} opts { onLog, secrets, onBlocked, maxSteps }
 * @returns {Promise<Record<string,string>>} scraped data keyed by node id
 */
async function executeGraph(agent, workflow, opts = {}) {
  const onLog = opts.onLog || (() => {});
  const secrets = opts.secrets || {};
  const onBlocked = opts.onBlocked; // async (blockInfo) => void
  const maxSteps = opts.maxSteps || MAX_STEPS_DEFAULT;

  const nodesById = {};
  (workflow.nodes || []).forEach(n => { nodesById[n.id] = n; });

  let current = (workflow.nodes || []).find(n => n.type === 'trigger') || (workflow.nodes || [])[0];
  if (!current) throw new Error('Workflow has no nodes to execute.');

  const scraped = {};
  const ctx = { agent, lastError: null, lastScrape: '', lastConditionResult: null };
  let steps = 0;

  while (current) {
    if (++steps > maxSteps) {
      throw new Error(`Exceeded max steps (${maxSteps}). The workflow may contain an infinite loop.`);
    }
    const label = `[Step ${steps}] (${current.label || current.type})`;
    ctx.lastError = null;

    try {
      await runGraphNode(agent, current, { onLog, secrets, scraped, ctx, label });
    } catch (err) {
      ctx.lastError = err;
      onLog(`${label} ERROR: ${err.message}`);
    }

    // Heuristic block / CAPTCHA check between steps.
    if (onBlocked && typeof agent.isPageBlocked === 'function') {
      try {
        const block = await agent.isPageBlocked();
        if (block && block.blocked) await onBlocked(block, label);
      } catch (_) { /* non-fatal */ }
    }

    const outgoing = (workflow.edges || []).filter(e => e.source === current.id);
    const next = await pickNextEdge(outgoing, ctx);

    if (!next) {
      if (ctx.lastError) throw ctx.lastError; // unhandled failure with no fallback edge
      break;                                  // clean end of a path
    }
    current = nodesById[next.target];
    if (!current) {
      onLog(`[Branch] Dangling edge → unknown target "${next.target}". Stopping.`);
      break;
    }
  }

  return scraped;
}

/** Executes a single graph node. Sets ctx.lastScrape / ctx.lastConditionResult as side effects. */
async function runGraphNode(agent, node, { onLog, secrets, scraped, ctx, label }) {
  const data = node.data || {};

  switch (node.type) {
    case 'trigger':
      if (data.url) { onLog(`${label} Navigating to ${data.url}`); await agent.navigate(data.url); }
      else onLog(`${label} Trigger (no URL).`);
      break;

    case 'navigate':
      if (!data.url) throw new Error('Navigate node missing URL');
      onLog(`${label} Navigating to ${data.url}`);
      await agent.navigate(data.url);
      break;

    case 'click':
      onLog(`${label} Clicking ${data.selector || data.description}`);
      if (data.selector) { await agent.waitForSelector(data.selector, 5000); await agent.click(data.selector); }
      else if (data.description) {
        const ok = await agent.clickByNaturalLocator(data.description);
        if (!ok) throw new Error(`Could not locate clickable element: "${data.description}"`);
      } else throw new Error('Click node missing selector/description');
      break;

    case 'type': {
      let value = data.value || '';
      if (typeof value === 'string' && value.startsWith('vault:')) {
        const secretId = value.slice('vault:'.length);
        value = secrets[secretId] || '********';
        onLog(`${label} Injected vault secret "${secretId}".`);
      }
      onLog(`${label} Typing into ${data.selector || data.description}`);
      if (data.selector) { await agent.waitForSelector(data.selector, 5000); await agent.type(data.selector, value); }
      else if (data.description) {
        const ok = await agent.typeByNaturalLocator(data.description, value);
        if (!ok) throw new Error(`Could not locate input: "${data.description}"`);
      } else throw new Error('Type node missing selector/description');
      break;
    }

    case 'wait': {
      const ms = parseInt(data.ms || '1000', 10);
      onLog(`${label} Waiting ${ms}ms`);
      await agent.wait(ms);
      break;
    }

    case 'scrape': {
      const text = await agent.scrapeContent(data.selector);
      scraped[node.id] = text;
      ctx.lastScrape = text;
      onLog(`${label} Scraped ${text.length} chars.`);
      break;
    }

    // Condition / decision node: evaluates and exposes true/false for outgoing edges.
    case 'condition':
    case 'if': {
      ctx.lastConditionResult = await evaluateCondition(data.condition, ctx);
      onLog(`${label} Condition evaluated → ${ctx.lastConditionResult}`);
      break;
    }

    case 'open_tab': {
      const id = await agent.openTab(data.url, data.label);
      onLog(`${label} Opened tab "${id}"${data.url ? ' → ' + data.url : ''}`);
      break;
    }
    case 'switch_tab': {
      const meta = await agent.switchTab(data.tab != null ? data.tab : data.index);
      onLog(`${label} Switched to tab "${meta.id}"`);
      break;
    }
    case 'close_tab': {
      await agent.closeTab(data.tab != null ? data.tab : data.index);
      onLog(`${label} Closed tab.`);
      break;
    }

    default:
      onLog(`${label} Unknown node type "${node.type}" — skipped.`);
  }
}

module.exports = {
  evaluateCondition,
  isFailureCondition,
  pickNextEdge,
  buildLabelMap,
  executeGraph,
  MAX_STEPS_DEFAULT,
};
