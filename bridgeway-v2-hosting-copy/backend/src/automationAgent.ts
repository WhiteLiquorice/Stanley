import { chromium, Browser, BrowserContext, Page, ConsoleMessage } from 'playwright';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

export interface ConsoleLogEntry {
  type: string;
  text: string;
  timestamp: string;
}

export interface AgentAction {
  thought: string;
  actionType: 'execute_js' | 'navigate' | 'wait' | 'finish';
  payload: string;
}

/**
 * Stanley Visual Browser Automation Agent
 * 
 * Runs a headful browser context allowing individual prosumers to monitor actions.
 * Listens to console logs and executes JS code within the page invisibly (simulating 
 * the browser's inspect/devtools console). Feeds screenshots and console state to 
 * Gemini to complete explained natural language workflows.
 */
export class StanleyAutomationAgent {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private consoleLogs: ConsoleLogEntry[] = [];
  private geminiClient: GoogleGenerativeAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.geminiClient = new GoogleGenerativeAI(apiKey);
    } else {
      console.warn("[Stanley Agent] GEMINI_API_KEY environment variable is not defined.");
    }
  }

  /**
   * Initializes the Playwright browser.
   */
  public async initialize(startUrl?: string): Promise<Page> {
    console.log("[Stanley Agent] Launching headful Chromium browser...");
    this.browser = await chromium.launch({
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox'
      ]
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 }
    });

    this.page = await this.context.newPage();

    // Mask webdriver
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // Intercept console logs invisibly
    this.page.on('console', (msg: ConsoleMessage) => {
      const entry: ConsoleLogEntry = {
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString()
      };
      this.consoleLogs.push(entry);
    });

    // Intercept unhandled page exceptions
    this.page.on('pageerror', (err: Error) => {
      this.consoleLogs.push({
        type: 'error',
        text: `Page Uncaught Error: ${err.message}`,
        timestamp: new Date().toISOString()
      });
    });

    if (startUrl) {
      await this.page.goto(startUrl, { waitUntil: 'domcontentloaded' });
    }

    return this.page;
  }

  /**
   * Navigates the active page to a target URL.
   */
  public async navigate(url: string): Promise<void> {
    if (!this.page) {
      throw new Error("Browser session is not initialized.");
    }
    console.log(`[Stanley Agent] Navigating to: ${url}`);
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  /**
   * Executes JS code in the context of the page, mirroring typing in the inspect console.
   * Runs completely invisibly on the user's screen.
   */
  public async executeInvisibleConsoleCommand(jsCode: string): Promise<{ success: boolean; result: unknown; error?: string }> {
    if (!this.page) {
      throw new Error("Browser session is not initialized.");
    }

    console.log(`[Stanley Agent] Executing console command: ${jsCode}`);
    try {
      // Run the JS code in the page context
      const result = await this.page.evaluate((code) => {
        // Wrap execution in an eval-like expression to return value
        try {
          // eslint-disable-next-line no-eval
          const val = window.eval(code);
          return { success: true, val: val !== undefined ? JSON.stringify(val) : "undefined" };
        } catch (e) {
          const err = e as Error;
          return { success: false, error: err.message };
        }
      }, jsCode);

      if (result.success) {
        return { success: true, result: result.val };
      } else {
        return { success: false, result: null, error: result.error };
      }
    } catch (err) {
      const error = err as Error;
      return { success: false, result: null, error: error.message };
    }
  }

  /**
   * Captures the visible viewport as a base64 encoded screenshot.
   */
  public async captureViewportBase64(): Promise<string> {
    if (!this.page) {
      throw new Error("Browser session is not initialized.");
    }
    const buffer = await this.page.screenshot({ type: 'png' });
    return buffer.toString('base64');
  }

  /**
   * Returns current buffered console logs.
   */
  public getConsoleLogs(): ConsoleLogEntry[] {
    return this.consoleLogs;
  }

  /**
   * Clears buffered console logs.
   */
  public clearConsoleLogs(): void {
    this.consoleLogs = [];
  }

  /**
   * Closes browser resources.
   */
  public async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  /**
   * Solves a workflow step by querying Gemini Vision with the user's goal, the page's current
   * screenshot, and the invisible DevTools console logs.
   */
  public async determineNextAction(goal: string): Promise<AgentAction> {
    if (!this.geminiClient) {
      throw new Error("Gemini AI client is not configured. Please supply GEMINI_API_KEY.");
    }

    if (!this.page) {
      throw new Error("No active page context exists.");
    }

    const screenshot = await this.captureViewportBase64();
    const logsText = this.consoleLogs
      .slice(-25) // Keep last 25 logs to avoid bloating token count
      .map(l => `[${l.type.toUpperCase()}] ${l.text}`)
      .join('\n');

    const currentUrl = this.page.url();

    const prompt = `You are Stanley, an elite web automation agent. The user wants you to achieve this goal: "${goal}".
Current Page URL: ${currentUrl}

Here is the current state of the page's console logs (which are running invisibly behind the scenes):
${logsText || "(No logs captured yet)"}

Based on the user's goal and the attached screenshot, output your next action as a valid JSON object matching the format:
{
  "thought": "Brief explanation of your visual analysis and reasoning",
  "actionType": "execute_js" | "navigate" | "wait" | "finish",
  "payload": "The specific value: JS code to execute in the console, the navigation URL, wait duration in ms, or empty for finish"
}

Guidelines:
1. To interact with elements (clicking buttons, typing into inputs), write JS code to run in the console (e.g. document.querySelector('#submit').click() or document.querySelector('input[type="text"]').value = 'hello').
2. Ensure the JS code is robust and self-contained. You can query document structures, click nodes, or submit forms.
3. If you get stuck or need to load a new page, use "navigate" with the target URL.
4. When the goal is completed successfully, return actionType "finish".

Output ONLY the raw JSON block. No markdown wrapper.`;

    const model = this.geminiClient.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    try {
      const response = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: screenshot,
            mimeType: 'image/png'
          }
        }
      ]);

      const responseText = response.response.text().trim();
      // Clean up markdown block if returned
      const cleanJson = responseText.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
      
      const parsedAction = JSON.parse(cleanJson) as AgentAction;
      return parsedAction;
    } catch (err) {
      const error = err as Error;
      console.error("[Stanley Agent] Gemini Vision parsing failed:", error);
      return {
        thought: `Failed to request Gemini Vision: ${error.message}`,
        actionType: 'finish',
        payload: ''
      };
    }
  }
}
