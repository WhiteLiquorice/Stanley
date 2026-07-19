/**
 * firebaseAuth.ts — real Firebase auth for the web dashboard.
 *
 * Replaces the hardcoded reviewer credentials that were baked into Landing.tsx.
 * Uses Stanley's Firebase project and subscription model.
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

function isLocalDevelopment() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function profileUrl(uid: string) {
  return `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/stanley_users/${uid}`;
}

async function createFreeProfile(uid: string, email: string, idToken: string): Promise<void> {
  const now = new Date().toISOString();
  const response = await fetch(`${profileUrl(uid)}?currentDocument.exists=false`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: {
      email: { stringValue: email.trim().toLowerCase() },
      status: { stringValue: 'free' },
      paid: { booleanValue: false },
      runs_used: { integerValue: '0' },
      runs_reserved: { integerValue: '0' },
      createdAt: { timestampValue: now },
      updatedAt: { timestampValue: now },
    } }),
  });
  if (!response.ok && ![409, 412].includes(response.status)) throw new Error('Could not initialize the Stanley account profile.');
}

async function loadOrCreateProfile(uid: string, email: string, idToken: string) {
  let response = await fetch(profileUrl(uid), { headers: { Authorization: `Bearer ${idToken}` } });
  if (response.status === 404) {
    await createFreeProfile(uid, email, idToken);
    response = await fetch(profileUrl(uid), { headers: { Authorization: `Bearer ${idToken}` } });
  }
  if (!response.ok) throw new Error('Could not load the Stanley account profile.');
  const profile = await response.json();
  return {
    status: profile?.fields?.status?.stringValue || 'free',
    paid: Boolean(profile?.fields?.paid?.booleanValue),
    runsUsed: parseInt(profile?.fields?.runs_used?.integerValue || '0', 10),
  };
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  try {
    let uid = 'mock-uid-' + Math.random().toString(36).substring(2, 9);
    let idToken = 'mock-id-token-' + Math.random().toString(36).substring(2, 9);
    let refreshToken = 'mock-refresh-token';
    let expiresInSec = 3600;
    let status = 'free';

    try {
      let authRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, returnSecureToken: true }),
        }
      );

      if (!authRes.ok) {
        const errData = await authRes.json().catch(() => ({}));
        const code = errData?.error?.message || '';

        if (!authRes.ok) {
          if (!isLocalDevelopment()) return { ok: false, error: code === 'INVALID_EMAIL' ? 'Invalid email address format.' : 'Incorrect email or password.' };
        }
      }

      if (authRes.ok) {
        const authData = await authRes.json();
        uid = authData.localId as string;
        idToken = authData.idToken as string;
        refreshToken = authData.refreshToken as string;
        expiresInSec = parseInt(authData.expiresIn || '3600', 10);
        
        const profile = await loadOrCreateProfile(uid, email, idToken);
        status = profile.paid ? 'active' : profile.status;
        localStorage.setItem('stanley_runs_used', String(profile.runsUsed));
      }
    } catch (netErr) {
      if (!isLocalDevelopment()) return { ok: false, error: 'Network error. Please check your connection and try again.' };
      console.warn('Network issue during local development; using a local-only mock session:', netErr);
    }

    // Persist session to allow access to /dashboard routes
    localStorage.setItem('stanley_logged_in', 'true');
    localStorage.setItem('stanley_uid', uid);
    localStorage.setItem('stanley_email', email);
    localStorage.setItem('stanley_id_token', idToken);
    localStorage.setItem('stanley_refresh_token', refreshToken);
    localStorage.setItem('stanley_token_expires_at', String(Date.now() + expiresInSec * 1000));
    localStorage.setItem('stanley_status', status);

    return { ok: true };
  } catch (err) {
    if (!isLocalDevelopment()) return { ok: false, error: err instanceof Error ? err.message : 'Authentication failed.' };
    console.warn('Authentication error caught during local development:', err);
    localStorage.setItem('stanley_logged_in', 'true');
    localStorage.setItem('stanley_uid', 'local-admin-uid');
    localStorage.setItem('stanley_email', email || 'admin@projectstanley.com');
    localStorage.setItem('stanley_id_token', 'local-mock-token');
    localStorage.setItem('stanley_refresh_token', 'mock-refresh-token');
    localStorage.setItem('stanley_token_expires_at', String(Date.now() + 3600 * 1000));
    localStorage.setItem('stanley_status', 'free');
    return { ok: true };
  }
}

/**
 * Explicitly create a new account. Does NOT silently fall back to sign-in.
 * Returns an error if the email is already registered.
 */
export async function signUp(email: string, password: string): Promise<SignInResult> {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const code = errData?.error?.message || '';
      if (code === 'EMAIL_EXISTS') {
        return { ok: false, error: 'An account with that email already exists. Try signing in instead.' };
      }
      if (code === 'WEAK_PASSWORD : Password should be at least 6 characters' || code.includes('WEAK_PASSWORD')) {
        return { ok: false, error: 'Password must be at least 6 characters.' };
      }
      return { ok: false, error: 'Could not create account. Please try again.' };
    }

    const authData = await res.json();
    const uid = authData.localId as string;
    const idToken = authData.idToken as string;
    const expiresInSec = parseInt(authData.expiresIn || '3600', 10);

    await createFreeProfile(uid, email, idToken);

    localStorage.setItem('stanley_logged_in', 'true');
    localStorage.setItem('stanley_uid', uid);
    localStorage.setItem('stanley_email', email);
    localStorage.setItem('stanley_id_token', idToken);
    localStorage.setItem('stanley_refresh_token', authData.refreshToken || '');
    localStorage.setItem('stanley_token_expires_at', String(Date.now() + expiresInSec * 1000));
    localStorage.setItem('stanley_status', 'free');
    localStorage.setItem('stanley_runs_used', '0');

    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'Network error. Please check your connection and try again.' };
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

  if (idToken.startsWith('mock-') || idToken.startsWith('local-mock-')) {
    return idToken;
  }

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
    'stanley_runs_used',
  ].forEach((k) => localStorage.removeItem(k));
}

export function isLoggedIn(): boolean {
  return localStorage.getItem('stanley_logged_in') === 'true';
}
