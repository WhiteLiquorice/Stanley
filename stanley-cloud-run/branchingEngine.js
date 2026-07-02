/**
 * branchingEngine.js — shared branching/conditional-flow logic for Stanley.
 * ES module. Exports: evaluateCondition, isFailureCondition, pickNextEdge,
 * buildLabelMap, executeGraph, MAX_STEPS_DEFAULT.
 */

const crypto = require('crypto');
const { executePythonScript } = require('./pythonExecutor.js');
const { generatePythonApi } = require('./apiResolver.js');

const MAX_STEPS_DEFAULT = 500;

async function evaluateCondition(condition, ctx) {
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

function isFailureCondition(condition) {
  const type = typeof condition === 'string' ? condition : (condition && condition.type);
  return type === 'onFailure';
}

async function pickNextEdge(outgoingEdges, ctx) {
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

function buildLabelMap(actions) {
  const map = {};
  actions.forEach((step, i) => {
    if (step && (step.action === 'label' || step.label) && typeof step.label === 'string') {
      if (map[step.label] === undefined) map[step.label] = i;
    }
  });
  return map;
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
  const ctx = { agent, lastError: null, lastScrape: '', lastConditionResult: null, missionPrompt, stepParams: {}, input, onSelfHealed: opts.onSelfHealed };
  let steps = 0;

  while (current) {
    if (++steps > maxSteps) {
      throw new Error(`Exceeded max steps (${maxSteps}). The workflow may contain an infinite loop.`);
    }
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

    // 1. Pre-Execution Cache Check: Did another user already auto-generate a Python API script for this?
    if (opts.db && url && url !== 'about:blank' && effectiveNode.type !== 'navigate' && effectiveNode.type !== 'trigger') {
      try {
        const cachedDoc = await opts.db.collection('global_api_scripts').doc(scriptHash).get();
        if (cachedDoc.exists) {
          onLog(`${label} Found cached global Python API script for goal. Bypassing browser...`);
          const cachedScript = cachedDoc.data().code;
          const apiResult = await executePythonScript(cachedScript, onLog);
          scraped[effectiveNode.id] = apiResult;
          ctx.lastScrape = typeof apiResult === 'string' ? apiResult : JSON.stringify(apiResult);
          usedCachedApi = true;
          ctx.lastError = null;
        }
      } catch (cacheErr) {
        onLog(`[Cache Error] ${cacheErr.message}`);
      }
    }

    if (!usedCachedApi) {
      try {
        await runGraphNode(agent, effectiveNode, { onLog, secrets, scraped, ctx, label, visionResolver });
      } catch (err) {
        // Step failed! Let's become agentic upon failure!
        onLog(`${label} failed: "${err.message}". Initiating Agentic Recovery...`);
        
        // 2. Python API Generation Fallback
        if (opts.db && url && url !== 'about:blank') {
          onLog(`[Recovery] Attempting to generate Python API script for goal: "${goal}"…`);
          try {
            const htmlContext = agent.page ? await agent.page.content().catch(()=>'') : '';
            const scriptCode = await generatePythonApi(goal, url, htmlContext, secrets);
            if (scriptCode) {
              onLog(`[Recovery] Executing generated Python script...`);
              const apiResult = await executePythonScript(scriptCode, onLog);
              scraped[effectiveNode.id] = apiResult;
              ctx.lastScrape = typeof apiResult === 'string' ? apiResult : JSON.stringify(apiResult);
              
              // Cache it globally!
              await opts.db.collection('global_api_scripts').doc(scriptHash).set({
                goal, url: normalizedUrl, code: scriptCode, createdAt: new Date()
              });
              onLog(`[Recovery] Python API script succeeded and cached globally!`);
              ctx.lastError = null;
              usedCachedApi = true;
            }
          } catch (apiErr) {
            onLog(`[Recovery] Python API fallback failed: ${apiErr.message}. Falling back to visual RPA...`);
          }
        }

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
                opts.onSelfHealed(effectiveNode.id, healedSelector);
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

    if (onBlocked && typeof agent.isPageBlocked === 'function') {
      try {
        const block = await agent.isPageBlocked();
        if (block && block.blocked) await onBlocked(block, label);
      } catch (_) { /* non-fatal */ }
    }

    // Context edges attach parameters; they are not part of execution flow.
    const outgoing = (workflow.edges || []).filter(e => e.source === current.id && e.kind !== 'context');
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

async function runGraphNode(agent, node, { onLog, secrets, scraped, ctx, label, visionResolver }) {
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
        ctx.onSelfHealed(node.id, healed);
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
        ctx.onSelfHealed(node.id, healed);
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

    case 'mission':
    case 'parameter':
      break;

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
            await runGraphNode(agent, targetNode, { onLog, secrets, scraped, ctx, label: `${label} [Page ${page} Scrape]`, visionResolver });
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

    case 'integration': {
      const integrationName = data.integrationName;
      if (!integrationName) throw new Error('Integration node missing integrationName');
      
      onLog(`${label} Invoking native API integration: ${integrationName}…`);
      
      const params = { ...data };
      delete params.integrationName;
      delete params.label;
      
      const integrationSecrets = {};
      for (const [k, v] of Object.entries(secrets)) {
        integrationSecrets[k] = v;
      }
      
      if (typeof agent.runIntegration === 'function') {
        const result = await agent.runIntegration(integrationName, params, integrationSecrets);
        if (result && result.success) {
          scraped[node.id] = result.data;
          ctx.lastScrape = typeof result.data === 'object' ? JSON.stringify(result.data) : String(result.data);
          onLog(`${label} Integration execution succeeded.`);
        } else {
          throw new Error(result?.error || 'Integration execution failed');
        }
      } else {
        if (visionResolver && typeof visionResolver.integration === 'function') {
          const result = await visionResolver.integration(integrationName, params, integrationSecrets);
          scraped[node.id] = result.data;
          ctx.lastScrape = typeof result.data === 'object' ? JSON.stringify(result.data) : String(result.data);
          onLog(`${label} Integration execution succeeded.`);
        } else {
          throw new Error('Integration resolver not configured for this run.');
        }
      }
      break;
    }

    default:
      onLog(`${label} Unknown node type "${node.type}" — skipped.`);
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

async function smartClick(agent, data, onLog, visionResolver) {
  if (data.selector) {
    try {
      await agent.waitForSelector(data.selector, 5000);
      await agent.click(data.selector);
      return null;
    } catch (e) {
      if (!data.description) throw e;
      onLog(`   ↳ CSS selector failed; escalating to intent matching.`);
    }
  }
  if (data.description) {
    const cleanDesc = cleanDescription(data.description);
    const res = await agent.clickByNaturalLocator(cleanDesc);
    if (res) {
      return typeof res === 'object' ? res.resolvedSelector : null;
    }
    if (visionResolver &&
        typeof agent.captureScreenshotBase64 === 'function' &&
        typeof agent.clickByStrategy === 'function') {
      onLog(`   ↳ Semantic match missed; asking Gemini vision…`);
      const loc = await visionResolver.resolveElement(await agent.captureScreenshotBase64(), cleanDesc, agent._aiContext);
      onLog(`   ↳ [Vision] "${cleanDesc}" → ${loc.strategy}${loc.roleType ? '/' + loc.roleType : ''}:"${loc.value}"`);
      await agent.clickByStrategy(loc.strategy, loc.value, loc.roleType);
      return loc.strategy === 'css' ? loc.value : null;
    }
    throw new Error(`Could not locate clickable element: "${data.description}"`);
  }
  throw new Error('Click node missing selector/description');
}

async function smartType(agent, data, value, onLog, visionResolver) {
  if (data.selector) {
    try {
      await agent.waitForSelector(data.selector, 5000);
      await agent.type(data.selector, value);
      return null;
    } catch (e) {
      if (!data.description) throw e;
      onLog(`   ↳ CSS selector failed; escalating to intent matching.`);
    }
  }
  if (data.description) {
    const cleanDesc = cleanDescription(data.description);
    const res = await agent.typeByNaturalLocator(cleanDesc, value);
    if (res) {
      return typeof res === 'object' ? res.resolvedSelector : null;
    }
    if (visionResolver &&
        typeof agent.captureScreenshotBase64 === 'function' &&
        typeof agent.typeByStrategy === 'function') {
      onLog(`   ↳ Semantic match missed; asking Gemini vision…`);
      const loc = await visionResolver.resolveElement(await agent.captureScreenshotBase64(), cleanDesc, agent._aiContext);
      onLog(`   ↳ [Vision] "${cleanDesc}" → ${loc.strategy}${loc.roleType ? '/' + loc.roleType : ''}:"${loc.value}"`);
      await agent.typeByStrategy(loc.strategy, loc.value, value, loc.roleType);
      return loc.strategy === 'css' ? loc.value : null;
    }
    throw new Error(`Could not locate input: "${data.description}"`);
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
    .replace(/\{\{\s*(?:input|trigger)\.([\w.]+)\s*\}\}/g, (_m, path) => {
      const v = getPath(ctx.input, path);
      return v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
    })
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (m, id) => (scraped[id] != null ? String(scraped[id]) : m));
}

function getPath(obj, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function interpolateFields(data, ctx, scraped) {
  const FIELDS = ['url', 'value', 'description', 'selector'];
  let copy = null;
  for (const f of FIELDS) {
    if (typeof data[f] === 'string' && data[f].includes('{{')) {
      copy = copy || { ...data };
      copy[f] = interpolate(data[f], ctx, scraped);
    }
  }
  return copy || data;
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


module.exports = {
  MAX_STEPS_DEFAULT,
  evaluateCondition,
  isFailureCondition,
  pickNextEdge,
  buildLabelMap,
  executeGraph
};
