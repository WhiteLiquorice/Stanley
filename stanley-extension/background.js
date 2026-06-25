/**
 * background.js — Stanley service worker, browser-native orchestrator.
 *
 * Stanley no longer NEEDS a local daemon to execute workflows. This worker runs the
 * same branching engine the Editor builds against, driving the page through
 * chrome.debugger (real isTrusted input) + content.js. The native-messaging daemon is
 * kept as an OPTIONAL path for users who want headless / Playwright-only features, but
 * it is no longer auto-connected (so users with no daemon see no errors).
 *
 * Pieces loaded below:
 *   - branchingEngine.js  → executeGraph (reused verbatim via a CommonJS shim)
 *   - cdpDriver.js        → self.StanleyCDP   (chrome.debugger wrapper)
 *   - nativeAgent.js      → self.StanleyNativeAgent (Playwright-shaped, CDP-backed)
 *   - tokenManager.js     → self.StanleyAuth  (Firebase token refresh, unchanged)
 */

// branchingEngine.js is authored as a CommonJS module (module.exports = {...}) so it
// can be shared with the Node daemon. Shim module/exports so importScripts can load the
// EXACT same file here — single source of truth for the branching logic.
self.module = { exports: {} };
self.exports = self.module.exports;
importScripts('branchingEngine.js');
const { executeGraph } = self.module.exports;
delete self.module;
delete self.exports;

importScripts('cdpDriver.js');
importScripts('nativeAgent.js');
importScripts('tokenManager.js');

// ── Keepalive: only while a workflow is running ────────────────────────────────────
// Primary keepalive is the worker's own message traffic to content.js during the run
// (every step messages the page; long `wait` nodes chunk-ping — see nativeAgent.wait).
// This alarm is a backup that wakes the worker if it's evicted between steps; it exists
// ONLY during a run so we don't pin the worker awake while the user is just browsing.
chrome.alarms.onAlarm.addListener(() => { /* waking is the whole point */ });
function startKeepaliveAlarm() { chrome.alarms.create('stanley-keepalive', { periodInMinutes: 0.4 }); }
function stopKeepaliveAlarm() { chrome.alarms.clear('stanley-keepalive'); }

// ── Run state ───────────────────────────────────────────────────────────────────
let workflowRunning = false;
let runningPrompt = '';
let currentAgent = null;
let cancelRequested = false;
let lastLog = 'Idle';
let currentEditorTabId = null;

function pushLog(line) {
  lastLog = line;
  chrome.runtime.sendMessage({ action: 'native_log', log: line }).catch(() => {});
  if (currentEditorTabId) {
    chrome.tabs.sendMessage(currentEditorTabId, {
      ns: 'stanley-extension-event',
      action: 'native_log',
      log: line
    }).catch(() => { currentEditorTabId = null; });
  }
}


function recordHistory(prompt, status, extra) {
  chrome.storage.local.get(['stanley_history'], (data) => {
    const history = Array.isArray(data.stanley_history) ? data.stanley_history : [];
    history.unshift({ prompt, status, timestamp: Date.now(), ...extra });
    if (history.length > 20) history.length = 20;
    chrome.storage.local.set({ stanley_history: history });
  });
}

/**
 * Runs a compiled workflow graph natively in the user's browser.
 * @param {object} workflow { nodes, edges }
 * @param {object} secrets  vault id/name -> value (resolves `vault:` typed values)
 * @param {object} opts     { fallbackToDispatch }
 */
