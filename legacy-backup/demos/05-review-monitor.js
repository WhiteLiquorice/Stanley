"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Demo 5: Review Monitor
 * "I check our Google reviews every morning"
 * Shows: Stanley reading recent reviews off a Maps-style page
 */
const utils_1 = require("./utils");
const overlay_1 = require("./overlay");
const PROMPT = "Get the 5 most recent reviews for Blue Bottle Coffee Mission and save them";
const PLAN = [
    { action: 'navigate', url: 'google.com/maps' },
    { action: 'type', description: 'search', value: 'Blue Bottle Coffee Mission' },
    { action: 'click', description: 'business listing' },
    { action: 'click', description: 'Reviews tab' },
    { action: 'scrape', description: 'reviewer names, star ratings, and review text' }
];
const RESULT = `Blue Bottle Coffee — 5 Latest Reviews

★★★★★  Sarah M.
"Best cold brew in the city. The staff remembered my order
after just two visits. Will keep coming back."

★★★★☆  James T.
"Great atmosphere, a bit pricey for a regular coffee run.
Pastries are worth it though."

★★★★★  Priya K.
"Consistently excellent espresso. One of the few places
that pulls a shot correctly every time."

★★★☆☆  Marcus W.
"Good coffee but slow service during rush hour.
Took 15 min for a drip coffee."

★★★★★  Anna L.
"My go-to spot every morning. Friendly staff, clean space,
and the single-origin pour-overs are outstanding."

Overall: 4.5★ across 847 reviews.`;
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
    await (0, overlay_1.overlayMinimize)(page, 'Opening Google Maps...');
    await page.waitForTimeout(500);
    await page.goto((0, utils_1.localPage)('google-reviews.html'));
    await page.waitForTimeout(700);
    await (0, overlay_1.injectOverlayRunning)(page, 'Finding Blue Bottle Coffee...');
    // Highlight the knowledge panel briefly
    await (0, overlay_1.overlaySetStatus)(page, 'Found: Blue Bottle Coffee Mission');
    await page.evaluate(() => {
        const panel = document.querySelector('.kp-card');
        if (panel) {
            panel.style.transition = 'all 0.4s';
            panel.style.outline = '2px solid rgba(34,197,94,0.5)';
        }
    });
    await page.waitForTimeout(1100);
    await page.evaluate(() => {
        const panel = document.querySelector('.kp-card');
        if (panel)
            panel.style.outline = '';
    });
    // Highlight the rating summary
    await (0, overlay_1.overlaySetStatus)(page, 'Reading overall rating: 4.5★');
    await page.evaluate(() => {
        const summary = document.querySelector('.rating-summary');
        if (summary) {
            summary.style.transition = 'all 0.4s';
            summary.style.outline = '2px solid rgba(34,197,94,0.6)';
            summary.style.backgroundColor = 'rgba(34,197,94,0.06)';
        }
    });
    await page.waitForTimeout(1100);
    await page.evaluate(() => {
        const summary = document.querySelector('.rating-summary');
        if (summary) {
            summary.style.outline = '';
            summary.style.backgroundColor = '';
        }
    });
    // Collect each review
    const reviewerNames = ['Sarah M.', 'James T.', 'Priya K.', 'Marcus W.', 'Anna L.'];
    const cards = await page.$$('.review-card');
    for (let i = 0; i < Math.min(cards.length, 5); i++) {
        await (0, overlay_1.overlaySetStatus)(page, `Reading review from ${reviewerNames[i]}...`);
        await page.evaluate((idx) => {
            const els = document.querySelectorAll('.review-card');
            const el = els[idx];
            if (!el)
                return;
            el.style.transition = 'all 0.4s';
            el.style.background = 'rgba(34,197,94,0.06)';
            el.style.borderRadius = '8px';
            el.style.padding = '12px';
            el.style.margin = '0 -12px 4px';
            el.style.outline = '1px solid rgba(34,197,94,0.4)';
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, i);
        await page.waitForTimeout(850);
    }
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(900);
    await (0, overlay_1.overlayDone)(page, '5 reviews saved');
    await page.waitForTimeout(2000);
    await (0, overlay_1.overlayShowResult)(page, RESULT);
    await page.waitForTimeout(4500);
    await context.close();
}
run().catch(console.error);
//# sourceMappingURL=05-review-monitor.js.map