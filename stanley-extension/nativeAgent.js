/**
 * nativeAgent.js — browser-native drop-in for the Playwright `foundationAgent`.
 *
 * This is the keystone of the daemon-free architecture. `branchingEngine.executeGraph`
 * is agent-agnostic: it only ever calls navigate / click / type / scrapeContent /
 * waitForSelector / clickByNaturalLocator / typeByNaturalLocator / isPageBlocked /
 * elementExists / openTab / switchTab / closeTab / wait. Implement that exact surface
 * here against chrome.debugger (CDP) + content.js, and the ENTIRE existing branching
 * engine runs unchanged inside the service worker — no Playwright, no native host.
 *
 * Clicks/types use CDP for isTrusted input (beats bot detection); element resolution
 * and React-safe value injection happen in content.js. Cross-origin iframes are
 * addressed by routing CDP to the owning frame's target (best-effort, see cdpDriver).
 *
 * Loaded via importScripts; exposes `self.StanleyNativeAgent` and relies on
 * `self.StanleyCDP`.
 */

(function () {
  const CDP = self.StanleyCDP;

  function tabsSend(tabId, frameId, msg) {
    return new Promise((resolve) => {
      const opts = frameId == null ? {} : { frameId };
      chrome.tabs.sendMessage(tabId, msg, opts, (resp) => {
        if (chrome.runtime.lastError) return resolve(null); // no listener in that frame
        resolve(resp);
      });
    });
  }

  function getFrames(tabId) {
    return new Promise((resolve) => {
      chrome.webNavigation.getAllFrames({ tabId }, (frames) => {
        if (chrome.runtime.lastError || !frames) return resolve([{ frameId: 0 }]);
        resolve(frames);
      });
    });
  }

  function waitTabComplete(tabId, timeout = 30000) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (fn, arg) => { if (!done) { done = true; cleanup(); fn(arg); } };
      const onUpdated = (id, info) => {
        if (id === tabId && info.status === 'complete') finish(resolve);
      };
      const timer = setTimeout(() => finish(resolve), timeout); // resolve anyway; SPA may never "complete"
      function cleanup() {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
      }
      chrome.tabs.onUpdated.addListener(onUpdated);
      // In case it's already complete:
      chrome.tabs.get(tabId, (t) => {
        if (chrome.runtime.lastError) return finish(reject, new Error('Tab closed'));
        if (t && t.status === 'complete') finish(resolve);
      });
    });
  }

  /** Wait until content.js answers a ping in the top frame (injection settled). */
  async function waitContentReady(tabId, timeout = 8000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const resp = await tabsSend(tabId, 0, { ns: 'stanley', cmd: 'ping' });
      if (resp && resp.ok) return true;
      await new Promise((r) => setTimeout(r, 150));
    }
    return false; // content script may be blocked on this page (chrome://, store, etc.)
  }

  class StanleyNativeAgent {
    constructor(config = {}) {
      this.onLog = config.onLog || (() => {});
      this.activeTabId = config.tabId;
      // Stable tab identity, mirroring foundationAgent.enhanced's Map approach.
      this.tabs = new Map(); // id -> { tabId, label }
      this.tabCounter = 1;
      this.fallbackToDispatch = !!config.fallbackToDispatch;
    }

    async initialize() {
      if (this.activeTabId == null) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) throw new Error('No active tab to drive.');
        this.activeTabId = tab.id;
      }
      const id = `tab-${this.tabCounter++}`;
      this.tabs.set(id, { tabId: this.activeTabId, label: 'main' });
      // Attach the debugger once for the whole run (single banner, not per-action).
      try {
        await CDP.attach(this.activeTabId);
      } catch (err) {
        throw new Error(
          /already attached|another debugger/i.test(err.message)
            ? 'Stanley needs the debugger but DevTools is open on this tab. Close DevTools and retry.'
            : `Could not start secure input mode: ${err.message}`
        );
      }
      await waitContentReady(this.activeTabId).catch(() => {});
    }

    // ── Element-locating message helpers ───────────────────────────────────────────
    // Try the top frame first, then any child frame, returning the first that owns the
    // element along with the frameId so CDP can be routed correctly.
    async _locateAcrossFrames(cmd, payload) {
      const top = await tabsSend(this.activeTabId, 0, { ns: 'stanley', cmd, ...payload });
      if (top && top.found) return { ...top, frameId: 0 };

      const frames = await getFrames(this.activeTabId);
      for (const f of frames) {
        if (f.frameId === 0) continue;
        const resp = await tabsSend(this.activeTabId, f.frameId, { ns: 'stanley', cmd, ...payload });
        if (resp && resp.found) return { ...resp, frameId: f.frameId };
      }
      return null;
    }

    // ── Core interface used by branchingEngine.executeGraph ─────────────────────────
    async navigate(url, timeout = 30000) {
      this.onLog(`[native] navigate → ${url}`);
      await chrome.tabs.update(this.activeTabId, { url });
      await waitTabComplete(this.activeTabId, timeout);
      await waitContentReady(this.activeTabId).catch(() => {});
    }

    async wait(ms) {
      // Chunk long waits and ping the page each chunk. The ping is a message the
      // service worker sends+receives, which resets its idle timer so a 60s `wait`
      // node can't get the worker killed mid-run.
      const CHUNK = 20000;
      let remaining = ms;
      while (remaining > 0) {
        const slice = Math.min(CHUNK, remaining);
        await new Promise((r) => setTimeout(r, slice));
        remaining -= slice;
        if (remaining > 0) await tabsSend(this.activeTabId, 0, { ns: 'stanley', cmd: 'ping' });
      }
    }

    async waitForSelector(selector, timeout = 10000) {
      const top = await tabsSend(this.activeTabId, 0, { ns: 'stanley', cmd: 'waitSelector', selector, timeout });
      if (top && top.found) return;
      // Try child frames before giving up.
      const frames = await getFrames(this.activeTabId);
      for (const f of frames) {
        if (f.frameId === 0) continue;
        const resp = await tabsSend(this.activeTabId, f.frameId, { ns: 'stanley', cmd: 'waitSelector', selector, timeout: 1000 });
        if (resp && resp.found) return;
      }
      throw new Error(`Timed out waiting for selector "${selector}".`);
    }

    async click(selector) {
      const loc = await this._locateAcrossFrames('locateClick', { selector });
      if (!loc) {
        if (this.fallbackToDispatch) return this._fallbackClick({ selector });
        throw new Error(`Element not found for click: "${selector}".`);
      }
      await CDP.clickAt(this.activeTabId, loc.x, loc.y, { url: loc.frameUrl, isTop: loc.isTop });
    }

    async clickByNaturalLocator(description) {
      const loc = await this._locateAcrossFrames('locateClick', { description });
      if (!loc) {
        if (this.fallbackToDispatch) return this._fallbackClick({ description });
        return false;
      }
      await CDP.clickAt(this.activeTabId, loc.x, loc.y, { url: loc.frameUrl, isTop: loc.isTop });
      return true;
    }

    async type(selector, text) {
      await this._typeImpl({ selector }, text);
    }

    async typeByNaturalLocator(description, text) {
      try {
        await this._typeImpl({ description }, text);
        return true;
      } catch (_) {
        return false;
      }
    }

    async _typeImpl(payload, text) {
      const loc = await this._locateAcrossFrames('locateType', payload);
      if (!loc) throw new Error(`Input not found: ${JSON.stringify(payload)}`);
      const frame = { url: loc.frameUrl, isTop: loc.isTop };
      // 1) isTrusted focus via CDP (satisfies validators that gate on real focus).
      await CDP.focusAt(this.activeTabId, loc.x, loc.y, frame);
      // 2) React/Vue/Angular-safe value injection in the owning frame.
      const set = await tabsSend(this.activeTabId, loc.frameId, { ns: 'stanley', cmd: 'setValue', ...payload, value: text });
      if (!set || !set.found) throw new Error(`Could not set value for ${JSON.stringify(payload)}`);
    }

    async scrapeContent(selector) {
      const resp = await tabsSend(this.activeTabId, 0, { ns: 'stanley', cmd: 'scrape', selector });
      return resp && resp.text ? resp.text : '';
    }

    async isPageBlocked() {
      const frames = await getFrames(this.activeTabId);
      for (const f of frames) {
        const resp = await tabsSend(this.activeTabId, f.frameId, { ns: 'stanley', cmd: 'isBlocked' });
        if (resp && resp.blocked) return { blocked: true, hint: resp.hint };
      }
      return { blocked: false, hint: '' };
    }

    async elementExists(description) {
      const top = await tabsSend(this.activeTabId, 0, { ns: 'stanley', cmd: 'exists', description, wantInput: false });
      if (top && top.exists) return true;
      const frames = await getFrames(this.activeTabId);
      for (const f of frames) {
        if (f.frameId === 0) continue;
        const resp = await tabsSend(this.activeTabId, f.frameId, { ns: 'stanley', cmd: 'exists', description, wantInput: false });
        if (resp && resp.exists) return true;
      }
      return false;
    }

    async _fallbackClick(payload) {
      const resp = await tabsSend(this.activeTabId, 0, { ns: 'stanley', cmd: 'fallbackClick', ...payload });
      if (!resp || !resp.found) throw new Error(`Fallback click failed for ${JSON.stringify(payload)}`);
    }

    // ── Multi-tab (stable ids, mirrors foundationAgent.enhanced) ────────────────────
    _resolveTabId(ref) {
      if (ref == null) return this.activeTabId;
      // numeric → positional (back-compat with index-based workflows)
      if (typeof ref === 'number') {
        const entry = Array.from(this.tabs.values())[ref];
        if (!entry) throw new Error(`No tab at position ${ref}.`);
        return entry.tabId;
      }
      const byId = this.tabs.get(ref);
      if (byId) return byId.tabId;
      for (const v of this.tabs.values()) if (v.label === ref) return v.tabId;
      throw new Error(`Unknown tab "${ref}". Open tabs: ${this.describeTabs()}`);
    }

    describeTabs() {
      return Array.from(this.tabs.entries()).map(([id, v]) => `${id}(${v.label})`).join(', ') || 'none';
    }

    async openTab(url, label) {
      const tab = await chrome.tabs.create({ url: url || 'about:blank', active: false });
      await waitTabComplete(tab.id).catch(() => {});
      const id = `tab-${this.tabCounter++}`;
      this.tabs.set(id, { tabId: tab.id, label: label || id });
      return id;
    }

    async switchTab(ref) {
      const tabId = this._resolveTabId(ref);
      // Move the debugger banner to the newly-active tab.
      if (tabId !== this.activeTabId) {
        try { await CDP.attach(tabId); } catch (_) { /* may already be attached */ }
        await CDP.detach(this.activeTabId);
        this.activeTabId = tabId;
        await chrome.tabs.update(tabId, { active: true });
        await waitContentReady(tabId).catch(() => {});
      }
      const entry = Array.from(this.tabs.entries()).find(([, v]) => v.tabId === tabId);
      return { id: entry ? entry[0] : 'tab', tabId };
    }

    async closeTab(ref) {
      const tabId = this._resolveTabId(ref);
      const entry = Array.from(this.tabs.entries()).find(([, v]) => v.tabId === tabId);
      if (entry) this.tabs.delete(entry[0]);
      await CDP.detach(tabId).catch(() => {});
      await chrome.tabs.remove(tabId).catch(() => {});
      if (tabId === this.activeTabId) {
        const next = this.tabs.values().next().value;
        this.activeTabId = next ? next.tabId : null;
      }
    }

    async saveState() { /* cookies/storage persist in the user's real browser — nothing to do */ }

    async cleanup() {
      // Drop every debugger session we may hold (clears the banner).
      for (const v of this.tabs.values()) {
        await CDP.detachAll(v.tabId).catch(() => {});
      }
      if (this.activeTabId != null) await CDP.detachAll(this.activeTabId).catch(() => {});
      this.tabs.clear();
    }
  }

  self.StanleyNativeAgent = StanleyNativeAgent;
})();
