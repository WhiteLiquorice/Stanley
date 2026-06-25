/**
 * tokenManager.js (Claude-additions) — extension-side Firebase token refresh.
 *
 * Fixes #4: the original popup.js stored only `idToken` from signInWithPassword and
 * threw away the `refreshToken`. Firebase ID tokens expire after 1 hour, after which
 * every Gemini call (callStanleyAI) and Firestore license check 401s with no recovery.
 *
 * This module persists the refresh token + expiry and transparently mints a fresh
 * ID token via the Secure Token API when the current one is near expiry.
 *
 * Load as a CLASSIC script (no bundler) BEFORE popup.js, and `importScripts` it in
 * background.js. It attaches `StanleyAuth` to the global (window or service worker self).
 *
 *   <!-- popup.html -->  <script src="../Claude-additions/tokenManager.js"></script>
 *   // background.js (top)  importScripts('../Claude-additions/tokenManager.js');
 */
(function (global) {
  const FIREBASE_API_KEY = 'AIzaSyCwyyfUU3DEJAFNFoILSbT2CH8oaNMrVlk';
  const FIREBASE_PROJECT_ID = 'bridgeway-db29e';
  // Refresh when the token has under this much life left (Firebase tokens last 3600s).
  const REFRESH_SKEW_MS = 5 * 60 * 1000;

  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }
  function storageSet(obj) {
    return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
  }

  /**
   * Persist the response from accounts:signInWithPassword (or :signUp).
   * Stores the refresh token and an absolute expiry so we can refresh later.
   */
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

  /** Calls the Secure Token API to exchange the refresh token for a new ID token. */
  async function refreshIdToken(refreshToken) {
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    });
    if (!res.ok) {
      throw new Error(`Token refresh failed (${res.status}). Please sign in again.`);
    }
    const data = await res.json();
    const expiresInSec = parseInt(data.expires_in || '3600', 10);
    await storageSet({
      idToken: data.id_token,
      refreshToken: data.refresh_token,
      tokenExpiresAt: Date.now() + expiresInSec * 1000,
    });
    return data.id_token;
  }

  /**
   * Returns a valid ID token, refreshing first if it is expired or about to be.
   * Returns '' if the user has no stored session.
   */
  async function getFreshIdToken() {
    const data = await storageGet(['idToken', 'refreshToken', 'tokenExpiresAt']);
    if (!data.idToken) return '';
    const expiresAt = data.tokenExpiresAt || 0;
    if (Date.now() < expiresAt - REFRESH_SKEW_MS) {
      return data.idToken; // still good
    }
    if (data.refreshToken) {
      try {
        return await refreshIdToken(data.refreshToken);
      } catch (e) {
        console.warn('[StanleyAuth] Refresh failed:', e.message);
        return data.idToken; // hand back the stale one; caller will surface the auth error
      }
    }
    return data.idToken;
  }

  /**
   * Bundle forwarded to the daemon so it can ALSO self-refresh during long runs.
   * (The daemon uses refreshToken + apiKey to re-mint tokens mid-workflow.)
   */
  async function getAuthBundle() {
    const idToken = await getFreshIdToken();
    const data = await storageGet(['refreshToken']);
    return { idToken, refreshToken: data.refreshToken || '', apiKey: FIREBASE_API_KEY };
  }

  /** Persist tokens the daemon rotated back to us via its `token_refreshed` message. */
  async function adoptDaemonRefresh(idToken, refreshToken) {
    const patch = { idToken };
    if (refreshToken) patch.refreshToken = refreshToken;
    // We don't know the exact expiry the daemon got; assume a full hour.
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

  global.StanleyAuth = {
    FIREBASE_API_KEY,
    FIREBASE_PROJECT_ID,
    saveLoginResponse,
    refreshIdToken,
    getFreshIdToken,
    getAuthBundle,
    adoptDaemonRefresh,
    clearAuth,
  };
})(typeof self !== 'undefined' ? self : this);
