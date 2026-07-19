/**
 * branchingEngine.js — shared branching/conditional-flow logic for Stanley.
 * ES module. Exports: evaluateCondition, isFailureCondition, pickNextEdge,
 * buildLabelMap, executeGraph, MAX_STEPS_DEFAULT.
 */

const crypto = require('crypto');
const { executePythonScript } = require('./pythonExecutor.js');
const { generatePythonApi } = require('./apiResolver.js');
const { callMcpTool } = require('./src/mcp-engine/client.js');
const { executeNativeIntegration, getOperation: getNativeOperation } = require('./src/native-integration-engine');
const { safeFetch } = require('./src/reliability');
const { assertList, enrichList, extractDomList, scrollUntil } = require('./src/use-case-engine/dynamicCollection');

const MAX_STEPS_DEFAULT = 500;

async function evaluateCondition(condition, ctx, scraped = {}) {
  if (condition === undefined || condition === null) return true;

  const type = typeof condition === 'string' ? condition : condition.type;
  const value = typeof condition === 'string' ? undefined : condition.value;
  
  let hay = (ctx.lastScrape || '').toLowerCase();
  if (condition.variable && typeof condition.variable === 'string') {
    hay = interpolate(condition.variable, ctx, scraped).toLowerCase();
  }
  const needle = String(value == null ? '' : value).toLowerCase();

  switch (type) {
    case 'always':     return true;
    case 'onSuccess':  return !ctx.lastError;
    case 'onFailure':  return !!ctx.lastError;
    case 'true':       return ctx.lastConditionResult === true;
    case 'false':      return ctx.lastConditionResult === false;
    case 'contains':   return hay.includes(needle);
    case 'notContains':return !hay.includes(needle);
    case 'equals':     return hay === needle;
    case 'notEquals':  return hay !== needle;
    case 'exists':
      return ctx.agent && ctx.agent.elementExists ? await ctx.agent.elementExists(value) : false;
    case 'notExists':
      return ctx.agent && ctx.agent.elementExists ? !(await ctx.agent.elementExists(value)) : true;
    default:
      return true;
  }
}

function isFailureCondition(condition) {
  const type = typeof condition === 'string' ? condition : (condition && condition.type);
  return type === 'onFailure';
}

async function pickNextEdge(outgoingEdges, ctx, scraped = {}) {
  if (!outgoingEdges || outgoingEdges.length === 0) return null;

  if (ctx.lastError) {
    for (const edge of outgoingEdges) {
      if (isFailureCondition(edge.condition)) return edge;
    }
    return null;
  }

  for (const edge of outgoingEdges) {
    if (isFailureCondition(edge.condition)) continue;
    if (await evaluateCondition(edge.condition, ctx, scraped)) return edge;
  }
  return null;
}

function buildLabelMap(actions) {
  const map = {};
  actions.forEach((step, i) => {
    if (step && (step.action === 'label' || step.label) && typeof step.label === 'string') {
      if (map[step.label] === undefined) map[step.label] = i;
    }
  });
  return map;
}

function nodeEffectKind(node) {
  const method = String(node.data?.method || 'GET').toUpperCase();
  if (node.type === 'integration') return getNativeOperation(node.data?.integrationName || node.data?.integrationType)?.readWrite || 'write';
  if (node.type === 'http_request') return ['GET', 'HEAD', 'OPTIONS'].includes(method) ? 'read' : 'write';
  if (['send_slack', 'send_email', 'upload_file'].includes(node.type)) return 'write';
  if (node.type === 'mcp_tool') return node.data?.readOnly === true ? 'read' : 'write';
  return node.data?.sideEffect === true ? 'write' : 'read';
}

async function ensureEffectClaim(node, ctx, opts) {
  if (!opts?.effectLedgerEnabled || nodeEffectKind(node) !== 'write') return;
  if (!opts.orchestration || typeof opts.orchestration.claimEffect !== 'function') {
    throw Object.assign(new Error('Durable effect protection is unavailable for this write node.'), { code: 'EFFECT_LEDGER_UNAVAILABLE' });
  }
  const effectKey = String(node.data?.idempotencyKey || `${opts.runId}:${node.id}:${ctx.loopIndex ?? 'single'}`);
  ctx.claimedEffects ||= new Set();
  if (ctx.claimedEffects.has(effectKey)) return;
  const claimed = await opts.orchestration.claimEffect(node, effectKey);
  if (!claimed) {
    throw Object.assign(new Error('This external effect was already claimed and its outcome requires verification before retrying.'), {
      code: 'EFFECT_UNKNOWN', nodeId: node.id, nodeType: node.type,
    });
  }
  ctx.claimedEffects.add(effectKey);
}

