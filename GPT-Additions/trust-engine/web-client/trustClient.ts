import { getFreshIdToken } from '../../../src/lib/firebaseAuth';

export type TrustExceptionState = 'open' | 'resolved' | 'dismissed';

export interface TrustException {
  id: string;
  runId: string;
  workflowId: string;
  nodeId?: string | null;
  kind: 'execution_failure' | 'assertion_failure' | string;
  severity: 'warning' | 'error';
  title: string;
  summary: string;
  state: TrustExceptionState;
  evidence: unknown;
  createdAt: string;
}

export interface ProofReceipt {
  id: string;
  runId: string;
  workflowId: string;
  nodeId?: string | null;
  kind: string;
  outcome: string;
  mode: 'live' | 'shadow';
  occurredAt: string;
  evidence: unknown;
  proofHash: string;
}

export interface RunCheckpoint {
  id: string;
  runId: string;
  sequence: number;
  nodeId?: string | null;
  phase: string;
  resumable: boolean;
  workflowFingerprint: string;
  createdAt: string;
}

const runnerUrl = (import.meta.env.VITE_RUNNER_URL as string | undefined)?.replace(/\/$/, '');

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!runnerUrl) throw new Error('Cloud runner is not configured.');
  const token = await getFreshIdToken();
  if (!token) throw new Error('You must be signed in.');
  const response = await fetch(`${runnerUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Stanley runner error: ${response.status}`);
  return payload;
}

export async function listTrustExceptions(state: TrustExceptionState | 'all' = 'open'): Promise<TrustException[]> {
  const payload = await request<{ exceptions: TrustException[] }>(`/v1/exceptions?state=${encodeURIComponent(state)}`);
  return payload.exceptions;
}

export async function resolveTrustException(
  exceptionId: string,
  resolution: { state?: 'resolved' | 'dismissed'; action: string; note?: string; correctedValue?: unknown },
): Promise<TrustException> {
  const payload = await request<{ exception: TrustException }>(`/v1/exceptions/${encodeURIComponent(exceptionId)}/resolve`, {
    method: 'POST',
    body: JSON.stringify(resolution),
  });
  return payload.exception;
}

export async function retryTrustException(exceptionId: string): Promise<{ runId: string }> {
  return request<{ success: true; runId: string }>(`/v1/exceptions/${encodeURIComponent(exceptionId)}/retry`, {
    method: 'POST',
    body: '{}',
  });
}

export async function getRunReceipts(runId: string): Promise<ProofReceipt[]> {
  const payload = await request<{ receipts: ProofReceipt[] }>(`/v1/runs/${encodeURIComponent(runId)}/receipts`);
  return payload.receipts;
}

export async function getLatestCheckpoint(runId: string): Promise<RunCheckpoint> {
  const payload = await request<{ checkpoint: RunCheckpoint }>(`/v1/runs/${encodeURIComponent(runId)}/checkpoint`);
  return payload.checkpoint;
}
