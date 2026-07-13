import { getFreshIdToken } from '../../src/lib/firebaseAuth';

export type ConnectorState = 'generated' | 'inspected' | 'tested' | 'approved' | 'published' | 'rejected' | 'retired';
export interface ConnectorArtifact {
  connectorId: string; tenantId: string; version: string; name: string; description: string;
  operationName: string; readWrite: 'read' | 'write'; targetDomains: string[]; allowedMethods: string[];
  requiredVaultRefs: string[]; publicationState: ConnectorState; successCount: number; failureCount: number;
  latencyMsTotal: number; generationCostMicros: number; executionCostMicros: number; testResults: Array<{ passed: boolean; total: number; passedCount: number }>;
  lastFailureFingerprint?: string;
  approvalHistory: Array<{ approvedAt: string; approvedBy: { uid: string } }>; createdAt: string; updatedAt: string;
}

const baseUrl = (import.meta.env.VITE_RUNNER_URL as string | undefined)?.replace(/\/$/, '');
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!baseUrl) throw new Error('Cloud runner is not configured.');
  const token = await getFreshIdToken(); if (!token) throw new Error('You must be signed in.');
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || `Connector request failed (${response.status}).`); return payload;
}
export async function listConnectors(): Promise<ConnectorArtifact[]> { return (await request<{ connectors: ConnectorArtifact[] }>('/v1/connectors')).connectors; }
export async function listVersions(id: string): Promise<ConnectorArtifact[]> { return (await request<{ connectors: ConnectorArtifact[] }>(`/v1/connectors/${encodeURIComponent(id)}/versions`)).connectors; }
export async function generateConnector(input: Record<string, unknown>): Promise<ConnectorArtifact> { return (await request<{ connector: ConnectorArtifact }>('/v1/connectors/generate', { method: 'POST', body: JSON.stringify(input) })).connector; }
async function action(id: string, version: string, name: string, body: unknown = {}): Promise<ConnectorArtifact> { return (await request<{ connector: ConnectorArtifact }>(`/v1/connectors/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/${name}`, { method: 'POST', body: JSON.stringify(body) })).connector; }
export const inspectConnector = (id: string, version: string) => action(id, version, 'inspect');
export const testConnector = (id: string, version: string) => action(id, version, 'test');
export const approveConnector = (id: string, version: string, note = '') => action(id, version, 'approve', { note });
export const publishConnector = (id: string, version: string) => action(id, version, 'publish');
export async function rollbackConnector(id: string, version: string): Promise<ConnectorArtifact> { return (await request<{ connector: ConnectorArtifact }>(`/v1/connectors/${encodeURIComponent(id)}/rollback/${encodeURIComponent(version)}`, { method: 'POST', body: '{}' })).connector; }
export async function proposeConnectorRepair(id: string, version: string, failureFingerprint: string): Promise<{ id: string; rationale: string }> { return (await request<{ proposal: { id: string; rationale: string } }>(`/v1/connectors/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/repairs`, { method: 'POST', body: JSON.stringify({ failureFingerprint }) })).proposal; }
export async function applyConnectorRepair(id: string, version: string, proposalId: string): Promise<ConnectorArtifact> { return (await request<{ connector: ConnectorArtifact }>(`/v1/connectors/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/repairs/${encodeURIComponent(proposalId)}/apply`, { method: 'POST', body: '{}' })).connector; }
