/**
 * Demo 5: Review Monitor
 * "I check our Google reviews every morning"
 * Shows: Stanley reading recent reviews off a Maps-style page
 */
import { launchDemo, localPage } from './utils';
import {
  injectOverlay, overlayHumanType, overlayClickRun,
  overlayShowPlan, overlayClickConfirm, overlayMinimize,
  injectOverlayRunning, overlaySetStatus, overlayDone, overlayShowResult
} from './overlay';

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
  const { context } = await launchDemo();
  const page = await context.newPage();

  await page.goto(localPage('newtab.html'));
  await page.waitForTimeout(2000);

  await injectOverlay(page);
  await page.waitForTimeout(900);

  await overlayHumanType(page, PROMPT);
  await page.waitForTimeout(1300);

  await overlayClickRun(page);
  await page.waitForTimeout(1600);

  await overlayShowPlan(page, PLAN);
  await page.waitForTimeout(3200);

  await overlayClickConfirm(page);
  await page.waitForTimeout(500);

  await overlayMinimize(page, 'Opening Google Maps...');
  await page.waitForTimeout(500);

  await page.goto(localPage('google-reviews.html'));
  await page.waitForTimeout(700);

  await injectOverlayRunning(page, 'Finding Blue Bottle Coffee...');

  // Highlight the knowledge panel briefly
  await overlaySetStatus(page, 'Found: Blue Bottle Coffee Mission');
  await page.evaluate(() => {
    const panel = document.querySelector('.kp-card') as HTMLElement | null;
    if (panel) { panel.style.transition = 'all 0.4s'; panel.style.outline = '2px solid rgba(34,197,94,0.5)'; }
  });
  await page.waitForTimeout(1100);
  await page.evaluate(() => {
    const panel = document.querySelector('.kp-card') as HTMLElement | null;
    if (panel) panel.style.outline = '';
  });

  // Highlight the rating summary
  await overlaySetStatus(page, 'Reading overall rating: 4.5★');
  await page.evaluate(() => {
    const summary = document.querySelector('.rating-summary') as HTMLElement | null;
    if (summary) {
      summary.style.transition = 'all 0.4s';
      summary.style.outline = '2px solid rgba(34,197,94,0.6)';
      summary.style.backgroundColor = 'rgba(34,197,94,0.06)';
    }
  });
  await page.waitForTimeout(1100);
  await page.evaluate(() => {
    const summary = document.querySelector('.rating-summary') as HTMLElement | null;
    if (summary) { summary.style.outline = ''; summary.style.backgroundColor = ''; }
  });

  // Collect each review
  const reviewerNames = ['Sarah M.', 'James T.', 'Priya K.', 'Marcus W.', 'Anna L.'];
  const cards = await page.$$('.review-card');
  for (let i = 0; i < Math.min(cards.length, 5); i++) {
    await overlaySetStatus(page, `Reading review from ${reviewerNames[i]}...`);
    await page.evaluate((idx) => {
      const els = document.querySelectorAll('.review-card');
      const el = els[idx] as HTMLElement | undefined;
      if (!el) return;
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

  await overlayDone(page, '5 reviews saved');
  await page.waitForTimeout(2000);

  await overlayShowResult(page, RESULT);
  await page.waitForTimeout(4500);

  await context.close();
}

run().catch(console.error);
