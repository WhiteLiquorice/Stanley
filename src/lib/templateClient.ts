import { getFreshIdToken } from './firebaseAuth';

export type TemplateState = 'draft' | 'approved' | 'published' | 'retired';
export interface WorkflowTemplate {
  templateId: string; tenantId?: string; version: string; name: string; description: string; category: string;
  state: TemplateState; visibility: 'tenant' | 'organization' | 'public'; fingerprint?: string; requiredVaultRefs: string[];
  workflow: { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>>; inputSchema?: Record<string, unknown>; outputSchema?: Record<string, unknown> };
  provenance: { type: 'builtin' | 'connector' | 'skill' | 'manual'; id?: string; version?: string; targetDomains?: string[] };
  health: { successCount: number; failureCount: number; verifiedSuccessRate: number; usageCount: number; compatibility: string; driftCount: number; lastSuccessfulAt?: string | null };
  createdAt?: string; updatedAt?: string; publishedAt?: string;
}

const baseUrl = (import.meta.env.VITE_RUNNER_URL as string | undefined)?.replace(/\/$/, '');
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!baseUrl) throw new Error('Cloud runner is not configured.');
  const token = await getFreshIdToken(); if (!token) throw new Error('You must be signed in.');
  let response: Response;
  try { response = await fetch(`${baseUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } }); }
  catch { throw new Error('Template service is unreachable. Check the deployed backend revision and allowed origin.'); }
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};
  if (!response.ok) throw new Error(payload.error || `Template request failed (${response.status}).`);
  return payload;
}

export async function listDynamicTemplates(): Promise<WorkflowTemplate[]> { return (await request<{ templates: WorkflowTemplate[] }>('/v1/templates')).templates; }
async function action(template: WorkflowTemplate, name: string, body: unknown = {}): Promise<WorkflowTemplate> {
  return (await request<{ template: WorkflowTemplate }>(`/v1/templates/${encodeURIComponent(template.templateId)}/versions/${encodeURIComponent(template.version)}/${name}`, { method: 'POST', body: JSON.stringify(body) })).template;
}
export const approveTemplate = (template: WorkflowTemplate, note = '') => action(template, 'approve', { note });
export const updateTemplate = (template: WorkflowTemplate, changes: Partial<Pick<WorkflowTemplate, 'name' | 'description' | 'category' | 'visibility'>>) => action(template, 'settings', changes);
export const publishTemplate = (template: WorkflowTemplate) => action(template, 'publish');
export const retireTemplate = (template: WorkflowTemplate) => action(template, 'retire');
export const recordTemplateUse = (template: WorkflowTemplate) => action(template, 'use');
