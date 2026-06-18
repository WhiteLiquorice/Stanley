const fs = require('fs');
const path = require('path');

// Redirect all standard console.log output to stderr so it does not corrupt the Native Messaging stdout stream
console.log = console.error;

const { StanleyFoundation } = require('../foundationAgent.js');

// Global resolve handler for pausing the workflow until user hint is received
let pauseResolve = null;

// Helper to write length-prefixed messages to stdout (Chrome Native Messaging protocol)
function sendResponse(msg) {
  const payload = Buffer.from(JSON.stringify(msg), 'utf8');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(payload.length, 0);
  process.stdout.write(Buffer.concat([lenBuf, payload]));
}

// Logging utilities that notify the Chrome extension UI
function logToExtension(desc, logDetails) {
  sendResponse({ desc, log: logDetails });
}

// REST client calling the Firebase Callable function
async function callStanleyAI(idToken, data) {
  const projectId = "bridgeway-db29e";
  const url = `https://us-central1-${projectId}.cloudfunctions.net/askStanleyAI`;
  
  const headers = {
    'Content-Type': 'application/json'
  };
  if (idToken) {
    headers['Authorization'] = `Bearer ${idToken}`;
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data })
  });
  
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

// Simple natural language prompt compiler to build action arrays (fallback)
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
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        actions.push({ action: 'navigate', url });
      }
    } else if (lowerStep.startsWith('click')) {
      const match = step.match(/click\s+(?:on\s+|at\s+)?['"]?([^'"]+)['"]?/i);
      if (match) {
        actions.push({ action: 'click', description: match[1].trim() });
      }
    } else if (lowerStep.startsWith('type')) {
      const match = step.match(/type\s+['"]?([^'"]+)['"]?\s+into\s+['"]?([^'"]+)['"]?/i);
      if (match) {
        actions.push({ action: 'type', value: match[1], description: match[2].trim() });
      }
    } else if (lowerStep.startsWith('wait')) {
      const match = step.match(/wait\s+(\d+)\s*(ms|s|second|seconds)?/i);
      if (match) {
        let val = parseInt(match[1], 10);
        let unit = match[2] ? match[2].toLowerCase() : 'ms';
        if (unit.startsWith('s') || val < 100) {
          val = val * 1000;
        }
        actions.push({ action: 'wait', ms: val });
      }
    } else if (lowerStep.includes('scrape') || lowerStep.includes('extract') || lowerStep.includes('get')) {
      actions.push({ action: 'scrape' });
    }
  }
  
  return actions;
}

// Pause utility that sends page screenshots to the popup and blocks until hint is received
async function waitForUserHint(agent, message) {
  let screenshot = null;
  try {
    screenshot = await agent.captureScreenshotBase64();
  } catch (err) {
    console.error("Failed to capture screenshot during pause:", err);
  }
  
  sendResponse({
    action: "pause_request",
    screenshot: screenshot,
    hint: message
  });
  
  return new Promise((resolve) => {
    pauseResolve = resolve;
  });
}

// Retry wrapper with progressive backoff for transient Playwright errors (Item 7)
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
      
      if (!isRetryable || attempt === maxAttempts - 1) {
        throw err;
      }
    }
  }
  throw lastErr;
}

