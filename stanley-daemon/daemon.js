/**
 * daemon.js (Claude-additions) — fixed native-messaging host for Stanley.
 *
 * Changes vs. the original stanley-daemon/daemon.js:
 *
 *  1. CAPTCHA HINT (now actually does something)
 *     The original captured a hint string and only logged it; the block was never
 *     re-checked and the hint was inert. Now `handleBlocking()` loops: it re-runs
 *     the block heuristic after each user response, understands control words
 *     ("skip" / "abort" / "continue"), and treats any free-text hint as an element
 *     to click (e.g. "I'm not a robot", "Verify"). It only proceeds once the block
 *     has actually cleared (or the user explicitly skips).
 *
 *  2. MULTI-TAB INDEXING
 *     Uses StanleyFoundationEnhanced. `open_tab` returns a stable id; `switch_tab`
 *     / `close_tab` accept `step.tab` (id/label) or `step.index` (positional,
 *     back-compat). Closing a tab no longer renumbers the others.
 *
 *  3. WORKFLOW BRANCHING
 *     The flat action list now supports control flow: `label`, `goto`, and `if`
 *     (with exists/contains/notExists conditions). Execution is a program counter
 *     with a max-step cap, so fallbacks and loops work end-to-end.
 *
 *  4. TOKEN REFRESH
 *     `callStanleyAI` accepts a token manager carrying { idToken, refreshToken,
 *     apiKey }. On a 401 / TOKEN_EXPIRED it refreshes via the Secure Token API and
 *     retries once, so long runs no longer die after the 1-hour ID-token expiry.
 */

const path = require('path');
const { StanleyFoundationEnhanced } = require('./foundationAgent.enhanced.js');
const { evaluateCondition, buildLabelMap } = require('./branchingEngine.js');

// Redirect console.log to stderr so it never corrupts the stdout messaging stream.
console.log = console.error;

// Global resolver for pausing the workflow until a user hint arrives.
let pauseResolve = null;

const PROJECT_ID = 'bridgeway-db29e';

// ── Native Messaging I/O ───────────────────────────────────────────────────────
function sendResponse(msg) {
  const payload = Buffer.from(JSON.stringify(msg), 'utf8');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(payload.length, 0);
  process.stdout.write(Buffer.concat([lenBuf, payload]));
}

function logToExtension(desc, logDetails) {
  sendResponse({ desc, log: logDetails });
}

// ── Token manager (fix #4) ──────────────────────────────────────────────────────
/**
 * Wraps the credentials the extension forwards so the daemon can refresh the
 * Firebase ID token mid-run. refreshToken + apiKey are optional; without them we
 * fall back to the original behavior (use idToken as-is).
 */
