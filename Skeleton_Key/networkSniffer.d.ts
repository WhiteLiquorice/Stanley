import { Page } from 'playwright';
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
export declare class StanleySkeletonKeySniffer extends StanleyFoundation {
    private onExchangeCallback;
    private outputPath;
    private writeQueue;
    constructor(config?: AgentConfig & {
        outputPath?: string;
    });
    /**
     * Registers a callback triggered when a network exchange is sniffed.
     */
    onExchange(callback: (exchange: SniffedExchange) => void): void;
    /**
     * Overrides StanleyFoundation initialize to attach network interceptors automatically.
     */
    initialize(): Promise<Page>;
    /**
     * Configures network listeners to filter and capture fetch/xhr APIs.
     */
    private setupNetworkInterceptors;
    /**
     * Appends captured exchanges in a sequential queue to ensure valid JSON format
     * without concurrency race conditions.
     */
    private queueAppend;
}