async function executeGraph(agent, workflow, opts = {}) {
  const onLog = opts.onLog || (() => {});
  const secrets = opts.secrets || {};
  const onBlocked = opts.onBlocked;
  const maxSteps = opts.maxSteps || MAX_STEPS_DEFAULT;
  // Optional LLM resolver. In the extension this is usually null — vision lives
  // inside nativeAgent.clickByNaturalLocator (tier 2) since only the background
  // worker can take a screenshot. Kept for parity with the Cloud Run engine.
  const visionResolver = opts.visionResolver || null;
  // Trigger payload (webhook body / schedule context) for {{input.field}}.
  const input = opts.input || {};

  const nodesById = {};
  (workflow.nodes || []).forEach(n => { nodesById[n.id] = n; });

  // Super node: a `mission` node supplies the overall goal as system context for
  // every AI call this run. Read once up front (it's off to the side, not in flow).
  const missionNode = (workflow.nodes || []).find(n => n.type === 'mission');
  const missionPrompt = missionNode && missionNode.data ? (missionNode.data.prompt || '') : '';
  if (missionPrompt) onLog(`[Mission] ${missionPrompt.slice(0, 120)}${missionPrompt.length > 120 ? '…' : ''}`);

  // Entry = a flow node with no incoming flow edge, so an Open Tab node can run
  // before the trigger (starts in a fresh tab, not the user's current one).
  const isFlowNode = (n) => n && n.type !== 'mission' && n.type !== 'parameter';
  const flowEdges = (workflow.edges || []).filter(e => e.kind !== 'context');
  const hasIncoming = new Set(flowEdges.map(e => e.target));
  const roots = (workflow.nodes || []).filter(n => isFlowNode(n) && !hasIncoming.has(n.id));
  let current = roots.find(n => n.type === 'trigger')
    || roots[0]
    || (workflow.nodes || []).find(n => n.type === 'trigger')
    || (workflow.nodes || []).find(isFlowNode);
  if (!current) throw new Error('Workflow has no nodes to execute.');

  const scraped = {};
  const ctx = { agent, lastError: null, lastScrape: '', lastConditionResult: null, missionPrompt, stepParams: {}, input, onSelfHealed: opts.onSelfHealed, data: {} };
  let steps = 0;

  while (current) {
    if (opts.deadlineAtMs && Date.now() > opts.deadlineAtMs) {
      throw Object.assign(new Error('Workflow exceeded its execution deadline.'), { code: 'RUN_DEADLINE_EXCEEDED' });
    }
    if (++steps > maxSteps) {
      throw new Error(`Exceeded max steps (${maxSteps}). The workflow may contain an infinite loop.`);
    }
    if (typeof opts.onLeaseHeartbeat === 'function') await opts.onLeaseHeartbeat();
    const label = `[Step ${steps}] (${current.label || current.type})`;
    ctx.lastError = null;

    // Sub nodes: merge parameter nodes wired via context edges into this step.
    const params = collectParams(current, workflow, nodesById);
    ctx.stepParams = params;
    agent._aiContext = buildAiContext(ctx.missionPrompt, params);
    if (Object.keys(params).length) onLog(`${label} + parameters: ${describeParams(params)}`);
    const effectiveNode = Object.keys(params).length
      ? { ...current, data: { ...(current.data || {}), ...params } }
      : current;

    if (opts.skipCompletedNodes && opts.orchestration && typeof opts.orchestration.restoreNode === 'function') {
      const restored = await opts.orchestration.restoreNode(effectiveNode);
      if (restored.completed) {
        scraped[effectiveNode.id] = restored.output;
        ctx.lastScrape = typeof restored.output === 'string' ? restored.output : JSON.stringify(restored.output ?? '');
        onLog(`${label} Restored from durable checkpoint; external work was not repeated.`);
        const outgoing = (workflow.edges || []).filter(e => e.source === current.id && e.kind !== 'context');
        const next = await pickNextEdge(outgoing, ctx, scraped);
        if (!next) break;
        current = nodesById[next.target];
        if (!current) {
          onLog(`[Branch] Dangling edge to unknown target "${next.target}". Stopping.`);
          break;
        }
        continue;
      }
    }

    if (opts.orchestration && typeof opts.orchestration.beforeNode === 'function') {
      await opts.orchestration.beforeNode(effectiveNode, ctx);
    }

    if (opts.trust && typeof opts.trust.beforeNode === 'function') {
      await opts.trust.beforeNode(effectiveNode, ctx);
    }
    if (opts.browserRuntime && typeof opts.browserRuntime.beforeNode === 'function') {
      await opts.browserRuntime.beforeNode(effectiveNode, ctx);
    }

    await ensureEffectClaim(effectiveNode, ctx, opts);

    const goal = effectiveNode.data?.description || ctx.missionPrompt || `Locate and perform action on the page.`;
    const url = agent.page ? agent.page.url() : '';
    
    // Normalize URL to remove query parameters/hash so the cache hits even with dynamic tracking IDs
    let normalizedUrl = url;
    try {
      if (url && url !== 'about:blank') {
        const parsed = new URL(url);
        normalizedUrl = parsed.origin + parsed.pathname;
      }
    } catch(e) {}

    const scriptHash = crypto.createHash('md5').update(goal + normalizedUrl).digest('hex');
    let usedCachedApi = false;

    // Connector Engine: approved tenant artifacts run before browser execution.
    if (opts.connectorRuntime && (effectiveNode.type === 'connector' || (url && url !== 'about:blank' && effectiveNode.type !== 'navigate' && effectiveNode.type !== 'trigger'))) {
      const connector = await opts.connectorRuntime.executeForNode({
        uid: opts.uid, runId: opts.runId, workflowId: workflow.id, node: effectiveNode,
        goal, url, input: { ...ctx.variables, ...ctx.stepParams },
        approval: opts.connectorApproval, trustMode: opts.trust?.policy?.mode || 'live',
      });
      if (connector.executed) {
        scraped[effectiveNode.id] = connector.result;
        ctx.lastScrape = typeof connector.result === 'string' ? connector.result : JSON.stringify(connector.result);
        usedCachedApi = true;
        ctx.lastError = null;
        onLog(`${label} Executed approved connector ${connector.connectorId}@${connector.version}.`);
      } else if (effectiveNode.type === 'connector') {
        throw Object.assign(new Error(`Published connector ${effectiveNode.data?.connectorId || ''} is unavailable for this workflow.`), { code: 'CONNECTOR_UNAVAILABLE', nodeId: effectiveNode.id, nodeType: effectiveNode.type });
      }
    }

    if (!usedCachedApi) {
      try {
        const browserNodes = ['trigger', 'navigate', 'click', 'type', 'wait', 'scrape', 'open_tab', 'switch_tab', 'close_tab', 'extract', 'extract_list', 'paginate', 'agent', 'scroll', 'scroll_until', 'dom_extract_list', 'visit_each', 'find_text', 'go_back', 'go_forward', 'send_keys', 'select_dropdown', 'hover', 'drag_drop', 'upload_file', 'download_file', 'monitor'];
        if (opts.ensureBrowser && browserNodes.includes(effectiveNode.type) && (effectiveNode.type !== 'trigger' || Boolean(effectiveNode.data?.url))) {
          await opts.ensureBrowser();
        }

        const retryableNodes = ['click', 'type', 'navigate', 'scrape', 'extract', 'extract_list'];
        const maxRetries = retryableNodes.includes(effectiveNode.type) ? 3 : 1;
        let lastErr;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            await runGraphNode(agent, effectiveNode, {
              onLog, secrets, scraped, ctx, label, visionResolver,
              artifactService: opts.artifactService, uid: opts.uid, runId: opts.runId,
              workflow, nodesById, runtimeOptions: opts,
            });
            const visibility = effectiveNode.data?.contextVisibility || workflow.contextPolicy?.defaultVisibility || 'ephemeral';
            if (visibility === 'hidden') ctx.lastScrape = '';
            else if (typeof ctx.lastScrape === 'string') {
              const limit = Math.max(500, Number(workflow.contextPolicy?.maxObservationChars || 6000));
              if (ctx.lastScrape.length > limit) ctx.lastScrape = `${ctx.lastScrape.slice(0, limit)}...[COMPACTED]`;
            }
            lastErr = null;
            break;
          } catch (attemptErr) {
            lastErr = attemptErr;
            if (attempt < maxRetries) {
              const delayMs = 1000 * Math.pow(2, attempt - 1);
              onLog(`${label} [Retry ${attempt}/${maxRetries}] Failed: "${attemptErr.message}". Retrying after ${delayMs}ms…`);
              await new Promise(r => setTimeout(r, delayMs));
            }
          }
        }
        if (lastErr) throw lastErr;
      } catch (err) {
        if (opts.browserRuntime && typeof opts.browserRuntime.nodeFailed === 'function') {
          await opts.browserRuntime.nodeFailed(effectiveNode, err, ctx).catch(() => {});
        }
        if (opts.allowAgenticRecovery !== true) {
          onLog(`${label} failed: "${err.message}". Recovery is constrained to the authored graph.`);
          if (opts.trust && typeof opts.trust.nodeFailed === 'function') {
            await opts.trust.nodeFailed(effectiveNode, err, ctx);
          }
          throw err;
        }
        // This workflow explicitly authorizes open-ended agentic recovery.
        onLog(`${label} failed: "${err.message}". Initiating Agentic Recovery...`);
        
        // Connector generation is deliberate and lifecycle-gated. Failed execution
        // is recorded for grouped repair; browser fallback remains available here.

        // 3. Visual RPA Fallback (if Python API failed or wasn't applicable)
        if (!usedCachedApi) {
          try {
            onLog(`[Recovery] Analyzing page visually to resolve goal: "${goal}"…`);
            
            let stepDecision;
            if (typeof agent.runAgentStep === 'function') {
              stepDecision = await agent.runAgentStep(goal, []);
            } else if (visionResolver && typeof visionResolver.agentStep === 'function') {
              const screenshot = await agent.captureScreenshotBase64();
              stepDecision = await visionResolver.agentStep(goal, [], screenshot);
            }
            
            if (stepDecision && stepDecision.action && stepDecision.action !== 'finish') {
              onLog(`[Recovery] Agent decided: ${stepDecision.action} -> ${stepDecision.description || stepDecision.url || stepDecision.value || ''}`);
              
              let healedSelector = null;
              if (stepDecision.action === 'click') {
                healedSelector = await smartClick(agent, { description: stepDecision.description }, onLog, visionResolver);
              } else if (stepDecision.action === 'type') {
                healedSelector = await smartType(agent, { description: stepDecision.description }, stepDecision.value || effectiveNode.data?.value || '', onLog, visionResolver);
              } else if (stepDecision.action === 'navigate' && stepDecision.url) {
                await agent.navigate(stepDecision.url);
              } else if (stepDecision.action === 'wait') {
                await agent.wait(parseInt(stepDecision.ms || '2000', 10));
              }
              
              if (healedSelector && opts.onSelfHealed) {
                onLog(`[Recovery] Healing successful! Auto-crystallizing selector: "${healedSelector}"`);
                await opts.onSelfHealed(effectiveNode.id, healedSelector);
              }
              // Recovery succeeded! Clear the error.
              ctx.lastError = null;
            } else {
              throw err; // throw original error if agent couldn't make a decision
            }
          } catch (recoveryErr) {
            ctx.lastError = err; // Keep original error
            onLog(`${label} Agentic Recovery failed: ${recoveryErr.message}`);
          }
        }
      }
    }

    if (opts.orchestration && typeof opts.orchestration.afterNode === 'function') {
      await opts.orchestration.afterNode(effectiveNode, scraped[effectiveNode.id], ctx);
    }

    if (opts.trust) {
      if (ctx.lastError && typeof opts.trust.nodeFailed === 'function') {
        await opts.trust.nodeFailed(effectiveNode, ctx.lastError, ctx);
      } else if (typeof opts.trust.afterNode === 'function') {
        await opts.trust.afterNode(effectiveNode, scraped[effectiveNode.id], ctx);
      }
    }
    if (opts.browserRuntime && typeof opts.browserRuntime.afterNode === 'function' && !ctx.lastError) {
      await opts.browserRuntime.afterNode(effectiveNode, scraped[effectiveNode.id], ctx);
    }

    if (onBlocked && typeof agent.isPageBlocked === 'function') {
      let block = null;
      try { block = await agent.isPageBlocked(); } catch (_) { /* detection is non-fatal */ }
      if (block && block.blocked) await onBlocked(block, label);
    }

    // Context edges attach parameters; they are not part of execution flow.
    const outgoing = (workflow.edges || []).filter(e => e.source === current.id && e.kind !== 'context');
    const next = await pickNextEdge(outgoing, ctx, scraped);

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

