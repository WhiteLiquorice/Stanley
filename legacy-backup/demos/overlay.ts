/**
 * Stanley floating overlay — injects a self-contained popup UI into any page.
 * All state transitions are driven from Playwright via page.evaluate().
 * The overlay appears fixed in the top-right corner, like the real extension popup.
 */
import { Page } from 'playwright';

export interface OverlayStep {
  action: string;
  url?: string;
  value?: string;
  description?: string;
  index?: number;
}

// Build the full overlay HTML + CSS as a string (injected into the target page)
const OVERLAY_CSS = `
  @keyframes sly-spin { to { transform: rotate(360deg); } }
  @keyframes sly-fadein { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
  @keyframes sly-slide-in { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }

  #sly-root {
    position: fixed;
    top: 16px;
    left: 68%;
    transform: translateX(-50%);
    width: 360px;
    z-index: 2147483647;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    animation: sly-slide-in 0.4s ease;
    pointer-events: none;
  }

  #sly-popup {
    width: 340px;
    background: #030712;
    border-radius: 14px;
    padding: 16px;
    color: #f3f4f6;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.08), 0 32px 100px rgba(0,0,0,0.92);
    pointer-events: auto;
    transition: all 0.4s ease;
  }

  .sly-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    padding-bottom: 12px;
  }
  .sly-logo-row { display: flex; align-items: center; gap: 10px; }
  .sly-icon {
    width: 28px; height: 28px;
    background: #22c55e;
    border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 900; color: #030712;
  }
  .sly-title {
    font-size: 16px; font-weight: 700; letter-spacing: 0.5px;
    background: linear-gradient(to right, #ffffff, #d1d5db);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .sly-badge {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 600;
    padding: 4px 10px; border-radius: 20px;
    background: rgba(34,197,94,0.08);
    border: 1px solid rgba(34,197,94,0.2);
    color: #22c55e;
  }
  .sly-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 8px #22c55e;
  }

  .sly-card {
    background: #0b0f19;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 14px;
    margin-bottom: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
  }
  .sly-label {
    font-size: 11px; font-weight: 600;
    color: #9ca3af;
    text-transform: uppercase; letter-spacing: 0.5px;
    margin-bottom: 8px; display: block;
  }
  #sly-textarea {
    width: 100%; height: 78px;
    background: rgba(0,0,0,0.3);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px; padding: 10px;
    color: #f3f4f6; font-size: 13px;
    font-family: inherit; resize: none; outline: none;
    box-sizing: border-box;
    border-color: rgba(34,197,94,0.4);
    box-shadow: 0 0 8px rgba(34,197,94,0.12);
  }

  .sly-mode-row {
    display: flex;
    background: rgba(0,0,0,0.2);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 8px; padding: 3px;
    margin-bottom: 10px; gap: 3px;
  }
  .sly-mode-btn {
    flex: 1; padding: 7px 10px;
    border: none; border-radius: 5px;
    font-size: 12px; font-weight: 600;
    cursor: pointer; color: #9ca3af; background: none;
    font-family: inherit;
  }
  .sly-mode-btn.active {
    background: rgba(255,255,255,0.08);
    color: #f3f4f6;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }

  #sly-run-btn {
    width: 100%; padding: 11px;
    border: none; border-radius: 8px;
    background: linear-gradient(to right, #22c55e, #10b981);
    color: #030712; font-weight: 700; font-size: 14px;
    cursor: pointer; display: flex;
    align-items: center; justify-content: center; gap: 8px;
    box-shadow: 0 4px 12px rgba(34,197,94,0.25);
    font-family: inherit; transition: all 0.2s;
    margin-bottom: 12px;
  }
  #sly-run-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(34,197,94,0.35); }

  #sly-plan-panel { display: none; }
  .sly-steps { display: flex; flex-direction: column; gap: 7px; margin-bottom: 10px; }
  .sly-step {
    display: flex; align-items: flex-start; gap: 8px;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 6px; padding: 8px 10px;
    font-size: 12px; color: #d1d5db;
    animation: sly-fadein 0.3s ease;
  }
  .sly-step-num {
    background: #22d3ee; color: #030712;
    width: 18px; height: 18px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 10px; flex-shrink: 0;
  }
  .sly-step-num.tab { background: #a855f7; }
  .sly-plan-actions { display: flex; gap: 8px; }
  #sly-confirm-btn {
    flex: 1; padding: 11px;
    border: none; border-radius: 8px;
    background: linear-gradient(to right, #22c55e, #10b981);
    color: #030712; font-weight: 700; font-size: 13px;
    cursor: pointer; font-family: inherit;
    box-shadow: 0 4px 12px rgba(34,197,94,0.2);
  }
  #sly-cancel-btn {
    padding: 11px 16px;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px; background: none;
    color: #f3f4f6; font-size: 13px; font-weight: 600;
    cursor: pointer; font-family: inherit;
  }

  /* Result block */
  #sly-result-block {
    display: none;
    background: rgba(13,148,136,0.08);
    border: 1px solid rgba(13,148,136,0.25) !important;
    border-radius: 12px;
    padding: 14px;
    margin-bottom: 12px;
    animation: sly-fadein 0.5s ease;
  }
  #sly-result-block .sly-label { color: #5eead4; }
  #sly-result-pre {
    white-space: pre-wrap;
    word-break: break-word;
    font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
    font-size: 11px;
    max-height: 155px;
    overflow-y: auto;
    color: #e2e8f0;
    background: rgba(0,0,0,0.25);
    padding: 10px;
    border-radius: 7px;
    border: 1px solid rgba(13,148,136,0.15);
    line-height: 1.6;
    margin-bottom: 10px;
  }
  .sly-result-actions { display: flex; gap: 7px; }
  .sly-result-btn {
    flex: 1; padding: 8px 4px;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 6px;
    color: #d1d5db;
    font-size: 11px; font-weight: 700;
    cursor: pointer; font-family: inherit;
    transition: background 0.15s;
  }
  .sly-result-btn:hover { background: rgba(255,255,255,0.06); }

  #sly-status-panel {
    border-top: 1px solid rgba(255,255,255,0.07);
    padding-top: 10px; margin-top: 4px;
    font-size: 12px; color: #9ca3af;
    display: flex; flex-direction: column; gap: 3px;
  }
  #sly-status-log { font-family: monospace; color: #22d3ee; }

  /* Minimized running badge */
  #sly-running-badge {
    display: none;
    background: rgba(217,119,6,0.12);
    border: 1px solid rgba(217,119,6,0.35);
    border-radius: 24px; padding: 10px 18px;
    align-items: center; gap: 10px;
    font-size: 13px; font-weight: 600; color: #fbbf24;
    pointer-events: auto;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    white-space: nowrap;
    width: fit-content;
    margin: 0 auto;
  }
  .sly-spinner {
    width: 14px; height: 14px;
    border: 2px solid rgba(251,191,36,0.25);
    border-top-color: #fbbf24; border-radius: 50%;
    animation: sly-spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  /* Done badge */
  #sly-done-badge {
    display: none;
    background: rgba(34,197,94,0.12);
    border: 1px solid rgba(34,197,94,0.35);
    border-radius: 24px; padding: 10px 18px;
    align-items: center; gap: 10px;
    font-size: 13px; font-weight: 600; color: #22c55e;
    pointer-events: auto;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    width: fit-content;
    margin: 0 auto;
  }

  /* Running banner inside popup */
  #sly-running-banner {
    display: none;
    background: rgba(217,119,6,0.1);
    border: 1px solid rgba(217,119,6,0.3);
    border-radius: 8px; padding: 9px 12px;
    align-items: center; gap: 8px;
    font-size: 12px; font-weight: 600; color: #fbbf24;
    margin-bottom: 10px;
  }
`;

