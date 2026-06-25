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
exports.StanleySkeletonKeySniffer = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const foundationAgent_1 = require("../foundationAgent");
/**
 * Stanley Skeleton Key Network Sniffer
 *
 * Local API proxy built to intercept raw hidden network traffic directly from
 * the prosumer's browser session. Intercepts fetch/xhr traffic and appends it to
 * skeleton_key_captured_apis.json.
 */
class StanleySkeletonKeySniffer extends foundationAgent_1.StanleyFoundation {
    onExchangeCallback = null;
    outputPath;
    writeQueue = Promise.resolve();
    constructor(config = {}) {
        super(config);
        this.outputPath = config.outputPath ?? path.join(process.cwd(), 'skeleton_key_captured_apis.json');
    }
    /**
     * Registers a callback triggered when a network exchange is sniffed.
     */
    onExchange(callback) {
        this.onExchangeCallback = callback;
    }
    /**
     * Overrides StanleyFoundation initialize to attach network interceptors automatically.
     */
    async initialize() {
        const page = await super.initialize();
        this.setupNetworkInterceptors();
        return page;
    }
    /**
     * Configures network listeners to filter and capture fetch/xhr APIs.
     */
    setupNetworkInterceptors() {
        if (!this.page)
            return;
        this.page.on('response', async (response) => {
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
                    let responsePayload = null;
                    try {
                        const rawText = await response.text();
                        try {
                            responsePayload = JSON.parse(rawText);
                        }
                        catch {
                            responsePayload = rawText; // Fallback to raw text if not JSON
                        }
                    }
                    catch {
                        responsePayload = null; // Stream already consumed or closed
                    }
                    const exchange = {
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
            }
            catch (err) {
                console.error("[Skeleton Key] Error parsing network interceptor response:", err);
            }
        });
    }
    /**
     * Appends captured exchanges in a sequential queue to ensure valid JSON format
     * without concurrency race conditions.
     */
    queueAppend(exchange) {
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
                }
                else {
                    const content = fs.readFileSync(filePath, 'utf-8').trim();
                    if (content.endsWith(']')) {
                        const truncated = content.slice(0, -1).trim();
                        const separator = truncated.endsWith('[') ? "" : ",\n";
                        fs.writeFileSync(filePath, `${truncated}${separator}${recordString}\n]`, 'utf-8');
                    }
                    else {
                        // Fallback: If formatting is corrupted, reset as a valid JSON array
                        fs.writeFileSync(filePath, `[\n${recordString}\n]`, 'utf-8');
                    }
                }
            }
            catch (err) {
                console.error(`[Skeleton Key] Failed appending transaction to ${this.outputPath}:`, err);
            }
        });
    }
}
exports.StanleySkeletonKeySniffer = StanleySkeletonKeySniffer;
//# sourceMappingURL=networkSniffer.js.map