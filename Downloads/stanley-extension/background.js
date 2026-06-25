/**
 * background.js (Claude-additions) — service worker with token-refresh plumbing.
 *
 * Differences vs. stanley-extension/background.js:
 *   - importScripts tokenManager.js (StanleyAuth).
 *   - Forwards a FRESH token bundle { idToken, refreshToken, apiKey } to the daemon
 *     for compile / run, so the daemon can self-refresh during long workflows.
 *   - Handles the daemon's `token_refreshed` message and persists the rotated tokens.
 *
 * Everything else (history, notifications, status relay) is unchanged.
 */

importScripts('tokenManager.js');

let nativePort = null;
let isConnected = false;
let lastLog = 'Idle';
let lastDesc = 'Ready to launch daemon wrapper.';
let pendingActions = null;
let pendingActiveMode = false;

let runningPrompt = '';
let workflowRunning = false;

const HOST_NAME = 'com.project.stanley';

function connectToNativeHost() {
  if (nativePort !== null) return;
  console.log(`[Stanley Extension] Connecting to native host: ${HOST_NAME}`);
  try {
    nativePort = chrome.runtime.connectNative(HOST_NAME);
    isConnected = true;

    nativePort.onMessage.addListener((msg) => {
      console.log('[Stanley Extension] Received message from native daemon:', msg);
      if (msg.log) lastLog = msg.log;
      if (msg.desc) lastDesc = msg.desc;

      if (msg.action === 'plan_ready') {
        pendingActions = msg.actions;
        chrome.runtime.sendMessage({ action: 'plan_ready', actions: msg.actions }).catch(() => {});
      } else if (msg.action === 'token_refreshed') {
        // Daemon rotated the ID token mid-run — keep the extension in sync.
        StanleyAuth.adoptDaemonRefresh(msg.idToken, msg.refreshToken).catch(() => {});
      } else if (msg.action === 'pause_request') {
        chrome.runtime.sendMessage({ action: 'pause_request', screenshot: msg.screenshot, hint: msg.hint }).catch(() => {});
      } else if (msg.action === 'scrape_result') {
        chrome.runtime.sendMessage({ action: 'scrape_result', result: msg.result, url: msg.url || '' }).catch(() => {});
      } else if (msg.action === 'workflow_complete') {
        const finishedPrompt = msg.prompt || runningPrompt;
        workflowRunning = false;
        chrome.notifications.create({
          type: 'basic', iconUrl: 'icon128.png', title: 'Stanley — Workflow Complete ✅',
          message: finishedPrompt ? `"${finishedPrompt.slice(0, 80)}" finished successfully.` : 'Workflow completed successfully.',
        });
        chrome.storage.local.get(['stanley_history'], (data) => {
          const history = Array.isArray(data.stanley_history) ? data.stanley_history : [];
          history.unshift({ prompt: finishedPrompt, status: 'complete', timestamp: Date.now(), result: lastLog });
          if (history.length > 20) history.length = 20;
          chrome.storage.local.set({ stanley_history: history });
        });
        chrome.runtime.sendMessage({ action: 'workflow_complete', log: msg.log, result: msg.result || null, prompt: finishedPrompt }).catch(() => {});
      } else if (msg.action === 'workflow_failed') {
        const finishedPrompt = msg.prompt || runningPrompt;
        workflowRunning = false;
        chrome.notifications.create({
          type: 'basic', iconUrl: 'icon128.png', title: 'Stanley — Workflow Failed ❌',
          message: msg.error ? `Error: ${msg.error.slice(0, 100)}` : 'The workflow encountered an error.',
        });
        chrome.storage.local.get(['stanley_history'], (data) => {
          const history = Array.isArray(data.stanley_history) ? data.stanley_history : [];
          history.unshift({ prompt: finishedPrompt, status: 'failed', timestamp: Date.now(), error: msg.error });
          if (history.length > 20) history.length = 20;
          chrome.storage.local.set({ stanley_history: history });
        });
        chrome.runtime.sendMessage({ action: 'workflow_failed', error: msg.error }).catch(() => {});
      }

      chrome.runtime.sendMessage({
        action: 'status_update', connected: isConnected, log: lastLog, desc: lastDesc,
        workflowRunning, runningPrompt,
      }).catch(() => {});
    });

    nativePort.onDisconnect.addListener(() => {
      console.log('[Stanley Extension] Disconnected from native daemon.');
      const err = chrome.runtime.lastError;
      lastLog = err ? 'Disconnected: ' + err.message : 'Connection closed cleanly.';
      lastDesc = 'Connection failed. Run daemon.bat or register manifest.';
      nativePort = null;
      isConnected = false;
      workflowRunning = false;
      chrome.runtime.sendMessage({ action: 'status_update', connected: false, log: lastLog, desc: lastDesc, workflowRunning: false, runningPrompt: '' }).catch(() => {});
    });
  } catch (err) {
    console.error('[Stanley Extension] Exception during connection:', err);
    isConnected = false;
    lastLog = 'Error: ' + err.message;
    lastDesc = 'Failed to launch native connection.';
    nativePort = null;
  }
}