// Browser automation engine using StanleyFoundation
async function runWorkflow(actions, idToken, activeMode) {
  const agent = new StanleyFoundation({
    headless: activeMode ? false : true,
    statePath: path.join(__dirname, 'stanley_session_state.json')
  });

  try {
    logToExtension("Initializing browser", `Launching Playwright browser (Stealth: ${!activeMode})...`);
    await agent.initialize();
    
    for (let i = 0; i < actions.length; i++) {
      const step = actions[i];
      const stepLabel = `[Step ${i+1}/${actions.length}]`;
      
      switch (step.action) {
        case 'navigate':
          logToExtension(`${stepLabel} Navigating`, `URL: ${step.url}`);
          await agent.navigate(step.url);
          break;
          
        case 'click': {
          logToExtension(`${stepLabel} Clicking`, `Target: ${step.description || step.selector}`);

          await withRetry(async () => {
            let clicked = false;

            // Tier 1: Natural Playwright locators (zero DOM mutation, no AI)
            if (step.description) {
              try {
                clicked = await agent.clickByNaturalLocator(step.description);
                if (clicked) {
                  console.error(`Tier 1: Clicked successfully via Natural Locator: "${step.description}"`);
                }
              } catch (err) {
                console.error('Tier 1 natural locator click failed:', err);
              }
            }
          
          // Tier 2: Vision locator (multimodal AI, zero DOM mutation)
          if (!clicked && step.description) {
            try {
              logToExtension(`${stepLabel} Vision resolving`, `Running screenshot analysis...`);
              const screenshot = await agent.captureScreenshotBase64();
              
              const visionResult = await callStanleyAI(idToken, {
                mode: 'resolveWithVision',
                stepDescription: step.description,
                screenshotBase64: screenshot
              });
              
              if (visionResult && visionResult.strategy && visionResult.value) {
                logToExtension(`${stepLabel} Vision resolved`, `Matched strategy "${visionResult.strategy}" = "${visionResult.value}"`);
                await agent.clickByStrategy(visionResult.strategy, visionResult.value, visionResult.roleType);
                clicked = true;
              }
            } catch (err) {
              console.error("Tier 2 Vision locator click failed:", err);
            }
          }
          
          // Tier 3: Stealth DOM attributes + Text Gemini (DOM mutation, text AI)
          if (!clicked) {
            let selectorToUse = step.selector;
            
            if (!selectorToUse && step.description) {
              const elements = await agent.getPrunedInteractiveElements();
              const descLower = step.description.toLowerCase();
              
              const exactMatch = elements.find(el => 
                el.text.toLowerCase() === descLower || 
                el.placeholder.toLowerCase() === descLower ||
                el.ariaLabel.toLowerCase() === descLower ||
                el.name.toLowerCase() === descLower ||
                el.id.toLowerCase() === descLower
              );
              
              if (exactMatch) {
                selectorToUse = `index_${exactMatch.index}`;
              } else {
                const fuzzyMatches = elements.filter(el => 
                  el.text.toLowerCase().includes(descLower) || 
                  el.placeholder.toLowerCase().includes(descLower) ||
                  el.ariaLabel.toLowerCase().includes(descLower)
                );
                if (fuzzyMatches.length === 1) {
                  selectorToUse = `index_${fuzzyMatches[0].index}`;
                }
              }
              
              if (!selectorToUse) {
                logToExtension(`${stepLabel} Text resolving`, `Asking Gemini text matching for: "${step.description}"`);
                const res = await callStanleyAI(idToken, {
                  mode: 'resolve',
                  stepDescription: step.description,
                  elements: elements
                });
                if (res && res.index !== undefined && res.index !== -1) {
                  selectorToUse = `index_${res.index}`;
                }
              }
            }
            
            if (selectorToUse) {
                const index = parseInt(selectorToUse.replace('index_', ''), 10);
                if (!isNaN(index)) {
                  await agent.clickByIndex(index);
                  clicked = true;
                }
              }
            }

            // Tier 4: Error fallback
            if (!clicked) {
              await agent.waitForPageStable(500);
              throw new Error(`Unable to resolve or click interactive element: "${step.description || step.selector}"`);
            }
          }, `click:${step.description || step.selector}`);

          break;
        }
          
        case 'type': {
          logToExtension(`${stepLabel} Typing`, `Into: ${step.description}`);

          await withRetry(async () => {
            let typed = false;

            // Tier 1: Natural Playwright locators (zero DOM mutation, no AI)
            if (step.description) {
              try {
                typed = await agent.typeByNaturalLocator(step.description, step.value);
                if (typed) {
                  console.error(`Tier 1: Typed successfully via Natural Locator: "${step.description}"`);
                }
              } catch (err) {
                console.error('Tier 1 natural locator type failed:', err);
              }
            }
          
          // Tier 2: Vision locator (multimodal AI, zero DOM mutation)
          if (!typed && step.description) {
            try {
              logToExtension(`${stepLabel} Vision resolving`, `Running screenshot analysis...`);
              const screenshot = await agent.captureScreenshotBase64();
              
              const visionResult = await callStanleyAI(idToken, {
                mode: 'resolveWithVision',
                stepDescription: step.description,
                screenshotBase64: screenshot
              });
              
              if (visionResult && visionResult.strategy && visionResult.value) {
                logToExtension(`${stepLabel} Vision resolved`, `Matched strategy "${visionResult.strategy}" = "${visionResult.value}"`);
                await agent.typeByStrategy(visionResult.strategy, visionResult.value, step.value, visionResult.roleType);
                typed = true;
              }
            } catch (err) {
              console.error("Tier 2 Vision locator type failed:", err);
            }
          }
          
          // Tier 3: Stealth DOM attributes + Text Gemini (DOM mutation, text AI)
          if (!typed) {
            let selectorToUse = step.selector;
            
            if (!selectorToUse && step.description) {
              const elements = await agent.getPrunedInteractiveElements();
              const descLower = step.description.toLowerCase();
              
              const exactMatch = elements.find(el => 
                el.placeholder.toLowerCase() === descLower || 
                el.name.toLowerCase() === descLower || 
                el.id.toLowerCase() === descLower ||
                el.ariaLabel.toLowerCase() === descLower ||
                el.text.toLowerCase() === descLower
              );
              
              if (exactMatch) {
                selectorToUse = `index_${exactMatch.index}`;
              } else {
                const fuzzyMatches = elements.filter(el => 
                  el.placeholder.toLowerCase().includes(descLower) || 
                  el.name.toLowerCase().includes(descLower) ||
                  el.text.toLowerCase().includes(descLower)
                );
                if (fuzzyMatches.length === 1) {
                  selectorToUse = `index_${fuzzyMatches[0].index}`;
                }
              }
              
              if (!selectorToUse) {
                logToExtension(`${stepLabel} Text resolving`, `Asking Gemini text matching for: "${step.description}"`);
                const res = await callStanleyAI(idToken, {
                  mode: 'resolve',
                  stepDescription: step.description,
                  elements: elements
                });
                if (res && res.index !== undefined && res.index !== -1) {
                  selectorToUse = `index_${res.index}`;
                }
              }
            }
            
            if (selectorToUse) {
                const index = parseInt(selectorToUse.replace('index_', ''), 10);
                if (!isNaN(index)) {
                  await agent.typeByIndex(index, step.value);
                  typed = true;
                }
              }
            }

            // Tier 4: Error fallback
            if (!typed) {
              await agent.waitForPageStable(500);
              throw new Error(`Unable to resolve or type into input element: "${step.description || step.selector}"`);
            }
          }, `type:${step.description || step.selector}`);

          break;
        }
          
        case 'wait':
          logToExtension(`${stepLabel} Waiting`, `Duration: ${step.ms}ms`);
          await agent.wait(step.ms);
          break;
          
        case 'scrape':
          logToExtension(`${stepLabel} Scraping`, `Extracting visible text content...`);
          const text = await agent.scrapeContent(step.selector);
          const currentUrl = agent.page ? agent.page.url() : '';
          sendResponse({
            action: "scrape_result",
            result: text,
            url: currentUrl
          });
          break;

        case 'open_tab': {
          const tabLabel = step.url ? `Opening tab: ${step.url}` : 'Opening new blank tab';
          logToExtension(`${stepLabel} Open Tab`, tabLabel);
          const newTabIndex = await agent.openTab(step.url);
          logToExtension(`${stepLabel} Tab Opened`, `New tab at index ${newTabIndex}`);
          break;
        }

        case 'switch_tab': {
          const idx = typeof step.index === 'number' ? step.index : parseInt(step.index, 10);
          logToExtension(`${stepLabel} Switch Tab`, `Switching to tab ${idx}`);
          await agent.switchTab(idx);
          break;
        }

        case 'close_tab': {
          const idx = typeof step.index === 'number' ? step.index : parseInt(step.index, 10);
          logToExtension(`${stepLabel} Close Tab`, `Closing tab ${idx}`);
          await agent.closeTab(idx);
          break;
        }

        default:
          logToExtension(`${stepLabel} Error`, `Unknown action: ${step.action}`);
      }

      // Cleanup any injected attributes after the step execution
      await agent.cleanupStealthAttributes();

      // Blocking/CAPTCHA heuristic check
      const blockCheck = await agent.isPageBlocked();
      if (blockCheck.blocked) {
        logToExtension(`${stepLabel} Page Blocked`, blockCheck.hint);
        const hint = await waitForUserHint(agent, `Page is blocked: ${blockCheck.hint}. Please solve it manually, then type hint and submit.`);
        if (hint) {
          logToExtension(`${stepLabel} Resumed`, `User hints processed: "${hint}"`);
        }
      }
    }
    
    await agent.saveState();
    logToExtension("Workflow Complete", `Executed ${actions.length} commands successfully.`);
  } catch (err) {
    logToExtension("Workflow Failed", `Error: ${err.message}`);
    throw err;
  } finally {
    await agent.cleanup();
  }
}

