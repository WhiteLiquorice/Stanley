/**
 * Demo 4: Competitor Pulse
 * "I manually check competitor pricing every week"
 * Shows: Stanley visiting 3 pricing pages and extracting prices one by one
 */
import { launchDemo, localPage } from './utils';
import {
  injectOverlay, overlayHumanType, overlayClickRun,
  overlayShowPlan, overlayClickConfirm, overlayMinimize,
  injectOverlayRunning, overlaySetStatus, overlayDone, overlayShowResult
} from './overlay';

const PROMPT = "Compare team plan pricing for Monday, Asana, and Notion";

const PLAN = [
  { action: 'navigate', url: 'monday.com/pricing' },
  { action: 'scrape', description: 'team plan price' },
  { action: 'open_tab', url: 'asana.com/pricing' },
  { action: 'scrape', description: 'starter plan price' },
  { action: 'open_tab', url: 'notion.so/pricing' },
  { action: 'scrape', description: 'plus plan price' }
];

const RESULT = `Team Plan Pricing Comparison — June 19, 2026

  monday.com    $9.00  / seat / month
  Asana        $10.99  / seat / month
  Notion       $15.00  / seat / month

monday.com is cheapest by $1.99/seat vs Asana.
At 25 seats: monday saves $49.75/month ($597/yr).

Data saved. Tap Export to copy as a table.`;

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

  await overlayMinimize(page, 'Navigating to monday.com...');
  await page.waitForTimeout(500);

  await page.goto(localPage('saas-pricing.html'));
  await page.waitForTimeout(700);

  await injectOverlayRunning(page, 'Checking monday.com...');

  // monday.com
  await page.evaluate(() => {
    const card = document.getElementById('card-monday') as HTMLElement | null;
    if (card) { card.style.transition = 'all 0.4s'; card.style.borderColor = 'rgba(34,197,94,0.7)'; card.style.boxShadow = '0 0 40px rgba(34,197,94,0.12)'; }
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const price = document.getElementById('monday-price') as HTMLElement | null;
    if (price) { price.style.transition = 'color 0.4s'; price.style.color = '#22c55e'; }
  });
  await overlaySetStatus(page, 'monday.com: $9/seat ✓');
  await page.waitForTimeout(1500);

  // Asana
  await overlaySetStatus(page, 'Checking Asana...');
  await page.evaluate(() => {
    const card = document.getElementById('card-asana') as HTMLElement | null;
    if (card) { card.style.transition = 'all 0.4s'; card.style.borderColor = 'rgba(34,197,94,0.7)'; card.style.boxShadow = '0 0 40px rgba(34,197,94,0.12)'; }
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const price = document.getElementById('asana-price') as HTMLElement | null;
    if (price) { price.style.transition = 'color 0.4s'; price.style.color = '#22c55e'; }
  });
  await overlaySetStatus(page, 'Asana: $10.99/seat ✓');
  await page.waitForTimeout(1500);

  // Notion
  await overlaySetStatus(page, 'Checking Notion...');
  await page.evaluate(() => {
    const card = document.getElementById('card-notion') as HTMLElement | null;
    if (card) { card.style.transition = 'all 0.4s'; card.style.borderColor = 'rgba(34,197,94,0.7)'; card.style.boxShadow = '0 0 40px rgba(34,197,94,0.12)'; }
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const price = document.getElementById('notion-price') as HTMLElement | null;
    if (price) { price.style.transition = 'color 0.4s'; price.style.color = '#22c55e'; }
  });
  await overlaySetStatus(page, 'Notion: $15/seat ✓');
  await page.waitForTimeout(1500);

  await overlayDone(page, 'Comparison ready');
  await page.waitForTimeout(2000);

  await overlayShowResult(page, RESULT);
  await page.waitForTimeout(4500);

  await context.close();
}

run().catch(console.error);
