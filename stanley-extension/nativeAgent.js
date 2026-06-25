/**
 * nativeAgent.js — browser-native drop-in for the Playwright foundationAgent.
 * ES module. Exports: StanleyNativeAgent class.
 */

import { StanleyCDP } from './cdpDriver.js';

function tabsSend(tabId, frameId, msg) {
  return new Promise((resolve) => {
    const opts = frameId == null ? {} : { frameId };
    chrome.tabs.sendMessage(tabId, msg, opts, (resp) => {
      if (chrome.runtime.lastError) return resolve(null);
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
    const timer = setTimeout(() => finish(resolve), timeout);
    function cleanup() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId, (t) => {
      if (chrome.runtime.lastError) return finish(reject, new Error('Tab closed'));
      if (t && t.status === 'complete') finish(resolve);
    });
  });
}

async function waitContentReady(tabId, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const resp = await tabsSend(tabId, 0, { ns: 'stanley', cmd: 'ping' });
    if (resp && resp.ok) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

export class StanleyNativeAgent {
  constructor(config = {}) {
    this.onLog = config.onLog || (() => {});
    this.activeTabId = config.tabId;
    this.tabs = new Map();
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
    try {
      await StanleyCDP.attach(this.activeTabId);
    } catch (err) {
      throw new Error(
        /already attached|another debugger/i.test(err.message)
          ? 'Stanley needs the debugger but DevTools is open on this tab. Close DevTools and retry.'
          : `Could not start secure input mode: ${err.message}`
      );
    }
    await waitContentReady(this.activeTabId).catch(() => {});
  }

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

  async navigate(url, timeout = 30000) {
    this.onLog(`[native] navigate → ${url}`);
    await chrome.tabs.update(this.activeTabId, { url });
    await waitTabComplete(this.activeTabId, timeout);
    await waitContentReady(this.activeTabId).catch(() => {});
  }

  async wait(ms) {
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
    await StanleyCDP.clickAt(this.activeTabId, loc.x, loc.y, { url: loc.frameUrl, isTop: loc.isTop });
  }

  async clickByNaturalLocator(description) {
    const loc = await this._locateAcrossFrames('locateClick', { description });
    if (!loc) {
      if (this.fallbackToDispatch) return this._fallbackClick({ description });
      return false;
    }
    await StanleyCDP.clickAt(this.activeTabId, loc.x, loc.y, { url: loc.frameUrl, isTop: loc.isTop });
    return true;
  }

  async type(selector, text) { await this._typeImpl({ selector }, text); }

  async typeByNaturalLocator(description, text) {
    try { await this._typeImpl({ description }, text); return true; }
    catch (_) { return false; }
  }

  async _typeImpl(payload, text) {
    const loc = await this._locateAcrossFrames('locateType', payload);
    if (!loc) throw new Error(`Input not found: ${JSON.stringify(payload)}`);
    const frame = { url: loc.frameUrl, isTop: loc.isTop };
    await StanleyCDP.focusAt(this.activeTabId, loc.x, loc.y, frame);
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

  _resolveTabId(ref) {
    if (ref == null) return this.activeTabId;
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
    if (tabId !== this.activeTabId) {
      try { await StanleyCDP.attach(tabId); } catch (_) {}
      await StanleyCDP.detach(this.activeTabId);
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
    await StanleyCDP.detach(tabId).catch(() => {});
    await chrome.tabs.remove(tabId).catch(() => {});
    if (tabId === this.activeTabId) {
      const next = this.tabs.values().next().value;
      this.activeTabId = next ? next.tabId : null;
    }
  }

  async saveState() { /* no-op — cookies/storage persist in the user's real browser */ }

  async cleanup() {
    for (const v of this.tabs.values()) {
      await StanleyCDP.detachAll(v.tabId).catch(() => {});
    }
    if (this.activeTabId != null) await StanleyCDP.detachAll(this.activeTabId).catch(() => {});
    this.tabs.clear();
  }
}