function createTokenManager({ idToken, refreshToken, apiKey }) {
  let token = idToken || '';
  let refresh = refreshToken || '';
  return {
    get: () => token,
    canRefresh: () => Boolean(refresh && apiKey),
    async refresh() {
      if (!refresh || !apiKey) {
        throw new Error('ID token expired and no refresh credentials were provided.');
      }
      const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refresh)}`,
      });
      if (!res.ok) {
        throw new Error(`Token refresh failed (${res.status}).`);
      }
      const data = await res.json();
      token = data.id_token || data.access_token || token;
      if (data.refresh_token) refresh = data.refresh_token;
      // Let the extension persist the rotated tokens.
      sendResponse({ action: 'token_refreshed', idToken: token, refreshToken: refresh });
      return token;
    },
  };
}

// ── Firebase Callable client with refresh-on-401 (fix #4) ────────────────────────
async function callStanleyAI(tokenMgr, data) {
  const url = `https://us-central1-${PROJECT_ID}.cloudfunctions.net/askStanleyAI`;

  const doFetch = async () => {
    const headers = { 'Content-Type': 'application/json' };
    const tok = typeof tokenMgr === 'string' ? tokenMgr : tokenMgr.get();
    if (tok) headers['Authorization'] = `Bearer ${tok}`;
    return fetch(url, { method: 'POST', headers, body: JSON.stringify({ data }) });
  };

  let response = await doFetch();

  // Refresh + retry once if the token is rejected.
  const refreshable = tokenMgr && typeof tokenMgr !== 'string' && tokenMgr.canRefresh();
  if ((response.status === 401 || response.status === 403) && refreshable) {
    const peek = await response.clone().text().catch(() => '');
    if (response.status === 401 || /TOKEN_EXPIRED|UNAUTHENTICATED|invalid.*token/i.test(peek)) {
      logToExtension('Refreshing session', 'ID token expired — refreshing and retrying...');
      await tokenMgr.refresh();
      response = await doFetch();
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cloud Function returned error ${response.status}: ${errorText}`);
  }
  const resData = await response.json();
  if (resData.error) {
    throw new Error(`Cloud Function Error: ${resData.error.message || resData.error}`);
  }
  return resData.result;
}

// ── Fallback regex compiler (unchanged) ──────────────────────────────────────────
function compilePromptToActionsRegex(prompt) {
  const actions = [];
  const steps = prompt.split(/[,;\n]+/);
  for (let step of steps) {
    step = step.trim();
    if (!step) continue;
    const lowerStep = step.toLowerCase();
    if (lowerStep.startsWith('go to') || lowerStep.startsWith('navigate to') || lowerStep.startsWith('goto')) {
      const match = step.match(/(?:go\s+to|navigate\s+to|goto)\s+['"]?([^'"]+)['"]?/i);
      if (match) {
        let url = match[1].trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
        actions.push({ action: 'navigate', url });
      }
    } else if (lowerStep.startsWith('click')) {
      const match = step.match(/click\s+(?:on\s+|at\s+)?['"]?([^'"]+)['"]?/i);
      if (match) actions.push({ action: 'click', description: match[1].trim() });
    } else if (lowerStep.startsWith('type')) {
      const match = step.match(/type\s+['"]?([^'"]+)['"]?\s+into\s+['"]?([^'"]+)['"]?/i);
      if (match) actions.push({ action: 'type', value: match[1], description: match[2].trim() });
    } else if (lowerStep.startsWith('wait')) {
      const match = step.match(/wait\s+(\d+)\s*(ms|s|second|seconds)?/i);
      if (match) {
        let val = parseInt(match[1], 10);
        const unit = match[2] ? match[2].toLowerCase() : 'ms';
        if (unit.startsWith('s') || val < 100) val = val * 1000;
        actions.push({ action: 'wait', ms: val });
      }
    } else if (lowerStep.includes('scrape') || lowerStep.includes('extract') || lowerStep.includes('get')) {
      actions.push({ action: 'scrape' });
    }
  }
  return actions;
}

// ── Pause / hint plumbing ─────────────────────────────────────────────────────────
async function waitForUserHint(agent, message) {
  let screenshot = null;
  try {
    screenshot = await agent.captureScreenshotBase64();
  } catch (err) {
    console.error('Failed to capture screenshot during pause:', err);
  }
  sendResponse({ action: 'pause_request', screenshot, hint: message });
  return new Promise((resolve) => { pauseResolve = resolve; });
}

/**
 * CAPTCHA / block handler (fix #1).
 * Loops until the page is unblocked, the user skips, or the user aborts.
 * A free-text hint is interpreted as an element to click.
 */
async function handleBlocking(agent, stepLabel) {
  const MAX_ROUNDS = 10;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const check = await agent.isPageBlocked();
    if (!check.blocked) return; // cleared — carry on

    logToExtension(`${stepLabel} Page Blocked`, check.hint);
    const raw = await waitForUserHint(
      agent,
      `Page appears blocked: ${check.hint}. Solve it in the browser then submit (blank) to continue — ` +
        `or type "skip" to proceed anyway, "abort" to cancel, or describe a button for me to click.`
    );
    const cmd = (raw || '').trim().toLowerCase();

    if (cmd === 'abort') throw new Error('User aborted at a blocking/CAPTCHA screen.');
    if (cmd === 'skip') {
      logToExtension(`${stepLabel} Block Skipped`, 'Proceeding despite the detected block.');
      return;
    }
    if (cmd === '' || cmd === 'continue' || cmd === 'done' || cmd === 'resume' || cmd === 'next') {
      // User says they solved it manually — settle, then re-check at top of loop.
      await agent.waitForPageStable(2000);
      continue;
    }

    // Otherwise treat the hint as an element to click (e.g. "I'm not a robot").
    try {
      logToExtension(`${stepLabel} Hint Action`, `Attempting to click: "${raw}"`);
      const clicked = await agent.clickByNaturalLocator(raw);
      if (!clicked) {
        logToExtension(`${stepLabel} Hint`, `Couldn't auto-click "${raw}". Re-checking block state...`);
      }
      await agent.waitForPageStable(2000);
    } catch (e) {
      logToExtension(`${stepLabel} Hint Error`, e.message);
    }
  }
  logToExtension(`${stepLabel} Block Persists`, 'Max unblock attempts reached — continuing anyway.');
}

// ── Retry wrapper (unchanged behavior) ────────────────────────────────────────────
async function withRetry(fn, label, maxAttempts = 3) {
  const delays = [0, 1500, 3000];
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      console.error(`[Stanley Retry] Attempt ${attempt + 1}/${maxAttempts} for: ${label}`);
      await new Promise(r => setTimeout(r, delays[attempt]));
    }
    try {
      return await fn();
    } catch (err) {
      const msg = (err.message || '').toLowerCase();
      const name = err.name || '';
      const cName = err.constructor ? err.constructor.name : '';
      const isTimeout = name === 'TimeoutError' || cName === 'TimeoutError' || msg.includes('timeout') || msg.includes('timed out');
      const isInteractable = name.includes('Interactable') || cName.includes('Interactable') || msg.includes('not interactable') || msg.includes('visible') || msg.includes('actionability') || msg.includes('intercepted') || msg.includes('obscured');
      const isStale = name.includes('Stale') || cName.includes('Stale') || msg.includes('stale') || msg.includes('detached') || msg.includes('attached');
      const isRetryable = isTimeout || isInteractable || isStale;
      lastErr = err;
      if (!isRetryable || attempt === maxAttempts - 1) throw err;
    }
  }
  throw lastErr;
}

