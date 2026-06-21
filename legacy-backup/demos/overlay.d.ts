/**
 * Stanley floating overlay — injects a self-contained popup UI into any page.
 * All state transitions are driven from Playwright via page.evaluate().
 * The overlay appears fixed in the top-right corner, like the real extension popup.
 */
import { Page } from 'playwright';
export interface OverlayStep {
    action: string;
    url?: string;
    value?: string;
    description?: string;
    index?: number;
}
export declare function injectOverlay(page: Page): Promise<void>;
export declare function injectOverlayRunning(page: Page, text?: string): Promise<void>;
export declare function overlayHumanType(page: Page, text: string): Promise<void>;
export declare function overlayType(page: Page, text: string, charDelayMs?: number): Promise<void>;
export declare function overlayClickRun(page: Page): Promise<void>;
export declare function overlayShowPlan(page: Page, steps: OverlayStep[]): Promise<void>;
export declare function overlayClickConfirm(page: Page): Promise<void>;
export declare function overlayMinimize(page: Page, text?: string): Promise<void>;
export declare function overlaySetStatus(page: Page, text: string): Promise<void>;
export declare function overlayDone(page: Page, text?: string): Promise<void>;
export declare function overlayShowResult(page: Page, result: string): Promise<void>;
