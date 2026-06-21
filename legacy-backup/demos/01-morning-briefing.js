"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Demo 1: Morning Briefing
 * "I check too many sites before I can start my day"
 * Shows: Stanley collecting top HackerNews stories while the page is visible
 */
const utils_1 = require("./utils");
const overlay_1 = require("./overlay");
const PROMPT = "Open Hacker News and collect today's top 10 stories";
const PLAN = [
    { action: 'navigate', url: 'news.ycombinator.com' },
    { action: 'wait', description: 'page to fully load' },
    { action: 'scrape', description: 'all story headlines and scores' },
    { action: 'scrape', description: 'comment counts for each story' }
];
const RESULT = `Top 10 stories — Hacker News, June 19 2026

1. OpenAI announces o3-mini reasoning update
   score: 847 points · 312 comments

2. Rust officially added to Linux kernel (stable)
   score: 702 points · 198 comments

3. Show HN: I built an offline-first AI assistant
   score: 634 points · 241 comments

4. A primer on LLM fine-tuning for production
   score: 511 points · 129 comments

5. Tesla Dojo 2 architecture details leaked
   score: 488 points · 203 comments

6. EU passes landmark AI liability regulation
   score: 420 points · 317 comments

7. Ask HN: How do you deal with AI-generated noise?
   score: 398 points · 442 comments

8. The case against microservices (2026 edition)
   score: 376 points · 158 comments

9. YC W26 batch demo day recap
   score: 341 points · 87 comments

10. Cloudflare announces Workers AI v2
    score: 298 points · 94 comments`;
async function run() {
    const { context } = await (0, utils_1.launchDemo)();
    const page = await context.newPage();
    // Start on the new tab page — just like a real user would
    await page.goto((0, utils_1.localPage)('newtab.html'));
    await page.waitForTimeout(2000);
    // Stanley popup appears in top-right
    await (0, overlay_1.injectOverlay)(page);
    await page.waitForTimeout(900);
    // User types their request — human speed with occasional mistakes
    await (0, overlay_1.overlayHumanType)(page, PROMPT);
    await page.waitForTimeout(1300);
    await (0, overlay_1.overlayClickRun)(page);
    await page.waitForTimeout(1600);
    await (0, overlay_1.overlayShowPlan)(page, PLAN);
    await page.waitForTimeout(3200);
    await (0, overlay_1.overlayClickConfirm)(page);
    await page.waitForTimeout(500);
    // Overlay minimizes to badge, then browser navigates to the target page
    await (0, overlay_1.overlayMinimize)(page, 'Navigating to Hacker News...');
    await page.waitForTimeout(500);
    await page.goto((0, utils_1.localPage)('hackernews.html'));
    await page.waitForTimeout(700);
    // Re-inject overlay in running badge state (navigation cleared the DOM)
    await (0, overlay_1.injectOverlayRunning)(page, 'Collecting top stories...');
    // Highlight each story as it's collected
    for (let i = 0; i < 10; i++) {
        await (0, overlay_1.overlaySetStatus)(page, `Collecting story ${i + 1} of 10...`);
        await page.evaluate((idx) => {
            const rows = document.querySelectorAll('.athing');
            const el = rows[idx];
            if (!el)
                return;
            el.style.transition = 'background-color 0.3s';
            el.style.backgroundColor = 'rgba(255, 102, 0, 0.14)';
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, i);
        await page.waitForTimeout(480);
    }
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(900);
    await (0, overlay_1.overlayDone)(page, '10 stories saved');
    await page.waitForTimeout(2000);
    // Expand overlay to show results
    await (0, overlay_1.overlayShowResult)(page, RESULT);
    await page.waitForTimeout(4500);
    await context.close();
}
run().catch(console.error);
//# sourceMappingURL=01-morning-briefing.js.map