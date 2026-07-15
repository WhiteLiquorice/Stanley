"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.StanleyFoundation = void 0;
const playwright_1 = require("playwright");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Project Stanley Generic Framework Core (StanleyFoundation)
 *
 * Manages non-headless browser lifecycles, persists session states,
 * and implements a client-side 'Record-and-Generalize' listener to capture
 * user click, change, and submit paths into serialized macro timelines.
 */
class StanleyFoundation {
    config;
    browser = null;
    context = null;
    page = null;
    pages = [];
    activePageIndex = 0;
    interactionTimeline = [];
    sessionKey;
    onWorkflowError;
    constructor(config = {}) {
        this.sessionKey = Math.random().toString(36).substring(2, 8);
        this.config = {
            headless: false, // Strict user directive: Must run headful so users can solve CAPTCHAs/MFA
            userAgent: config.userAgent ?? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            viewport: config.viewport ?? { width: 1280, height: 800 },
            statePath: config.statePath ?? path.join(process.cwd(), 'stanley_session_state.json'),
            ...config
        };
    }
    /**
     * Initializes the Playwright browser session.
     * Restores session storageState if it exists, exposes the event logger callback,
     * and registers the DOM event listener script.
     */
    async initialize() {
        console.log("[StanleyFoundation] Launching Chromium browser...");
        // channel '' (or null) => Playwright's bundled Chromium (required in containers / Cloud Run).
        // channel undefined => default to the user's installed Chrome (desktop daemon, no download).
        const launchOptions = {
            headless: this.config.headless,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                ...(this.config.extraArgs || []),
            ]
        };
        const channel = this.config.channel === undefined ? 'chrome' : this.config.channel;
        if (channel) launchOptions.channel = channel;
        this.browser = await playwright_1.chromium.launch(launchOptions);
        const contextOptions = {
            userAgent: this.config.userAgent,
            viewport: this.config.viewport,
        };
        if (this.config.storageState) {
            contextOptions.storageState = this.config.storageState;
        }
        if (this.config.statePath && fs.existsSync(this.config.statePath)) {
            console.log(`[StanleyFoundation] Restoring state session from: ${this.config.statePath}`);
            try {
                const stateText = fs.readFileSync(this.config.statePath, 'utf-8');
                contextOptions.storageState = JSON.parse(stateText);
            }
            catch (err) {
                console.error("[StanleyFoundation] Failed to load session state JSON:", err);
            }
        }
        this.context = await this.browser.newContext(contextOptions);
        this.page = await this.context.newPage();
        this.pages = [this.page];
        this.activePageIndex = 0;
        // Auto-register any new tabs opened by the browser (e.g. target="_blank", window.open)
        this.context.on('page', (newPage) => {
            console.log('[StanleyFoundation] New tab auto-detected and registered.');
            this.pages.push(newPage);
            // Apply stealth init script to new page
            newPage.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            }).catch(() => { });
        });
        // Mask the window.navigator.webdriver automation attribute
        await this.page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });
        // Expose the node event logging function to the browser window context
        await this.page.exposeFunction('logStanleyEvent', (event) => {
            console.log(`[StanleyFoundation Event Logged] ${event.eventType.toUpperCase()} on "${event.selector}"`);
            this.interactionTimeline.push(event);
        });
        // Inject global DOM event listener script
        await this.page.addInitScript(() => {
            // Helper function to dynamically construct a unique CSS selector path for any element
            function computeCssSelector(el) {
                if (!el)
                    return '';
                if (el.id)
                    return `#${el.id}`;
                // Prefer stable semantic attributes over fragile class-based paths
                const ariaLabel = el.getAttribute('aria-label');
                if (ariaLabel)
                    return `[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`;
                const nameAttr = el.getAttribute('name');
                if (nameAttr)
                    return `${el.nodeName.toLowerCase()}[name="${nameAttr.replace(/"/g, '\\"')}"]`;
                const dataTestId = el.getAttribute('data-testid');
                if (dataTestId)
                    return `[data-testid="${dataTestId.replace(/"/g, '\\"')}"]`;
                const pathParts = [];
                let current = el;
                while (current && current.nodeType === Node.ELEMENT_NODE) {
                    let selector = current.nodeName.toLowerCase();
                    if (current.className) {
                        // Filter classes, escaping spaces or odd tokens
                        const classNames = current.className
                            .split(/\s+/)
                            .map(c => c.trim())
                            .filter(c => c.length > 0 && !c.includes(':') && !c.includes('[')); // omit Tailwind dynamic parts
                        if (classNames.length > 0) {
                            selector += `.${classNames.join('.')}`;
                        }
                    }
                    const parent = current.parentNode;
                    if (parent) {
                        const siblings = Array.from(parent.children);
                        if (siblings.length > 1) {
                            const index = siblings.indexOf(current) + 1;
                            selector += `:nth-child(${index})`;
                        }
                    }
                    pathParts.unshift(selector);
                    current = parent;
                }
                return pathParts.join(' > ');
            }
            // Event Listener for clicks (excluding clicks on textboxes/inputs to prevent double logging)
            document.addEventListener('click', (e) => {
                const target = e.target;
                if (!target)
                    return;
                const tagName = target.tagName.toLowerCase();
                if (tagName === 'input' || tagName === 'textarea' || tagName === 'select')
                    return;
                window.logStanleyEvent({
                    eventType: 'click',
                    selector: computeCssSelector(target),
                    value: null,
                    textContent: target.textContent?.trim().slice(0, 150) || '',
                    currentUrl: window.location.href,
                    timestamp: Date.now()
                });
            }, true);
            // Event Listener for inputs and textchanges
            document.addEventListener('change', (e) => {
                const target = e.target;
                if (!target)
                    return;
                window.logStanleyEvent({
                    eventType: 'change',
                    selector: computeCssSelector(target),
                    value: target.type === 'password' ? '********' : target.value,
                    textContent: '',
                    currentUrl: window.location.href,
                    timestamp: Date.now()
                });
            }, true);
            // Event Listener for form submits
            document.addEventListener('submit', (e) => {
                const target = e.target;
                if (!target)
                    return;
                window.logStanleyEvent({
                    eventType: 'submit',
                    selector: computeCssSelector(target),
                    value: null,
                    textContent: 'Form Submit',
                    currentUrl: window.location.href,
                    timestamp: Date.now()
                });
            }, true);
        });
        return this.page;
    }
    /**
     * Navigates the current browser page to a target URL.
     */
    async navigate(url, timeout = 30000) {
        if (!this.page)
            throw new Error("Agent browser session is not initialized.");
        console.log(`[StanleyFoundation] Navigating context to: ${url}`);
        await this.page.goto(url, { waitUntil: 'load', timeout });
    }
    /**
     * Helper to wait for a specific duration in milliseconds.
     */
    async wait(ms) {
        await new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Wait for selector helper.
     */
    async waitForSelector(selector, timeout = 10000) {
        if (!this.page)
            throw new Error("Agent browser session is not initialized.");
        await this.page.waitForSelector(selector, { state: 'visible', timeout });
    }
    /**
     * Clicks a target selector.
     */
    async click(selector) {
        if (!this.page)
            throw new Error("Agent browser session is not initialized.");
        try {
            await this.page.click(selector, { timeout: 3000 });
        }
        catch (err) {
            console.warn(`[StanleyFoundation] Standard click failed, retrying with force: true...`);
            await this.page.click(selector, { force: true });
        }
    }
    /**
     * Types text into a target input.
     */
    async type(selector, text) {
        if (!this.page)
            throw new Error("Agent browser session is not initialized.");
        await this.page.fill(selector, text);
    }
    /**
     * Extracts a list of visible, interactive elements on the page with a temporary stealth session attribute.
     */
    async getPrunedInteractiveElements() {
        if (!this.page)
            throw new Error("Agent browser session is not initialized.");
        return await this.page.evaluate((key) => {
            const interactiveSelectors = [
                'a', 'button', 'input', 'textarea', 'select',
                '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="menuitem"]',
                '[cursor="pointer"]'
            ];
            const elements = Array.from(document.querySelectorAll(interactiveSelectors.join(',')));
            const pruned = [];
            let index = 0;
            const attr = `data-_${key}`;
            elements.forEach(el => {
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0)
                    return;
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
                    return;
                el.setAttribute(attr, String(index));
                pruned.push({
                    index: index,
                    tag: el.tagName,
                    text: el.innerText ? el.innerText.trim().slice(0, 100) : '',
                    placeholder: el.placeholder || '',
                    ariaLabel: el.getAttribute('aria-label') || '',
                    id: el.id || '',
                    name: el.name || '',
                    type: el.type || '',
                    role: el.getAttribute('role') || ''
                });
                index++;
            });
            return pruned;
        }, this.sessionKey);
    }
    /**
     * Clicks an element by its custom stealth session attribute.
     */
    async clickByIndex(index) {
        if (!this.page)
            throw new Error("Agent browser session is not initialized.");
        const attr = `data-_${this.sessionKey}`;
        console.log(`[StanleyFoundation] Clicking element with ${attr}="${index}"`);
        await this.page.click(`[${attr}="${index}"]`);
    }
    /**
     * Types text into an element by its custom stealth session attribute.
     */
    async typeByIndex(index, text) {
        if (!this.page)
            throw new Error("Agent browser session is not initialized.");
        const attr = `data-_${this.sessionKey}`;
        console.log(`[StanleyFoundation] Fill element with ${attr}="${index}"`);
        await this.page.fill(`[${attr}="${index}"]`, text);
    }
    /**
     * Captures a JPEG screenshot as a base64 string for vision processing.
     */
    async captureScreenshotBase64() {
        if (!this.page)
            throw new Error("Agent browser session is not initialized.");
        const buffer = await this.page.screenshot({ type: 'jpeg', quality: 55 });
        return buffer.toString('base64');
    }
    /**
     * Tries to find and click an element using standard Playwright natural locators.
     * Returns true if successful, false otherwise.
     */
    async clickByNaturalLocator(description) {
        if (!this.page)
            throw new Error("Agent browser session is not initialized.");
        const text = description.trim();
        const locators = [
            ...['button', 'link', 'checkbox', 'tab', 'menuitem'].map(role => this.page.getByRole(role, { name: text, exact: false })),
            this.page.getByText(text, { exact: false }),
            this.page.getByLabel(text, { exact: false }),
            this.page.getByPlaceholder(text, { exact: false })
        ];
        for (const locator of locators) {
            try {
                const count = await locator.count();
                if (count > 0) {
                    await locator.first().click({ timeout: 3000 });
                    return true;
                }
            }
            catch (err) {
                // Ignore and try next locator
            }
        }
        return false;
    }
    /**
     * Tries to find and fill an input element using standard Playwright natural locators.
     * Returns true if successful, false otherwise.
     */
    async typeByNaturalLocator(description, value) {
        if (!this.page)
            throw new Error("Agent browser session is not initialized.");
        const text = description.trim();
        const locators = [
            this.page.getByPlaceholder(text, { exact: false }),
            this.page.getByLabel(text, { exact: false }),
            ...['textbox', 'searchbox', 'spinbutton'].map(role => this.page.getByRole(role, { name: text, exact: false })),
            this.page.getByText(text, { exact: false })
        ];
        for (const locator of locators) {
            try {
                const count = await locator.count();
                if (count > 0) {
                    await locator.first().fill(value, { timeout: 3000 });
                    return true;
                }
            }
            catch (err) {
                // Ignore and try next locator
            }
        }
        return false;
    }
    /**
     * Clicks an element matching a specific strategy/value locator returned by Vision.
     */
    async clickByStrategy(strategy, value, roleType) {
        if (!this.page)
            throw new Error("Agent browser session is not initialized.");
        let locator;
        if (strategy === 'role' && roleType) {
            locator = this.page.getByRole(roleType, { name: value, exact: false });
        }
        else if (strategy === 'text') {
            locator = this.page.getByText(value, { exact: false });
        }
        else if (strategy === 'label') {
            locator = this.page.getByLabel(value, { exact: false });
        }
        else if (strategy === 'placeholder') {
            locator = this.page.getByPlaceholder(value, { exact: false });
        }
        else {
            throw new Error(`Unsupported strategy: ${strategy}`);
        }
        await locator.first().click({ timeout: 5000 });
    }
    /**
     * Fills an input element matching a specific strategy/value locator returned by Vision.
     */
    async typeByStrategy(strategy, value, text, roleType) {
        if (!this.page)
            throw new Error("Agent browser session is not initialized.");
        let locator;
        if (strategy === 'role' && roleType) {
            locator = this.page.getByRole(roleType, { name: value, exact: false });
        }
        else if (strategy === 'text') {
            locator = this.page.getByText(value, { exact: false });
        }
        else if (strategy === 'label') {
            locator = this.page.getByLabel(value, { exact: false });
        }
        else if (strategy === 'placeholder') {
            locator = this.page.getByPlaceholder(value, { exact: false });
        }
        else {
            throw new Error(`Unsupported strategy: ${strategy}`);
        }
        await locator.first().fill(text, { timeout: 5000 });
    }
    /**
     * Scrapes structured visible text content from the current page.
     */
    async scrapeContent(selector) {
        if (!this.page)
            throw new Error("Agent browser session is not initialized.");
        return await this.page.evaluate((sel) => {
            const root = sel ? document.querySelector(sel) : document.body;
            if (!root)
                return `Element with selector "${sel}" not found.`;
            const elementsToScrape = ['p', 'li', 'td', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span'];
            const textNodes = [];
            if (!sel) {
                textNodes.push(`Title: ${document.title}`);
            }
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
                acceptNode: (node) => {
                    const el = node;
                    const tagName = el.tagName.toLowerCase();
                    if (elementsToScrape.includes(tagName)) {
                        const rect = el.getBoundingClientRect();
                        if (rect.width === 0 || rect.height === 0)
                            return NodeFilter.FILTER_REJECT;
                        const style = window.getComputedStyle(el);
                        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                            return NodeFilter.FILTER_REJECT;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_SKIP;
                }
            });
            let currentNode = walker.nextNode();
            while (currentNode) {
                const text = currentNode.textContent?.trim();
                if (text && text.length > 0) {
                    textNodes.push(text);
                }
                currentNode = walker.nextNode();
            }
            const uniqueTexts = Array.from(new Set(textNodes));
            return uniqueTexts.join('\n');
        }, selector);
    }
    /**
     * Performs heuristic checks to see if the page is blocked by CAPTCHA, Cloudflare, etc.
     */
    async isPageBlocked() {
        if (!this.page)
            throw new Error("Agent browser session is not initialized.");
        return await this.page.evaluate(() => {
            const selectors = [
                'iframe[src*="recaptcha"]',
                'iframe[src*="hcaptcha"]',
                'iframe[src*="turnstile"]',
                '[class*="captcha"]',
                '[id*="captcha"]',
                '[class*="modal"]',
                '[id*="modal"]',
                '[role="dialog"]',
                '#challenge-running',
                '#cf-challenge',
                '#challenge-form'
            ];
            for (const selector of selectors) {
                const els = Array.from(document.querySelectorAll(selector));
                for (const el of els) {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        const style = window.getComputedStyle(el);
                        if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                            return { blocked: true, hint: `Detected blocking element matching selector: "${selector}"` };
                        }
                    }
                }
            }
            return { blocked: false, hint: '' };
        });
    }
    /**
     * Waits until the page network is idle or a timeout is reached.
     * Prevents retrying actions into an actively-loading page.
     * Default 5s — SPAs with persistent connections will time out gracefully.
     */
    async waitForPageStable(ms = 5000) {
        if (!this.page)
            return;
        try {
            await this.page.waitForLoadState('networkidle', { timeout: ms });
        }
        catch {
            // Timeout is acceptable — page may be a SPA with persistent connections
        }
    }
    /**
     * Opens a new browser tab, applies stealth config, and optionally navigates to a URL.
     * Returns the index of the new tab in the pages array.
     */
    async openTab(url) {
        if (!this.context)
            throw new Error('Browser context not established.');
        const newPage = await this.context.newPage();
        await newPage.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });
        // Register in array (context 'page' event may have already added it; avoid duplicates)
        if (!this.pages.includes(newPage)) {
            this.pages.push(newPage);
        }
        const index = this.pages.indexOf(newPage);
        this.activePageIndex = index;
        this.page = newPage;
        if (url) {
            await newPage.goto(url, { waitUntil: 'load' });
        }
        console.log(`[StanleyFoundation] Opened new tab at index ${index}${url ? ': ' + url : ''}.`);
        return index;
    }
    /**
     * Switches the active page context to the tab at the given index.
     */
    async switchTab(index) {
        if (index < 0 || index >= this.pages.length) {
            throw new Error(`Tab index ${index} is out of range (${this.pages.length} tabs open).`);
        }
        this.activePageIndex = index;
        this.page = this.pages[index];
        console.log(`[StanleyFoundation] Switched to tab ${index}.`);
    }
    /**
     * Closes the tab at the given index and updates the active page reference.
     */
    async closeTab(index) {
        if (index < 0 || index >= this.pages.length) {
            throw new Error(`Tab index ${index} is out of range (${this.pages.length} tabs open).`);
        }
        await this.pages[index].close();
        this.pages.splice(index, 1);
        // Clamp activePageIndex to valid range
        if (this.pages.length === 0) {
            this.page = null;
            this.activePageIndex = 0;
        }
        else {
            this.activePageIndex = Math.min(this.activePageIndex, this.pages.length - 1);
            this.page = this.pages[this.activePageIndex];
        }
        console.log(`[StanleyFoundation] Closed tab ${index}. Active tab is now ${this.activePageIndex}.`);
    }
    /**
     * Strips all temporary stealth attributes from the DOM.
     */
    async cleanupStealthAttributes() {
        if (!this.page)
            return;
        try {
            await this.page.evaluate((key) => {
                const attr = `data-_${key}`;
                const elements = document.querySelectorAll(`[${attr}]`);
                elements.forEach(el => el.removeAttribute(attr));
            }, this.sessionKey);
        }
        catch (err) {
            console.error("[StanleyFoundation] Error cleaning up stealth attributes:", err);
        }
    }
    /**
     * Saves the browser state (cookies + local storage contents) to file.
     */
    async saveState() {
        if (!this.context || !this.config.statePath)
            throw new Error("Browser context not established.");
        console.log(`[StanleyFoundation] Saving session state to: ${this.config.statePath}`);
        const state = await this.context.storageState();
        fs.writeFileSync(this.config.statePath, JSON.stringify(state, null, 2), 'utf-8');
    }
    /**
     * Serializes the captured timeline events to a JSON configuration block on disk.
     */
    saveMacroTimeline(filename) {
        const outputPath = path.isAbsolute(filename) ? filename : path.join(process.cwd(), filename);
        console.log(`[StanleyFoundation] Serializing ${this.interactionTimeline.length} macro steps to: ${outputPath}`);
        try {
            const dataStr = JSON.stringify(this.interactionTimeline, null, 2);
            fs.writeFileSync(outputPath, dataStr, 'utf-8');
        }
        catch (err) {
            console.error(`[StanleyFoundation] Error serializing macro timeline to ${outputPath}:`, err);
        }
    }
    /**
     * Returns current timeline.
     */
    getTimeline() {
        return this.interactionTimeline;
    }
    /**
     * Consumes a structured declarative workflow schema, handles the edge-to-edge
     * linear routing mechanics, and runs the corresponding Playwright browser actions.
     */
    async runWorkflow(workflow) {
        console.log(`[StanleyEngine] Beginning execution for workflow: "${workflow.name}"`);
        const scrapedData = {};
        // Find the initial trigger node (node with no incoming edges or type === 'trigger')
        let currentNode = workflow.nodes.find(n => n.type === 'trigger');
        if (!currentNode) {
            throw new Error("[StanleyEngine] Invalid workflow configuration: No 'trigger' node found.");
        }
        while (currentNode) {
            console.log(`[StanleyEngine Step] Executing: [${currentNode.type.toUpperCase()}] "${currentNode.label}"`);
            // Heuristic security barrier protection check before performing actions
            const check = await this.isPageBlocked();
            if (check.blocked) {
                console.warn(`[StanleyEngine Blocked] ${check.hint}. Pausing for manual client override...`);
                // Sleep briefly or prompt user in headful mode — allowing manual captcha/MFA resolution
                await this.wait(5000);
            }
            let success = false;
            let attempts = 0;
            const maxAttempts = 3;
            while (!success && attempts < maxAttempts) {
                try {
                    switch (currentNode.type) {
                        case 'trigger':
                            if (currentNode.data.url) {
                                await this.navigate(currentNode.data.url);
                            }
                            break;
                        case 'type':
                            if (currentNode.data.selector && currentNode.data.value !== undefined) {
                                await this.waitForSelector(currentNode.data.selector, 5000);
                                await this.type(currentNode.data.selector, currentNode.data.value);
                            }
                            break;
                        case 'click':
                            if (currentNode.data.selector) {
                                await this.waitForSelector(currentNode.data.selector, 5000);
                                await this.click(currentNode.data.selector);
                            }
                            break;
                        case 'wait':
                            if (currentNode.data.ms) {
                                const delay = parseInt(currentNode.data.ms, 10);
                                await this.wait(delay);
                            }
                            break;
                        case 'scrape':
                            const targetSelector = currentNode.data.selector;
                            const resultText = await this.scrapeContent(targetSelector);
                            scrapedData[currentNode.id] = resultText;
                            console.log(`[StanleyEngine Scrape Complete] Captured content length: ${resultText.length}`);
                            break;
                        default:
                            console.error(`[StanleyEngine] Unknown action step type encountered: ${currentNode.type}`);
                    }
                    success = true;
                }
                catch (stepError) {
                    attempts++;
                    console.warn(`[StanleyEngine Attempt ${attempts} Failed] Action failed for "${currentNode.label || currentNode.type}" (ID: ${currentNode.id}). Error details: ${stepError.message}`);
                    if (attempts >= maxAttempts) {
                        console.error(`[StanleyEngine Critical] Action failed after ${maxAttempts} attempts. Halting sequence.`);
                        // Log clean warning message as requested by the user
                        console.warn(`[StanleyEngine Prompt] I couldn't find the element "${currentNode.data.selector || 'N/A'}" for step "${currentNode.label}". Did the page change, or should I wait for an input variable?`);
                        if (this.onWorkflowError) {
                            const resolution = await this.onWorkflowError(currentNode, stepError);
                            if (resolution === 'retry') {
                                console.log(`[StanleyEngine Prompt] User requested retry. Restarting step execution...`);
                                attempts = 0; // Reset attempts to try again
                                continue;
                            }
                            else if (resolution === 'skip') {
                                console.log(`[StanleyEngine Prompt] User requested to skip. Continuing to next step...`);
                                break; // Exit retry loop and proceed
                            }
                        }
                        throw stepError;
                    }
                    else {
                        // Wait briefly before retrying
                        await this.wait(2000);
                    }
                }
            }
            // Evaluate edge mapping logic to step to the next sequence item
            const currentId = currentNode.id;
            const nextEdge = workflow.edges.find(e => e.source === currentId);
            if (nextEdge) {
                currentNode = workflow.nodes.find(n => n.id === nextEdge.target);
            }
            else {
                currentNode = undefined; // Sequence path completed cleanly
            }
        }
        console.log(`[StanleyEngine] Workflow execution completed successfully for: "${workflow.name}"`);
        return scrapedData;
    }
    /**
     * Closes browser sessions cleanly.
     */
    async cleanup() {
        console.log("[StanleyFoundation] Cleaning up browser processes...");
        if (this.browser) {
            await this.browser.close();
        }
        this.browser = null;
        this.context = null;
        this.page = null;
        this.pages = [];
        this.activePageIndex = 0;
    }
}
exports.StanleyFoundation = StanleyFoundation;
