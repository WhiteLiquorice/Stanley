import { chromium, BrowserContext } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

export const PAGES_PATH = path.resolve(__dirname, 'pages').replace(/\\/g, '/');
export const OUTPUT_PATH = path.resolve(__dirname, 'output');

export async function launchDemo(): Promise<{ browser: any; context: BrowserContext }> {
  if (!fs.existsSync(OUTPUT_PATH)) fs.mkdirSync(OUTPUT_PATH, { recursive: true });

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1080, height: 1920 },
    recordVideo: { dir: OUTPUT_PATH, size: { width: 1080, height: 1920 } }
  });

  context.on('close', () => { browser.close().catch(() => {}); });
  return { browser, context };
}

export function localPage(filename: string): string {
  return `file:///${PAGES_PATH}/${filename}`;
}
