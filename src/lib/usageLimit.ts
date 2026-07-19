/** Free-tier usage display. Enforcement happens atomically in the cloud runner. */
import { getFreshIdToken } from './firebaseAuth';

export const FREE_RUN_LIMIT = 10;
const PROJECT_ID = 'bridgeway-db29e';

function firestoreUrl(uid: string) {
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/stanley_users/${uid}`;
}

function maskToken(token: string) {
  return token.startsWith('mock-') || token.startsWith('local-mock-');
}

export interface UsageStatus {
  isPaid: boolean;
  runsUsed: number;
  remaining: number;
}

export async function getUsageStatus(): Promise<UsageStatus> {
  const uid = localStorage.getItem('stanley_uid') || '';
  const token = await getFreshIdToken();
  if (token && !maskToken(token) && uid && !uid.startsWith('mock-') && !uid.startsWith('local-')) {
    try {
      const response = await fetch(firestoreUrl(uid), { headers: { Authorization: `Bearer ${token}` } });
      if (response.ok) {
        const data = await response.json();
        const status = data?.fields?.status?.stringValue || 'free';
        const isPaid = Boolean(data?.fields?.paid?.booleanValue) || status === 'active';
        const runsUsed = parseInt(data?.fields?.runs_used?.integerValue || '0', 10);
        localStorage.setItem('stanley_runs_used', String(runsUsed));
        localStorage.setItem('stanley_status', isPaid ? 'active' : status);
        return { isPaid, runsUsed, remaining: isPaid ? Infinity : Math.max(0, FREE_RUN_LIMIT - runsUsed) };
      }
    } catch {
      // The cached value is display-only; the server remains authoritative.
    }
  }

  const status = localStorage.getItem('stanley_status') || 'free';
  const runsUsed = parseInt(localStorage.getItem('stanley_runs_used') || '0', 10);
  const isPaid = status === 'active';
  return { isPaid, runsUsed, remaining: isPaid ? Infinity : Math.max(0, FREE_RUN_LIMIT - runsUsed) };
}

/** @deprecated Usage can no longer be changed by browser code. */
export async function incrementRunCount(): Promise<void> {
  return Promise.resolve();
}
