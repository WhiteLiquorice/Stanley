import { Page, Response } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { StanleyFoundation, AgentConfig } from '../foundationAgent';

export interface SniffedExchange {
  id: string;
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responsePayload: unknown;
  timestamp: string;
}

/**
 * Stanley Skeleton Key Network Sniffer
 * 
 * Local API proxy built to intercept raw hidden network traffic directly from
 * the prosumer's browser session. Intercepts fetch/xhr traffic and appends it to
 * skeleton_key_captured_apis.json.
 */
export class StanleySkeletonKeySniffer extends StanleyFoundation {
  private onExchangeCallback: ((exchange: SniffedExchange) => void) | null = null;
  private outputPath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(config: AgentConfig & { outputPath?: string } = {}) {
    super(config);
    this.outputPath = config.outputPath ?? path.join(process.cwd(), 'skeleton_key_captured_apis.json');
  }

  /**
   * Registers a callback triggered when a network exchange is sniffed.
   */
  public onExchange(callback: (exchange: SniffedExchange) => void): void {
    this.onExchangeCallback = callback;
  }

  /**
   * Overrides StanleyFoundation initialize to attach network interceptors automatically.
   */
  public override async initialize(): Promise<Page> {
    const page = await super.initialize();
    this.setupNetworkInterceptors();
    return page;
  }

  /**
   * Configures network listeners to filter and capture fetch/xhr APIs.
   */
  private setupNetworkInterceptors(): void {
    if (!this.page) return;

    this.page.on('response', async (response: Response) => {
      try {
        const request = response.request();
        const type = request.resourceType();

        // Enforce strict logical filters: only fetch and xhr
        if (type === 'fetch' || type === 'xhr') {
          const url = response.url();
          const method = request.method();
          const requestHeaders = request.headers();
          const requestBody = request.postData() || null;
          const responseStatus = response.status();
          const responseHeaders = response.headers();

          let responsePayload: unknown = null;
          try {
            const rawText = await response.text();
            try {
              responsePayload = JSON.parse(rawText);
            } catch {
              responsePayload = rawText; // Fallback to raw text if not JSON
            }
          } catch {
            responsePayload = null; // Stream already consumed or closed
          }

          const exchange: SniffedExchange = {
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            url,
            method,
            requestHeaders,
            requestBody,
            responseStatus,
            responseHeaders,
            responsePayload,
            timestamp: new Date().toISOString()
          };

          // Stream and append to file
          this.queueAppend(exchange);

          // Invoke client callback
          if (this.onExchangeCallback) {
            this.onExchangeCallback(exchange);
          }
        }
      } catch (err) {
        console.error("[Skeleton Key] Error parsing network interceptor response:", err);
      }
    });
  }

  /**
   * Appends captured exchanges in a sequential queue to ensure valid JSON format
   * without concurrency race conditions.
   */
  private queueAppend(exchange: SniffedExchange): void {
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        const filePath = this.outputPath;
        const dirPath = path.dirname(filePath);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }

        const recordString = JSON.stringify(exchange, null, 2);
        const isFirst = !fs.existsSync(filePath) || fs.statSync(filePath).size === 0;

        if (isFirst) {
          fs.writeFileSync(filePath, `[\n${recordString}\n]`, 'utf-8');
        } else {
          const content = fs.readFileSync(filePath, 'utf-8').trim();
          if (content.endsWith(']')) {
            const truncated = content.slice(0, -1).trim();
            const separator = truncated.endsWith('[') ? "" : ",\n";
            fs.writeFileSync(filePath, `${truncated}${separator}${recordString}\n]`, 'utf-8');
          } else {
            // Fallback: If formatting is corrupted, reset as a valid JSON array
            fs.writeFileSync(filePath, `[\n${recordString}\n]`, 'utf-8');
          }
        }
      } catch (err) {
        console.error(`[Skeleton Key] Failed appending transaction to ${this.outputPath}:`, err);
      }
    });
  }
}