async function runNativeWorkflow(workflow, secrets, opts = {}) {
  if (workflowRunning) throw new Error('A workflow is already running.');
  workflowRunning = true;
  cancelRequested = false;
  runningPrompt = workflow.name || 'Workflow';
  startKeepaliveAlarm();

  const agent = new StanleyNativeAgent({ onLog: pushLog, fallbackToDispatch: !!opts.fallbackToDispatch });
  currentAgent = agent;

  try {
    pushLog('[native] Starting secure browser session…');
    await agent.initialize();

    const scraped = await executeGraph(agent, workflow, {
      onLog: pushLog,
      secrets: secrets || {},
      // Headful by definition — the page is the user's own tab. On a block, surface it
      // and poll until the user (or the site) clears it, then continue.
      onBlocked: async (block, label) => {
        pushLog(`${label} ${block.hint} — waiting for you to resolve it…`);
        chrome.runtime.sendMessage({ action: 'pause_request', hint: block.hint }).catch(() => {});
        chrome.notifications.create({
          type: 'basic', iconUrl: 'icon.png', title: 'Stanley needs you',
          message: 'A CAPTCHA or prompt is blocking the workflow. Solve it in the tab to continue.',
        });
        for (let i = 0; i < 60; i++) { // up to ~5 min
          if (cancelRequested) throw new Error('Cancelled while blocked.');
          await agent.wait(5000);
          const still = await agent.isPageBlocked();
          if (!still.blocked) { pushLog(`${label} Block cleared — resuming.`); return; }
        }
        throw new Error('Timed out waiting for the block to be resolved.');
      },
      maxSteps: 1000,
    });

    if (cancelRequested) throw new Error('Workflow cancelled.');

    pushLog('[native] Workflow complete ✅');
    recordHistory(runningPrompt, 'complete', { result: lastLog });
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icon.png', title: 'Stanley — Workflow Complete ✅',
      message: `"${runningPrompt.slice(0, 80)}" finished.`,
    });
    chrome.runtime.sendMessage({ action: 'native_complete', result: scraped, prompt: runningPrompt }).catch(() => {});
    if (currentEditorTabId) {
      chrome.tabs.sendMessage(currentEditorTabId, {
        ns: 'stanley-extension-event',
        action: 'native_complete',
        result: scraped,
        prompt: runningPrompt
      }).catch(() => { currentEditorTabId = null; });
    }
    return scraped;
  } catch (err) {
    pushLog(`[native] ERROR: ${err.message}`);
    recordHistory(runningPrompt, 'failed', { error: err.message });
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icon.png', title: 'Stanley — Workflow Failed ❌',
      message: err.message.slice(0, 120),
    });
    chrome.runtime.sendMessage({ action: 'native_failed', error: err.message }).catch(() => {});
    if (currentEditorTabId) {
      chrome.tabs.sendMessage(currentEditorTabId, {
        ns: 'stanley-extension-event',
        action: 'native_failed',
        error: err.message
      }).catch(() => { currentEditorTabId = null; });
    }
    throw err;
  } finally {
    await agent.cleanup().catch(() => {});
    currentAgent = null;
    workflowRunning = false;
    runningPrompt = '';
    stopKeepaliveAlarm();
  }
}

// ── Optional native-messaging daemon (opt-in, not auto-connected) ──────────────────
let nativePort = null;
function connectDaemon() {
  if (nativePort) return true;
  try {
    nativePort = chrome.runtime.connectNative('com.project.stanley');
    nativePort.onMessage.addListener((msg) => {
      if (msg.action === 'token_refreshed') StanleyAuth.adoptDaemonRefresh(msg.idToken, msg.refreshToken).catch(() => {});
      chrome.runtime.sendMessage({ action: 'daemon_message', msg }).catch(() => {});
    });
    nativePort.onDisconnect.addListener(() => { nativePort = null; });
    return true;
  } catch (_) {
    nativePort = null;
    return false;
  }
}

// ── Message API ────────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'get_status':
      sendResponse({ mode: 'native', workflowRunning, runningPrompt, lastLog, daemonConnected: !!nativePort });
      return false;

    case 'run_native_workflow':
      if (sender && sender.tab) {
        currentEditorTabId = sender.tab.id;
      }
      runNativeWorkflow(request.workflow, request.secrets, { fallbackToDispatch: request.fallbackToDispatch })
        .then(() => {})
        .catch(() => {});
      sendResponse({ started: true });
      return false;

    case 'cancel_native':
      cancelRequested = true;
      if (currentAgent) currentAgent.cleanup().catch(() => {});
      sendResponse({ ok: true });
      return false;

    case 'connect_daemon':
      sendResponse({ connected: connectDaemon() });
      return false;

    default:
      // Unhandled actions fall through (keeps room for daemon-relay messages).
      return false;
  }
});
