/**
 * firebaseAuth.ts — real Firebase auth for the web dashboard.
 *
 * Replaces the hardcoded reviewer credentials that were baked into Landing.tsx.
 * Uses the same Firebase project + license model as the Chrome extension
 * (Identity Toolkit for sign-in, Firestore `stanley_users/{uid}` for license
 * status), via REST so no SDK dependency is needed.
 *
 * Tokens are stored in localStorage along with the existing `stanley_logged_in`
 * flag that ProtectedRoute checks, so routing keeps working unchanged.
 */

const FIREBASE_API_KEY = 'AIzaSyCwyyfUU3DEJAFNFoILSbT2CH8oaNMrVlk';
const FIREBASE_PROJECT_ID = 'bridgeway-db29e';

export interface SignInResult {
  ok: boolean;
  error?: string;
}

/** Only an `active` paid license may use the dashboard (mirrors the extension). */
function licenseIsValid(status: string): boolean {
  return status === 'active';
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  try {
    const authRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );

    if (!authRes.ok) {
      const errData = await authRes.json().catch(() => ({}));
      const code = errData?.error?.message || 'Authentication failed.';
      return { ok: false, error: code.replace(/_/g, ' ') };
    }

    const authData = await authRes.json();
    const uid = authData.localId as string;
    const idToken = authData.idToken as string;
    const expiresInSec = parseInt(authData.expiresIn || '3600', 10);

    // License check
    const dbRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/stanley_users/${uid}`,
      { headers: { Authorization: `Bearer ${idToken}` } }
    );
    if (!dbRes.ok) {
      return { ok: false, error: 'License details not found. Register on the website first.' };
    }
    const dbData = await dbRes.json();
    const status = dbData?.fields?.status?.stringValue || 'inactive';
    if (!licenseIsValid(status)) {
      return { ok: false, error: 'License inactive. Purchase a license to access.' };
    }

    localStorage.setItem('stanley_logged_in', 'true');
    localStorage.setItem('stanley_uid', uid);
    localStorage.setItem('stanley_email', email);
    localStorage.setItem('stanley_id_token', idToken);
    localStorage.setItem('stanley_refresh_token', authData.refreshToken || '');
    localStorage.setItem('stanley_token_expires_at', String(Date.now() + expiresInSec * 1000));
    localStorage.setItem('stanley_status', status);

    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// Refresh when under this much token life remains (Firebase tokens last 3600s).
const REFRESH_SKEW_MS = 5 * 60 * 1000;

/**
 * Returns a valid ID token, transparently refreshing via the Secure Token API when
 * the stored one is expired/near-expiry. Returns null if there is no usable session
 * (no token, or refresh failed on an already-expired token) — callers should sign out.
 */
export async function getFreshIdToken(): Promise<string | null> {
  const idToken = localStorage.getItem('stanley_id_token');
  if (!idToken) return null;

  const expiresAt = parseInt(localStorage.getItem('stanley_token_expires_at') || '0', 10);
  if (Date.now() < expiresAt - REFRESH_SKEW_MS) {
    return idToken; // still fresh
  }

  const refreshToken = localStorage.getItem('stanley_refresh_token');
  if (!refreshToken) {
    return Date.now() < expiresAt ? idToken : null;
  }

  try {
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    });
    if (!res.ok) {
      return Date.now() < expiresAt ? idToken : null;
    }
    const data = await res.json();
    const expiresInSec = parseInt(data.expires_in || '3600', 10);
    localStorage.setItem('stanley_id_token', data.id_token);
    localStorage.setItem('stanley_refresh_token', data.refresh_token || refreshToken);
    localStorage.setItem('stanley_token_expires_at', String(Date.now() + expiresInSec * 1000));
    return data.id_token;
  } catch {
    return Date.now() < expiresAt ? idToken : null;
  }
}

export function signOut(): void {
  [
    'stanley_logged_in',
    'stanley_uid',
    'stanley_email',
    'stanley_id_token',
    'stanley_refresh_token',
    'stanley_token_expires_at',
    'stanley_status',
  ].forEach((k) => localStorage.removeItem(k));
}

export function isLoggedIn(): boolean {
  return localStorage.getItem('stanley_logged_in') === 'true';
}
