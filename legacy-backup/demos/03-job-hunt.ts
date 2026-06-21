/**
 * Demo 3: Job Board Sweep
 * "I check job boards every morning — it takes forever"
 * Shows: Stanley scrolling through results and marking each one
 */
import { launchDemo, localPage } from './utils';
import {
  injectOverlay, overlayHumanType, overlayClickRun,
  overlayShowPlan, overlayClickConfirm, overlayMinimize,
  injectOverlayRunning, overlaySetStatus, overlayDone, overlayShowResult
} from './overlay';

const PROMPT = "Find remote UX Designer jobs and save the top results with salary";

const PLAN = [
  { action: 'navigate', url: 'indeed.com/jobs' },
  { action: 'type', description: 'search field', value: 'UX Designer' },
  { action: 'type', description: 'location field', value: 'Remote' },
  { action: 'click', description: 'Find jobs button' },
  { action: 'scrape', description: 'job titles, companies, and salaries' },
  { action: 'scroll', description: 'through all results on first page' }
];

const RESULT = `8 Remote UX Designer jobs saved

1. Shopify — Senior UX Designer
   $130K–$160K/yr · Remote · Full-time

2. Figma — Product Designer, Growth
   $140K–$170K/yr · Remote · Full-time

3. Stripe — UX Designer, Developer Exp.
   $135K–$165K/yr · Remote · Full-time

4. Notion — Staff UX Designer
   $150K–$180K/yr · Remote · Full-time

5. Atlassian — UX Designer II
   $115K–$145K/yr · Remote · Full-time

6. Dropbox — Senior Product Designer
   $125K–$155K/yr · Remote · Full-time

7. HubSpot — UX Designer, CRM
   $110K–$140K/yr · Remote · Full-time

8. Canva — Product Designer
   $120K–$150K/yr · Remote · Full-time`;

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

  await overlayMinimize(page, 'Navigating to Indeed...');
  await page.waitForTimeout(500);

  await page.goto(localPage('indeed-jobs.html'));
  await page.waitForTimeout(700);

  await injectOverlayRunning(page, 'Searching jobs...');

  // Highlight the search bar area
  await overlaySetStatus(page, 'Filling in search terms...');
  await page.evaluate(() => {
    const bar = document.querySelector('.search-bar') as HTMLElement | null;
    if (bar) { bar.style.transition = 'all 0.4s'; bar.style.outline = '2px solid rgba(34,197,94,0.6)'; bar.style.borderRadius = '8px'; }
  });
  await page.waitForTimeout(1300);

  await page.evaluate(() => {
    const bar = document.querySelector('.search-bar') as HTMLElement | null;
    if (bar) bar.style.outline = '';
  });

  await overlaySetStatus(page, 'Reading results...');
  await page.waitForTimeout(700);

  // Collect each job card
  const totalJobs = 8;
  for (let i = 0; i < totalJobs; i++) {
    await overlaySetStatus(page, `Reading job ${i + 1} of ${totalJobs}...`);
    await page.evaluate((idx) => {
      const card = document.getElementById(`job-${idx}`) as HTMLElement | null;
      if (!card) return;
      card.style.transition = 'all 0.35s';
      card.style.borderColor = 'rgba(34,197,94,0.65)';
      card.style.backgroundColor = 'rgba(34,197,94,0.05)';
      card.style.boxShadow = '0 0 0 1px rgba(34,197,94,0.3)';
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, i);
    await page.waitForTimeout(520);
  }

  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(900);

  await overlayDone(page, '8 jobs saved');
  await page.waitForTimeout(2000);

  await overlayShowResult(page, RESULT);
  await page.waitForTimeout(4500);

  await context.close();
}

run().catch(console.error);