async function runGraphNode(agent, node, { onLog, secrets, scraped, ctx, label, visionResolver, artifactService, uid, runId, workflow, nodesById, runtimeOptions }) {
  await ensureEffectClaim(node, ctx, runtimeOptions);
  const data = interpolateFields(node.data || {}, ctx, scraped);

  switch (node.type) {
    case 'trigger':
      if (data.url) { 
        onLog(`${label} Opening new tab for trigger: ${data.url}`); 
        await agent.openTab(data.url, 'Start'); 
      } else {
        onLog(`${label} Trigger (no URL).`);
      }
      break;

    case 'navigate':
      if (!data.url) throw new Error('Navigate node missing URL');
      onLog(`${label} Navigating to ${data.url}`);
      await agent.navigate(data.url);
      break;

    case 'click': {
      onLog(`${label} Clicking ${data.selector || data.description}`);
      const healed = await smartClick(agent, data, onLog, visionResolver);
      if (healed && ctx.onSelfHealed) {
        await ctx.onSelfHealed(node.id, healed);
      }
      await maybeVerify(agent, data, ctx, onLog, label);
      break;
    }

    case 'type': {
      let value = data.value || '';
      if (typeof value === 'string' && value.startsWith('vault:')) {
        const secretId = value.slice('vault:'.length);
        value = secrets[secretId] || '********';
        onLog(`${label} Injected vault secret "${secretId}".`);
      }
      onLog(`${label} Typing into ${data.selector || data.description}`);
      const healed = await smartType(agent, data, value, onLog, visionResolver);
      if (healed && ctx.onSelfHealed) {
        await ctx.onSelfHealed(node.id, healed);
      }
      await maybeVerify(agent, data, ctx, onLog, label);
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

    case 'ai_prompt': {
      if (!visionResolver || typeof visionResolver.generateText !== 'function') {
        onLog(`${label} ai_prompt skipped — no AI resolver configured for this run.`);
        break;
      }
      const promptText = interpolate(data.prompt || '', ctx, scraped);
      const sys = [ctx.missionPrompt ? `Overall goal: ${ctx.missionPrompt}` : '', data.system || '']
        .filter(Boolean).join('\n\n');
      onLog(`${label} Running AI prompt…`);
      const out = await visionResolver.generateText(promptText, sys);
      ctx.lastAiResult = out;
      ctx.lastScrape = out;
      scraped[node.id] = out;
      onLog(`${label} AI replied (${out.length} chars).`);
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

    case 'scroll': {
      const amount = Math.max(-5000, Math.min(5000, Number(data.amount || 700)));
      if (data.selector) await agent.page.locator(data.selector).first().scrollIntoViewIfNeeded();
      else await agent.page.evaluate((pixels) => window.scrollBy({ top: pixels, behavior: 'instant' }), amount);
      onLog(`${label} Scrolled ${data.selector || `${amount}px`}.`); break;
    }
    case 'scroll_until': {
      const result = await scrollUntil({
        page: agent.page,
        containerSelector: data.containerSelector,
        itemSelector: data.itemSelector,
        uniqueByAttribute: data.uniqueByAttribute,
        targetCount: data.targetCount,
        maxScrolls: data.maxScrolls,
        scrollAmount: data.scrollAmount,
        settleMs: data.settleMs,
        stagnationLimit: data.stagnationLimit,
      });
      scraped[node.id] = result;
      ctx.lastScrape = JSON.stringify(result);
      onLog(`${label} Dynamic feed exposed ${result.count}/${result.targetCount} items after ${result.scrolls} scrolls.`);
      break;
    }
    case 'dom_extract_list': {
      const records = await extractDomList({
        page: agent.page,
        itemSelector: data.itemSelector,
        fields: parseObject(data.fields, 'DOM extraction fields'),
        maxItems: data.maxItems,
        dedupeBy: data.dedupeBy,
      });
      scraped[node.id] = records;
      ctx.lastScrape = JSON.stringify(records);
      onLog(`${label} Deterministically extracted ${records.length} DOM records.`);
      break;
    }
    case 'visit_each': {
      const source = scraped[data.sourceNodeId];
      const records = await enrichList({
        agent,
        records: source,
        urlField: String(data.urlField || 'url'),
        fields: parseObject(data.fields, 'detail extraction fields'),
        maxItems: data.maxItems,
        settleMs: data.settleMs,
        onProgress: ({ index, total, error }) => onLog(error ? `${label} Skipped detail page ${index}/${total}: ${error.message}` : `${label} Enriched ${index}/${total} detail pages.`),
      });
      scraped[node.id] = records;
      ctx.lastScrape = JSON.stringify(records);
      onLog(`${label} Detail enrichment completed with ${records.length} records.`);
      break;
    }
    case 'find_text': {
      const text = String(data.text || data.description || ''); if (!text) throw new Error('Find text node requires text.');
      const locator = agent.page.getByText(text, { exact: false }).first(); await locator.scrollIntoViewIfNeeded();
      scraped[node.id] = { found: true, text }; ctx.lastScrape = text; onLog(`${label} Found text.`); break;
    }
    case 'go_back': await agent.page.goBack({ waitUntil: 'domcontentloaded' }); onLog(`${label} Went back.`); break;
    case 'go_forward': await agent.page.goForward({ waitUntil: 'domcontentloaded' }); onLog(`${label} Went forward.`); break;
    case 'send_keys': {
      const keys = String(data.keys || ''); if (!/^[a-zA-Z0-9+_-]{1,40}$/.test(keys)) throw new Error('Keyboard shortcut contains unsupported characters.');
      await agent.page.keyboard.press(keys); onLog(`${label} Sent keyboard shortcut ${keys}.`); break;
    }
    case 'select_dropdown': {
      const locator = data.selector ? agent.page.locator(data.selector).first() : agent.page.getByLabel(String(data.description || '')).first();
      const option = data.value !== undefined ? { value: String(data.value) } : data.optionLabel ? { label: String(data.optionLabel) } : { index: Number(data.index || 0) };
      const selected = await locator.selectOption(option); scraped[node.id] = selected; ctx.lastScrape = JSON.stringify(selected); onLog(`${label} Selected dropdown option.`); break;
    }
    case 'hover': {
      const locator = data.selector ? agent.page.locator(data.selector).first() : agent.page.getByText(String(data.description || ''), { exact: false }).first();
      await locator.hover(); onLog(`${label} Hovered target.`); break;
    }
    case 'drag_drop': {
      if (!data.sourceSelector || !data.targetSelector) throw new Error('Drag and drop requires sourceSelector and targetSelector.');
      await agent.page.dragAndDrop(data.sourceSelector, data.targetSelector); onLog(`${label} Dragged item.`); break;
    }
    case 'upload_file': {
      if (!artifactService || !uid || !data.artifactId) throw new Error('Upload file requires a tenant artifact.');
      const local = await artifactService.localPath(uid, data.artifactId);
      try { const locator = data.selector ? agent.page.locator(data.selector).first() : agent.page.locator('input[type="file"]').first(); await locator.setInputFiles(local.path); }
      finally { await local.cleanup(); }
      onLog(`${label} Uploaded tenant artifact ${data.artifactId}.`); break;
    }
    case 'download_file': {
      if (!artifactService || !uid) throw new Error('Artifact storage is unavailable.');
      const downloadPromise = agent.page.waitForEvent('download', { timeout: Number(data.timeoutMs || 30000) });
      await smartClick(agent, data, onLog, visionResolver); const download = await downloadPromise;
      const artifact = await artifactService.fromDownload(uid, download, runId); scraped[node.id] = artifact; ctx.lastScrape = JSON.stringify(artifact); onLog(`${label} Saved download as artifact ${artifact.id}.`); break;
    }
    case 'mcp_tool': {
      let toolArguments = data.arguments || {}; if (typeof toolArguments === 'string') { try { toolArguments = JSON.parse(toolArguments); } catch { throw new Error('MCP tool arguments must be valid JSON.'); } }
      const token = data.vaultKey ? secrets[data.vaultKey] : '';
      const result = await callMcpTool({ serverUrl: String(data.serverUrl || ''), toolName: data.toolName, arguments: toolArguments, token });
      scraped[node.id] = result; ctx.lastScrape = JSON.stringify(result); onLog(`${label} Called MCP tool ${data.toolName}.`); break;
    }

    case 'mission':
    case 'parameter':
      break;

    case 'router':
      // The router node acts as a pass-through.
      // The routing logic is handled by evaluateCondition checking the branch edges.
      onLog(`${label} Evaluating router branches...`);
      break;

    case 'native_integration':
    case 'integration': {
      const integrationName = data.integrationName || data.integrationType;
      if (!integrationName) throw new Error('Integration node missing integrationName.');
      let integrationInput = data.params || data.input || {};
      if (typeof integrationInput === 'string') {
        try { integrationInput = JSON.parse(integrationInput); }
        catch { throw new Error('Integration params must be valid JSON.'); }
      }
      if (data.query && !integrationInput.query) integrationInput = { ...integrationInput, query: { q: data.query } };
      onLog(`${label} Executing native integration: ${integrationName}`);
      const execution = await executeNativeIntegration(integrationName, integrationInput, secrets, {
        idempotencyKey: `${runId || 'run'}:${node.id}`,
        artifactService, uid, runId,
        providerResilience: runtimeOptions.providerResilience,
      });
      scraped[node.id] = execution.output;
      ctx.lastScrape = typeof execution.output === 'string' ? execution.output : JSON.stringify(execution.output);
      onLog(`${label} Native integration completed with status ${execution.status}.`);
      break;
    }

    case 'ai_agent': {
      const role = data.role || 'Helpful Assistant';
      const agentGoal = data.goal || 'Complete the task';
      onLog(`${label} Spawning Autonomous Agent: [${role}] - "${agentGoal}"`);
      
      let agentResult;
      if (agent.clickByNaturalLocator) {
        onLog(`${label} Agent is analyzing page state...`);
        agentResult = await agent.clickByNaturalLocator(agentGoal);
      } else {
        onLog(`${label} Agent requires browser context which is unavailable.`);
        agentResult = { status: 'failed', reason: 'No browser context' };
      }
      
      scraped[node.id] = agentResult;
      ctx.lastScrape = typeof agentResult === 'string' ? agentResult : JSON.stringify(agentResult);
      break;
    }

    case 'extract': {
      const selector = data.selector;
      const schema = data.schema || '{}';
      onLog(`${label} Extracting structured data using schema…`);
      const htmlContent = await agent.scrapeContent(selector);
      if (typeof agent.runExtract === 'function') {
        const parsed = await agent.runExtract(htmlContent, schema);
        scraped[node.id] = parsed;
        ctx.lastScrape = typeof parsed === 'object' ? JSON.stringify(parsed) : String(parsed);
        onLog(`${label} Extracted structured data.`);
      } else {
        if (visionResolver && typeof visionResolver.extract === 'function') {
          const parsed = await visionResolver.extract(htmlContent, schema);
          scraped[node.id] = parsed;
          ctx.lastScrape = typeof parsed === 'object' ? JSON.stringify(parsed) : String(parsed);
          onLog(`${label} Extracted structured data.`);
        } else {
          throw new Error('Extraction LLM resolver not configured for this run.');
        }
      }
      break;
    }

    case 'extract_list': {
      const selector = data.selector;
      const schema = data.schema || '[]';
      onLog(`${label} Extracting repeating list using schema…`);
      const htmlContent = await agent.scrapeContent(selector);
      if (typeof agent.runExtract === 'function') {
        const parsed = await agent.runExtract(htmlContent, schema);
        scraped[node.id] = parsed;
        ctx.lastScrape = typeof parsed === 'object' ? JSON.stringify(parsed) : String(parsed);
        onLog(`${label} Extracted ${Array.isArray(parsed) ? parsed.length : 0} items.`);
      } else {
        if (visionResolver && typeof visionResolver.extract === 'function') {
          const parsed = await visionResolver.extract(htmlContent, schema);
          scraped[node.id] = parsed;
          ctx.lastScrape = typeof parsed === 'object' ? JSON.stringify(parsed) : String(parsed);
          onLog(`${label} Extracted ${Array.isArray(parsed) ? parsed.length : 0} items.`);
        } else {
          throw new Error('Extraction LLM resolver not configured for this run.');
        }
      }
      break;
    }

    case 'filter_list': {
      if (!visionResolver || typeof visionResolver.extract !== 'function') throw new Error('AI list filtering requires an extraction resolver.');
      const source = scraped[data.sourceNodeId];
      if (!Array.isArray(source)) throw new Error('AI list filtering source must be an array.');
      const criteria = String(data.criteria || 'Keep records that are complete and relevant.');
      const schema = data.schema || [{ title: 'string', url: 'string' }];
      const selected = await visionResolver.extract(`Selection criteria:\n${criteria}\n\nCandidate records:\n${JSON.stringify(source)}`, schema);
      if (!Array.isArray(selected)) throw new Error('AI list filtering did not return an array.');
      scraped[node.id] = selected;
      ctx.lastScrape = JSON.stringify(selected);
      onLog(`${label} AI selected ${selected.length}/${source.length} records.`);
      break;
    }

    case 'assertion': {
      const source = scraped[data.sourceNodeId];
      const result = assertList(source, {
        minItems: data.minItems,
        requiredFields: Array.isArray(data.requiredFields) ? data.requiredFields : String(data.requiredFields || '').split(',').map((field) => field.trim()).filter(Boolean),
        uniqueBy: data.uniqueBy,
        dropIncomplete: data.dropIncomplete === true || data.dropIncomplete === 'true',
        outputLimit: data.outputLimit,
      });
      scraped[node.id] = result;
      ctx.lastScrape = JSON.stringify(result);
      onLog(`${label} Verified ${result.length} records against the declared use-case contract.`);
      break;
    }

    case 'paginate': {
      const nextSelector = data.selector || data.description;
      const maxPages = parseInt(data.maxPages || '3', 10);
      const actionNodeId = data.actionNodeId;
      const targetNode = workflow.nodes.find(n => n.id === actionNodeId);
      
      onLog(`${label} Starting pagination loop up to ${maxPages} pages…`);
      const accumulated = [];
      
      for (let page = 1; page <= maxPages; page++) {
        onLog(`${label} Page ${page}/${maxPages}`);
        
        if (targetNode) {
          try {
            await runGraphNode(agent, targetNode, {
              onLog, secrets, scraped, ctx, label: `${label} [Page ${page} Scrape]`, visionResolver,
              artifactService, uid, runId, workflow, nodesById, runtimeOptions,
            });
            const result = scraped[actionNodeId];
            if (Array.isArray(result)) {
              accumulated.push(...result);
            } else if (result) {
              accumulated.push(result);
            }
          } catch (err) {
            onLog(`${label} Scrape warning on page ${page}: ${err.message}`);
          }
        }
        
        if (page === maxPages) break;
        
        onLog(`${label} Clicking next page button: "${nextSelector}"`);
        try {
          await smartClick(agent, { selector: data.selector, description: data.description }, onLog, visionResolver);
          await agent.wait(3000);
        } catch (err) {
          onLog(`${label} Next page button not found/clickable. Stopping pagination.`);
          break;
        }
      }
      
      scraped[node.id] = accumulated;
      ctx.lastScrape = JSON.stringify(accumulated);
      onLog(`${label} Paginated scrape completed. Total items accumulated: ${accumulated.length}`);
      break;
    }

    case 'agent': {
      const goal = data.goal || ctx.missionPrompt || 'Explore page';
      const agentMaxSteps = parseInt(data.maxSteps || '8', 10);
      onLog(`${label} Entering Agentic Mode. Goal: "${goal}". Max steps: ${agentMaxSteps}`);
      
      const agentHistory = [];
      let stepCount = 0;
      let finished = false;
      
      while (!finished && stepCount < agentMaxSteps) {
        stepCount++;
        onLog(`${label} Agent step ${stepCount}/${agentMaxSteps}…`);
        
        let stepDecision;
        if (typeof agent.runAgentStep === 'function') {
          stepDecision = await agent.runAgentStep(goal, agentHistory);
        } else {
          if (visionResolver && typeof visionResolver.agentStep === 'function') {
            const screenshot = await agent.captureScreenshotBase64();
            stepDecision = await visionResolver.agentStep(goal, agentHistory, screenshot);
          } else {
            throw new Error('Agentic Vision Planner not configured for this run.');
          }
        }
        
        if (!stepDecision || stepDecision.action === 'finish') {
          onLog(`${label} Agent completed task. Reason: ${stepDecision?.reason || 'Done'}`);
          finished = true;
          break;
        }
        
        onLog(`${label} Agent decided: ${stepDecision.action} -> ${stepDecision.description || stepDecision.url || stepDecision.value || ''} (${stepDecision.reason})`);
        agentHistory.push({
          step: stepCount,
          action: stepDecision.action,
          description: stepDecision.description,
          value: stepDecision.value,
          url: stepDecision.url,
          reason: stepDecision.reason
        });
        
        try {
          if (stepDecision.action === 'click') {
            await smartClick(agent, { description: stepDecision.description }, onLog, visionResolver);
          } else if (stepDecision.action === 'type') {
            await smartType(agent, { description: stepDecision.description }, stepDecision.value || '', onLog, visionResolver);
          } else if (stepDecision.action === 'navigate' && stepDecision.url) {
            await agent.navigate(stepDecision.url);
          } else if (stepDecision.action === 'wait') {
            await agent.wait(parseInt(stepDecision.ms || '2000', 10));
          } else if (stepDecision.action === 'scrape') {
            const txt = await agent.scrapeContent(stepDecision.selector);
            ctx.lastScrape = txt;
          }
        } catch (err) {
          onLog(`${label} Agent step execution failed: ${err.message}`);
          agentHistory[agentHistory.length - 1].error = err.message;
        }
        
        await agent.wait(1500);
      }
      
      scraped[node.id] = agentHistory;
      ctx.lastScrape = JSON.stringify(agentHistory);
      onLog(`${label} Agentic Mode completed. Action trace stored.`);
      break;
    }

    case 'vision': {
      if (!visionResolver || typeof visionResolver.visionAnalysis !== 'function') {
        throw new Error('Vision resolver not configured for this run.');
      }
      onLog(`${label} Passing screenshot to Vision AI for analysis...`);
      const screenshot = await agent.captureScreenshotBase64();
      const prompt = interpolate(data.prompt || '', ctx, scraped);
      const response = await visionResolver.visionAnalysis(prompt, '', screenshot);
      scraped[node.id] = response;
      ctx.lastScrape = response;
      onLog(`${label} Vision AI replied: ${response.slice(0, 100)}${response.length > 100 ? '...' : ''}`);
      break;
    }

    case 'approval': {
      const contextStr = interpolate(data.context || '', ctx, scraped);
      const emailTarget = interpolate(data.email || '', ctx, scraped);
      onLog(`${label} Human-in-the-Loop Checkpoint reached.`);
      
      if (runtimeOptions?.db && runtimeOptions?.runId) {
        onLog(`${label} Pausing execution and notifying ${emailTarget || 'workspace admins'}...`);
        await runtimeOptions.db.collection('runs').doc(runtimeOptions.runId).update({
          status: 'pending_approval',
          approvalContext: contextStr,
          approvalEmail: emailTarget,
          pendingNodeId: node.id
        });
        throw new Error('WORKFLOW_PAUSED_FOR_APPROVAL');
      } else {
        onLog(`${label} Warning: No DB context provided. Bypassing approval in local mode.`);
      }
      break;
    }

    case 'http_request': {
      const method = (data.method || 'GET').toUpperCase();
      let url = data.url;
      if (!url) throw new Error('http_request node missing URL');
      let headers = {};
      if (data.headers) {
        try { headers = typeof data.headers === 'string' ? JSON.parse(data.headers) : data.headers; } catch { headers = {}; }
        for (const [k, v] of Object.entries(headers)) {
          if (typeof v === 'string' && v.startsWith('vault:')) {
            headers[k] = secrets[v.slice('vault:'.length)] || v;
          }
        }
      }
      let body = undefined;
      if (['POST', 'PUT', 'PATCH'].includes(method) && data.body) {
        body = typeof data.body === 'string' ? data.body : JSON.stringify(data.body);
        if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/json';
      }
      onLog(`${label} HTTP ${method} ${url}`);
      const httpRes = await safeFetch(url, { method, headers, body }, { enabled: runtimeOptions.safeEgress });
      const contentType = httpRes.headers.get('content-type') || '';
      const httpResult = contentType.includes('json') ? await httpRes.json() : await httpRes.text();
      scraped[node.id] = httpResult;
      ctx.lastScrape = typeof httpResult === 'object' ? JSON.stringify(httpResult) : String(httpResult);
      onLog(`${label} HTTP ${httpRes.status}`);
      break;
    }

    case 'loop': {
      const sourceId = data.sourceNodeId;
      const maxItems = parseInt(data.maxItems || '50', 10);
      if (!sourceId) throw new Error('Loop node missing sourceNodeId');
      const items = Array.isArray(scraped[sourceId]) ? scraped[sourceId] : [];
      const loopLimit = Math.min(items.length, maxItems);
      onLog(`${label} Looping over ${items.length} items (max ${maxItems})`);
      const loopResults = [];
      for (let i = 0; i < loopLimit; i++) {
        ctx.loopItem = items[i];
        ctx.loopIndex = i;
        onLog(`${label} Loop iteration ${i + 1}/${loopLimit}`);
        const loopEdges = (workflow.edges || []).filter(e => e.source === node.id && e.kind !== 'context' && e.loopBody);
        for (const le of loopEdges) {
          const childNode = nodesById[le.target];
          if (childNode) {
            const childData = interpolateFields(childNode.data || {}, ctx, scraped);
            try {
              await runGraphNode(agent, { ...childNode, data: childData }, {
                onLog, secrets, scraped, ctx, label: `${label} [${i+1}]`, visionResolver,
                artifactService, uid, runId, workflow, nodesById, runtimeOptions,
              });
            } catch (err) { onLog(`${label} Loop item ${i+1} failed: ${err.message}`); }
          }
        }
        loopResults.push({ index: i, item: items[i] });
      }
      delete ctx.loopItem;
      delete ctx.loopIndex;
      scraped[node.id] = loopResults;
      ctx.lastScrape = JSON.stringify(loopResults);
      onLog(`${label} Loop completed. ${loopLimit} iterations.`);
      break;
    }

    case 'transform': {
      const op = data.operation || 'trim';
      let input = data.input || ctx.lastScrape || '';
      if (typeof input === 'string' && input.startsWith('{{') && input.endsWith('}}')) {
        const ref = input.slice(2, -2).trim();
        if (scraped[ref] != null) input = scraped[ref];
        else if (ref === 'lastScrape') input = ctx.lastScrape;
      }
      const param = data.param || '';
      let result;
      switch (op) {
        case 'extract_regex': result = String(input).match(new RegExp(param, 'gi')) || []; break;
        case 'replace': result = String(input).replace(new RegExp(data.find || '', 'g'), data.replaceWith || ''); break;
        case 'json_parse': try { result = JSON.parse(String(input)); } catch { result = input; } break;
        case 'filter_array': result = Array.isArray(input) ? input.filter(item => (typeof item === 'object' ? JSON.stringify(item) : String(item)).toLowerCase().includes(param.toLowerCase())) : input; break;
        case 'sort_array': result = Array.isArray(input) ? [...input].sort((a, b) => String(param && typeof a === 'object' ? a[param] : a).localeCompare(String(param && typeof b === 'object' ? b[param] : b))) : input; break;
        case 'to_upper': result = String(input).toUpperCase(); break;
        case 'to_lower': result = String(input).toLowerCase(); break;
        case 'trim': result = String(input).trim(); break;
        case 'count': result = Array.isArray(input) ? input.length : String(input).length; break;
        case 'first_item': result = Array.isArray(input) ? input[0] : input; break;
        case 'last_item': result = Array.isArray(input) ? input[input.length - 1] : input; break;
        case 'format_date': try { result = new Date(String(input)).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); } catch { result = String(input); } break;
        default: result = input;
      }
      scraped[node.id] = result;
      ctx.lastScrape = typeof result === 'object' ? JSON.stringify(result) : String(result);
      onLog(`${label} Transform (${op})`);
      break;
    }

    case 'send_slack': {
      const webhookUrl = data.webhookUrl || (data.webhook && data.webhook.startsWith('vault:') ? secrets[data.webhook.slice('vault:'.length)] : data.webhook);
      if (!webhookUrl) throw new Error('send_slack node missing webhookUrl');
      const message = data.message || ctx.lastScrape || 'Stanley notification';
      onLog(`${label} Sending Slack message…`);
      const slackRes = await safeFetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: message }) }, { enabled: runtimeOptions.safeEgress });
      scraped[node.id] = { status: slackRes.status, ok: slackRes.ok };
      if (!slackRes.ok) throw new Error(`Slack webhook failed (${slackRes.status}).`);
      onLog(`${label} Slack ${slackRes.ok ? 'sent' : 'failed (' + slackRes.status + ')'}`);
      break;
    }

    case 'send_email': {
      const to = data.to;
      const subject = data.subject || 'Stanley Notification';
      const emailBody = data.body || ctx.lastScrape || '';
      if (!to) throw new Error('send_email node missing "to" address');
      const apiKey = secrets.SendGridApiKey || secrets.sendgrid_api_key;
      const from = data.from || secrets.SendGridFromEmail || secrets.sendgrid_from_email;
      if (!apiKey || !from) throw new Error('Email delivery requires SendGridApiKey and SendGridFromEmail in the Vault.');
      onLog(`${label} Sending email to ${to}…`);
      const emailRes = await safeFetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalizations: [{ to: [{ email: to }] }], from: { email: from }, subject, content: [{ type: 'text/plain', value: String(emailBody) }] }),
      }, { enabled: runtimeOptions.safeEgress });
      scraped[node.id] = { status: emailRes.status, ok: emailRes.ok };
      if (!emailRes.ok) throw new Error(`Email delivery failed (${emailRes.status}).`);
      onLog(`${label} Email sent.`);
      break;
    }

    case 'monitor': {
      const crypto = require('crypto');
      const content = await agent.scrapeContent(data.selector);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      // For cloud runs, store state in Firestore if db is available, otherwise in-memory
      let prevHash;
      if (runtimeOptions?.db && uid && workflow?.id) {
        try {
          const stateRef = runtimeOptions.db.collection('stanley_users').doc(uid).collection('monitor_state').doc(`${workflow.id}:${node.id}`);
          const stateDoc = await stateRef.get();
          prevHash = stateDoc.exists ? stateDoc.data().hash : undefined;
          if (runtimeOptions.twoPhaseMonitors && runId) {
            await runtimeOptions.db.collection('stanley_users').doc(uid).collection('monitor_candidates').doc(`${runId}:${node.id}`).set({
              runId, workflowId: workflow.id, nodeId: node.id, baselineId: `${workflow.id}:${node.id}`,
              hash, previousHash: prevHash ?? null, state: 'pending', createdAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 7 * 86400000),
            });
          } else {
            await stateRef.set({ hash, workflowId: workflow.id, nodeId: node.id, updatedAt: new Date() });
          }
        } catch { /* first run or db error */ }
      }
      const changed = prevHash !== undefined && prevHash !== hash;
      ctx.lastConditionResult = changed;
      scraped[node.id] = { changed, hash, previousHash: prevHash || null, contentLength: content.length };
      if (prevHash === undefined) {
        onLog(`${label} Monitor baseline captured. Hash: ${hash.slice(0, 12)}…`);
      } else if (changed) {
        onLog(`${label} ⚡ Change detected!`);
      } else {
        onLog(`${label} No change detected.`);
      }
      break;
    }

    default:
      throw new Error(`Unsupported node type "${node.type}". Replace or remove it before running.`);
  }
}

