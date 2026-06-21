"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Demo 7: Lead Research
 * "I look up the same info on every prospect before reaching out"
 * Shows: Stanley pulling key facts from a Wikipedia article
 */
const utils_1 = require("./utils");
const overlay_1 = require("./overlay");
const PROMPT = "Look up Stripe on Wikipedia — get founding year, HQ, and leadership";
const PLAN = [
    { action: 'navigate', url: 'en.wikipedia.org/wiki/Stripe,_Inc.' },
    { action: 'scrape', description: 'founding year and location from infobox' },
    { action: 'scrape', description: 'headquarters location' },
    { action: 'scrape', description: 'CEO, President, and key leadership' }
];
const RESULT = `Stripe, Inc. — Company Profile

  Founded:    2010
  HQ:         South San Francisco, CA
  Employees:  8,000+ (2024)

  CEO:        Patrick Collison (Co-founder)
  President:  John Collison (Co-founder)
  CFO:        Dhivya Suryadevara

  About: Founded in 2010 by brothers Patrick and John
  Collison. Stripe processes payments for millions of
  businesses worldwide. Now valued at $65B+.

Saved to CRM. Ready to research next prospect.`;
async function highlightRow(page, rowId) {
    await page.evaluate((id) => {
        const row = document.getElementById(id);
        if (!row)
            return;
        row.querySelectorAll('th, td').forEach((el) => {
            el.style.transition = 'background 0.4s, outline 0.4s';
            el.style.background = 'rgba(34,197,94,0.18)';
            el.style.outline = '2px solid rgba(34,197,94,0.6)';
        });
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, rowId);
}
async function run() {
    const { context } = await (0, utils_1.launchDemo)();
    const page = await context.newPage();
    await page.goto((0, utils_1.localPage)('newtab.html'));
    await page.waitForTimeout(2000);
    await (0, overlay_1.injectOverlay)(page);
    await page.waitForTimeout(900);
    await (0, overlay_1.overlayHumanType)(page, PROMPT);
    await page.waitForTimeout(1300);
    await (0, overlay_1.overlayClickRun)(page);
    await page.waitForTimeout(1600);
    await (0, overlay_1.overlayShowPlan)(page, PLAN);
    await page.waitForTimeout(3200);
    await (0, overlay_1.overlayClickConfirm)(page);
    await page.waitForTimeout(500);
    await (0, overlay_1.overlayMinimize)(page, 'Opening Wikipedia...');
    await page.waitForTimeout(500);
    await page.goto((0, utils_1.localPage)('wikipedia-stripe.html'));
    await page.waitForTimeout(700);
    await (0, overlay_1.injectOverlayRunning)(page, 'Opening Wikipedia...');
    await (0, overlay_1.overlaySetStatus)(page, 'Found: Stripe, Inc. article');
    await page.evaluate(() => {
        document.getElementById('infobox')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await page.waitForTimeout(1100);
    await (0, overlay_1.overlaySetStatus)(page, 'Reading: Founded — 2010');
    await highlightRow(page, 'row-founded');
    await page.waitForTimeout(1400);
    await (0, overlay_1.overlaySetStatus)(page, 'Reading: HQ — South San Francisco, CA');
    await highlightRow(page, 'row-hq');
    await page.waitForTimeout(1400);
    await (0, overlay_1.overlaySetStatus)(page, 'Reading: CEO — Patrick Collison');
    await highlightRow(page, 'row-people');
    await page.waitForTimeout(1400);
    // Scroll to history section to show depth
    await (0, overlay_1.overlaySetStatus)(page, 'Reading history section...');
    await page.evaluate(() => {
        document.getElementById('history')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    await page.waitForTimeout(1300);
    // Scroll back to infobox for final shot
    await page.evaluate(() => {
        document.getElementById('infobox')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await page.waitForTimeout(900);
    await (0, overlay_1.overlayDone)(page, 'Lead profile saved');
    await page.waitForTimeout(2000);
    await (0, overlay_1.overlayShowResult)(page, RESULT);
    await page.waitForTimeout(4500);
    await context.close();
}
run().catch(console.error);
//# sourceMappingURL=07-lead-research.js.map