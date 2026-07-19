import contract from '../../shared/workflow-command-contract.json';

export type WorkflowCommandType = (typeof contract.commands)[number]['type'];
export type WorkflowCommandCategory = (typeof contract.commands)[number]['category'];

export interface WorkflowCommand {
  type: WorkflowCommandType;
  requestId: string;
  workflowId?: string;
  baseRevision?: number;
  [key: string]: unknown;
}

export interface CommandValidationResult {
  valid: boolean;
  missing: string[];
  category?: WorkflowCommandCategory;
}

const definitions = new Map(contract.commands.map((command) => [command.type, command]));

export function validateWorkflowCommand(command: Record<string, unknown>): CommandValidationResult {
  const definition = definitions.get(String(command.type));
  if (!definition) return { valid: false, missing: ['type'] };

  const missing = definition.required.filter((field) => {
    const value = command[field];
    return value === undefined || value === null || value === '';
  });

  return { valid: missing.length === 0, missing, category: definition.category };
}

export function workflowCommandDefinitions() {
  return contract.commands.map((command) => ({ ...command, required: [...command.required] }));
}
