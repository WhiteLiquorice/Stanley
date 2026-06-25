/**
 * content.js — Stanley's in-page DOM layer (runs in every frame, all_urls).
 *
 * The service worker owns the WHAT (step sequencing, branching, AI). This script owns
 * the WHERE: it resolves selectors / natural-language descriptions to live elements,
 * scrolls them into view, and reports fresh viewport coordinates so the worker can fire
 * a real isTrusted click through chrome.debugger (CDP). It also does React-safe value
 * injection, page scraping, and CAPTCHA/block heuristics — the browser-native ports of
 * the old Playwright `foundationAgent` primitives.
 *
 * It does NOT click via dispatchEvent for the primary path; coordinate + CDP is what
 * beats bot detection. dispatchEvent stays only as a last-resort fallback flag.
 *
 * Two channels to the worker:
 *   1. A long-lived Port ('stanley-keepalive') — heartbeat so the MV3 service worker
 *      doesn't idle out mid-workflow while a page loads or the user solves a CAPTCHA.
 *   2. Per-command request/response via chrome.runtime.onMessage.
 */

(function () {
  if (window.__stanleyContentLoaded) return; // guard against double injection
  window.__stanleyContentLoaded = true;

  const IS_TOP = window.top === window;

  // Worker keepalive is handled by the service worker itself, which pings this frame
  // during otherwise-idle waits (see nativeAgent.wait). Each ping is a message the
  // worker receives, resetting its 30s idle timer — no always-on port needed, so the
  // worker is only kept awake during an active run, not on every page you browse.

  // ── Element resolution ────────────────────────────────────────────────────────────
  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  /** Resolve a CSS selector to the first visible match in THIS frame's document. */
  function bySelector(selector) {
    const els = document.querySelectorAll(selector);
    for (const el of els) {
      if (isVisible(el)) return el;
    }
    return els[0] || null; // fall back to first even if hidden, caller decides
  }

  /**
   * Resolve a natural-language description to an element, mirroring the old
   * Playwright getByRole/Text/Label/Placeholder cascade. Returns the best match.
   */
  function byDescription(description, wantInput) {
    const text = (description || '').trim().toLowerCase();
    if (!text) return null;

    const candidates = [];
    const pushIf = (el) => { if (el && isVisible(el)) candidates.push(el); };

    if (wantInput) {
      // placeholder / aria-label / associated <label> / name
      document.querySelectorAll('input, textarea, select, [contenteditable="true"]').forEach((el) => {
        const ph = (el.getAttribute('placeholder') || '').toLowerCase();
        const al = (el.getAttribute('aria-label') || '').toLowerCase();
        const nm = (el.getAttribute('name') || '').toLowerCase();
        if (ph.includes(text) || al.includes(text) || nm.includes(text)) pushIf(el);
      });
      // <label>text</label> -> its control
      document.querySelectorAll('label').forEach((lbl) => {
        if ((lbl.textContent || '').trim().toLowerCase().includes(text)) {
          const ctl = lbl.htmlFor ? document.getElementById(lbl.htmlFor) : lbl.querySelector('input,textarea,select');
          pushIf(ctl);
        }
      });
    } else {
      // clickable: buttons, links, role=button, then any element whose text matches
      document.querySelectorAll('button, a, [role="button"], [role="link"], [role="tab"], [role="menuitem"], input[type="submit"], input[type="button"]').forEach((el) => {
        const label = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().toLowerCase();
        if (label.includes(text)) pushIf(el);
      });
      if (candidates.length === 0) {
        // Broaden: smallest element whose visible text contains the phrase.
        const all = document.body ? document.body.querySelectorAll('*') : [];
        let best = null;
        for (const el of all) {
          if (!isVisible(el)) continue;
          const own = Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent)
            .join('')
            .trim()
            .toLowerCase();
          if (own.includes(text)) {
            if (!best || el.getBoundingClientRect().width * el.getBoundingClientRect().height <
              best.getBoundingClientRect().width * best.getBoundingClientRect().height) {
              best = el;
            }
          }
        }
        pushIf(best);
      }
    }
    return candidates[0] || null;
  }

  function resolve({ selector, description, wantInput }) {
    if (selector) return bySelector(selector);
    if (description) return byDescription(description, wantInput);
    return null;
  }

  /**
   * Scroll an element into view and return fresh center coordinates (CSS px, viewport
   * origin). The scroll + settle delay fixes the "click lands in empty space on long
   * pages" problem — coords are recomputed AFTER the scroll completes.
   */
  async function locateForClick(el) {
    el.scrollIntoView({ block: 'center', inline: 'center' });
    await new Promise((r) => setTimeout(r, 100)); // let smooth-scroll settle
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      frameUrl: location.href,
      isTop: IS_TOP,
    };
  }

  /**
   * React/Vue/Angular-safe value injection. Setting `.value` directly is ignored by
   * frameworks that wrap the native setter; we call the prototype setter and dispatch
   * bubbling input + change so the framework's state manager captures it.
   */
  function forceInput(el, text) {
    el.focus();
    const proto = el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) {
      setter.set.call(el, text);
    } else if (el.isContentEditable) {
      el.textContent = text;
    } else {
      el.value = text;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ── Scrape (port of foundationAgent.scrapeContent) ──────────────────────────────
  function scrapeContent(selector) {
    const root = selector ? document.querySelector(selector) : document.body;
    if (!root) return `Element with selector "${selector}" not found.`;

    const tags = ['p', 'li', 'td', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span'];
    const out = [];
    if (!selector) out.push(`Title: ${document.title}`);

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => {
        const el = node;
        if (tags.includes(el.tagName.toLowerCase())) {
          return isVisible(el) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    });
    let n = walker.nextNode();
    while (n) {
      const t = (n.textContent || '').trim();
      if (t) out.push(t);
      n = walker.nextNode();
    }
    return Array.from(new Set(out)).join('\n');
  }

  // ── Block / CAPTCHA heuristic (port of isPageBlocked) ───────────────────────────
  function detectBlock() {
    const selectors = [
      'iframe[src*="recaptcha"]', 'iframe[src*="hcaptcha"]', 'iframe[src*="turnstile"]',
      '[class*="captcha"]', '[id*="captcha"]', '[role="dialog"]',
      '#challenge-running', '#cf-challenge', '#challenge-form',
    ];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (isVisible(el)) return { blocked: true, hint: `Detected blocking element: "${sel}"` };
      }
    }
    return { blocked: false, hint: '' };
  }

  // ── Command handler ─────────────────────────────────────────────────────────────
  // Each command answers ONLY if relevant to this frame. For element lookups, a frame
  // that doesn't own the element returns { ok:true, found:false } so the worker can try
  // the next frame.
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.ns !== 'stanley') return false;

    (async () => {
      try {
        switch (msg.cmd) {
          case 'ping':
            return sendResponse({ ok: true, isTop: IS_TOP, url: location.href });

          case 'locateClick': {
            const el = resolve({ selector: msg.selector, description: msg.description, wantInput: false });
            if (!el) return sendResponse({ ok: true, found: false });
            const pos = await locateForClick(el);
            return sendResponse({ ok: true, found: true, ...pos });
          }

          case 'locateType': {
            const el = resolve({ selector: msg.selector, description: msg.description, wantInput: true });
            if (!el) return sendResponse({ ok: true, found: false });
            const pos = await locateForClick(el);
            return sendResponse({ ok: true, found: true, ...pos });
          }

          case 'setValue': {
            const el = resolve({ selector: msg.selector, description: msg.description, wantInput: true });
            if (!el) return sendResponse({ ok: true, found: false });
            forceInput(el, msg.value == null ? '' : String(msg.value));
            return sendResponse({ ok: true, found: true });
          }

          case 'exists': {
            const el = resolve({ selector: msg.selector, description: msg.description, wantInput: msg.wantInput });
            return sendResponse({ ok: true, exists: !!el });
          }

          case 'waitSelector': {
            const deadline = Date.now() + (msg.timeout || 10000);
            while (Date.now() < deadline) {
              const el = bySelector(msg.selector);
              if (el && isVisible(el)) return sendResponse({ ok: true, found: true });
              await new Promise((r) => setTimeout(r, 150));
            }
            return sendResponse({ ok: true, found: false });
          }

          case 'scrape':
            // Only the top frame answers scrape to avoid concatenating every iframe.
            if (!IS_TOP) return sendResponse({ ok: true, found: false });
            return sendResponse({ ok: true, found: true, text: scrapeContent(msg.selector) });

          case 'isBlocked': {
            const b = detectBlock();
            return sendResponse({ ok: true, ...b, frameUrl: location.href });
          }

          case 'fallbackClick': {
            // Last-resort dispatchEvent path (isTrusted:false). Used only when CDP is
            // unavailable (e.g. DevTools open) and the caller opted in.
            const el = resolve({ selector: msg.selector, description: msg.description, wantInput: false });
            if (!el) return sendResponse({ ok: true, found: false });
            el.scrollIntoView({ block: 'center' });
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            return sendResponse({ ok: true, found: true });
          }

          default:
            return sendResponse({ ok: false, error: `Unknown cmd "${msg.cmd}"` });
        }
      } catch (err) {
        return sendResponse({ ok: false, error: err.message });
      }
    })();

    return true; // async sendResponse
  });

  // ── Web Page Message Relay ──────────────────────────────────────────────────────
  if (IS_TOP) {
    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data || event.data.ns !== 'stanley-web') return;

      const { cmd } = event.data;
      if (cmd === 'ping') {
        window.postMessage({ ns: 'stanley-extension', cmd: 'ping_response', ok: true }, '*');
      } else if (cmd === 'run_native_workflow') {
        chrome.runtime.sendMessage({
          action: 'run_native_workflow',
          workflow: event.data.workflow,
          secrets: event.data.secrets
        });
      } else if (cmd === 'cancel_native') {
        chrome.runtime.sendMessage({ action: 'cancel_native' });
      } else if (cmd === 'get_native_status') {
        chrome.runtime.sendMessage({ action: 'get_status' }, (resp) => {
          window.postMessage({ ns: 'stanley-extension', cmd: 'native_status', status: resp }, '*');
        });
      }
    });

    // Listen for events from background worker and post to the page
    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.ns === 'stanley-extension-event') {
        window.postMessage({
          ns: 'stanley-extension',
          cmd: 'workflow_event',
          action: message.action,
          log: message.log,
          error: message.error,
          result: message.result,
          prompt: message.prompt
        }, '*');
      }
      return false;
    });
  }
})();

