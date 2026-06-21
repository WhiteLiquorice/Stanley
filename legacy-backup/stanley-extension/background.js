let nativePort = null;
let isConnected = false;
let lastLog = "Idle";
let lastDesc = "Ready to launch daemon wrapper.";
let pendingActions = null;
let pendingIdToken = '';
let pendingActiveMode = false;

// Item 6: Track running workflow prompt for notifications and background banner
let runningPrompt = '';
let workflowRunning = false;

const HOST_NAME = "com.project.stanley";

// Connect to native daemon
function connectToNativeHost() {
  if (nativePort !== null) {
    return;
  }

  console.log(`[Stanley Extension] Connecting to native host: ${HOST_NAME}`);
  try {
    nativePort = chrome.runtime.connectNative(HOST_NAME);
    isConnected = true;

    nativePort.onMessage.addListener((msg) => {
      console.log("[Stanley Extension] Received message from native daemon:", msg);
      
      // Update state
      if (msg.log) {
        lastLog = msg.log;
      }
      if (msg.desc) {
        lastDesc = msg.desc;
      }
      
      // Handle structured actions from native daemon
      if (msg.action === "plan_ready") {
        pendingActions = msg.actions;
        chrome.runtime.sendMessage({
          action: "plan_ready",
          actions: msg.actions
        }).catch(() => {});
      } else if (msg.action === "pause_request") {
        chrome.runtime.sendMessage({
          action: "pause_request",
          screenshot: msg.screenshot,
          hint: msg.hint
        }).catch(() => {});
      } else if (msg.action === "scrape_result") {
        chrome.runtime.sendMessage({
          action: "scrape_result",
          result: msg.result,
          url: msg.url || ''
        }).catch(() => {});
      } else if (msg.action === "workflow_complete") {
        const finishedPrompt = msg.prompt || runningPrompt;
        workflowRunning = false;
        
        // Item 6: Fire Chrome notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon128.png',
          title: 'Stanley — Workflow Complete ✅',
          message: finishedPrompt
            ? `"${finishedPrompt.slice(0, 80)}" finished successfully.`
            : 'Workflow completed successfully.'
        });
        
        // Item 4: Write run to history (max 20 entries)
        chrome.storage.local.get(['stanley_history'], (data) => {
          const history = Array.isArray(data.stanley_history) ? data.stanley_history : [];
          history.unshift({
            prompt: finishedPrompt,
            status: 'complete',
            timestamp: Date.now(),
            result: lastLog
          });
          if (history.length > 20) history.length = 20;
          chrome.storage.local.set({ stanley_history: history });
        });

        chrome.runtime.sendMessage({
          action: "workflow_complete",
          log: msg.log,
          result: msg.result || null,
          prompt: finishedPrompt
        }).catch(() => {});
      } else if (msg.action === "workflow_failed") {
        const finishedPrompt = msg.prompt || runningPrompt;
        workflowRunning = false;

        // Item 6: Fire Chrome error notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon128.png',
          title: 'Stanley — Workflow Failed ❌',
          message: msg.error
            ? `Error: ${msg.error.slice(0, 100)}`
            : 'The workflow encountered an error.'
        });

        // Item 4: Write failure to history
        chrome.storage.local.get(['stanley_history'], (data) => {
          const history = Array.isArray(data.stanley_history) ? data.stanley_history : [];
          history.unshift({
            prompt: finishedPrompt,
            status: 'failed',
            timestamp: Date.now(),
            error: msg.error
          });
          if (history.length > 20) history.length = 20;
          chrome.storage.local.set({ stanley_history: history });
        });

        chrome.runtime.sendMessage({
          action: "workflow_failed",
          error: msg.error
        }).catch(() => {});
      }
      
      // Push state update to popup if open
      chrome.runtime.sendMessage({
        action: "status_update",
        connected: isConnected,
        log: lastLog,
        desc: lastDesc,
        workflowRunning: workflowRunning,
        runningPrompt: runningPrompt
      }).catch(() => {
        // Suppress errors when popup is closed
      });
    });

    nativePort.onDisconnect.addListener(() => {
      console.log("[Stanley Extension] Disconnected from native daemon.");
      const err = chrome.runtime.lastError;
      if (err) {
        console.warn("[Stanley Extension] Native error details:", err.message);
        lastLog = "Disconnected: " + err.message;
      } else {
        lastLog = "Connection closed cleanly.";
      }
      lastDesc = "Connection failed. Run daemon.bat or register manifest.";
      nativePort = null;
      isConnected = false;
      workflowRunning = false;

      // Notify popup
      chrome.runtime.sendMessage({
        action: "status_update",
        connected: isConnected,
        log: lastLog,
        desc: lastDesc,
        workflowRunning: false,
        runningPrompt: ''
      }).catch(() => {});
    });
  } catch (err) {
    console.error("[Stanley Extension] Exception during connection:", err);
    isConnected = false;
    lastLog = "Error: " + err.message;
    lastDesc = "Failed to launch native connection.";
    nativePort = null;
  }
}

// Auto-connect on background startup
connectToNativeHost();

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "get_status") {
    // Attempt reconnect if offline
    if (!isConnected) {
      connectToNativeHost();
    }
    sendResponse({
      connected: isConnected,
      lastLog: lastLog,
      lastDesc: lastDesc,
      workflowRunning: workflowRunning,
      runningPrompt: runningPrompt
    });
  } else if (request.action === "compile_prompt") {
    if (!isConnected || !nativePort) {
      connectToNativeHost();
    }
    
    if (isConnected && nativePort) {
      pendingIdToken = request.idToken || '';
      pendingActiveMode = request.activeMode || false;
      pendingActions = null;
      
      nativePort.postMessage({
        action: "compile_only",
        prompt: request.prompt,
        idToken: pendingIdToken
      });
      sendResponse({ success: true });
    } else {
      sendResponse({ error: "Native Daemon is not running or registered." });
    }
  } else if (request.action === "confirm_run") {
    if (isConnected && nativePort && pendingActions) {
      runningPrompt = request.prompt || '';
      workflowRunning = true;
      nativePort.postMessage({
        action: "confirm_run",
        actions: pendingActions,
        idToken: pendingIdToken,
        activeMode: pendingActiveMode,
        prompt: runningPrompt
      });
      sendResponse({ success: true });
    } else {
      sendResponse({ error: "No compiled plan ready to run or daemon disconnected." });
    }
  } else if (request.action === "run_custom_workflow") {
    if (isConnected && nativePort) {
      runningPrompt = request.prompt || 'Custom Builder Workflow';
      workflowRunning = true;
      nativePort.postMessage({
        action: "confirm_run",
        actions: request.actions,
        idToken: request.idToken || '',
        activeMode: request.activeMode || false,
        prompt: runningPrompt
      });
      sendResponse({ success: true });
    } else {
      sendResponse({ error: "Daemon disconnected or not running." });
    }
  } else if (request.action === "cancel_run") {
    pendingActions = null;
    pendingIdToken = '';
    pendingActiveMode = false;
    workflowRunning = false;
    runningPrompt = '';
    sendResponse({ success: true });
  } else if (request.action === "pause_response") {
    if (isConnected && nativePort) {
      nativePort.postMessage({
        action: "pause_response",
        hint: request.hint
      });
      sendResponse({ success: true });
    } else {
      sendResponse({ error: "Daemon disconnected." });
    }
  }
  return true; // Keep message channel open for async responses
});