const OVERLAY_HTML = `
<style>${OVERLAY_CSS}</style>
<div id="sly-root">
  <!-- Full popup -->
  <div id="sly-popup">
    <div class="sly-header">
      <div class="sly-logo-row">
        <div class="sly-icon">S</div>
        <span class="sly-title">STANLEY</span>
      </div>
      <div class="sly-badge"><div class="sly-dot"></div>Connected</div>
    </div>

    <!-- Running banner (inside popup, before plan disappears) -->
    <div id="sly-running-banner">
      <div class="sly-spinner"></div>
      <span id="sly-banner-text">Stanley is working...</span>
    </div>

    <!-- Prompt card -->
    <div id="sly-prompt-card" class="sly-card">
      <span class="sly-label">What should Stanley do?</span>
      <textarea id="sly-textarea" placeholder="Describe the task in plain English..."></textarea>
    </div>

    <!-- Mode toggle -->
    <div class="sly-mode-row">
      <button class="sly-mode-btn" id="sly-stealth-btn">🥷 Stealth</button>
      <button class="sly-mode-btn active" id="sly-active-btn">👁 Active</button>
    </div>

    <!-- Run button -->
    <button id="sly-run-btn">
      Run Workflow
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
    </button>

    <!-- Plan panel -->
    <div id="sly-plan-panel" class="sly-card">
      <span class="sly-label">Plan Preview</span>
      <div id="sly-steps" class="sly-steps"></div>
      <div class="sly-plan-actions">
        <button id="sly-confirm-btn">Confirm &amp; Run</button>
        <button id="sly-cancel-btn">Cancel</button>
      </div>
    </div>

    <!-- Result block (shown after workflow completes) -->
    <div id="sly-result-block">
      <span class="sly-label">✓ Results</span>
      <pre id="sly-result-pre"></pre>
      <div class="sly-result-actions">
        <button class="sly-result-btn">📋 Copy</button>
        <button class="sly-result-btn">⬇ Export</button>
        <button class="sly-result-btn">💾 Save</button>
      </div>
    </div>

    <!-- Activity feed -->
    <div class="sly-card" style="margin-bottom:0;">
      <span class="sly-label">Activity</span>
      <div id="sly-status-panel">
        <div id="sly-status-desc">Ready.</div>
        <div id="sly-status-log">Idle</div>
      </div>
    </div>
  </div>

  <!-- Minimized running badge (shown instead of popup during automation) -->
  <div id="sly-running-badge">
    <div class="sly-spinner"></div>
    <span id="sly-badge-text">Stanley is working...</span>
  </div>

  <!-- Done badge -->
  <div id="sly-done-badge">
    ✅ <span id="sly-done-text">Done</span>
  </div>
</div>
`;