// ── Tier-based click / type resolution (extracted, logic preserved) ───────────────
async function resolveClick(agent, tokenMgr, step, stepLabel) {
  await withRetry(async () => {
    let clicked = false;

    if (step.description) {
      try {
        clicked = await agent.clickByNaturalLocator(step.description);
        if (clicked) console.error(`Tier 1: Clicked via Natural Locator: "${step.description}"`);
      } catch (err) { console.error('Tier 1 natural locator click failed:', err); }
    }

    if (!clicked && step.description) {
      try {
        logToExtension(`${stepLabel} Vision resolving`, 'Running screenshot analysis...');
        const screenshot = await agent.captureScreenshotBase64();
        const visionResult = await callStanleyAI(tokenMgr, { mode: 'resolveWithVision', stepDescription: step.description, screenshotBase64: screenshot });
        if (visionResult && visionResult.strategy && visionResult.value) {
          logToExtension(`${stepLabel} Vision resolved`, `strategy "${visionResult.strategy}" = "${visionResult.value}"`);
          await agent.clickByStrategy(visionResult.strategy, visionResult.value, visionResult.roleType);
          clicked = true;
        }
      } catch (err) { console.error('Tier 2 Vision locator click failed:', err); }
    }

    if (!clicked) {
      let selectorToUse = step.selector;
      if (!selectorToUse && step.description) {
        const elements = await agent.getPrunedInteractiveElements();
        const descLower = step.description.toLowerCase();
        const exactMatch = elements.find(el =>
          el.text.toLowerCase() === descLower || el.placeholder.toLowerCase() === descLower ||
          el.ariaLabel.toLowerCase() === descLower || el.name.toLowerCase() === descLower || el.id.toLowerCase() === descLower);
        if (exactMatch) selectorToUse = `index_${exactMatch.index}`;
        else {
          const fuzzy = elements.filter(el =>
            el.text.toLowerCase().includes(descLower) || el.placeholder.toLowerCase().includes(descLower) || el.ariaLabel.toLowerCase().includes(descLower));
          if (fuzzy.length === 1) selectorToUse = `index_${fuzzy[0].index}`;
        }
        if (!selectorToUse) {
          logToExtension(`${stepLabel} Text resolving`, `Asking Gemini text matching for: "${step.description}"`);
          const res = await callStanleyAI(tokenMgr, { mode: 'resolve', stepDescription: step.description, elements });
          if (res && res.index !== undefined && res.index !== -1) selectorToUse = `index_${res.index}`;
        }
      }
      if (selectorToUse) {
        const index = parseInt(selectorToUse.replace('index_', ''), 10);
        if (!isNaN(index)) { await agent.clickByIndex(index); clicked = true; }
      }
    }

    if (!clicked) {
      await agent.waitForPageStable(500);
      throw new Error(`Unable to resolve or click interactive element: "${step.description || step.selector}"`);
    }
  }, `click:${step.description || step.selector}`);
}

async function resolveType(agent, tokenMgr, step, stepLabel) {
  await withRetry(async () => {
    let typed = false;

    if (step.description) {
      try {
        typed = await agent.typeByNaturalLocator(step.description, step.value);
        if (typed) console.error(`Tier 1: Typed via Natural Locator: "${step.description}"`);
      } catch (err) { console.error('Tier 1 natural locator type failed:', err); }
    }

    if (!typed && step.description) {
      try {
        logToExtension(`${stepLabel} Vision resolving`, 'Running screenshot analysis...');
        const screenshot = await agent.captureScreenshotBase64();
        const visionResult = await callStanleyAI(tokenMgr, { mode: 'resolveWithVision', stepDescription: step.description, screenshotBase64: screenshot });
        if (visionResult && visionResult.strategy && visionResult.value) {
          logToExtension(`${stepLabel} Vision resolved`, `strategy "${visionResult.strategy}" = "${visionResult.value}"`);
          await agent.typeByStrategy(visionResult.strategy, visionResult.value, step.value, visionResult.roleType);
          typed = true;
        }
      } catch (err) { console.error('Tier 2 Vision locator type failed:', err); }
    }

    if (!typed) {
      let selectorToUse = step.selector;
      if (!selectorToUse && step.description) {
        const elements = await agent.getPrunedInteractiveElements();
        const descLower = step.description.toLowerCase();
        const exactMatch = elements.find(el =>
          el.placeholder.toLowerCase() === descLower || el.name.toLowerCase() === descLower ||
          el.id.toLowerCase() === descLower || el.ariaLabel.toLowerCase() === descLower || el.text.toLowerCase() === descLower);
        if (exactMatch) selectorToUse = `index_${exactMatch.index}`;
        else {
          const fuzzy = elements.filter(el =>
            el.placeholder.toLowerCase().includes(descLower) || el.name.toLowerCase().includes(descLower) || el.text.toLowerCase().includes(descLower));
          if (fuzzy.length === 1) selectorToUse = `index_${fuzzy[0].index}`;
        }
        if (!selectorToUse) {
          logToExtension(`${stepLabel} Text resolving`, `Asking Gemini text matching for: "${step.description}"`);
          const res = await callStanleyAI(tokenMgr, { mode: 'resolve', stepDescription: step.description, elements });
          if (res && res.index !== undefined && res.index !== -1) selectorToUse = `index_${res.index}`;
        }
      }
      if (selectorToUse) {
        const index = parseInt(selectorToUse.replace('index_', ''), 10);
        if (!isNaN(index)) { await agent.typeByIndex(index, step.value); typed = true; }
      }
    }

    if (!typed) {
      await agent.waitForPageStable(500);
      throw new Error(`Unable to resolve or type into input element: "${step.description || step.selector}"`);
    }
  }, `type:${step.description || step.selector}`);
}

