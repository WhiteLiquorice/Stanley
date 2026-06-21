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
exports.OUTPUT_PATH = exports.PAGES_PATH = void 0;
exports.launchDemo = launchDemo;
exports.localPage = localPage;
const playwright_1 = require("playwright");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
exports.PAGES_PATH = path.resolve(__dirname, 'pages').replace(/\\/g, '/');
exports.OUTPUT_PATH = path.resolve(__dirname, 'output');
async function launchDemo() {
    if (!fs.existsSync(exports.OUTPUT_PATH))
        fs.mkdirSync(exports.OUTPUT_PATH, { recursive: true });
    const browser = await playwright_1.chromium.launch({
        headless: false,
        args: ['--disable-blink-features=AutomationControlled']
    });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        viewport: { width: 1080, height: 1920 },
        recordVideo: { dir: exports.OUTPUT_PATH, size: { width: 1080, height: 1920 } }
    });
    context.on('close', () => { browser.close().catch(() => { }); });
    return { browser, context };
}
function localPage(filename) {
    return `file:///${exports.PAGES_PATH}/${filename}`;
}
//# sourceMappingURL=utils.js.map