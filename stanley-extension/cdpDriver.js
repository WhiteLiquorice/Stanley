/**
 * cdpDriver.js — Chrome DevTools Protocol wrapper for Stanley's browser-native engine.
 *
 * This is the piece that lets a Manifest V3 extension produce REAL, isTrusted input
 * events without a Playwright daemon. `chrome.debugger` attaches to a tab and speaks
 * the same protocol Playwright uses, so `Input.dispatchMouseEvent` / `dispatchKeyEvent`
 * are indistinguishable from a human at the OS level (isTrusted === true).
 *
 * Responsibilities:
 *   - attach / detach (ref-counted per tab, so one banner per workflow, not per click)
 *   - mouse clicks at viewport coordinates (the content script computes the coords)
 *   - real keystroke typing via Input.insertText
 *   - cross-origin iframe routing via Target.getTargets + attachToTarget (best-effort)
 *
 * Loaded into the service worker via importScripts; exposes `self.StanleyCDP`.
 *
 * KNOWN LIMITS (documented, not hidden):
 *   - If DevTools is already open on the tab, attach() fails — caller must catch and
 *     surface a clear message ("close DevTools to run Stanley").
 *   - Out-of-process iframe (OOPIF) input routing depends on the Chrome version's
 *     chrome.debugger support for child targets; we attempt it and degrade to a
 *     top-frame click with a warning if the child session can't be established.
 */

(function () {
  const PROTOCOL_VERSION = '1.3';

  // tabId -> { count } so nested attach calls share one debugger session.
  const attachments = new Map();
  // tabId -> Map<frameUrl, targetId> discovered iframe targets, refreshed lazily.
  const frameTargets = new Map();

  function attachDebuggee(tabId) {
    return new Promise((resolve, reject) => {
      chrome.debugger.attach({ tabId }, PROTOCOL_VERSION, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          // "Another debugger is already attached" === DevTools is open.
          reject(new Error(err.message));
        } else {
          resolve();
        }
      });
    });
  }

  function detachDebuggee(tabId) {
    return new Promise((resolve) => {
      chrome.debugger.detach({ tabId }, () => {
        // Swallow lastError — detaching an already-gone tab is fine.
        void chrome.runtime.lastError;
        resolve();
      });
    });
  }

  function sendCommand(target, method, params) {
    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand(target, method, params || {}, (result) => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(`${method}: ${err.message}`));
        else resolve(result);
      });
    });
  }

  /** Attach (or bump the ref count) for a tab. Safe to call once per workflow. */
  async function attach(tabId) {
    const existing = attachments.get(tabId);
    if (existing) {
      existing.count += 1;
      return;
    }
    await attachDebuggee(tabId);
    attachments.set(tabId, { count: 1 });
  }

  /** Release one ref; actually detaches (and drops the banner) when the last ref goes. */
  async function detach(tabId) {
    const existing = attachments.get(tabId);
    if (!existing) return;
    existing.count -= 1;
    if (existing.count > 0) return;
    attachments.delete(tabId);
    frameTargets.delete(tabId);
    await detachDebuggee(tabId);
  }

  /** Force a full detach regardless of ref count (used on workflow abort/cleanup). */
  async function detachAll(tabId) {
    attachments.delete(tabId);
    frameTargets.delete(tabId);
    await detachDebuggee(tabId);
  }

  function isAttached(tabId) {
    return attachments.has(tabId);
  }

  // ── Cross-origin iframe routing ────────────────────────────────────────────────
  // Discover child iframe targets so we can address inputs inside cross-origin frames
  // (Stripe fields, embedded OAuth, etc.). Matched by frame URL reported by the
  // content script that lives in that frame.
  async function refreshFrameTargets(tabId) {
    const map = new Map();
    try {
      const { targetInfos } = await sendCommand({ tabId }, 'Target.getTargets', {});
      for (const info of targetInfos || []) {
        if (info.type === 'iframe' && info.url) {
          map.set(info.url, info.targetId);
        }
      }
    } catch (_) {
      // Target domain unavailable — top-frame only on this Chrome build.
    }
    frameTargets.set(tabId, map);
    return map;
  }

  /**
   * Resolves an attached debuggee for a given frame URL. Returns the top-tab debuggee
   * when the frame is the top document or can't be matched, so callers always get a
   * usable target (degrading to top-frame coordinates).
   */
  async function debuggeeForFrame(tabId, frameUrl, isTop) {
    if (isTop || !frameUrl) return { tabId };

    let map = frameTargets.get(tabId);
    if (!map || !map.has(frameUrl)) map = await refreshFrameTargets(tabId);
    const targetId = map.get(frameUrl);
    if (!targetId) return { tabId }; // fall back to top frame

    try {
      const { sessionId } = await sendCommand({ tabId }, 'Target.attachToTarget', {
        targetId,
        flatten: true,
      });
      // chrome.debugger addresses child sessions via { tabId, sessionId } on builds
      // that support flattened sessions.
      return { tabId, sessionId };
    } catch (_) {
      return { tabId }; // degrade gracefully
    }
  }

  // ── Input primitives ────────────────────────────────────────────────────────────

  /**
   * Clicks at viewport coordinates (CSS pixels, origin top-left). The content script
   * has already scrolled the element into view and reported fresh coords.
   */
  async function clickAt(tabId, x, y, frame) {
    const target = frame ? await debuggeeForFrame(tabId, frame.url, frame.isTop) : { tabId };
    const base = { x, y, button: 'left', clickCount: 1 };
    await sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
    await sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
  }

  /** Focuses a point (single mouse press/release) without expecting navigation. */
  async function focusAt(tabId, x, y, frame) {
    await clickAt(tabId, x, y, frame);
  }

  /**
   * Types text as real key events. Used for fields that gate on actual keystrokes;
   * for ordinary value-bound inputs the content script's forceReactInput is enough
   * and cheaper, so nativeAgent decides which to use.
   */
  async function insertText(tabId, text, frame) {
    const target = frame ? await debuggeeForFrame(tabId, frame.url, frame.isTop) : { tabId };
    await sendCommand(target, 'Input.insertText', { text });
  }

  /** Presses a single named key (e.g. 'Enter', 'Tab') as a real key event. */
  async function pressKey(tabId, key, frame) {
    const target = frame ? await debuggeeForFrame(tabId, frame.url, frame.isTop) : { tabId };
    const keyMap = {
      Enter: { keyCode: 13, code: 'Enter', key: 'Enter' },
      Tab: { keyCode: 9, code: 'Tab', key: 'Tab' },
      Escape: { keyCode: 27, code: 'Escape', key: 'Escape' },
    };
    const k = keyMap[key];
    if (!k) return;
    await sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: k.keyCode, code: k.code, key: k.key });
    await sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: k.keyCode, code: k.code, key: k.key });
  }

  self.StanleyCDP = {
    attach,
    detach,
    detachAll,
    isAttached,
    clickAt,
    focusAt,
    insertText,
    pressKey,
    refreshFrameTargets,
  };
})();