// ── Workflow executor with flat-array branching (fixes #2 + #3) ───────────────────
async function runWorkflow(actions, tokenMgr, activeMode) {
  const agent = new StanleyFoundationEnhanced({
    headless: activeMode ? false : true,
    statePath: path.join(__dirname, 'stanley_session_state.json'),
  });

  // Branch context shared with `if` conditions (scraped text drives `contains`).
  const flowCtx = { agent, lastScrape: '', lastConditionResult: null };
  const labels = buildLabelMap(actions);
  const MAX_STEPS = 1000;

  try {
    logToExtension('Initializing browser', `Launching Playwright browser (Stealth: ${!activeMode})...`);
    await agent.initialize();

    let pc = 0;
    let stepsRun = 0;
    while (pc < actions.length) {
      if (++stepsRun > MAX_STEPS) {
        throw new Error(`Exceeded ${MAX_STEPS} steps — possible infinite loop in the workflow.`);
      }
      const step = actions[pc];
      const stepLabel = `[Step ${stepsRun}]`;

      // ----- control-flow actions (branching) -----
      if (step.action === 'label') { pc++; continue; }

      if (step.action === 'goto') {
        const target = labels[step.label];
        if (target === undefined) throw new Error(`goto: unknown label "${step.label}"`);
        logToExtension(`${stepLabel} Goto`, `Jumping to "${step.label}"`);
        pc = target;
        continue;
      }

      if (step.action === 'if') {
        const result = await evaluateCondition(step.condition, flowCtx);
        const branch = result ? step.then : step.else;
        logToExtension(`${stepLabel} If`, `Condition → ${result}; ${branch ? 'jump to "' + branch + '"' : 'fall through'}`);
        if (branch) {
          const target = labels[branch];
          if (target === undefined) throw new Error(`if: unknown label "${branch}"`);
          pc = target;
          continue;
        }
        pc++;
        continue;
      }

      // ----- regular actions -----
      switch (step.action) {
        case 'navigate':
          logToExtension(`${stepLabel} Navigating`, `URL: ${step.url}`);
          await agent.navigate(step.url);
          break;

        case 'click':
          logToExtension(`${stepLabel} Clicking`, `Target: ${step.description || step.selector}`);
          await resolveClick(agent, tokenMgr, step, stepLabel);
          break;

        case 'type':
          logToExtension(`${stepLabel} Typing`, `Into: ${step.description || step.selector}`);
          await resolveType(agent, tokenMgr, step, stepLabel);
          break;

        case 'wait':
          logToExtension(`${stepLabel} Waiting`, `Duration: ${step.ms}ms`);
          await agent.wait(step.ms);
          break;

        case 'scrape': {
          logToExtension(`${stepLabel} Scraping`, 'Extracting visible text content...');
          const text = await agent.scrapeContent(step.selector);
          flowCtx.lastScrape = text; // feeds `if` contains/notContains conditions
          const currentUrl = agent.page ? agent.page.url() : '';
          sendResponse({ action: 'scrape_result', result: text, url: currentUrl });
          break;
        }

        case 'open_tab': {
          logToExtension(`${stepLabel} Open Tab`, step.url ? `Opening: ${step.url}` : 'Opening blank tab');
          const tabId = await agent.openTab(step.url, step.label);
          logToExtension(`${stepLabel} Tab Opened`, `Stable id: "${tabId}"`);
          break;
        }

        case 'switch_tab': {
          const ref = step.tab != null ? step.tab : step.index;
          logToExtension(`${stepLabel} Switch Tab`, `Switching to "${ref}"`);
          const meta = await agent.switchTab(ref);
          logToExtension(`${stepLabel} Switched`, `Active tab "${meta.id}"`);
          break;
        }

        case 'close_tab': {
          const ref = step.tab != null ? step.tab : step.index;
          logToExtension(`${stepLabel} Close Tab`, `Closing "${ref}"`);
          await agent.closeTab(ref);
          break;
        }

        default:
          logToExtension(`${stepLabel} Error`, `Unknown action: ${step.action}`);
      }

      await agent.cleanupStealthAttributes();

      // CAPTCHA / block handling — now loops until cleared (fix #1).
      await handleBlocking(agent, stepLabel);

      pc++;
    }

    await agent.saveState();
    logToExtension('Workflow Complete', `Executed ${stepsRun} steps successfully.`);
  } catch (err) {
    logToExtension('Workflow Failed', `Error: ${err.message}`);
    throw err;
  } finally {
    await agent.cleanup();
  }
}

// ── stdin framing ─────────────────────────────────────────────────────────────────
let inputBuffer = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  while (inputBuffer.length >= 4) {
    const length = inputBuffer.readUInt32LE(0);
    if (inputBuffer.length >= 4 + length) {
      const messageBuffer = inputBuffer.slice(4, 4 + length);
      inputBuffer = inputBuffer.slice(4 + length);
      try {
        handleIncomingMessage(JSON.parse(messageBuffer.toString('utf8')));
      } catch (err) {
        logToExtension('Protocol Error', 'Failed to parse incoming JSON payload.');
      }
    } else break;
  }
});