// Inject the overlay into the current page (full popup state)
export async function injectOverlay(page: Page): Promise<void> {
  await page.evaluate((html) => {
    if (document.getElementById('sly-root')) return;
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
  }, OVERLAY_HTML);
  await page.waitForTimeout(600);
}

// Inject the overlay directly in minimized/running-badge state.
// Used after page.goto() destroys the original overlay injection.
export async function injectOverlayRunning(page: Page, text = 'Stanley is working...'): Promise<void> {
  await page.evaluate(({ html, badgeText }: { html: string; badgeText: string }) => {
    if (document.getElementById('sly-root')) return;
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const popup = document.getElementById('sly-popup');
    const badge = document.getElementById('sly-running-badge');
    const bt = document.getElementById('sly-badge-text');
    if (popup) popup.style.display = 'none';
    if (badge) badge.style.display = 'flex';
    if (bt) bt.textContent = badgeText;
  }, { html: OVERLAY_HTML, badgeText: text });
  await page.waitForTimeout(400);
}

// Type text into the overlay textarea — human-like speed with occasional typos
export async function overlayHumanType(page: Page, text: string): Promise<void> {
  await page.evaluate(() => {
    const ta = document.getElementById('sly-textarea') as HTMLTextAreaElement | null;
    if (ta) { ta.focus(); ta.value = ''; }
  });
  await page.waitForTimeout(500);

  // Adjacent-key map for realistic typos
  const adj: Record<string, string> = {
    a:'s',b:'v',c:'x',d:'f',e:'r',f:'g',g:'h',h:'j',i:'o',j:'k',
    k:'l',l:'k',m:'n',n:'m',o:'p',p:'o',q:'w',r:'t',s:'d',t:'y',
    u:'i',v:'b',w:'e',x:'z',y:'u',z:'x'
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    // Thinking pause at word boundaries (~7% chance)
    if (ch === ' ' && Math.random() < 0.07) {
      await page.waitForTimeout(200 + Math.random() * 380);
    }

    // Occasional typo on letters (~5% chance)
    if (ch.match(/[a-z]/i) && Math.random() < 0.05) {
      const wrong = adj[ch.toLowerCase()] ?? ch;
      await page.evaluate((c: string) => {
        const ta = document.getElementById('sly-textarea') as HTMLTextAreaElement | null;
        if (ta) { ta.value += c; ta.dispatchEvent(new Event('input')); }
      }, wrong);
      await page.waitForTimeout(85 + Math.random() * 65);
      // Backspace correction
      await page.evaluate(() => {
        const ta = document.getElementById('sly-textarea') as HTMLTextAreaElement | null;
        if (ta) { ta.value = ta.value.slice(0, -1); ta.dispatchEvent(new Event('input')); }
      });
      await page.waitForTimeout(110 + Math.random() * 90);
    }

    // Type the correct character
    await page.evaluate((c: string) => {
      const ta = document.getElementById('sly-textarea') as HTMLTextAreaElement | null;
      if (ta) { ta.value += c; ta.dispatchEvent(new Event('input')); }
    }, ch);

    await page.waitForTimeout(48 + Math.random() * 58);
  }
}

