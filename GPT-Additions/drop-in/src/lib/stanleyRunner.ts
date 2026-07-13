/**
 * Drop-in replacement for src/lib/stanleyRunner.ts.
 * Keeps the current runHeadless(workflow, secrets) call shape while switching
 * execution to the server-owned workflow-ID contract. Browser secrets are ignored.
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
}

export function isHeadlessConfigured(): boolean {
  return isCloudRunnerConfigured();
}

export async function runHeadless(
  workflow: { id?: string },
  _legacyBrowserSecrets: Record<string, string> = {}
): Promise<HeadlessRunResult> {
  if (!workflow.id) throw new Error('Save the workflow before running it.');
  return runWorkflowById(workflow.id);
}

export { cancelRun as cancelHeadlessRun, decideRun as decideHeadlessRun };
