import { getFreshIdToken } from './firebaseAuth';

export interface NativeIntegrationOperation {
  id: string;
  name: string;
  app: string;
  method: string;
  readWrite: 'read' | 'write';
  approvalRequired: boolean;
  requiredVaultRefs: string[];
  inputSchema: {
    required?: string[];
    properties?: {
      connection?: { required?: string[] };
      path?: { required?: string[] };
    };
  };
}

const baseUrl = (import.meta.env.VITE_RUNNER_URL as string | undefined)?.replace(/\/$/, '');

export async function listNativeIntegrationOperations(): Promise<NativeIntegrationOperation[]> {
  if (!baseUrl) return [];
  const token = await getFreshIdToken();
  if (!token) return [];
  const response = await fetch(`${baseUrl}/v1/native-integrations`, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => ({})) as { operations?: NativeIntegrationOperation[]; error?: string };
  if (!response.ok) throw new Error(payload.error || `Integration catalog request failed (${response.status}).`);
  return payload.operations || [];
}

export function emptyNativeIntegrationInput(operation?: NativeIntegrationOperation): string {
  const connection = Object.fromEntries((operation?.inputSchema.properties?.connection?.required || []).map((field) => [field, '']));
  const path = Object.fromEntries((operation?.inputSchema.properties?.path?.required || []).map((field) => [field, '']));
  return JSON.stringify({ connection, path, query: {}, body: {} }, null, 2);
}