// ── Neuro-symbolic action resolution ─────────────────────────────────────────
// Tier 1 CSS selector → Tier 2 semantic locator → Tier 3 vision (only where the
// agent + a resolver support it). In the extension, nativeAgent.clickByNaturalLocator
// itself escalates to vision internally (it owns the screenshot path), so the
// tier-3 block here stays inert (no clickByStrategy on nativeAgent).

function cleanDescription(desc) {
  const text = (desc || '').trim().toLowerCase();
  if (!text) return '';
  return text.replace(/\s+(field|input|box|bar|button|link|element|area|textbox|searchbox|text|form)$/gi, '')
             .replace(/\s+(field|input|box|bar|button|link|element|area|textbox|searchbox|text|form)$/gi, '') // double strip for "input field"
             .trim();
}

async function retryWithBackoff(fn, onLog, maxRetries = 3, baseDelayMs = 2000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = /429|quota|rate limit|too many requests/i.test(err.message);
      if (isRateLimit && i < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, i);
        onLog(`   [Rate Limit] Hit 429. Auto-pausing execution. Cooling down for ${delay / 1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
}

async function resolveSelectorFallback(agent, failedSelector, description, onLog, visionResolver) {
  if (!visionResolver || typeof visionResolver.generateText !== 'function') return null;
  
  onLog(`   [Self-Healing] Intercepting DOM snapshot for failed selector: "${failedSelector}"`);
  try {
    const semanticSnapshot = agent._browserRuntime ? await agent._browserRuntime.snapshot() : null;
    const elements = semanticSnapshot
      ? semanticSnapshot.elements.slice(0, 120).map(({ ref, role, name, editable, disabled }) => ({ ref, role, name, editable, disabled }))
      : await agent.getPrunedInteractiveElements();
    const elementsSnapshot = JSON.stringify(elements);
    const answerKind = semanticSnapshot ? 'accessibility ref (for example ax-0123456789ab)' : 'index as a plain number (for example 5)';

    const prompt = `The browser automation failed to interact with selector "${failedSelector}".
Target Element Description: "${description || 'the interactive element'}"
Here is a list of interactive elements currently on the page:
${elementsSnapshot}

Identify the correct element from the list that matches the user's intent. Return only its ${answerKind}. If no match is found, return -1.`;

    const system = `You are a self-healing browser automation assistant. Return only one identifier from the supplied list.`;
    const reply = await retryWithBackoff(() => visionResolver.generateText(prompt, system), onLog);
    if (semanticSnapshot) {
      const matchedRef = reply.match(/ax-[a-f0-9]{12}/i)?.[0]?.toLowerCase();
      if (matchedRef && semanticSnapshot.elements.some((element) => element.ref === matchedRef)) {
        onLog(`   [Self-Healing] Resolved semantic accessibility reference: ${matchedRef}`);
        return `ref_${matchedRef}`;
      }
      return null;
    }
    const matchedIndex = parseInt(reply.trim().match(/-?\d+/)?.[0] || '-1', 10);
    
    if (matchedIndex !== -1) {
      onLog(`   [Self-Healing] Resolved alternative element index: ${matchedIndex}`);
      return `index_${matchedIndex}`;
    }
  } catch (err) {
    onLog(`   [Self-Healing] Fallback resolver failed: ${err.message}`);
  }
  return null;
}

