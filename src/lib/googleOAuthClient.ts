import { getFreshIdToken } from './firebaseAuth';

const baseUrl = (import.meta.env.VITE_RUNNER_URL as string | undefined)?.replace(/\/$/, '');

async function request(path: string, init: RequestInit = {}) {
  if (!baseUrl) throw new Error('Cloud runner is not configured.');
  const token = await getFreshIdToken();
  if (!token) throw new Error('Sign in before connecting Google.');
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Google connection request failed.');
  return payload;
}

export interface GoogleConnectionStatus { configured: boolean; connected: boolean; scopes?: string[]; updatedAt?: string | null }
export async function getGoogleConnection(): Promise<GoogleConnectionStatus> { return request('/v1/oauth/google'); }
export async function connectGoogle(): Promise<void> { const payload = await request('/v1/oauth/google/start'); window.location.assign(payload.authorizationUrl); }
export async function disconnectGoogle(): Promise<void> { await request('/v1/oauth/google', { method: 'DELETE' }); }
