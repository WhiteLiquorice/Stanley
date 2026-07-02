/**
 * cloudRunner.js — branching-aware workflow runner for headless Cloud Run execution.
 *
 * Mirrors the desktop runner.js, but:
 *   - launches Playwright's BUNDLED Chromium (channel: '') instead of the user's Chrome
 *   - runs headless: true
 *   - keeps no on-disk session state (containers are ephemeral)
 *
 * Returns the collected log lines so the caller can hand them back to the client.
 */

const { StanleyFoundationEnhanced } = require('./foundationAgent.enhanced.js');
const { executeGraph } = require('./branchingEngine.js');
const visionResolver = require('./visionResolver.js');

async function runWorkflowHeadless(workflow, secrets = {}, input = {}, db = null) {
  const logs = [];
  const onLog = (line) => {
    logs.push(line);
    console.log(line);
  };

  onLog(`[Runner] Starting headless execution: "${workflow.name || 'Workflow'}"`);

  if (!workflow.nodes || workflow.nodes.length === 0) {
    throw new Error('Workflow has no nodes to execute.');
  }

  // A run needs a starting URL somewhere — on the trigger, or on a navigate /
  // open-tab node if the flow begins by opening a fresh tab.
  const isValidUrl = (u) => !!u && u !== 'https://' && u !== 'http://' && u.length >= 8;
  const hasStartUrl = workflow.nodes.some(
    (n) => ['trigger', 'navigate', 'open_tab'].includes(n.type) && isValidUrl(n.data?.url)
  );
  if (!hasStartUrl) {
    throw new Error(
      'Workflow has no starting URL. Set one on the trigger, or on a navigate / open-tab node before running.'
    );
  }

  const agent = new StanleyFoundationEnhanced({
    headless: true,      // Run headless
    channel: '',          // '' => bundled Chromium, not the (absent) system Chrome
    statePath: null,      // ephemeral container, no persisted session
    // Extended anti-detection launch args
    extraArgs: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-infobars',
      '--window-size=1280,800',
      '--disable-extensions',
      '--disable-gpu',
      '--lang=en-US,en',
      '--disable-features=IsolateOrigins,site-per-process',
      '--flag-switches-begin',
      '--disable-site-isolation-trials',
      '--flag-switches-end',
    ],
  });

  let scraped;
  try {
    onLog('[Runner] Initializing stealth headless browser…');
    await agent.initialize();

    // ── Deep stealth init: patch every known automation signal ──────────────
    // Applied to both the initial page and any new tabs opened during the run.
    const stealthScript = () => {
      // 1. webdriver
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

      // 2. Plugins — headless normally has 0; spoof a realistic set
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const arr = [{ filename: 'internal-pdf-viewer', name: 'Chrome PDF Plugin', description: 'Portable Document Format' }];
          arr.__proto__ = PluginArray.prototype;
          return arr;
        },
      });

      // 3. Languages
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

      // 4. chrome runtime object (absent in headless)
      if (!window.chrome) {
        window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
      }

      // 5. Permissions API — headless returns 'denied' for notifications; real Chrome returns 'default'
      const origQuery = window.navigator.permissions?.query?.bind(navigator.permissions);
      if (origQuery) {
        navigator.permissions.query = (parameters) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : origQuery(parameters);
      }

      // 6. WebGL renderer — mask the SwiftShader/LLVMpipe fingerprint
      const getParam = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (parameter) {
        if (parameter === 37445) return 'Intel Inc.';          // UNMASKED_VENDOR_WEBGL
        if (parameter === 37446) return 'Intel Iris OpenGL Engine'; // UNMASKED_RENDERER_WEBGL
        return getParam.call(this, parameter);
      };

      // 7. Screen dimensions
      Object.defineProperty(screen, 'width',  { get: () => 1280 });
      Object.defineProperty(screen, 'height', { get: () => 800  });
      Object.defineProperty(screen, 'availWidth',  { get: () => 1280 });
      Object.defineProperty(screen, 'availHeight', { get: () => 800  });
    };

    // Apply to the initial page
    await agent.page.addInitScript(stealthScript);
    // Apply to any future tabs
    if (agent.context) {
      agent.context.on('page', async (p) => {
        await p.addInitScript(stealthScript).catch(() => {});
      });
    }
    onLog('[Runner] Stealth patches applied.');

    scraped = await executeGraph(agent, workflow, {
      onLog,
      secrets,
      input,            // trigger payload (webhook body / schedule context) for {{input.x}}
      visionResolver,   // enables tier-3 vision fallback + ai_prompt nodes
      db,               // allows branching engine to access Firestore cache
      onBlocked: async (block, label) => {
        // No human present in headless mode — fail fast rather than hang.
        throw new Error(`${label} Blocked by ${block.hint}. Headless runs cannot solve CAPTCHAs/MFA.`);
      },
      maxSteps: 1000,
    });

    onLog('[Runner] Workflow completed successfully.');
    return { logs, scraped };
  } catch (error) {
    onLog(`[Runner] ERROR: ${error.message}`);
    const err = new Error(error.message);
    err.logs = logs;
    throw err;
  } finally {
    onLog('[Runner] Cleaning up browser…');
    await agent.cleanup().catch(() => {});
  }
}

module.exports = { runWorkflowHeadless };