async function smartClick(agent, data, onLog, visionResolver) {
  if (data.elementRef && agent._browserRuntime) {
    await agent._browserRuntime.clickRef(data.elementRef);
    return null;
  }
  if (data.selector) {
    try {
      await agent.waitForSelector(data.selector, 5000);
      await agent.click(data.selector);
      return null;
    } catch (e) {
      // Try self healing first
      const healedSelector = await resolveSelectorFallback(agent, data.selector, data.intentFallback || data.description, onLog, visionResolver);
      if (healedSelector) {
        if (healedSelector.startsWith('ref_') && agent._browserRuntime) {
          await agent._browserRuntime.clickRef(healedSelector.slice(4));
          return null;
        }
        const index = parseInt(healedSelector.replace('index_', ''), 10);
        if (!isNaN(index)) {
          await agent.clickByIndex(index);
          return healedSelector;
        }
      }
      if (!data.description && !data.intentFallback) throw e;
      onLog(`   ↳ CSS selector failed; escalating to intent matching.`);
    }
  }
  const desc = data.intentFallback || data.description;
  if (desc) {
    const cleanDesc = cleanDescription(desc);
    const res = await agent.clickByNaturalLocator(cleanDesc);
    if (res) {
      return typeof res === 'object' ? res.resolvedSelector : null;
    }
    if (visionResolver &&
        typeof agent.captureScreenshotBase64 === 'function' &&
        typeof agent.clickByStrategy === 'function') {
      onLog(`   ↳ Semantic match missed; asking Gemini vision…`);
      const loc = await retryWithBackoff(async () => visionResolver.resolveElement(await agent.captureScreenshotBase64(), cleanDesc, agent._aiContext), onLog);
      onLog(`   ↳ [Vision] "${cleanDesc}" → ${loc.strategy}${loc.roleType ? '/' + loc.roleType : ''}:"${loc.value}"`);
      await agent.clickByStrategy(loc.strategy, loc.value, loc.roleType);
      return loc.strategy === 'css' ? loc.value : null;
    }
    throw new Error(`Could not locate clickable element: "${desc}"`);
  }
  throw new Error('Click node missing selector/description');
}

