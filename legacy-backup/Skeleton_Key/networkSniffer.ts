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
   * Appends each captured exchange as a single newline-delimited JSON (NDJSON) record.
   * One JSON object per line — safe for concurrent writes, no full-file reads needed.
   * Parse with: readAll() or `file.split('\n').filter(Boolean).map(JSON.parse)`
   */
  private queueAppend(exchange: SniffedExchange): void {
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        const dirPath = path.dirname(this.outputPath);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
        fs.appendFileSync(this.outputPath, JSON.stringify(exchange) + '\n', 'utf-8');
      } catch (err) {
        console.error(`[Skeleton Key] Failed appending transaction to ${this.outputPath}:`, err);
      }
    });
  }

  /**
   * Reads and parses all captured exchanges from the NDJSON output file.
   */
  public readAll(): SniffedExchange[] {
    if (!fs.existsSync(this.outputPath)) return [];
    return fs.readFileSync(this.outputPath, 'utf-8')
      .split('\n')
      .filter(line => line.trim().length > 0)
      .reduce<SniffedExchange[]>((acc, line) => {
        try {
          acc.push(JSON.parse(line) as SniffedExchange);
        } catch {
          console.error(`[Skeleton Key] Skipping malformed NDJSON line: ${line.slice(0, 80)}`);
        }
        return acc;
      }, []);
  }
}
