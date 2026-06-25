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
        } else if (msg.action === "run_custom_workflow") {
          if (callback) callback({ success: true });
          setTimeout(() => {
            if (window._mockListener) {
              window._mockListener({ action: "status_update", connected: true, log: "Initializing custom workflow...", desc: "Running Custom", workflowRunning: true, runningPrompt: msg.prompt });
              setTimeout(() => {
                window._mockListener({ action: "status_update", connected: true, log: "Completed successfully.", desc: "Workflow Complete", workflowRunning: false, runningPrompt: '' });
                window._mockListener({ action: "workflow_complete", log: "Custom steps finished successfully." });
              }, 1200);
            }
          }, 400);
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
              stanley_history: [],
              stanley_vault: {
                "SlackToken": "xoxb-mock-token-12345",
                "GoogleApiKey": "AIzaSyMockKey-xyz"
              },
              stanley_builder_draft: []
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

  // Background Running Banner
  const runningBanner = document.getElementById('running-banner');
  const runningBannerText = document.getElementById('running-banner-text');

  // Workflow Library
  const workflowLibraryToggle = document.getElementById('workflow-library-toggle');
  const workflowChevron = document.getElementById('workflow-chevron');
  const workflowLibraryBody = document.getElementById('workflow-library-body');
  const workflowList = document.getElementById('workflow-list');

  // Tab Navigation Elements
  const tabAssistant = document.getElementById('tab-assistant');
  const tabBuilder = document.getElementById('tab-builder');
  const tabVault = document.getElementById('tab-vault');
  const assistantView = document.getElementById('assistant-view');
  const builderView = document.getElementById('builder-view');
  const vaultView = document.getElementById('vault-view');

  // Builder Elements
  const builderStepsList = document.getElementById('builder-steps-list');
  const builderEmpty = document.getElementById('builder-empty');
  const builderConfigCard = document.getElementById('builder-config-card');
  const builderConfigFields = document.getElementById('builder-config-fields');
  const runBuilderBtn = document.getElementById('run-builder-btn');
  const saveBuilderBtn = document.getElementById('save-builder-btn');
  const builderClearBtn = document.getElementById('builder-clear-btn');

  // Vault Elements
  const vaultInputKey = document.getElementById('vault-input-key');
  const vaultInputVal = document.getElementById('vault-input-val');
  const vaultAddBtn = document.getElementById('vault-add-btn');
  const vaultListContainer = document.getElementById('vault-list-container');

  // Firebase Config Identifiers
  const FIREBASE_API_KEY = "AIzaSyCwyyfUU3DEJAFNFoILSbT2CH8oaNMrVlk";
  const FIREBASE_PROJECT_ID = "bridgeway-db29e";

  let hasValidSession = false;
  let isConnected = false;
  let lastScrapeResult = '';
  let lastScrapeUrl = '';
  let lastRunPrompt = '';
  
  // State lists
  let builderSteps = [];
  let selectedStepIndex = null;

  // ── Tab Switching ────────────────────────────────────────────────────────────
  function switchTab(tabName) {
    tabAssistant.classList.remove('active');
    tabBuilder.classList.remove('active');
    tabVault.classList.remove('active');
    assistantView.classList.add('hidden');
    builderView.classList.add('hidden');
    vaultView.classList.add('hidden');

    if (tabName === 'assistant') {
      tabAssistant.classList.add('active');
      assistantView.classList.remove('hidden');
    } else if (tabName === 'builder') {
      tabBuilder.classList.add('active');
      builderView.classList.remove('hidden');
      renderBuilder();
    } else if (tabName === 'vault') {
      tabVault.classList.add('active');
      vaultView.classList.remove('hidden');
      renderVault();
    }
  }

  tabAssistant.addEventListener('click', () => switchTab('assistant'));
  tabBuilder.addEventListener('click', () => switchTab('builder'));
  tabVault.addEventListener('click', () => switchTab('vault'));

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
      runBuilderBtn.setAttribute('disabled', 'true');
    }
  }

  function setConnectionState(connected) {
    isConnected = connected;
    if (connected && hasValidSession) {
      connectionBadge.className = 'badge connected';
      badgeText.textContent = 'Connected';
      runBtn.removeAttribute('disabled');
      if (builderSteps.length > 0) runBuilderBtn.removeAttribute('disabled');
    } else {
      connectionBadge.className = 'badge disconnected';
      badgeText.textContent = connected ? 'Active' : 'Offline';
      runBtn.setAttribute('disabled', 'true');
      runBuilderBtn.setAttribute('disabled', 'true');
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
      pauseScreenshot.src = '';
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

  // ── Export Logic ─────────────────────────────────────────────────────────────
  copyTextBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(lastScrapeResult).then(() => {
      const orig = copyTextBtn.textContent;
      copyTextBtn.textContent = '✅ Copied!';
      setTimeout(() => { copyTextBtn.textContent = orig; }, 2000);
    });
  });

  downloadCsvBtn.addEventListener('click', () => {
    const lines = lastScrapeResult.split('\n').filter(l => l.trim().length > 0);
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

  // ── Workflow Library ─────────────────────────────────────────────────────────
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
        workflowList.innerHTML = '<div class="workflow-empty">No saved workflows yet. Run a task and click "Save".</div>';
        return;
      }

      workflows.forEach((wf, idx) => {
        const chip = document.createElement('div');
        chip.className = 'workflow-chip';
        chip.title = wf.prompt || 'Saved Workflow';

        const name = document.createElement('div');
        name.className = 'workflow-chip-name';
        name.textContent = wf.name || `Workflow ${idx + 1}`;

        const time = document.createElement('div');
        time.className = 'workflow-chip-time';
        time.textContent = wf.savedAt ? new Date(wf.savedAt).toLocaleDateString() : '';

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

        // Click chip to load
        chip.addEventListener('click', () => {
          if (wf.actions) {
            builderSteps = JSON.parse(JSON.stringify(wf.actions));
            selectedStepIndex = null;
            saveBuilderDraft();
            switchTab('builder');
          } else {
            taskInput.value = wf.prompt;
            lastRunPrompt = wf.prompt;
            switchTab('assistant');
          }
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

  // ── Vault Management ─────────────────────────────────────────────────────────
  vaultAddBtn.addEventListener('click', () => {
    const key = vaultInputKey.value.trim();
    const val = vaultInputVal.value.trim();
    if (!key || !val) {
      alert("Secret key and value are required!");
      return;
    }

    // Clean key name to prevent breaking vault format
    const cleanKey = key.replace(/[^a-zA-Z0-9]/g, '');
    if (cleanKey !== key) {
      alert("Key name must contain alphanumeric characters only.");
      return;
    }

    chrome.storage.local.get(['stanley_vault'], (data) => {
      const vault = data.stanley_vault || {};
      vault[cleanKey] = val;
      chrome.storage.local.set({ stanley_vault: vault }, () => {
        vaultInputKey.value = '';
        vaultInputVal.value = '';
        renderVault();
      });
    });
  });

  function renderVault() {
    chrome.storage.local.get(['stanley_vault'], (data) => {
      const vault = data.stanley_vault || {};
      vaultListContainer.innerHTML = '';
      const keys = Object.keys(vault);

      if (keys.length === 0) {
        vaultListContainer.innerHTML = '<div class="workflow-empty">No secrets stored. Add one above.</div>';
        return;
      }

      keys.forEach(key => {
        const row = document.createElement('div');
        row.className = 'vault-row';

        const info = document.createElement('div');
        const keySpan = document.createElement('span');
        keySpan.className = 'vault-key';
        keySpan.textContent = key;
        const valSpan = document.createElement('span');
        valSpan.className = 'vault-value-mask';
        valSpan.textContent = ' ••••••••';
        info.appendChild(keySpan);
        info.appendChild(valSpan);

        const delBtn = document.createElement('button');
        delBtn.className = 'builder-step-btn del';
        delBtn.innerHTML = '×';
        delBtn.title = 'Delete Secret';
        delBtn.style.fontSize = '16px';
        delBtn.addEventListener('click', () => {
          deleteVaultSecret(key);
        });

        row.appendChild(info);
        row.appendChild(delBtn);
        vaultListContainer.appendChild(row);
      });
    });
  }

  function deleteVaultSecret(key) {
    chrome.storage.local.get(['stanley_vault'], (data) => {
      const vault = data.stanley_vault || {};
      delete vault[key];
      chrome.storage.local.set({ stanley_vault: vault }, () => {
        renderVault();
      });
    });
  }

  // ── Builder Management ───────────────────────────────────────────────────────
  // Add steps listener
  document.querySelectorAll('.add-step-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-type');
      let step = { action: type };
      
      // Default parameters
      if (type === 'navigate') {
        step.url = 'https://';
      } else if (type === 'click') {
        step.selector = '';
        step.description = '';
      } else if (type === 'type') {
        step.selector = '';
        step.value = '';
        step.description = '';
      } else if (type === 'wait') {
        step.ms = 1000;
      } else if (type === 'scrape') {
        step.selector = '';
      } else if (type === 'open_tab') {
        step.url = '';
      } else if (type === 'switch_tab') {
        step.index = 0;
      } else if (type === 'close_tab') {
        step.index = 0;
      }

      builderSteps.push(step);
      selectedStepIndex = builderSteps.length - 1;
      saveBuilderDraft();
      renderBuilder();
      showStepConfig(selectedStepIndex);
    });
  });

  builderClearBtn.addEventListener('click', () => {
    builderSteps = [];
    selectedStepIndex = null;
    saveBuilderDraft();
    renderBuilder();
    builderConfigCard.classList.add('hidden');
  });

  function saveBuilderDraft() {
    chrome.storage.local.set({ stanley_builder_draft: builderSteps });
  }

  function renderBuilder() {
    builderStepsList.innerHTML = '';
    if (builderSteps.length === 0) {
      builderStepsList.appendChild(builderEmpty);
      builderEmpty.style.display = 'block';
      runBuilderBtn.disabled = true;
      return;
    }

    builderEmpty.style.display = 'none';
    if (hasValidSession && isConnected) {
      runBuilderBtn.disabled = false;
    } else {
      runBuilderBtn.disabled = true;
    }

    builderSteps.forEach((step, idx) => {
      const row = document.createElement('div');
      row.className = 'builder-step-row';
      if (selectedStepIndex === idx) row.classList.add('selected');

      const info = document.createElement('div');
      info.className = 'builder-step-info';

      const badge = document.createElement('span');
      badge.className = 'builder-step-badge';
      
      let descText = '';
      if (step.action === 'navigate') {
        badge.classList.add('badge-nav');
        badge.textContent = 'Nav';
        descText = `Navigate to ${step.url || ''}`;
      } else if (step.action === 'click') {
        badge.classList.add('badge-click');
        badge.textContent = 'Click';
        descText = `Click "${step.description || step.selector || ''}"`;
      } else if (step.action === 'type') {
        badge.classList.add('badge-type');
        badge.textContent = 'Type';
        descText = `Type "${step.value || ''}" into "${step.description || step.selector || ''}"`;
      } else if (step.action === 'wait') {
        badge.classList.add('badge-wait');
        badge.textContent = 'Wait';
        descText = `Wait for ${step.ms || 1000}ms`;
      } else if (step.action === 'scrape') {
        badge.classList.add('badge-scrape');
        badge.textContent = 'Scrape';
        descText = step.selector ? `Scrape "${step.selector}"` : 'Scrape text';
      } else if (step.action === 'open_tab') {
        badge.classList.add('badge-tab');
        badge.textContent = 'Open';
        descText = step.url ? `Open Tab: ${step.url}` : 'Open blank tab';
      } else if (step.action === 'switch_tab') {
        badge.classList.add('badge-tab');
        badge.textContent = 'Switch';
        descText = `Switch to Tab ${step.index || 0}`;
      } else if (step.action === 'close_tab') {
        badge.classList.add('badge-tab');
        badge.textContent = 'Close';
        descText = `Close Tab ${step.index || 0}`;
      }

      info.appendChild(badge);
      
      const descSpan = document.createElement('span');
      descSpan.className = 'builder-step-desc';
      descSpan.textContent = `${idx + 1}. ${descText}`;
      info.appendChild(descSpan);

      const actions = document.createElement('div');
      actions.className = 'builder-step-actions';

      // Move up button
      if (idx > 0) {
        const upBtn = document.createElement('button');
        upBtn.className = 'builder-step-btn';
        upBtn.innerHTML = '▲';
        upBtn.title = 'Move Up';
        upBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          swapSteps(idx, idx - 1);
        });
        actions.appendChild(upBtn);
      }

      // Move down button
      if (idx < builderSteps.length - 1) {
        const downBtn = document.createElement('button');
        downBtn.className = 'builder-step-btn';
        downBtn.innerHTML = '▼';
        downBtn.title = 'Move Down';
        downBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          swapSteps(idx, idx + 1);
        });
        actions.appendChild(downBtn);
      }

      // Delete button
      const delBtn = document.createElement('button');
      delBtn.className = 'builder-step-btn del';
      delBtn.innerHTML = '×';
      delBtn.title = 'Delete Step';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteStep(idx);
      });
      actions.appendChild(delBtn);

      row.appendChild(info);
      row.appendChild(actions);

      row.addEventListener('click', () => {
        selectedStepIndex = idx;
        renderBuilder();
        showStepConfig(idx);
      });

      builderStepsList.appendChild(row);
    });
  }

  function swapSteps(i, j) {
    const temp = builderSteps[i];
    builderSteps[i] = builderSteps[j];
    builderSteps[j] = temp;
    if (selectedStepIndex === i) selectedStepIndex = j;
    else if (selectedStepIndex === j) selectedStepIndex = i;
    saveBuilderDraft();
    renderBuilder();
    if (selectedStepIndex !== null) showStepConfig(selectedStepIndex);
  }

  function deleteStep(idx) {
    builderSteps.splice(idx, 1);
    if (selectedStepIndex === idx) {
      selectedStepIndex = null;
      builderConfigCard.classList.add('hidden');
    } else if (selectedStepIndex > idx) {
      selectedStepIndex--;
    }
    saveBuilderDraft();
    renderBuilder();
    if (selectedStepIndex !== null) showStepConfig(selectedStepIndex);
  }

  function showStepConfig(idx) {
    const step = builderSteps[idx];
    if (!step) {
      builderConfigCard.classList.add('hidden');
      return;
    }

    builderConfigCard.classList.remove('hidden');
    document.getElementById('builder-config-title').textContent = `Configure Step ${idx + 1}: ${step.action.toUpperCase()}`;
    builderConfigFields.innerHTML = '';

    if (step.action === 'navigate') {
      builderConfigFields.appendChild(createField('url', 'Target URL', step.url || '', 'text', (val) => {
        step.url = val;
        saveBuilderDraft();
        renderBuilder();
      }));
    } else if (step.action === 'click') {
      builderConfigFields.appendChild(createField('description', 'Visual Text Label (AI Natural Locator)', step.description || '', 'text', (val) => {
        step.description = val;
        saveBuilderDraft();
        renderBuilder();
      }));
      builderConfigFields.appendChild(createField('selector', 'CSS Selector (Optional Fallback)', step.selector || '', 'text', (val) => {
        step.selector = val;
        saveBuilderDraft();
        renderBuilder();
      }));
    } else if (step.action === 'type') {
      builderConfigFields.appendChild(createField('value', 'Value to Type (use vault:KeyName for vault secrets)', step.value || '', 'text', (val) => {
        step.value = val;
        saveBuilderDraft();
        renderBuilder();
      }));
      builderConfigFields.appendChild(createField('description', 'Visual Text Label (AI Natural Locator)', step.description || '', 'text', (val) => {
        step.description = val;
        saveBuilderDraft();
        renderBuilder();
      }));
      builderConfigFields.appendChild(createField('selector', 'CSS Selector (Optional Fallback)', step.selector || '', 'text', (val) => {
        step.selector = val;
        saveBuilderDraft();
        renderBuilder();
      }));
    } else if (step.action === 'wait') {
      builderConfigFields.appendChild(createField('ms', 'Duration (milliseconds)', step.ms || 1000, 'number', (val) => {
        step.ms = parseInt(val, 10) || 1000;
        saveBuilderDraft();
        renderBuilder();
      }));
    } else if (step.action === 'scrape') {
      builderConfigFields.appendChild(createField('selector', 'CSS Selector (Optional, empty scrapes whole page)', step.selector || '', 'text', (val) => {
        step.selector = val;
        saveBuilderDraft();
        renderBuilder();
      }));
    } else if (step.action === 'open_tab') {
      builderConfigFields.appendChild(createField('url', 'URL to Open (Optional)', step.url || '', 'text', (val) => {
        step.url = val;
        saveBuilderDraft();
        renderBuilder();
      }));
    } else if (step.action === 'switch_tab') {
      builderConfigFields.appendChild(createField('index', 'Tab Index (0-indexed)', step.index || 0, 'number', (val) => {
        step.index = parseInt(val, 10) || 0;
        saveBuilderDraft();
        renderBuilder();
      }));
    } else if (step.action === 'close_tab') {
      builderConfigFields.appendChild(createField('index', 'Tab Index to Close (0-indexed)', step.index || 0, 'number', (val) => {
        step.index = parseInt(val, 10) || 0;
        saveBuilderDraft();
        renderBuilder();
      }));
    }
  }

  function createField(name, labelText, value, type = 'text', onChange) {
    const group = document.createElement('div');
    group.className = 'form-group';
    
    const lbl = document.createElement('label');
    lbl.textContent = labelText;
    group.appendChild(lbl);

    const inp = document.createElement('input');
    inp.type = type;
    inp.value = value;
    inp.addEventListener('input', (e) => {
      onChange(e.target.value);
    });
    group.appendChild(inp);

    return group;
  }

  // ── Run Builder Workflow ─────────────────────────────────────────────────────
  runBuilderBtn.addEventListener('click', () => {
    if (builderSteps.length === 0 || !hasValidSession) return;
    
    runBuilderBtn.disabled = true;
    statusDesc.textContent = 'Preparing builder workflow...';
    statusLog.textContent = 'Resolving vault credentials...';
    
    chrome.storage.local.get(['stanley_vault'], (data) => {
      const vault = data.stanley_vault || {};
      
      // Deep copy actions so we don't overwrite draft references with plain text secrets
      const resolvedActions = JSON.parse(JSON.stringify(builderSteps));
      
      resolvedActions.forEach(step => {
        if (step.action === 'type' && step.value && step.value.startsWith('vault:')) {
          const key = step.value.replace('vault:', '');
          if (vault[key]) {
            step.value = vault[key];
          }
        }
      });
      
      statusDesc.textContent = 'Executing custom workflow...';
      statusLog.textContent = 'Sending direct actions list to daemon wrapper...';
      
      // Clean up preview panels
      planPreviewPanel.classList.add('hidden');
      pausePanel.classList.add('hidden');
      resultBlock.classList.add('hidden');
      
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentUrl = (tabs && tabs[0]) ? tabs[0].url : '';
        chrome.runtime.sendMessage({
          action: "run_custom_workflow",
          actions: resolvedActions,
          activeMode: activeMode,
          currentUrl: currentUrl,
          prompt: 'Custom Builder Workflow (' + resolvedActions.length + ' steps)'
        }, (response) => {
          runBuilderBtn.disabled = false;
          if (chrome.runtime.lastError) {
            statusDesc.textContent = 'Execution failed';
            statusLog.textContent = 'Error: ' + chrome.runtime.lastError.message;
            return;
          }
        if (response && response.error) {
          statusDesc.textContent = 'Execution Error';
          statusLog.textContent = response.error;
        }
      });
    });
  });
});

  // ── Save Builder Workflow ────────────────────────────────────────────────────
  saveBuilderBtn.addEventListener('click', () => {
    if (builderSteps.length === 0) return;
    const name = window.prompt('Name this custom builder workflow:', `Custom Workflow ${new Date().toLocaleDateString()}`);
    if (!name) return;

    chrome.storage.local.get(['stanley_workflows'], (data) => {
      const workflows = Array.isArray(data.stanley_workflows) ? data.stanley_workflows : [];
      workflows.unshift({
        name: name.trim(),
        actions: builderSteps,
        prompt: `Custom low-code builder workflow: ${name}`,
        savedAt: Date.now()
      });
      chrome.storage.local.set({ stanley_workflows: workflows }, () => {
        const orig = saveBuilderBtn.textContent;
        saveBuilderBtn.textContent = '✅ Saved!';
        setTimeout(() => { saveBuilderBtn.textContent = orig; }, 2000);
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
      if (message.result) {
        showScrapeResult(message.result, lastScrapeUrl || '');
      }
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

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentUrl = (tabs && tabs[0]) ? tabs[0].url : '';
      chrome.runtime.sendMessage({ 
        action: "compile_prompt", 
        prompt: prompt, 
        activeMode: activeMode,
        currentUrl: currentUrl
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
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentUrl = (tabs && tabs[0]) ? tabs[0].url : '';
      chrome.runtime.sendMessage({ action: "confirm_run", prompt: lastRunPrompt, currentUrl: currentUrl }, (response) => {
        if (chrome.runtime.lastError) {
          statusDesc.textContent = 'Failed to execute';
          statusLog.textContent = chrome.runtime.lastError.message;
        }
      });
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

    loginStatus.style.color = "var(--brand)";
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

      await StanleyAuth.saveLoginResponse(authData, {
        email: email,
        status: status,
        trialEndsAt: trialEndsAtVal,
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
    await StanleyAuth.clearAuth();
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
    const data = await chrome.storage.local.get(['email', 'uid', 'idToken', 'status', 'trialEndsAt', 'savedAt', 'activeMode', 'stanley_builder_draft']);
    
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

    if (data.stanley_builder_draft) {
      builderSteps = data.stanley_builder_draft;
    }

    if (data.idToken && data.uid) {
      const access = validateAccess(data.status);
      if (access.isValid) {
        hasValidSession = true;
        userInfo.textContent = access.label;
        togglePanels(true);
        queryStatus();
        
        try {
          const idToken = await StanleyAuth.getFreshIdToken();
          const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/stanley_users/${data.uid}`;
          const dbRes = await fetch(firestoreUrl, {
            headers: { 'Authorization': `Bearer ${idToken}` }
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
