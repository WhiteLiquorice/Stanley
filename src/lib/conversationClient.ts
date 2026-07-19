import { getFreshIdToken } from './firebaseAuth';
import type { WorkflowCommand } from '../domain/workflowCommands';

export type ConversationIntent = 'create' | 'edit' | 'run' | 'inspect' | 'repair' | 'explain' | 'manage';

export interface ClarificationQuestion {
  id: string;
  prompt: string;
  required: boolean;
  options: string[];
}

export interface ConversationDiffEntry {
  index: number;
  type: string;
  category: string;
  description: string;
  effectful: boolean;
  requiresApproval: boolean;
  baseRevision: number | null;
}

export interface ConversationPlanResult {
  conversationId: string;
  intentHint: ConversationIntent;
  plan: {
    intent: ConversationIntent;
    summary: string;
    questions: ClarificationQuestion[];
    commands: WorkflowCommand[];
  };
  diff: ConversationDiffEntry[];
  model: string;
  durationMs: number;
  capabilityContextTokens: number;
  proposal: {
    id: string;
    fingerprint: string;
    canApply: boolean;
    expiresAt: string;
  } | null;
  proposalStored: boolean;
  persisted: false;
  executed: false;
}

export interface AppliedConversationProposal {
  proposalId: string;
  workflowId: string;
  revision: number;
  created: boolean;
  replayed: boolean;
  persisted: true;
  executed: false;
  workflow: {
    id: string;
    name: string;
    nodes: Array<{ id: string; type: string; label: string; data: Record<string, any>; position: { x: number; y: number } }>;
    edges: Array<{ source: string; target: string; kind?: string }>;
  };
}

const runnerUrl = (import.meta.env.VITE_RUNNER_URL as string | undefined)?.replace(/\/$/, '');
const plannerEnabled = import.meta.env.VITE_CONVERSATION_PLANNER_ENABLED === 'true';

export function isConversationPlannerConfigured() {
  return Boolean(runnerUrl && plannerEnabled);
}

export async function planConversation(input: {
  message: string;
  conversationId?: string;
  workflowId?: string;
  answers?: Record<string, string>;
}): Promise<ConversationPlanResult> {
  if (!runnerUrl) throw new Error('Stanley conversation planning is not configured.');
  const token = await getFreshIdToken();
  if (!token) throw new Error('You must be signed in to plan an automation.');
  const response = await fetch(`${runnerUrl}/v1/conversations/plan`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Conversation planning failed (${response.status}).`);
  return payload as ConversationPlanResult;
}

export async function applyConversationProposal(proposalId: string, fingerprint: string): Promise<AppliedConversationProposal> {
  if (!runnerUrl) throw new Error('Stanley conversation planning is not configured.');
  const token = await getFreshIdToken();
  if (!token) throw new Error('You must be signed in to save an automation.');
  const response = await fetch(`${runnerUrl}/v1/conversations/proposals/${encodeURIComponent(proposalId)}/apply`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved: true, fingerprint }),
  });
  const payload = await response.json().catch(() => ({ error: `Stanley returned an invalid response (${response.status}).` }));
  if (!response.ok) throw new Error(payload.error || `Saving the approved proposal failed (${response.status}).`);
  return payload as AppliedConversationProposal;
}
