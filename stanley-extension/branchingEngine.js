/**
 * branchingEngine.js — shared branching/conditional-flow logic for Stanley.
 * ES module. Exports: evaluateCondition, isFailureCondition, pickNextEdge,
 * buildLabelMap, executeGraph, MAX_STEPS_DEFAULT.
 */

export const MAX_STEPS_DEFAULT = 500;

export async function evaluateCondition(condition, ctx) {
  if (condition === undefined || condition === null) return true;

  const type = typeof condition === 'string' ? condition : condition.type;
  const value = typeof condition === 'string' ? undefined : condition.value;
  const hay = (ctx.lastScrape || '').toLowerCase();
  const needle = String(value == null ? '' : value).toLowerCase();

  switch (type) {
    case 'always':     return true;
    case 'onSuccess':  return !ctx.lastError;
    case 'onFailure':  return !!ctx.lastError;
    case 'true':       return ctx.lastConditionResult === true;
    case 'false':      return ctx.lastConditionResult === false;
    case 'contains':   return hay.includes(needle);
    case 'notContains':return !hay.includes(needle);
    case 'exists':
      return ctx.agent && ctx.agent.elementExists ? await ctx.agent.elementExists(value) : false;
    case 'notExists':
      return ctx.agent && ctx.agent.elementExists ? !(await ctx.agent.elementExists(value)) : true;
    default:
      return true;
  }
}

export function isFailureCondition(condition) {
  const type = typeof condition === 'string' ? condition : (condition && condition.type);
  return type === 'onFailure';
}

export async function pickNextEdge(outgoingEdges, ctx) {
  if (!outgoingEdges || outgoingEdges.length === 0) return null;

  if (ctx.lastError) {
    for (const edge of outgoingEdges) {
      if (isFailureCondition(edge.condition)) return edge;
    }
    return null;
  }

  for (const edge of outgoingEdges) {
    if (isFailureCondition(edge.condition)) continue;
    if (await evaluateCondition(edge.condition, ctx)) return edge;
  }
  return null;
}

export function buildLabelMap(actions) {
  const map = {};
  actions.forEach((step, i) => {
    if (step && (step.action === 'label' || step.label) && typeof step.label === 'string') {
      if (map[step.label] === undefined) map[step.label] = i;
    }
  });
  return map;
}

export async function executeGraph(agent, workflow, opts = {}) {
  const onLog = opts.onLog || (() => {});
  const secrets = opts.secrets || {};
  const onBlocked = opts.onBlocked;
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

    if (onBlocked && typeof agent.isPageBlocked === 'function') {
      try {
        const block = await agent.isPageBlocked();
        if (block && block.blocked) await onBlocked(block, label);
      } catch (_) { /* non-fatal */ }
    }

    const outgoing = (workflow.edges || []).filter(e => e.source === current.id);
    const next = await pickNextEdge(outgoing, ctx);

    if (!next) {
      if (ctx.lastError) throw ctx.lastError;
      break;
    }
    current = nodesById[next.target];
    if (!current) {
      onLog(`[Branch] Dangling edge → unknown target "${next.target}". Stopping.`);
      break;
    }
  }

  return scraped;
}

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

    case 'ai_prompt': {
      onLog(`${label} Requesting AI Analysis...`);
      if (ctx.runAiPrompt) {
        const result = await ctx.runAiPrompt(data.prompt, JSON.stringify(ctx.scrapedData));
        onLog(`[Result] ${result}`);
      } else {
        onLog(`[Result] Error: AI engine not wired up for this environment.`);
      }
      break;
    }

    default:
      onLog(`${label} Unknown node type "${node.type}" — skipped.`);
  }
}
