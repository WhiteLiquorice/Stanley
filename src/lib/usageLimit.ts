/**
 * usageLimit.ts — Free tier run tracking.
 *
 * Free users get FREE_RUN_LIMIT runs total, tracked in Firestore
 * `stanley_users/{uid}.runs_used`. Paid users (status === 'active' from Stripe)
 * bypass the limit entirely.
 */

import { getFreshIdToken } from './firebaseAuth';

export const FREE_RUN_LIMIT = 10;

const PROJECT_ID = 'bridgeway-db29e';

function firestoreUrl(uid: string) {
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/stanley_users/${uid}`;
}

function maskToken(tok: string) {
  return tok.startsWith('mock-') || tok.startsWith('local-mock-');
}

export interface UsageStatus {
  isPaid: boolean;
  runsUsed: number;
  remaining: number; // Infinity for paid users
}

/**
 * Returns the current usage status for the logged-in user.
 * Falls back to localStorage cache if Firestore is unreachable.
 */
export async function getUsageStatus(): Promise<UsageStatus> {
  const uid = localStorage.getItem('stanley_uid') || '';
  const token = await getFreshIdToken();

  // If we have a real token, try Firestore
  if (token && !maskToken(token) && uid && !uid.startsWith('mock-') && !uid.startsWith('local-')) {
    try {
      const res = await fetch(firestoreUrl(uid), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const status = data?.fields?.status?.stringValue || 'free';
        const runsUsed = parseInt(data?.fields?.runs_used?.integerValue || '0', 10);
        const isPaid = status === 'active';
        // Cache locally
        localStorage.setItem('stanley_runs_used', String(runsUsed));
        localStorage.setItem('stanley_status', status);
        return {
          isPaid,
          runsUsed,
          remaining: isPaid ? Infinity : Math.max(0, FREE_RUN_LIMIT - runsUsed),
        };
      }
    } catch {
      // fall through to cache
    }
  }

  // Fallback: read from localStorage
  const status = localStorage.getItem('stanley_status') || 'free';
  const runsUsed = parseInt(localStorage.getItem('stanley_runs_used') || '0', 10);
  const isPaid = status === 'active';
  return {
    isPaid,
    runsUsed,
    remaining: isPaid ? Infinity : Math.max(0, FREE_RUN_LIMIT - runsUsed),
  };
}

/**
 * Increments runs_used by 1 in Firestore and updates the localStorage cache.
 * Silently swallows errors — a failed increment should never block the user.
 */
export async function incrementRunCount(): Promise<void> {
  const uid = localStorage.getItem('stanley_uid') || '';
  const token = await getFreshIdToken();

  // Always update localStorage immediately
  const current = parseInt(localStorage.getItem('stanley_runs_used') || '0', 10);
  localStorage.setItem('stanley_runs_used', String(current + 1));

  if (!token || maskToken(token) || !uid || uid.startsWith('mock-') || uid.startsWith('local-')) {
    return; // mock session — no Firestore write needed
  }

  try {
    // Use a Firestore PATCH with field mask so we don't overwrite other fields
    await fetch(`${firestoreUrl(uid)}?updateMask.fieldPaths=runs_used`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          runs_used: { integerValue: String(current + 1) },
        },
      }),
    });
  } catch {
    // Silently ignore — localStorage is already updated
  }
}
