/**
 * Drop-in replacement for src/lib/stanleyRunner.ts.
 * Executes a persisted workflow by ID and submits only its declared runtime
 * inputs. Vault secrets are always resolved by the server.
 */
import {
  cancelRun,
  decideRun,
  isCloudRunnerConfigured,
  runWorkflowById,
} from './cloudRunClient';

export interface HeadlessRunResult {
  success: boolean;
  logs: string[];
  scraped?: unknown;
  error?: string;
  runId?: string;
  status?: string;
  paused?: boolean;
  wait?: { type?: string; nodeId?: string; reason?: string };
}

export function isHeadlessConfigured(): boolean {
  return isCloudRunnerConfigured();
}

export async function runHeadless(
  workflow: { id?: string },
  input: Record<string, unknown> = {}
): Promise<HeadlessRunResult> {
  if (!workflow.id) throw new Error('Save the workflow before running it.');
  return runWorkflowById(workflow.id, input);
}

export { cancelRun as cancelHeadlessRun, decideRun as decideHeadlessRun };