connectToNativeHost();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'get_status') {
    if (!isConnected) connectToNativeHost();
    sendResponse({ connected: isConnected, lastLog, lastDesc, workflowRunning, runningPrompt });
    return true;
  }

  if (request.action === 'compile_prompt') {
    if (!isConnected || !nativePort) connectToNativeHost();
    if (isConnected && nativePort) {
      pendingActions = null;
      pendingActiveMode = request.activeMode || false;
      // Forward a freshly-refreshed token bundle.
      StanleyAuth.getAuthBundle().then((bundle) => {
        nativePort.postMessage({ action: 'compile_only', prompt: request.prompt, currentUrl: request.currentUrl, ...bundle });
        sendResponse({ success: true });
      }).catch((e) => sendResponse({ error: e.message }));
    } else {
      sendResponse({ error: 'Native Daemon is not running or registered.' });
    }
    return true;
  }

  if (request.action === 'confirm_run') {
    if (isConnected && nativePort && pendingActions) {
      runningPrompt = request.prompt || '';
      workflowRunning = true;
      StanleyAuth.getAuthBundle().then((bundle) => {
        nativePort.postMessage({ action: 'confirm_run', actions: pendingActions, activeMode: pendingActiveMode, prompt: runningPrompt, currentUrl: request.currentUrl, ...bundle });
        sendResponse({ success: true });
      }).catch((e) => sendResponse({ error: e.message }));
    } else {
      sendResponse({ error: 'No compiled plan ready to run or daemon disconnected.' });
    }
    return true;
  }

  if (request.action === 'run_custom_workflow') {
    if (isConnected && nativePort) {
      runningPrompt = request.prompt || 'Custom Builder Workflow';
      workflowRunning = true;
      StanleyAuth.getAuthBundle().then((bundle) => {
        nativePort.postMessage({ action: 'confirm_run', actions: request.actions, activeMode: request.activeMode || false, prompt: runningPrompt, currentUrl: request.currentUrl, ...bundle });
        sendResponse({ success: true });
      }).catch((e) => sendResponse({ error: e.message }));
    } else {
      sendResponse({ error: 'Daemon disconnected or not running.' });
    }
    return true;
  }

  if (request.action === 'cancel_run') {
    pendingActions = null;
    pendingActiveMode = false;
    workflowRunning = false;
    runningPrompt = '';
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'pause_response') {
    if (isConnected && nativePort) {
      nativePort.postMessage({ action: 'pause_response', hint: request.hint });
      sendResponse({ success: true });
    } else {
      sendResponse({ error: 'Daemon disconnected.' });
    }
    return true;
  }

  return true;
});
