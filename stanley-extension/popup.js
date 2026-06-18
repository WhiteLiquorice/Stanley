// Mock chrome APIs for browser preview environments
if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
  window.chrome = {
    runtime: {
      sendMessage: (msg, callback) => {
        console.log("[Mock Chrome API] sendMessage:", msg);
        if (msg.action === "get_status") {
          if (callback) {
            callback({ 
              connected: true, 
              lastLog: "Active (Mock Preview Mode)", 
              lastDesc: "Extension workspace is running on preview host.",
              workflowRunning: false,
              runningPrompt: ''
            });
          }
        } else if (msg.action === "compile_prompt") {
          if (callback) {
            callback({ success: true });
          }
          // Mock plan_ready message back
          setTimeout(() => {
            if (window._mockListener) {
              window._mockListener({
                action: "plan_ready",
                actions: [
                  { action: "navigate", url: "https://news.ycombinator.com" },
                  { action: "open_tab", url: "https://www.wikipedia.org" },
                  { action: "scrape" },
                  { action: "switch_tab", index: 0 },
                  { action: "scrape" }
                ]
              });
            }
          }, 800);
        } else if (msg.action === "confirm_run") {
          if (callback) callback({ success: true });
          setTimeout(() => {
            if (window._mockListener) {
              window._mockListener({ action: "scrape_result", result: "Title: Hacker News\nStory 1\nStory 2", url: "https://news.ycombinator.com" });
              window._mockListener({ action: "status_update", connected: true, log: "Completed successfully.", desc: "Workflow Complete", workflowRunning: false, runningPrompt: '' });
            }
          }, 1500);
        }
      },
      onMessage: {
        addListener: (fn) => {
          window._mockListener = fn;
        }
      },
      lastError: null
    },
    storage: {
      local: {
        get: (keys, callback) => {
          console.log("[Mock Chrome API] storage.get:", keys);
          if (callback) {
            callback({
              email: "preview@projectstanley.com",
              uid: "preview-user-123",
              idToken: "mock-token",
              status: "active",
              activeMode: false,
              stanley_workflows: [],
              stanley_history: []
            });
          }
        },
        set: (data, callback) => {
          console.log("[Mock Chrome API] storage.set:", data);
          if (callback) callback();
        },
        remove: (keys, callback) => {
          console.log("[Mock Chrome API] storage.remove:", keys);
          if (callback) callback();
        }
      }
    }
  };
}