async function smartType(agent, data, value, onLog, visionResolver) {
  if (data.elementRef && agent._browserRuntime) {
    await agent._browserRuntime.fillRef(data.elementRef, value);
    return null;
  }
  if (data.selector) {
    try {
      await agent.waitForSelector(data.selector, 5000);
      await agent.type(data.selector, value);
      return null;
    } catch (e) {
      // Try self healing first
      const healedSelector = await resolveSelectorFallback(agent, data.selector, data.intentFallback || data.description, onLog, visionResolver);
      if (healedSelector) {
        if (healedSelector.startsWith('ref_') && agent._browserRuntime) {
          await agent._browserRuntime.fillRef(healedSelector.slice(4), value);
          return null;
        }
        const index = parseInt(healedSelector.replace('index_', ''), 10);
        if (!isNaN(index)) {
          await agent.typeByIndex(index, value);
          return healedSelector;
        }
      }
      if (!data.description && !data.intentFallback) throw e;
      onLog(`   ↳ CSS selector failed; escalating to intent matching.`);
    }
  }
  const desc = data.intentFallback || data.description;
  if (desc) {
    const cleanDesc = cleanDescription(desc);
    const res = await agent.typeByNaturalLocator(cleanDesc, value);
    if (res) {
      return typeof res === 'object' ? res.resolvedSelector : null;
    }
    if (visionResolver &&
        typeof agent.captureScreenshotBase64 === 'function' &&
        typeof agent.typeByStrategy === 'function') {
      onLog(`   ↳ Semantic match missed; asking Gemini vision…`);
      const loc = await retryWithBackoff(async () => visionResolver.resolveElement(await agent.captureScreenshotBase64(), cleanDesc, agent._aiContext), onLog);
      onLog(`   ↳ [Vision] "${cleanDesc}" → ${loc.strategy}${loc.roleType ? '/' + loc.roleType : ''}:"${loc.value}"`);
      await agent.typeByStrategy(loc.strategy, loc.value, value, loc.roleType);
      return loc.strategy === 'css' ? loc.value : null;
    }
    throw new Error(`Could not locate input: "${desc}"`);
  }
  throw new Error('Type node missing selector/description');
}

