import { BrowserContext } from 'playwright';
export declare const PAGES_PATH: string;
export declare const OUTPUT_PATH: string;
export declare function launchDemo(): Promise<{
    browser: any;
    context: BrowserContext;
}>;
export declare function localPage(filename: string): string;