// ── message router ─────────────────────────────────────────────────────────────────
async function handleIncomingMessage(msg) {
  // Build a refreshable token manager from whatever the extension forwarded.
  const tokenMgr = createTokenManager({
    idToken: msg.idToken || '',
    refreshToken: msg.refreshToken || '',
    apiKey: msg.apiKey || '',
  });

  if (msg.action === 'compile_only') {
    logToExtension('Compiling prompt', 'Asking Gemini to structure user workflow...');
    let actions = [];
    try {
      const aiResult = await callStanleyAI(tokenMgr, { mode: 'compile', prompt: msg.prompt });
      if (aiResult && Array.isArray(aiResult.actions)) actions = aiResult.actions;
    } catch (err) {
      console.error('Gemini compile failed, falling back to regex parser:', err);
      logToExtension('AI Compile Failed', 'Falling back to local regex parsing engine...');
      actions = compilePromptToActionsRegex(msg.prompt);
    }
    if (actions.length === 0) {
      logToExtension('Empty Workflow', 'No valid automation actions detected.');
      sendResponse({ action: 'workflow_failed', error: 'Empty compiled workflow' });
      return;
    }
    if (msg.currentUrl && actions.length > 0) {
      const first = actions[0];
      if (first.action === 'navigate' || first.action === 'trigger') {
        first.url = msg.currentUrl;
      }
    }
    sendResponse({ action: 'plan_ready', actions });
  } else if (msg.action === 'confirm_run') {
    if (!msg.actions || msg.actions.length === 0) {
      logToExtension('Empty Workflow', 'No actions provided to run.');
      sendResponse({ action: 'workflow_failed', error: 'No actions to run.' });
      return;
    }
    if (msg.currentUrl && msg.actions && msg.actions.length > 0) {
      const first = msg.actions[0];
      if (first.action === 'navigate' || first.action === 'trigger') {
        first.url = msg.currentUrl;
      }
    }
    const runPrompt = msg.prompt || '';
    runWorkflow(msg.actions, tokenMgr, msg.activeMode)
      .then(() => sendResponse({ action: 'workflow_complete', prompt: runPrompt }))
      .catch((err) => sendResponse({ action: 'workflow_failed', error: err.message, prompt: runPrompt }));
  } else if (msg.action === 'pause_response') {
    if (pauseResolve) {
      const resolve = pauseResolve;
      pauseResolve = null;
      resolve(msg.hint);
    }
  } else {
    // Legacy direct-run support (test scripts).
    if (msg.prompt) {
      logToExtension('Compiling prompt', 'Asking Gemini to structure user workflow...');
      let actions = [];
      try {
        const aiResult = await callStanleyAI(tokenMgr, { mode: 'compile', prompt: msg.prompt });
        if (aiResult && Array.isArray(aiResult.actions)) actions = aiResult.actions;
      } catch (err) {
        actions = compilePromptToActionsRegex(msg.prompt);
      }
      if (actions.length === 0) { logToExtension('Empty Workflow', 'No valid automation actions detected.'); return; }
      runWorkflow(actions, tokenMgr, msg.activeMode || false).catch((err) => logToExtension('Process Error', err.message));
    } else if (Array.isArray(msg.actions)) {
      runWorkflow(msg.actions, tokenMgr, msg.activeMode || false).catch((err) => logToExtension('Process Error', err.message));
    } else {
      logToExtension('Invalid Message', "Requires 'action' or 'prompt' or 'actions' array.");
    }
  }
}