// Keep the original overlayType for backward compat (used in fast/non-demo contexts)
export async function overlayType(page: Page, text: string, charDelayMs = 30): Promise<void> {
  await page.evaluate(() => {
    const ta = document.getElementById('sly-textarea') as HTMLTextAreaElement | null;
    if (ta) { ta.focus(); ta.value = ''; }
  });
  await page.waitForTimeout(300);
  for (const ch of text) {
    await page.evaluate((c) => {
      const ta = document.getElementById('sly-textarea') as HTMLTextAreaElement | null;
      if (ta) {
        ta.value += c;
        ta.dispatchEvent(new Event('input'));
      }
    }, ch);
    await page.waitForTimeout(charDelayMs);
  }
}

// Animate the Run button click and show compiling state
export async function overlayClickRun(page: Page): Promise<void> {
  await page.evaluate(() => {
    const btn = document.getElementById('sly-run-btn') as HTMLElement | null;
    if (btn) {
      btn.style.transform = 'scale(0.96)';
      btn.style.opacity = '0.85';
      setTimeout(() => { btn.style.transform = ''; btn.style.opacity = ''; }, 200);
    }
    const desc = document.getElementById('sly-status-desc');
    const log = document.getElementById('sly-status-log');
    if (desc) desc.textContent = 'Compiling workflow...';
    if (log) log.textContent = 'Asking AI to structure steps';
  });
  await page.waitForTimeout(250);
}

// Show plan steps one by one in the overlay
export async function overlayShowPlan(page: Page, steps: OverlayStep[]): Promise<void> {
  await page.evaluate(() => {
    const planPanel = document.getElementById('sly-plan-panel');
    const stepsDiv = document.getElementById('sly-steps');
    if (planPanel) planPanel.style.display = 'block';
    if (stepsDiv) stepsDiv.innerHTML = '';
    const desc = document.getElementById('sly-status-desc');
    const log = document.getElementById('sly-status-log');
    if (desc) desc.textContent = 'Plan ready — review before running';
    if (log) log.textContent = 'Awaiting confirmation';
  });

  const TAB_ACTIONS = ['open_tab', 'switch_tab', 'close_tab'];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    let label = '';
    if (step.action === 'navigate') label = `Navigate to ${step.url}`;
    else if (step.action === 'click') label = `Click "${step.description || step.url}"`;
    else if (step.action === 'type') label = `Type "${step.value}" into ${step.description || 'field'}`;
    else if (step.action === 'scrape') label = `Collect ${step.description || 'page content'}`;
    else if (step.action === 'wait') label = `Wait for page to settle`;
    else if (step.action === 'open_tab') label = `📑 Open new tab${step.url ? ': ' + step.url : ''}`;
    else if (step.action === 'switch_tab') label = `📑 Switch to tab ${step.index ?? ''}`;
    else if (step.action === 'scroll') label = `Scroll through results`;
    else label = step.description || step.action;

    const isTab = TAB_ACTIONS.includes(step.action);
    await page.evaluate(({ idx, text, tab }: { idx: number; text: string; tab: boolean }) => {
      const stepsDiv = document.getElementById('sly-steps');
      if (!stepsDiv) return;
      const row = document.createElement('div');
      row.className = 'sly-step';
      row.innerHTML = `
        <div class="sly-step-num${tab ? ' tab' : ''}">${idx + 1}</div>
        <div style="flex:1">${text}</div>
      `;
      stepsDiv.appendChild(row);
    }, { idx: i, text: label, tab: isTab });
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(400);
}

