import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const OUT = path.join(__dirname, 'output', 'cover.png');

// Read the compiled overlay CSS+HTML directly from the source so we can
// disable animations before rendering — avoids blank screenshots from opacity:0 keyframes
const overlaySource = fs.readFileSync(path.join(__dirname, 'overlay.ts'), 'utf8');

// Pull the CSS block out of the source
const cssMatch = overlaySource.match(/const OVERLAY_CSS = `([\s\S]*?)`;/);
const CSS = cssMatch ? cssMatch[1] : '';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1080, height: 1920 });

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #0f172a; width: 1080px; height: 1920px; }

/* Kill all animations so screenshot captures final state */
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  opacity: 1 !important;
}

${CSS}

/* Override position:fixed so it renders relative to the page */
#sly-root {
  position: absolute !important;
  animation: none !important;
  opacity: 1 !important;
}
</style>
</head>
<body>
<div id="sly-root">
  <div id="sly-popup" style="display:block">
    <div class="sly-header">
      <div class="sly-logo-row">
        <div class="sly-icon">S</div>
        <span class="sly-title">STANLEY</span>
      </div>
      <div class="sly-badge"><div class="sly-dot"></div>Connected</div>
    </div>

    <div id="sly-result-block" style="display:block">
      <span class="sly-label">✓ Results</span>
      <pre id="sly-result-pre">Morning briefing ready
10 top stories saved
Completed in 4 seconds</pre>
      <div class="sly-result-actions">
        <button class="sly-result-btn">📋 Copy</button>
        <button class="sly-result-btn">⬇ Export</button>
        <button class="sly-result-btn">💾 Save</button>
      </div>
    </div>

    <div class="sly-card" style="margin-bottom:0;">
      <span class="sly-label">Activity</span>
      <div id="sly-status-panel">
        <div id="sly-status-desc">Workflow complete</div>
        <div id="sly-status-log">All steps finished successfully</div>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;

  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.locator('#sly-root').screenshot({ path: OUT });
  await browser.close();

  console.log(`Saved → ${OUT}`);
})();