// Optional, non-fatal post-step check. Runs only when the node author set a
// `data.expect` description of what should appear after the action.
async function maybeVerify(agent, data, ctx, onLog, label) {
  if (!data.expect || typeof agent.elementExists !== 'function') return;
  try {
    const ok = await agent.elementExists(data.expect);
    if (ok) {
      onLog(`${label} ✓ Verified: "${data.expect}" present.`);
    } else {
      ctx.lastWarning = `Expected "${data.expect}" not found after ${label}.`;
      onLog(`${label} ⚠ Verify failed: expected "${data.expect}" not found (continuing).`);
    }
  } catch (e) {
    onLog(`${label} ⚠ Verify error: ${e.message}`);
  }
}

function interpolate(tpl, ctx, scraped) {
  return String(tpl)
    .replace(/\{\{\s*lastScrape\s*\}\}/g, ctx.lastScrape || '')
    .replace(/\{\{\s*lastAiResult\s*\}\}/g, ctx.lastAiResult || '')
    .replace(/\{\{\s*loopIndex\s*\}\}/g, ctx.loopIndex != null ? String(ctx.loopIndex) : '')
    .replace(/\{\{\s*loop\.(\w+)\s*\}\}/g, (_m, field) => {
      if (ctx.loopItem == null) return '';
      const v = ctx.loopItem[field];
      return v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
    })
    .replace(/\{\{\s*(?:input|trigger)\.([\w.]+)\s*\}\}/g, (_m, path) => {
      const v = getPath(ctx.input, path);
      return v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
    })
    .replace(/\{\{\s*(?:context|data)\.([\w.]+)\s*\}\}/g, (_m, path) => {
      const v = getPath(ctx.data, path);
      return v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
    })
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (m, id) => (scraped[id] != null ? String(scraped[id]) : m));
}