document.addEventListener('DOMContentLoaded', () => {
  // UI Panels
  const loginPanel = document.getElementById('login-panel');
  const mainPanel = document.getElementById('main-panel');
  
  // Login Panel Elements
  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const loginBtn = document.getElementById('login-btn');
  const loginStatus = document.getElementById('login-status');
  
  // Main Panel Elements
  const userInfo = document.getElementById('user-info');
  const signoutBtn = document.getElementById('signout-btn');
  const taskInput = document.getElementById('task-input');
  const runBtn = document.getElementById('run-btn');
  const connectionBadge = document.getElementById('connection-badge');
  const badgeText = document.getElementById('badge-text');
  const statusDesc = document.getElementById('status-desc');
  const statusLog = document.getElementById('status-log');
  const exampleTags = document.querySelectorAll('.example-tag');

  // Active / Stealth Mode Toggle Elements
  const stealthModeBtn = document.getElementById('stealth-mode-btn');
  const activeModeBtn = document.getElementById('active-mode-btn');
  let activeMode = false;

  // Plan Preview Elements
  const planPreviewPanel = document.getElementById('plan-preview-panel');
  const planStepsDiv = document.getElementById('plan-steps');
  const confirmRunBtn = document.getElementById('confirm-run-btn');
  const cancelRunBtn = document.getElementById('cancel-run-btn');

  // Pause Panel Elements
  const pausePanel = document.getElementById('pause-panel');
  const pauseScreenshot = document.getElementById('pause-screenshot');
  const pauseMessage = document.getElementById('pause-message');
  const pauseHintInput = document.getElementById('pause-hint-input');
  const pauseSubmitBtn = document.getElementById('pause-submit-btn');

  // Result Elements
  const resultBlock = document.getElementById('result-block');
  const resultText = document.getElementById('result-text');
  const copyTextBtn = document.getElementById('copy-text-btn');
  const downloadCsvBtn = document.getElementById('download-csv-btn');
  const copyJsonBtn = document.getElementById('copy-json-btn');
  const saveWorkflowBtn = document.getElementById('save-workflow-btn');

  // Background Running Banner (Item 6)
  const runningBanner = document.getElementById('running-banner');
  const runningBannerText = document.getElementById('running-banner-text');

  // Workflow Library (Item 4)
  const workflowLibraryToggle = document.getElementById('workflow-library-toggle');
  const workflowChevron = document.getElementById('workflow-chevron');
  const workflowLibraryBody = document.getElementById('workflow-library-body');
  const workflowList = document.getElementById('workflow-list');

  // Firebase Config Identifiers
  const FIREBASE_API_KEY = "AIzaSyCwyyfUU3DEJAFNFoILSbT2CH8oaNMrVlk";
  const FIREBASE_PROJECT_ID = "bridgeway-db29e";

  let hasValidSession = false;
  let lastScrapeResult = '';
  let lastScrapeUrl = '';
  let lastRunPrompt = '';

  // ── Example tag clicks ──────────────────────────────────────────────────────
  exampleTags.forEach(tag => {
    tag.addEventListener('click', () => {
      taskInput.value = tag.getAttribute('data-text');
    });
  });

  // ── Mode Toggle ─────────────────────────────────────────────────────────────
  stealthModeBtn.addEventListener('click', () => {
    stealthModeBtn.classList.add('active');
    activeModeBtn.classList.remove('active');
    activeMode = false;
    chrome.storage.local.set({ activeMode: false });
  });

  activeModeBtn.addEventListener('click', () => {
    activeModeBtn.classList.add('active');
    stealthModeBtn.classList.remove('active');
    activeMode = true;
    chrome.storage.local.set({ activeMode: true });
  });

  // ── Panel toggle helpers ─────────────────────────────────────────────────────
  function togglePanels(loggedIn) {
    if (loggedIn) {
      loginPanel.style.display = 'none';
      mainPanel.style.display = 'block';
      signoutBtn.style.display = 'block';
    } else {
      loginPanel.style.display = 'block';
      mainPanel.style.display = 'none';
      signoutBtn.style.display = 'none';
      runBtn.setAttribute('disabled', 'true');
    }
  }

  function setConnectionState(connected) {
    if (connected && hasValidSession) {
      connectionBadge.className = 'badge connected';
      badgeText.textContent = 'Connected';
      runBtn.removeAttribute('disabled');
    } else {
      connectionBadge.className = 'badge disconnected';
      badgeText.textContent = connected ? 'Active' : 'Offline';
      if (!connected) {
        runBtn.setAttribute('disabled', 'true');
      }
    }
  }

  // ── Status polling ───────────────────────────────────────────────────────────
  function queryStatus() {
    chrome.runtime.sendMessage({ action: "get_status" }, (response) => {
      if (chrome.runtime.lastError) {
        setConnectionState(false);
        return;
      }
      if (response) {
        setConnectionState(response.connected);
        if (response.lastLog) statusLog.textContent = response.lastLog;
        if (response.lastDesc) statusDesc.textContent = response.lastDesc;

        // Item 6: Show/hide background running banner
        if (response.workflowRunning) {
          runningBanner.classList.remove('hidden');
          runningBannerText.textContent = response.runningPrompt
            ? `Stanley is working: "${response.runningPrompt.slice(0, 55)}..."`
            : 'Stanley is working in the background...';
        } else {
          runningBanner.classList.add('hidden');
        }
      }
    });
  }

  // ── Plan Preview ─────────────────────────────────────────────────────────────
  function showPlanPreview(actions) {
    planStepsDiv.innerHTML = '';
    
    actions.forEach((act, idx) => {
      const row = document.createElement('div');
      row.className = 'plan-step-row';
      
      const badge = document.createElement('div');
      badge.className = 'step-badge';
      // Purple badge for tab actions (Item 8)
      const TAB_ACTIONS = ['open_tab', 'switch_tab', 'close_tab'];
      if (TAB_ACTIONS.includes(act.action)) badge.classList.add('tab-badge');
      badge.textContent = idx + 1;
      
      const desc = document.createElement('div');
      desc.style.flex = '1';
      
      let text = '';
      if (act.action === 'navigate') {
        text = `Navigate to ${act.url}`;
      } else if (act.action === 'click') {
        text = `Click "${act.description || act.selector}"`;
      } else if (act.action === 'type') {
        text = `Type "${act.value}" into "${act.description || act.selector}"`;
      } else if (act.action === 'wait') {
        text = `Wait for ${act.ms}ms`;
      } else if (act.action === 'scrape') {
        text = `Scrape text content` + (act.selector ? ` from "${act.selector}"` : '');
      } else if (act.action === 'open_tab') {
        text = `📑 Open new tab${act.url ? ': ' + act.url : ''}`;
      } else if (act.action === 'switch_tab') {
        text = `📑 Switch to tab ${act.index}`;
      } else if (act.action === 'close_tab') {
        text = `📑 Close tab ${act.index}`;
      } else {
        text = act.action || 'Unknown Action';
      }
      
      desc.textContent = text;
      row.appendChild(badge);
      row.appendChild(desc);
      planStepsDiv.appendChild(row);
    });
    
    planPreviewPanel.classList.remove('hidden');
  }

  // ── Pause Panel ──────────────────────────────────────────────────────────────
  function showPausePanel(screenshot, hint) {
    if (screenshot) {
      pauseScreenshot.src = `data:image/jpeg;base64,${screenshot}`;
      pauseScreenshot.classList.remove('hidden');
    } else {
      pauseScreenshot.classList.add('hidden');
    }
    
    pauseMessage.textContent = hint || "Stanley is stuck — needs your help.";
    pauseHintInput.value = '';
    pausePanel.classList.remove('hidden');
  }

  // ── Scrape Result ────────────────────────────────────────────────────────────
  function showScrapeResult(result, url) {
    lastScrapeResult = result || '';
    lastScrapeUrl = url || '';
    resultText.textContent = result || "(No text content scraped)";
    resultBlock.classList.remove('hidden');
    saveWorkflowBtn.classList.remove('hidden');
  }

  // ── Item 5: Export Logic ─────────────────────────────────────────────────────
  copyTextBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(lastScrapeResult).then(() => {
      const orig = copyTextBtn.textContent;
      copyTextBtn.textContent = '✅ Copied!';
      setTimeout(() => { copyTextBtn.textContent = orig; }, 2000);
    });
  });

  downloadCsvBtn.addEventListener('click', () => {
    const lines = lastScrapeResult.split('\n').filter(l => l.trim().length > 0);
    // Wrap each line in quotes to handle commas inside content
    const csvContent = lines.map(l => `"${l.replace(/"/g, '""')}"`).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stanley_scrape_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  copyJsonBtn.addEventListener('click', () => {
    const lines = lastScrapeResult.split('\n').filter(l => l.trim().length > 0);
    const json = JSON.stringify({
      timestamp: new Date().toISOString(),
      url: lastScrapeUrl,
      prompt: lastRunPrompt,
      data: lines
    }, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      const orig = copyJsonBtn.textContent;
      copyJsonBtn.textContent = '✅ Copied!';
      setTimeout(() => { copyJsonBtn.textContent = orig; }, 2000);
    });
  });

  // ── Item 4: Workflow Library ─────────────────────────────────────────────────
  workflowLibraryToggle.addEventListener('click', () => {
    const isOpen = !workflowLibraryBody.classList.contains('hidden');
    if (isOpen) {
      workflowLibraryBody.classList.add('hidden');
      workflowChevron.classList.remove('open');
    } else {
      workflowLibraryBody.classList.remove('hidden');
      workflowChevron.classList.add('open');
      renderWorkflowLibrary();
    }
  });

  function renderWorkflowLibrary() {
    chrome.storage.local.get(['stanley_workflows'], (data) => {
      const workflows = Array.isArray(data.stanley_workflows) ? data.stanley_workflows : [];
      workflowList.innerHTML = '';

      if (workflows.length === 0) {
        workflowList.innerHTML = '<div class="workflow-empty">No saved workflows yet. Run a task and click "Save This Workflow".</div>';
        return;
      }

      workflows.forEach((wf, idx) => {
        const chip = document.createElement('div');
        chip.className = 'workflow-chip';
        chip.title = wf.prompt;

        const name = document.createElement('div');
        name.className = 'workflow-chip-name';
        name.textContent = wf.name;

        const time = document.createElement('div');
        time.className = 'workflow-chip-time';
        time.textContent = new Date(wf.savedAt).toLocaleDateString();

        const del = document.createElement('button');
        del.className = 'workflow-chip-delete';
        del.textContent = '×';
        del.title = 'Delete workflow';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteWorkflow(idx);
        });

        chip.appendChild(name);
        chip.appendChild(time);
        chip.appendChild(del);

        // Click chip to load into task input
        chip.addEventListener('click', () => {
          taskInput.value = wf.prompt;
          lastRunPrompt = wf.prompt;
        });

        workflowList.appendChild(chip);
      });
    });
  }

  function deleteWorkflow(idx) {
    chrome.storage.local.get(['stanley_workflows'], (data) => {
      const workflows = Array.isArray(data.stanley_workflows) ? data.stanley_workflows : [];
      workflows.splice(idx, 1);
      chrome.storage.local.set({ stanley_workflows: workflows }, () => {
        renderWorkflowLibrary();
      });
    });
  }

  saveWorkflowBtn.addEventListener('click', () => {
    const prompt = lastRunPrompt || taskInput.value.trim();
    if (!prompt) return;

    const name = window.prompt('Name this workflow:', prompt.slice(0, 40));
    if (!name) return;

    chrome.storage.local.get(['stanley_workflows'], (data) => {
      const workflows = Array.isArray(data.stanley_workflows) ? data.stanley_workflows : [];
      workflows.unshift({ name: name.trim(), prompt, savedAt: Date.now() });
      chrome.storage.local.set({ stanley_workflows: workflows }, () => {
        saveWorkflowBtn.textContent = '✅ Saved!';
        setTimeout(() => { saveWorkflowBtn.textContent = '💾 Save This Workflow'; }, 2000);
        renderWorkflowLibrary();
      });
    });
  });

  // ── Message handler from background.js ──────────────────────────────────────
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "status_update") {
      setConnectionState(message.connected);
      if (message.log) statusLog.textContent = message.log;
      if (message.desc) statusDesc.textContent = message.desc;

      // Item 6: Background banner
      if (message.workflowRunning) {
        runningBanner.classList.remove('hidden');
        runningBannerText.textContent = message.runningPrompt
          ? `Stanley is working: "${message.runningPrompt.slice(0, 55)}..."`
          : 'Stanley is working in the background...';
      } else {
        runningBanner.classList.add('hidden');
      }
    } else if (message.action === "plan_ready") {
      showPlanPreview(message.actions);
    } else if (message.action === "pause_request") {
      showPausePanel(message.screenshot, message.hint);
    } else if (message.action === "scrape_result") {
      showScrapeResult(message.result, message.url);
    } else if (message.action === "workflow_complete") {
      statusDesc.textContent = "Workflow Complete";
      statusLog.textContent = message.log || "Completed successfully.";
      planPreviewPanel.classList.add('hidden');
      runningBanner.classList.add('hidden');
    } else if (message.action === "workflow_failed") {
      statusDesc.textContent = "Workflow Failed";
      statusLog.textContent = message.error || "Execution failed.";
      planPreviewPanel.classList.add('hidden');
      runningBanner.classList.add('hidden');
    }
  });

  // ── Run Workflow ─────────────────────────────────────────────────────────────
  runBtn.addEventListener('click', () => {
    const prompt = taskInput.value.trim();
    if (!prompt || !hasValidSession) return;

    lastRunPrompt = prompt;
    statusDesc.textContent = 'Compiling prompt...';
    statusLog.textContent = 'Asking Gemini to structure workflow steps';
    runBtn.setAttribute('disabled', 'true');

    // Clean up panels
    planPreviewPanel.classList.add('hidden');
    pausePanel.classList.add('hidden');
    resultBlock.classList.add('hidden');

    chrome.storage.local.get(['idToken'], (data) => {
      const idToken = data.idToken || '';
      chrome.runtime.sendMessage({ 
        action: "compile_prompt", 
        prompt: prompt, 
        idToken: idToken,
        activeMode: activeMode 
      }, (response) => {
        runBtn.removeAttribute('disabled');
        if (chrome.runtime.lastError) {
          statusDesc.textContent = 'Compilation failed';
          statusLog.textContent = 'Error: ' + chrome.runtime.lastError.message;
          return;
        }
        if (response && response.error) {
          statusDesc.textContent = 'Compilation Error';
          statusLog.textContent = response.error;
        }
      });
    });
  });

  // ── Confirm / Cancel Plan ────────────────────────────────────────────────────
  confirmRunBtn.addEventListener('click', () => {
    planPreviewPanel.classList.add('hidden');
    statusDesc.textContent = 'Executing workflow...';
    statusLog.textContent = 'Running confirmed steps';
    
    chrome.runtime.sendMessage({ action: "confirm_run", prompt: lastRunPrompt }, (response) => {
      if (chrome.runtime.lastError) {
        statusDesc.textContent = 'Failed to execute';
        statusLog.textContent = chrome.runtime.lastError.message;
      }
    });
  });

  cancelRunBtn.addEventListener('click', () => {
    planPreviewPanel.classList.add('hidden');
    statusDesc.textContent = 'Workflow cancelled';
    statusLog.textContent = 'Steps discarded by user';
    
    chrome.runtime.sendMessage({ action: "cancel_run" });
  });

  // ── Pause / Resume ───────────────────────────────────────────────────────────
  pauseSubmitBtn.addEventListener('click', () => {
    const hint = pauseHintInput.value.trim();
    pausePanel.classList.add('hidden');
    statusDesc.textContent = 'Resuming...';
    statusLog.textContent = `Sending user hint: "${hint || 'None'}"`;
    
    chrome.runtime.sendMessage({ action: "pause_response", hint: hint }, (response) => {
      if (chrome.runtime.lastError) {
        statusDesc.textContent = 'Failed to resume';
        statusLog.textContent = chrome.runtime.lastError.message;
      }
    });
  });

  pauseHintInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      pauseSubmitBtn.click();
    }
  });

  // ── Login ────────────────────────────────────────────────────────────────────
  loginBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      loginStatus.textContent = "Email and password are required.";
      return;
    }

    loginStatus.style.color = "var(--accent)";
    loginStatus.textContent = "Authenticating...";
    loginBtn.disabled = true;

    try {
      const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
      const authRes = await fetch(authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true })
      });

      if (!authRes.ok) {
        const errData = await authRes.json();
        throw new Error(errData.error.message || "Authentication failed.");
      }

      const authData = await authRes.json();
      const uid = authData.localId;
      const idToken = authData.idToken;

      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/stanley_users/${uid}`;
      const dbRes = await fetch(firestoreUrl, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });

      if (!dbRes.ok) {
        throw new Error("License details not found. Register on the website first.");
      }

      const dbData = await dbRes.json();
      const fields = dbData.fields;
      const status = fields.status ? fields.status.stringValue : 'inactive';
      
      let trialEndsAtVal = null;
      if (fields.trialEndsAt && fields.trialEndsAt.timestampValue) {
        trialEndsAtVal = fields.trialEndsAt.timestampValue;
      }

      const access = validateAccess(status, trialEndsAtVal);
      if (!access.isValid) {
        throw new Error(access.reason);
      }

      await chrome.storage.local.set({
        email: email,
        uid: uid,
        idToken: idToken,
        status: status,
        trialEndsAt: trialEndsAtVal,
        savedAt: Date.now()
      });

      loginStatus.textContent = "";
      hasValidSession = true;
      userInfo.textContent = access.label;
      togglePanels(true);
      queryStatus();
    } catch (err) {
      console.error(err);
      loginStatus.style.color = "var(--error)";
      loginStatus.textContent = err.message.replace(/_/g, ' ');
    } finally {
      loginBtn.disabled = false;
    }
  });

  // ── Sign Out ─────────────────────────────────────────────────────────────────
  signoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    await chrome.storage.local.remove(['email', 'uid', 'idToken', 'status', 'trialEndsAt', 'savedAt']);
    hasValidSession = false;
    emailInput.value = "";
    passwordInput.value = "";
    togglePanels(false);
  });

  // ── Access Validation ────────────────────────────────────────────────────────
  function validateAccess(status) {
    if (status === 'active') {
      return { isValid: true, label: "Butler Status: Active (Paid License)", reason: "" };
    }
    return { isValid: false, label: "", reason: "License inactive. Purchase a license to access." };
  }

  // ── Session Restore on Load ──────────────────────────────────────────────────
  async function checkSession() {
    const data = await chrome.storage.local.get(['email', 'uid', 'idToken', 'status', 'trialEndsAt', 'savedAt', 'activeMode']);
    
    if (data.activeMode !== undefined) {
      activeMode = data.activeMode;
      if (activeMode) {
        activeModeBtn.classList.add('active');
        stealthModeBtn.classList.remove('active');
      } else {
        stealthModeBtn.classList.add('active');
        activeModeBtn.classList.remove('active');
      }
    }

    if (data.idToken && data.uid) {
      const access = validateAccess(data.status);
      if (access.isValid) {
        hasValidSession = true;
        userInfo.textContent = access.label;
        togglePanels(true);
        queryStatus();
        
        try {
          const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/stanley_users/${data.uid}`;
          const dbRes = await fetch(firestoreUrl, {
            headers: { 'Authorization': `Bearer ${data.idToken}` }
          });
          if (dbRes.ok) {
            const dbData = await dbRes.json();
            const status = dbData.fields.status ? dbData.fields.status.stringValue : 'inactive';
            
            const freshAccess = validateAccess(status);
            if (!freshAccess.isValid) {
              signoutBtn.click();
            } else {
              userInfo.textContent = freshAccess.label;
              chrome.storage.local.set({ status });
            }
          }
        } catch (e) {
          // Ignore background refresh errors
        }
      } else {
        togglePanels(false);
      }
    } else {
      togglePanels(false);
    }
  }

  // ── Initialize ───────────────────────────────────────────────────────────────
  checkSession();
  setInterval(queryStatus, 1000);
});