// Receive and buffer standard input chunks
let inputBuffer = Buffer.alloc(0);

process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  
  while (inputBuffer.length >= 4) {
    const length = inputBuffer.readUInt32LE(0);
    
    if (inputBuffer.length >= 4 + length) {
      const messageBuffer = inputBuffer.slice(4, 4 + length);
      inputBuffer = inputBuffer.slice(4 + length);
      
      try {
        const message = JSON.parse(messageBuffer.toString('utf8'));
        handleIncomingMessage(message);
      } catch (err) {
        logToExtension("Protocol Error", "Failed to parse incoming JSON payload.");
      }
    } else {
      break;
    }
  }
});

// Route and execute incoming message requests
async function handleIncomingMessage(msg) {
  const idToken = msg.idToken || '';
  
  if (msg.action === "compile_only") {
    logToExtension("Compiling prompt", "Asking Gemini to structure user workflow...");
    let actions = [];
    try {
      const aiResult = await callStanleyAI(idToken, {
        mode: 'compile',
        prompt: msg.prompt
      });
      if (aiResult && Array.isArray(aiResult.actions)) {
        actions = aiResult.actions;
      }
    } catch (err) {
      console.error("Gemini compile failed, falling back to regex parser:", err);
      logToExtension("AI Compile Failed", "Falling back to local regex parsing engine...");
      actions = compilePromptToActionsRegex(msg.prompt);
    }
    
    if (actions.length === 0) {
      logToExtension("Empty Workflow", "No valid automation actions detected.");
      sendResponse({ action: "workflow_failed", error: "Empty compiled workflow" });
      return;
    }

    sendResponse({
      action: "plan_ready",
      actions: actions
    });
  } else if (msg.action === "confirm_run") {
    if (!msg.actions || msg.actions.length === 0) {
      logToExtension("Empty Workflow", "No actions provided to run.");
      sendResponse({ action: "workflow_failed", error: "No actions to run." });
      return;
    }

    const runPrompt = msg.prompt || '';
    runWorkflow(msg.actions, idToken, msg.activeMode).then(() => {
      sendResponse({ action: "workflow_complete", prompt: runPrompt });
    }).catch((err) => {
      sendResponse({ action: "workflow_failed", error: err.message, prompt: runPrompt });
    });
  } else if (msg.action === "pause_response") {
    if (pauseResolve) {
      const resolve = pauseResolve;
      pauseResolve = null;
      resolve(msg.hint);
    }
  } else {
    // Legacy support for direct runs (e.g., test scripts sending direct messages)
    if (msg.prompt) {
      logToExtension("Compiling prompt", "Asking Gemini to structure user workflow...");
      let actions = [];
      try {
        const aiResult = await callStanleyAI(idToken, {
          mode: 'compile',
          prompt: msg.prompt
        });
        if (aiResult && Array.isArray(aiResult.actions)) {
          actions = aiResult.actions;
        }
      } catch (err) {
        actions = compilePromptToActionsRegex(msg.prompt);
      }
      
      if (actions.length === 0) {
        logToExtension("Empty Workflow", "No valid automation actions detected.");
        return;
      }
      
      runWorkflow(actions, idToken, msg.activeMode || false).catch((err) => {
        logToExtension("Process Error", err.message);
      });
    } else if (Array.isArray(msg.actions)) {
      runWorkflow(msg.actions, idToken, msg.activeMode || false).catch((err) => {
        logToExtension("Process Error", err.message);
      });
    } else {
      logToExtension("Invalid Message", "Requires 'action' or 'prompt' or 'actions' array.");
    }
  }
}

// Keep daemon running in stdio state
logToExtension("Daemon Active", "Listening on stdin channel...");
