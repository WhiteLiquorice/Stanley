/**
 * tokenManager.js — extension-side Firebase token refresh.
 * ES module. Exports: StanleyAuth object.
 */

const FIREBASE_API_KEY = 'AIzaSyCwyyfUU3DEJAFNFoILSbT2CH8oaNMrVlk';
const FIREBASE_PROJECT_ID = 'bridgeway-db29e';
const REFRESH_SKEW_MS = 5 * 60 * 1000;

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}
function storageSet(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

async function saveLoginResponse(authData, extra = {}) {
  const expiresInSec = parseInt(authData.expiresIn || '3600', 10);
  await storageSet({
    uid: authData.localId,
    idToken: authData.idToken,
    refreshToken: authData.refreshToken,
    tokenExpiresAt: Date.now() + expiresInSec * 1000,
    savedAt: Date.now(),
    ...extra,
  });
}

async function refreshIdToken(refreshToken) {
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
  });
  if (!res.ok) throw new Error(`Token refresh failed (${res.status}). Please sign in again.`);
  const data = await res.json();
  const expiresInSec = parseInt(data.expires_in || '3600', 10);
  await storageSet({
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    tokenExpiresAt: Date.now() + expiresInSec * 1000,
  });
  return data.id_token;
}

async function getFreshIdToken() {
  const data = await storageGet(['idToken', 'refreshToken', 'tokenExpiresAt']);
  if (!data.idToken) return '';
  const expiresAt = data.tokenExpiresAt || 0;
  if (Date.now() < expiresAt - REFRESH_SKEW_MS) return data.idToken;
  if (data.refreshToken) {
    try { return await refreshIdToken(data.refreshToken); }
    catch (e) {
      console.warn('[StanleyAuth] Refresh failed:', e.message);
      return data.idToken;
    }
  }
  return data.idToken;
}

async function getAuthBundle() {
  const idToken = await getFreshIdToken();
  const data = await storageGet(['refreshToken']);
  return { idToken, refreshToken: data.refreshToken || '', apiKey: FIREBASE_API_KEY };
}

async function adoptDaemonRefresh(idToken, refreshToken) {
  const patch = { idToken };
  if (refreshToken) patch.refreshToken = refreshToken;
  patch.tokenExpiresAt = Date.now() + 3600 * 1000;
  await storageSet(patch);
}

async function clearAuth() {
  return new Promise((resolve) =>
    chrome.storage.local.remove(
      ['email', 'uid', 'idToken', 'refreshToken', 'tokenExpiresAt', 'status', 'trialEndsAt', 'savedAt'],
      resolve
    )
  );
}

export const StanleyAuth = {
  FIREBASE_API_KEY,
  FIREBASE_PROJECT_ID,
  saveLoginResponse,
  refreshIdToken,
  getFreshIdToken,
  getAuthBundle,
  adoptDaemonRefresh,
  clearAuth,
};

// Expose as a global so popup.js (classic script) can access it without being a module.
if (typeof window !== 'undefined') window.StanleyAuth = StanleyAuth;
