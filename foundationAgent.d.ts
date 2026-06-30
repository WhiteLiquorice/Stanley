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
export interface WorkflowNode {
    id: string;
    type: 'trigger' | 'type' | 'click' | 'wait' | 'scrape';
    label: string;
    data: {
        url?: string;
        selector?: string;
        value?: string;
        ms?: string;
    };
}
export interface WorkflowEdge {
    source: string;
    target: string;
}
export interface Workflow {
    id: string;
    name: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
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
    protected pages: Page[];
    protected activePageIndex: number;
    protected interactionTimeline: InteractionEvent[];
    protected sessionKey: string;
    onWorkflowError?: (node: WorkflowNode, error: Error) => Promise<'retry' | 'skip' | 'abort'>;
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
    navigate(url: string, timeout?: number): Promise<void>;
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
     * Extracts a list of visible, interactive elements on the page with a temporary stealth session attribute.
     */
    getPrunedInteractiveElements(): Promise<any[]>;
    /**
     * Clicks an element by its custom stealth session attribute.
     */
    clickByIndex(index: number): Promise<void>;
    /**
     * Types text into an element by its custom stealth session attribute.
     */
    typeByIndex(index: number, text: string): Promise<void>;
    /**
     * Captures a JPEG screenshot as a base64 string for vision processing.
     */
    captureScreenshotBase64(): Promise<string>;
    /**
     * Tries to find and click an element using standard Playwright natural locators.
     * Returns true if successful, false otherwise.
     */
    clickByNaturalLocator(description: string): Promise<boolean>;
    /**
     * Tries to find and fill an input element using standard Playwright natural locators.
     * Returns true if successful, false otherwise.
     */
    typeByNaturalLocator(description: string, value: string): Promise<boolean>;
    /**
     * Clicks an element matching a specific strategy/value locator returned by Vision.
     */
    clickByStrategy(strategy: string, value: string, roleType?: string): Promise<void>;
    /**
     * Fills an input element matching a specific strategy/value locator returned by Vision.
     */
    typeByStrategy(strategy: string, value: string, text: string, roleType?: string): Promise<void>;
    /**
     * Scrapes structured visible text content from the current page.
     */
    scrapeContent(selector?: string): Promise<string>;
    /**
     * Performs heuristic checks to see if the page is blocked by CAPTCHA, Cloudflare, etc.
     */
    isPageBlocked(): Promise<{
        blocked: boolean;
        hint: string;
    }>;
    /**
     * Waits until the page network is idle or a timeout is reached.
     * Prevents retrying actions into an actively-loading page.
     * Default 5s — SPAs with persistent connections will time out gracefully.
     */
    waitForPageStable(ms?: number): Promise<void>;
    /**
     * Opens a new browser tab, applies stealth config, and optionally navigates to a URL.
     * Returns the index of the new tab in the pages array.
     */
    openTab(url?: string): Promise<number>;
    /**
     * Switches the active page context to the tab at the given index.
     */
    switchTab(index: number): Promise<void>;
    /**
     * Closes the tab at the given index and updates the active page reference.
     */
    closeTab(index: number): Promise<void>;
    /**
     * Strips all temporary stealth attributes from the DOM.
     */
    cleanupStealthAttributes(): Promise<void>;
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
     * Consumes a structured declarative workflow schema, handles the edge-to-edge
     * linear routing mechanics, and runs the corresponding Playwright browser actions.
     */
    runWorkflow(workflow: Workflow): Promise<Record<string, string>>;
    /**
     * Closes browser sessions cleanly.
     */
    cleanup(): Promise<void>;
}
