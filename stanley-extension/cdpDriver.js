/**
 * cdpDriver.js — Chrome DevTools Protocol wrapper for Stanley's browser-native engine.
 * ES module. Exports: StanleyCDP.
 */

const PROTOCOL_VERSION = '1.3';

// tabId -> { count }
const attachments = new Map();
// tabId -> Map<frameUrl, targetId>
const frameTargets = new Map();

function attachDebuggee(tabId) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, PROTOCOL_VERSION, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

function detachDebuggee(tabId) {
  return new Promise((resolve) => {
    chrome.debugger.detach({ tabId }, () => {
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

async function attach(tabId) {
  const existing = attachments.get(tabId);
  if (existing) { existing.count += 1; return; }
  await attachDebuggee(tabId);
  attachments.set(tabId, { count: 1 });
}

async function detach(tabId) {
  const existing = attachments.get(tabId);
  if (!existing) return;
  existing.count -= 1;
  if (existing.count > 0) return;
  attachments.delete(tabId);
  frameTargets.delete(tabId);
  await detachDebuggee(tabId);
}

async function detachAll(tabId) {
  attachments.delete(tabId);
  frameTargets.delete(tabId);
  await detachDebuggee(tabId);
}

function isAttached(tabId) {
  return attachments.has(tabId);
}

async function refreshFrameTargets(tabId) {
  const map = new Map();
  try {
    const { targetInfos } = await sendCommand({ tabId }, 'Target.getTargets', {});
    for (const info of targetInfos || []) {
      if (info.type === 'iframe' && info.url) map.set(info.url, info.targetId);
    }
  } catch (_) { /* Target domain unavailable */ }
  frameTargets.set(tabId, map);
  return map;
}

async function debuggeeForFrame(tabId, frameUrl, isTop) {
  if (isTop || !frameUrl) return { tabId };
  let map = frameTargets.get(tabId);
  if (!map || !map.has(frameUrl)) map = await refreshFrameTargets(tabId);
  const targetId = map.get(frameUrl);
  if (!targetId) return { tabId };
  try {
    const { sessionId } = await sendCommand({ tabId }, 'Target.attachToTarget', { targetId, flatten: true });
    return { tabId, sessionId };
  } catch (_) {
    return { tabId };
  }
}

async function clickAt(tabId, x, y, frame) {
  const target = frame ? await debuggeeForFrame(tabId, frame.url, frame.isTop) : { tabId };
  const base = { x, y, button: 'left', clickCount: 1 };
  await sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
  await sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
}

async function focusAt(tabId, x, y, frame) {
  await clickAt(tabId, x, y, frame);
}

async function insertText(tabId, text, frame) {
  const target = frame ? await debuggeeForFrame(tabId, frame.url, frame.isTop) : { tabId };
  await sendCommand(target, 'Input.insertText', { text });
}

async function pressKey(tabId, key, frame) {
  const target = frame ? await debuggeeForFrame(tabId, frame.url, frame.isTop) : { tabId };
  const keyMap = {
    Enter:  { keyCode: 13, code: 'Enter',  key: 'Enter'  },
    Tab:    { keyCode: 9,  code: 'Tab',    key: 'Tab'    },
    Escape: { keyCode: 27, code: 'Escape', key: 'Escape' },
  };
  const k = keyMap[key];
  if (!k) return;
  await sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: k.keyCode, code: k.code, key: k.key });
  await sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyUp',   windowsVirtualKeyCode: k.keyCode, code: k.code, key: k.key });
}

export const StanleyCDP = {
  attach, detach, detachAll, isAttached,
  clickAt, focusAt, insertText, pressKey,
  refreshFrameTargets,
};
