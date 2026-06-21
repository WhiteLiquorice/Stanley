/**
 * Demo 2: Price Tracker
 * "I keep checking if the price dropped before I buy"
 * Shows: Stanley navigating to a product page, finding and logging the price
 */
import { launchDemo, localPage } from './utils';
import {
  injectOverlay, overlayHumanType, overlayClickRun,
  overlayShowPlan, overlayClickConfirm, overlayMinimize,
  injectOverlayRunning, overlaySetStatus, overlayDone, overlayShowResult
} from './overlay';

const PROMPT = "Check the price of Sony WH-1000XM5 headphones and save it";

const PLAN = [
  { action: 'navigate', url: 'amazon.com/Sony-WH-1000XM5' },
  { action: 'wait', description: 'product page to load' },
  { action: 'scrape', description: 'current price and original price' },
  { action: 'scrape', description: 'savings amount and discount percentage' }
];

const RESULT = `Sony WH-1000XM5 — Price Check

  Current price:   $279.99
  List price:      $349.99
  You save:        $70.00 (20% off)

  Rating:          4.4 / 5  (2,847 reviews)
  Availability:    In Stock
  Seller:          Amazon.com

  Price is DOWN $70 from list.
  Saved to your watchlist.`;

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

  await overlayMinimize(page, 'Navigating to Amazon...');
  await page.waitForTimeout(500);

  await page.goto(localPage('amazon-product.html'));
  await page.waitForTimeout(700);

  await injectOverlayRunning(page, 'Loading product page...');

  // Scroll down to the product details
  await overlaySetStatus(page, 'Loading product page...');
  await page.evaluate(() => window.scrollTo({ top: 180, behavior: 'smooth' }));
  await page.waitForTimeout(1000);

  // Highlight the title
  await overlaySetStatus(page, 'Reading product name...');
  await page.evaluate(() => {
    const el = document.querySelector('.product-title') as HTMLElement | null;
    if (!el) return;
    el.style.transition = 'background 0.4s';
    el.style.background = 'rgba(34,197,94,0.1)';
  });
  await page.waitForTimeout(1000);

  // Highlight the price block
  await overlaySetStatus(page, 'Extracting current price...');
  await page.evaluate(() => {
    const el = document.getElementById('price-block') as HTMLElement | null;
    if (!el) return;
    el.style.transition = 'all 0.4s';
    el.style.outline = '2px solid rgba(34,197,94,0.85)';
    el.style.backgroundColor = 'rgba(34,197,94,0.1)';
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await page.waitForTimeout(1000);

  // Highlight the price itself
  await page.evaluate(() => {
    const el = document.getElementById('price-main') as HTMLElement | null;
    if (el) { el.style.transition = 'color 0.4s'; el.style.color = '#16a34a'; }
  });
  await overlaySetStatus(page, 'Price found: $279.99 ✓');
  await page.waitForTimeout(1100);

  // Highlight savings badge
  await page.evaluate(() => {
    const el = document.querySelector('.savings-badge') as HTMLElement | null;
    if (!el) return;
    el.style.transition = 'all 0.4s';
    el.style.outline = '2px solid rgba(34,197,94,0.7)';
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  await overlaySetStatus(page, 'Savings: $70.00 (20% off) ✓');
  await page.waitForTimeout(1300);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(900);

  await overlayDone(page, 'Price saved — $279.99');
  await page.waitForTimeout(2000);

  await overlayShowResult(page, RESULT);
  await page.waitForTimeout(4500);

  await context.close();
}

run().catch(console.error);