function getPath(obj, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function interpolateFields(data, ctx, scraped) {
  const visit = (value) => {
    if (typeof value === 'string') return value.includes('{{') ? interpolate(value, ctx, scraped) : value;
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item)]));
    return value;
  };
  return visit(data);
}

// ── Sub nodes (parameter merging) ────────────────────────────────────────────
function collectParams(node, workflow, nodesById) {
  const params = {};
  for (const e of workflow.edges || []) {
    if (e.kind !== 'context') continue;
    let otherId = null;
    if (e.source === node.id) otherId = e.target;
    else if (e.target === node.id) otherId = e.source;
    if (!otherId) continue;
    const other = nodesById[otherId];
    if (other && other.type === 'parameter') Object.assign(params, other.data || {});
  }
  return params;
}

function buildAiContext(missionPrompt, params) {
  const parts = [];
  if (missionPrompt) parts.push(`Overall goal: ${missionPrompt}`);
  const shown = describeParams(params);
  if (shown) parts.push(`Provided parameters for this step: ${shown}`);
  return parts.join('\n');
}

function describeParams(params) {
  if (!params) return '';
  return Object.entries(params)
    .map(([k, v]) => `${k}: ${String(v).startsWith('vault:') ? '[secret]' : v}`)
    .join('; ');
}

function parseObject(value, label) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* handled below */ }
  }
  throw new Error(`${label} must be a JSON object.`);
}


module.exports = {
  MAX_STEPS_DEFAULT,
  evaluateCondition,
  isFailureCondition,
  pickNextEdge,
  buildLabelMap,
  executeGraph
};
