/**
 * stanleyRunner.ts — client for the cloud headless runner (Cloud Run).
 *
 * Sends a workflow + vault secrets to the runner service, which executes it
 * with Playwright server-side and returns the log lines when finished.
 *
 * The runner URL is configured at build time via VITE_RUNNER_URL.
 */

import { getFreshIdToken } from './firebaseAuth';

const RUNNER_URL = (import.meta.env.VITE_RUNNER_URL as string | undefined)?.replace(/\/$/, '') || window.location.origin;

export interface HeadlessRunResult {
  success: boolean;
  logs: string[];
  scraped?: unknown;
  error?: string;
}

/** True when a cloud runner URL is configured for this build. */
export function isHeadlessConfigured(): boolean {
  return true;
}

/**
 * Execute a workflow headless in the cloud. Resolves with logs + result.
 * Rejects only on transport/auth failure; a failed *run* resolves with
 * { success: false, error, logs }.
 */
export async function runHeadless(
  workflow: object,
  secrets: Record<string, string>
): Promise<HeadlessRunResult> {

  const token = await getFreshIdToken();
  if (!token) throw new Error('You must be signed in to run workflows.');

  const res = await fetch(`${RUNNER_URL}/run`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ workflow, secrets }),
  });

  if (res.status === 401) throw new Error('Authentication failed. Please sign in again.');
  if (res.status === 403) throw new Error('No active Stanley license found for your account.');
  if (!res.ok) throw new Error(`Runner error: ${res.status}`);

  return (await res.json()) as HeadlessRunResult;
}
