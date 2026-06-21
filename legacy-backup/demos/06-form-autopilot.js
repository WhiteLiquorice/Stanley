"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Demo 6: Form Autopilot
 * "I fill out the exact same form every single week"
 * Shows: Stanley filling a professional form field by field in real-time
 */
const utils_1 = require("./utils");
const overlay_1 = require("./overlay");
const PROMPT = "Fill out the weekly vendor timesheet on the Apex supplier portal";
const PLAN = [
    { action: 'navigate', url: 'portal.apexsupply.com/timesheets' },
    { action: 'type', description: 'Vendor Name', value: 'Bridgeway Solutions LLC' },
    { action: 'type', description: 'Vendor ID', value: 'V-2847' },
    { action: 'type', description: 'Project Code', value: 'PROJ-2026-07' },
    { action: 'type', description: 'Week Ending', value: '06/20/2026' },
    { action: 'type', description: 'Work Description' },
    { action: 'click', description: 'Submit Timesheet' }
];
const RESULT = `Timesheet Submitted ✓

  Vendor:        Bridgeway Solutions LLC
  Vendor ID:     V-2847
  Contact:       Jordan Davis
  Email:         jdavis@bridgewaysolutions.com

  Project:       PROJ-2026-07
  Week Ending:   06/20/2026
  Bill Rate:     $125.00/hr

  Description:   Platform integration, QA testing,
                 and sprint planning for Q3 deploy.

  Confirmation:  #TS-2026-84291
  Status:        Received by Apex Supply`;
async function slowType(page, selector, text, delay = 52) {
    await page.focus(selector);
    await page.waitForTimeout(280);
    for (const ch of text) {
        await page.type(selector, ch);
        await page.waitForTimeout(delay + Math.random() * 22);
    }
    await page.waitForTimeout(380);
}
async function markFilled(page, id) {
    await page.evaluate((elId) => {
        const el = document.getElementById(elId);
        if (el)
            el.classList.add('filled');
    }, id);
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
    await (0, overlay_1.overlayMinimize)(page, 'Opening Apex supplier portal...');
    await page.waitForTimeout(500);
    await page.goto((0, utils_1.localPage)('vendor-form.html'));
    await page.waitForTimeout(700);
    await (0, overlay_1.injectOverlayRunning)(page, 'Filling form...');
    await (0, overlay_1.overlaySetStatus)(page, 'Entering vendor name...');
    await slowType(page, '#vendor-name', 'Bridgeway Solutions LLC');
    await markFilled(page, 'vendor-name');
    await (0, overlay_1.overlaySetStatus)(page, 'Entering vendor ID...');
    await slowType(page, '#vendor-id', 'V-2847');
    await markFilled(page, 'vendor-id');
    await (0, overlay_1.overlaySetStatus)(page, 'Entering contact name...');
    await slowType(page, '#contact-name', 'Jordan Davis');
    await markFilled(page, 'contact-name');
    await (0, overlay_1.overlaySetStatus)(page, 'Entering contact email...');
    await slowType(page, '#contact-email', 'jdavis@bridgewaysolutions.com');
    await markFilled(page, 'contact-email');
    await page.evaluate(() => {
        document.getElementById('project-code')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await page.waitForTimeout(700);
    await (0, overlay_1.overlaySetStatus)(page, 'Entering project code...');
    await slowType(page, '#project-code', 'PROJ-2026-07');
    await markFilled(page, 'project-code');
    await (0, overlay_1.overlaySetStatus)(page, 'Entering billing week...');
    await slowType(page, '#week-ending', '06/20/2026');
    await markFilled(page, 'week-ending');
    await (0, overlay_1.overlaySetStatus)(page, 'Entering bill rate...');
    await slowType(page, '#bill-rate', '125.00');
    await markFilled(page, 'bill-rate');
    await page.evaluate(() => {
        document.getElementById('work-desc')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await page.waitForTimeout(700);
    await (0, overlay_1.overlaySetStatus)(page, 'Entering work description...');
    await slowType(page, '#work-desc', 'Platform integration, QA testing, and sprint planning for Q3 deployment.', 40);
    await markFilled(page, 'work-desc');
    await page.waitForTimeout(500);
    await (0, overlay_1.overlaySetStatus)(page, 'Submitting timesheet...');
    await page.evaluate(() => {
        const btn = document.getElementById('submit-btn');
        if (!btn)
            return;
        btn.style.transition = 'all 0.3s';
        btn.style.background = '#22c55e';
        btn.style.color = '#fff';
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await page.waitForTimeout(800);
    await page.click('#submit-btn');
    await page.waitForTimeout(800);
    await (0, overlay_1.overlayDone)(page, 'Timesheet submitted ✓');
    await page.waitForTimeout(2000);
    await (0, overlay_1.overlayShowResult)(page, RESULT);
    await page.waitForTimeout(4500);
    await context.close();
}
run().catch(console.error);
//# sourceMappingURL=06-form-autopilot.js.map