import { getFreshIdToken } from '../../src/lib/firebaseAuth';
const baseUrl = (import.meta.env.VITE_RUNNER_URL as string | undefined)?.replace(/\/$/, '');
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> { if (!baseUrl) throw new Error('Cloud runner is not configured.'); const token = await getFreshIdToken(); if (!token) throw new Error('You must be signed in.'); const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`); return payload; }
export const post = <T,>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const remove = (path: string) => api<void>(path, { method: 'DELETE' });
