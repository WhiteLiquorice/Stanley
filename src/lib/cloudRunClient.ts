import { getFreshIdToken } from './firebaseAuth';

export type RunStatus =
  | 'queued' | 'pending_approval' | 'approved' | 'running' | 'retrying'
  | 'cancel_requested' | 'waiting' | 'completed' | 'failed' | 'cancelled';

export interface CloudRunRecord {
  id: string;
  workflowId: string;
  workflowName: string;
  state: RunStatus;
  status: string;
  logs: string[];
  scraped?: unknown;
  error?: string;
  wait?: { type?: string; nodeId?: string; reason?: string };
}

export interface CloudRunResult {
  success: boolean;
  runId: string;
  status: RunStatus;
  logs: string[];
  scraped?: unknown;
  error?: string;
  paused?: boolean;
  wait?: CloudRunRecord['wait'];
}

const baseUrl = (import.meta.env.VITE_RUNNER_URL as string | undefined)?.replace(/\/$/, '');
const terminal = new Set<RunStatus>(['pending_approval', 'waiting', 'completed', 'failed', 'cancelled']);

async function request(path: string, init: RequestInit = {}): Promise<{ success: boolean; run: CloudRunRecord }> {
  if (!baseUrl) throw new Error('Cloud runner is not configured.');
  const token = await getFreshIdToken();
  if (!token) throw new Error('You must be signed in to run workflows.');
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Runner error: ${response.status}`);
  return payload;
}

function toResult(run: CloudRunRecord): CloudRunResult {
  return {
    success: run.state === 'completed', runId: run.id, status: run.state,
    logs: run.logs || [], scraped: run.scraped, error: run.error,
    paused: run.state === 'pending_approval' || run.state === 'waiting',
    wait: run.wait,
  };
}

export function isCloudRunnerConfigured(): boolean { return Boolean(baseUrl); }

export async function getRun(runId: string): Promise<CloudRunRecord> {
  return (await request(`/v1/runs/${encodeURIComponent(runId)}`)).run;
}

export async function waitForRun(runId: string, timeoutMs = 10 * 60 * 1000): Promise<CloudRunResult> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await getRun(runId);
    if (terminal.has(run.state)) return toResult(run);
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }
  throw new Error('Run remains active and is available in run history.');
}

export async function runWorkflowById(workflowId: string, input: Record<string, unknown> = {}): Promise<CloudRunResult> {
  const payload = await request(`/v1/workflows/${encodeURIComponent(workflowId)}/runs`, {
    method: 'POST', headers: { 'X-Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ input }),
  });
  return terminal.has(payload.run.state) ? toResult(payload.run) : waitForRun(payload.run.id);
}

export async function decideRun(runId: string, decision: 'approve' | 'reject'): Promise<CloudRunResult> {
  const payload = await request(`/v1/runs/${encodeURIComponent(runId)}/approval`, {
    method: 'POST', body: JSON.stringify({ decision }),
  });
  return terminal.has(payload.run.state) ? toResult(payload.run) : waitForRun(payload.run.id);
}

export async function cancelRun(runId: string): Promise<CloudRunResult> {
  const payload = await request(`/v1/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST', body: '{}' });
  return toResult(payload.run);
}