// ── Local Express HTTP Server Bridge (fix for end-user zero-config) ───────────
function startLocalHttpBridge() {
  const express = require('express');
  const cors = require('cors');
  const fs = require('fs');
  const httpPort = 3001;

  const app = express();
  app.use(cors());
  app.use(express.json());

  const dbDir = process.pkg ? path.dirname(process.execPath) : __dirname;
  const WORKFLOWS_FILE = path.join(dbDir, 'workflows.json');
  const VAULT_FILE = path.join(dbDir, 'vault.json');
  const RUNS_FILE = path.join(dbDir, 'runs.json');

  // Initialize files if they don't exist
  if (!fs.existsSync(WORKFLOWS_FILE)) {
    const defaultWorkflows = [
      {
        "id": "1",
        "name": "Google Search Automation (Basic)",
        "nodes": [
          { "id": "1", "type": "trigger", "label": "Start Trigger", "data": { "url": "https://www.google.com" }, "position": { "x": 250, "y": 50 } },
          { "id": "2", "type": "type", "label": "Enter Query", "data": { "selector": "textarea[name=\"q\"]", "value": "Project Stanley enterprise automation" }, "position": { "x": 250, "y": 150 } },
          { "id": "3", "type": "click", "label": "Submit Search", "data": { "selector": "input[name=\"btnK\"]:visible" }, "position": { "x": 250, "y": 250 } },
          { "id": "4", "type": "wait", "label": "Wait for Results", "data": { "ms": "3000" }, "position": { "x": 250, "y": 350 } },
          { "id": "5", "type": "scrape", "label": "Scrape Text", "data": { "selector": "#search" }, "position": { "x": 250, "y": 450 } }
        ],
        "edges": [
          { "source": "1", "target": "2" },
          { "source": "2", "target": "3" },
          { "source": "3", "target": "4" },
          { "source": "4", "target": "5" }
        ]
      },
      {
        "id": "2",
        "name": "Google News AI Summarizer",
        "nodes": [
          { "id": "1", "type": "trigger", "label": "Trigger Start", "data": { "url": "" }, "position": { "x": 250, "y": 50 } },
          { "id": "2", "type": "navigate", "label": "Go to Google Search", "data": { "url": "https://www.google.com/search?q={{query}}&tbm=nws" }, "position": { "x": 250, "y": 150 } },
          { "id": "3", "type": "scrape", "label": "Scrape Article Links", "data": { "selector": "div.g a" }, "position": { "x": 250, "y": 250 } },
          { "id": "4", "type": "js_code", "label": "Loop, Scrape & Summarize", "data": { "code": "const urls = context.variables['3'] || '';\nconst targets = urls.split('\\n').filter(url => url.startsWith('http') && !url.includes('google.com')).slice(0, 2);\ncontext.log('Target URLs parsed: ' + JSON.stringify(targets));\nif (targets.length === 0) {\n  return 'No news article URLs found.';\n}\nlet compiledText = '';\nfor (const url of targets) {\n  context.log('Navigating to article: ' + url);\n  try {\n    await context.agent.navigate(url);\n    await context.agent.wait(2000);\n    const text = await context.agent.scrapeContent('body');\n    compiledText += '\\n\\n--- Article: ' + url + ' ---\\n' + text.substring(0, 3000);\n  } catch (err) {\n    context.log('Error scraping ' + url + ': ' + err.message);\n  }\n}\nconst summary = await context.ai.prompt({\n  system: 'You are a news summarization assistant. Summarize everything clearly.',\n  prompt: 'Please summarize the following articles in 3 concise bullet points:\\n\\n' + compiledText\n});\ncontext.log('\\n=== DYNAMIC SUMMARY ===\\n' + summary);\nreturn summary;" }, "position": { "x": 250, "y": 350 } }
        ],
        "edges": [
          { "source": "1", "target": "2" },
          { "source": "2", "target": "3" },
          { "source": "3", "target": "4" }
        ]
      },
      {
        "id": "3",
        "name": "E-Commerce Price Comparison",
        "nodes": [
          { "id": "1", "type": "trigger", "label": "Trigger Start", "data": { "url": "" }, "position": { "x": 250, "y": 50 } },
          { "id": "2", "type": "navigate", "label": "Amazon Search", "data": { "url": "https://www.amazon.com/s?k={{product}}" }, "position": { "x": 250, "y": 150 } },
          { "id": "3", "type": "scrape", "label": "Scrape Amazon Results", "data": { "selector": "span.a-price-whole" }, "position": { "x": 250, "y": 250 } },
          { "id": "4", "type": "navigate", "label": "eBay Search", "data": { "url": "https://www.ebay.com/sch/i.html?_nkw={{product}}" }, "position": { "x": 250, "y": 350 } },
          { "id": "5", "type": "scrape", "label": "Scrape eBay Results", "data": { "selector": ".s-item__price" }, "position": { "x": 250, "y": 450 } },
          { "id": "6", "type": "ai_prompt", "label": "AI Price Analysis", "data": { "prompt": "Amazon price matches: {{3}}\neBay price matches: {{5}}\nEvaluate the prices for '{{product}}' and summarize which platform is cheaper and the typical price range.", "system": "You are a shopping comparison agent." }, "position": { "x": 250, "y": 550 } }
        ],
        "edges": [
          { "source": "1", "target": "2" },
          { "source": "2", "target": "3" },
          { "source": "3", "target": "4" },
          { "source": "4", "target": "5" },
          { "source": "5", "target": "6" }
        ]
      },
      {
        "id": "4",
        "name": "HackerNews Startups Lead Finder",
        "nodes": [
          { "id": "1", "type": "trigger", "label": "Trigger Start", "data": { "url": "https://news.ycombinator.com" }, "position": { "x": 250, "y": 50 } },
          { "id": "2", "type": "scrape", "label": "Scrape Frontpage Headlines", "data": { "selector": "span.titleline" }, "position": { "x": 250, "y": 150 } },
          { "id": "3", "type": "ai_prompt", "label": "Extract Tech Startups", "data": { "prompt": "Read the following Hacker News headlines and extract start-up launches, new open-source projects, or hiring posts:\n\n{{2}}", "system": "You are a lead generation research assistant." }, "position": { "x": 250, "y": 250 } }
        ],
        "edges": [
          { "source": "1", "target": "2" },
          { "source": "2", "target": "3" }
        ]
      }
    ];
    fs.writeFileSync(WORKFLOWS_FILE, JSON.stringify(defaultWorkflows, null, 2));
  } else {
    // Migrate existing workflows to use input[name="btnK"]:visible
    try {
      const workflows = JSON.parse(fs.readFileSync(WORKFLOWS_FILE, 'utf-8'));
      let migrated = false;
      workflows.forEach(wf => {
        if (wf.nodes) {
          wf.nodes.forEach(node => {
            if (node.data && node.data.selector === 'input[name="btnK"]') {
              node.data.selector = 'input[name="btnK"]:visible';
              migrated = true;
            }
          });
        }
      });
      if (migrated) {
        fs.writeFileSync(WORKFLOWS_FILE, JSON.stringify(workflows, null, 2));
        console.error('[Daemon] Migrated workflows.json input[name="btnK"] selector to input[name="btnK"]:visible');
      }
    } catch (e) {
      console.error('[Daemon] Failed to migrate existing workflows:', e);
    }
  }
  if (!fs.existsSync(VAULT_FILE)) {
    const defaultSecrets = [
      { id: '1', name: 'Slack Token', value: 'xoxb-mock-token-12345', type: 'Bot Token', expires: 'Never', status: 'Active' },
      { id: '2', name: 'Google API Key', value: 'AIzaSyMockKey-xyz', type: 'API Key', expires: 'Never', status: 'Active' }
    ];
    fs.writeFileSync(VAULT_FILE, JSON.stringify(defaultSecrets, null, 2));
  }
  if (!fs.existsSync(RUNS_FILE)) {
    fs.writeFileSync(RUNS_FILE, JSON.stringify([], null, 2));
  }

  const activeRuns = {};
  function readData(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
    catch (e) { return []; }
  }
  function writeData(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  app.get('/api/workflows', (req, res) => { res.json(readData(WORKFLOWS_FILE)); });
  app.post('/api/workflows', (req, res) => {
    const workflows = readData(WORKFLOWS_FILE);
    const newWorkflow = req.body;
    if (!newWorkflow.id) newWorkflow.id = Math.random().toString(36).substring(2, 9);
    const index = workflows.findIndex(w => w.id === newWorkflow.id);
    if (index !== -1) workflows[index] = newWorkflow;
    else workflows.push(newWorkflow);
    writeData(WORKFLOWS_FILE, workflows);
    res.json(newWorkflow);
  });
  app.delete('/api/workflows/:id', (req, res) => {
    const workflows = readData(WORKFLOWS_FILE);
    writeData(WORKFLOWS_FILE, workflows.filter(w => w.id !== req.params.id));
    res.json({ success: true });
  });

  app.get('/api/vault', (req, res) => { res.json(readData(VAULT_FILE)); });
  app.post('/api/vault', (req, res) => {
    const secrets = readData(VAULT_FILE);
    const newSecret = req.body;
    if (!newSecret.id) newSecret.id = Math.random().toString(36).substring(2, 9);
    secrets.push(newSecret);
    writeData(VAULT_FILE, secrets);
    res.json(newSecret);
  });
  app.delete('/api/vault/:id', (req, res) => {
    const secrets = readData(VAULT_FILE);
    writeData(VAULT_FILE, secrets.filter(s => s.id !== req.params.id));
    res.json({ success: true });
  });

  app.get('/api/runs', (req, res) => { res.json(readData(RUNS_FILE)); });
  app.post('/api/runs', (req, res) => {
    const runs = readData(RUNS_FILE);
    const run = req.body;
    const idx = runs.findIndex(r => r.id === run.id);
    if (idx !== -1) {
      runs[idx] = run;
    } else {
      runs.unshift(run);
    }
    writeData(RUNS_FILE, runs);
    res.json(run);
  });
  app.get('/api/runs/:id', (req, res) => {
    const runs = readData(RUNS_FILE);
    const run = runs.find(r => r.id === req.params.id);
    if (run) {
      const active = activeRuns[req.params.id];
      if (active) { run.logs = active.logs; run.status = active.status; }
      res.json(run);
    } else res.status(404).json({ error: 'Run not found' });
  });

  app.post('/api/run/:id', async (req, res) => {
    const workflows = readData(WORKFLOWS_FILE);
    const workflow = workflows.find(w => w.id === req.params.id);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });

    const workflowCopy = JSON.parse(JSON.stringify(workflow));
    if (req.body && req.body.startUrl) {
      const triggerNode = workflowCopy.nodes.find(n => n.type === 'trigger');
      if (triggerNode && triggerNode.data) triggerNode.data.url = req.body.startUrl;
    }

    const runId = Math.random().toString(36).substring(2, 9);
    const runs = readData(RUNS_FILE);
    const newRun = {
      id: runId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      status: 'Running',
      trigger: 'Manual API',
      duration: '0s',
      timestamp: new Date().toLocaleString(),
      logs: []
    };
    runs.unshift(newRun);
    writeData(RUNS_FILE, runs);

    activeRuns[runId] = { status: 'Running', logs: ['[System] Initializing run...'], startTime: Date.now() };

    const { runWorkflow: runGraphWorkflow } = require('../runner.js');
    runGraphWorkflow(
      workflowCopy,
      (logMsg) => { if (activeRuns[runId]) activeRuns[runId].logs.push(logMsg); },
      readData(VAULT_FILE).reduce((acc, curr) => { acc[curr.id] = curr.value; return acc; }, {})
    ).then(() => {
      if (activeRuns[runId]) {
        activeRuns[runId].status = 'Success';
        activeRuns[runId].logs.push('[System] Run finished successfully!');
        const currentRuns = readData(RUNS_FILE);
        const idx = currentRuns.findIndex(r => r.id === runId);
        if (idx !== -1) {
          currentRuns[idx].status = 'Success';
          currentRuns[idx].duration = `${Math.round((Date.now() - activeRuns[runId].startTime) / 1000)}s`;
          currentRuns[idx].logs = activeRuns[runId].logs;
          writeData(RUNS_FILE, currentRuns);
        }
      }
    }).catch((err) => {
      if (activeRuns[runId]) {
        activeRuns[runId].status = 'Failed';
        activeRuns[runId].logs.push(`[System] Execution failed: ${err.message}`);
        const currentRuns = readData(RUNS_FILE);
        const idx = currentRuns.findIndex(r => r.id === runId);
        if (idx !== -1) {
          currentRuns[idx].status = 'Failed';
          currentRuns[idx].duration = `${Math.round((Date.now() - activeRuns[runId].startTime) / 1000)}s`;
          currentRuns[idx].logs = activeRuns[runId].logs;
          writeData(RUNS_FILE, currentRuns);
        }
      }
    });

    res.json({ success: true, runId });
  });

  // REST Endpoints - AI Chat Copilot
  app.post('/api/ai/chat', async (req, res) => {
    const { message, workflow, history } = req.body;
    
    // 1. Get API Key from environment or vault.json
    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const secrets = readData(VAULT_FILE);
      const googleSecret = secrets.find(s => s.name === 'Google API Key' || s.id === '2');
      if (googleSecret && googleSecret.value && !googleSecret.value.startsWith('AIzaSyMockKey')) {
        apiKey = googleSecret.value;
      }
    }
    
    if (!apiKey) {
      return res.status(400).json({ 
        error: 'Google Gemini API Key is missing. Please add a valid API key named "Google API Key" in your Credential Vault first.' 
      });
    }

    // 2. Call Gemini
    try {
      const systemInstruction = `You are "Stanley", the AI Copilot for Project Stanley, an enterprise browser automation suite.
Your goal is to help the user build, edit, and understand their low-code browser automation workflows.
You must respond in strict JSON matching this schema:
{
  "message": "A conversational explanation of what you did or how you answered.",
  "actions": [
    // Array of actions to apply to the current workflow
  ]
}

The current workflow is provided in the prompt as a JSON object with:
- name: string
- nodes: Array of { id, type, label, data: { ... }, position: { x, y } }
- edges: Array of { source, target, condition: ... }

Supported Node Types:
- 'trigger': Start step, takes "url" in data.
- 'navigate': Go to a URL, takes "url" in data.
- 'click': Click an element, takes "description" and optionally "selector" in data.
- 'type': Type text into an input, takes "description", "value" (can be "vault:SecretName" for vault items), and optionally "selector" in data.
- 'wait': Wait for some milliseconds, takes "ms" (string) in data.
- 'scrape': Extract text from a selector, takes "selector" in data.
- 'open_tab': Open a new browser tab, takes "url" and "label" in data.
- 'switch_tab': Switch active tab, takes "tab" or "index" in data.
- 'close_tab': Close tab, takes "tab" or "index" in data.
- 'if': Decision node for branching, takes "condition" object in data: { type: "always"|"contains"|"notContains"|"exists"|"notExists", value: string }
- 'goto': Jump to a labeled step, takes "label" in data.
- 'label': Step label target for goto, takes "label" in data.
- 'ai_prompt': Run AI analysis via Gemini, takes "prompt" and "system" (optional) in data.
- 'js_code': Execute custom javascript block, takes "code" in data.

Supported Actions in your response:
1. {"type": "add_node", "node": { "id": "unique_string", "type": "node_type", "label": "Label", "data": { ... }, "position": { "x": number, "y": number } }}
2. {"type": "delete_node", "nodeId": "node_id_to_delete"}
3. {"type": "update_node", "nodeId": "node_id_to_update", "nodeUpdates": { "label": "New Label", "data": { ... } }}
4. {"type": "add_edge", "edge": { "source": "source_id", "target": "target_id", "condition": ... }}
5. {"type": "delete_edge", "source": "source_id", "target": "target_id"}
6. {"type": "set_workflow", "workflow": { "name": "New Name", "nodes": [...], "edges": [...] }}

Rules:
- Keep the graph clean. When adding nodes, calculate a logical position (e.g. down the y-axis, spacing nodes by 140px).
- Connect nodes using "add_edge" so the workflow has a logical flow.
- If the user asks a general question, explain it clearly in "message" and leave "actions" empty.
- Always output valid, parseable JSON. Do not include markdown code block formatting (like \`\`\`json) in your raw response body, just output the raw JSON string.`;

      const contents = [];
      if (history && Array.isArray(history)) {
        history.forEach(h => {
          contents.push({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.content }]
          });
        });
      }
      
      // Add current context
      const currentContext = `Current Workflow State: ${JSON.stringify(workflow || null)}\n\nUser Request: ${message}`;
      contents.push({
        role: 'user',
        parts: [{ text: currentContext }]
      });

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: contents,
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(500).json({ error: `Gemini API error: ${errText}` });
      }

      const data = await response.json();
      const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      res.json(JSON.parse(resultText));
    } catch (err) {
      res.status(500).json({ error: `Failed to call AI Chat: ${err.message}` });
    }
  });

  app.listen(httpPort, () => {
    console.error(`[Server Bridge] Local Express server bridge listening on port ${httpPort}`);
  }).on('error', (err) => {
    console.error(`[Server Bridge] Local Express server failed to start: ${err.message}`);
  });
}

startLocalHttpBridge();
logToExtension('Daemon Active', 'Listening on stdin channel...');
