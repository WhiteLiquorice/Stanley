import { Browser, BrowserContext, Page } from 'playwright';
export interface InteractionEvent {
    eventType: string;
    selector: string;
    value: string | null;
    textContent: string;
    currentUrl: string;
    timestamp: number;
}
export interface AgentConfig {
    headless?: boolean;
    userAgent?: string;
    viewport?: {
        width: number;
        height: number;
    };
    statePath?: string;
}
/**
 * Project Stanley Generic Framework Core (StanleyFoundation)
 *
 * Manages non-headless browser lifecycles, persists session states,
 * and implements a client-side 'Record-and-Generalize' listener to capture
 * user click, change, and submit paths into serialized macro timelines.
 */
export declare class StanleyFoundation {
    protected config: AgentConfig;
    protected browser: Browser | null;
    protected context: BrowserContext | null;
    protected page: Page | null;
    protected interactionTimeline: InteractionEvent[];
    constructor(config?: AgentConfig);
    /**
     * Initializes the Playwright browser session.
     * Restores session storageState if it exists, exposes the event logger callback,
     * and registers the DOM event listener script.
     */
    initialize(): Promise<Page>;
    /**
     * Navigates the current browser page to a target URL.
     */
    navigate(url: string): Promise<void>;
    /**
     * Helper to wait for a specific duration in milliseconds.
     */
    wait(ms: number): Promise<void>;
    /**
     * Wait for selector helper.
     */
    waitForSelector(selector: string, timeout?: number): Promise<void>;
    /**
     * Clicks a target selector.
     */
    click(selector: string): Promise<void>;
    /**
     * Types text into a target input.
     */
    type(selector: string, text: string): Promise<void>;
    /**
     * Saves the browser state (cookies + local storage contents) to file.
     */
    saveState(): Promise<void>;
    /**
     * Serializes the captured timeline events to a JSON configuration block on disk.
     */
    saveMacroTimeline(filename: string): void;
    /**
     * Returns current timeline.
     */
    getTimeline(): InteractionEvent[];
    /**
     * Closes browser sessions cleanly.
     */
    cleanup(): Promise<void>;
}