// Animate the Confirm & Run button click
export async function overlayClickConfirm(page: Page): Promise<void> {
  await page.evaluate(() => {
    const btn = document.getElementById('sly-confirm-btn') as HTMLElement | null;
    if (btn) { btn.style.transform = 'scale(0.96)'; btn.style.opacity = '0.8'; }
    setTimeout(() => {
      const b = document.getElementById('sly-confirm-btn') as HTMLElement | null;
      if (b) { b.style.transform = ''; b.style.opacity = ''; }
    }, 200);
  });
  await page.waitForTimeout(400);
}

// Minimize overlay to running badge (hides popup, shows badge)
export async function overlayMinimize(page: Page, text = 'Stanley is working...'): Promise<void> {
  await page.evaluate((t) => {
    const popup = document.getElementById('sly-popup');
    const badge = document.getElementById('sly-running-badge');
    const badgeText = document.getElementById('sly-badge-text');
    if (popup) popup.style.display = 'none';
    if (badge) badge.style.display = 'flex';
    if (badgeText) badgeText.textContent = t;
  }, text);
}

// Update the running badge text
export async function overlaySetStatus(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => {
    const el = document.getElementById('sly-badge-text');
    if (el) el.textContent = t;
  }, text);
}

// Show done badge (replaces running badge)
export async function overlayDone(page: Page, text = 'Workflow complete'): Promise<void> {
  await page.evaluate((t) => {
    const runBadge = document.getElementById('sly-running-badge');
    const doneBadge = document.getElementById('sly-done-badge');
    const doneText = document.getElementById('sly-done-text');
    if (runBadge) runBadge.style.display = 'none';
    if (doneBadge) doneBadge.style.display = 'flex';
    if (doneText) doneText.textContent = t;
  }, text);
}

// Expand from done badge back to popup showing a results panel.
// Call this after overlayDone() to show what Stanley collected.
export async function overlayShowResult(page: Page, result: string): Promise<void> {
  await page.evaluate((text: string) => {
    const doneBadge = document.getElementById('sly-done-badge');
    const popup = document.getElementById('sly-popup');
    const planPanel = document.getElementById('sly-plan-panel');
    const promptCard = document.getElementById('sly-prompt-card');
    const modeRow = document.querySelector('.sly-mode-row') as HTMLElement | null;
    const runBtn = document.getElementById('sly-run-btn');
    const resultBlock = document.getElementById('sly-result-block');
    const resultPre = document.getElementById('sly-result-pre');

    if (doneBadge) doneBadge.style.display = 'none';
    if (popup) popup.style.display = 'block';

    // Hide input UI — this view is results-only
    if (planPanel) planPanel.style.display = 'none';
    if (promptCard) promptCard.style.display = 'none';
    if (modeRow) modeRow.style.display = 'none';
    if (runBtn) runBtn.style.display = 'none';

    if (resultPre) resultPre.textContent = text;
    if (resultBlock) resultBlock.style.display = 'block';

    const statusDesc = document.getElementById('sly-status-desc');
    const statusLog = document.getElementById('sly-status-log');
    if (statusDesc) statusDesc.textContent = 'Workflow complete';
    if (statusLog) statusLog.textContent = 'All steps finished successfully';
  }, result);
  await page.waitForTimeout(300);
}
