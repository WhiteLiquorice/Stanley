const EFFECTFUL_COMMANDS = new Set([
  'run.start', 'connector.publish', 'connector.rollback', 'skill.activate', 'skill.rollback', 'connection.disconnect',
]);

function describeCommand(command) {
  switch (command.type) {
    case 'workflow.create': return `Create workflow “${command.name}” with ${command.steps?.length || 0} planned step${command.steps?.length === 1 ? '' : 's'} and Mission “${command.mission}”.`;
    case 'workflow.rename': return `Rename the workflow to “${command.name}”.`;
    case 'workflow.set_mission': return `Change the Mission to “${command.mission}”.`;
    case 'workflow.set_trigger': return 'Change the workflow trigger.';
    case 'workflow.set_policy': return 'Change execution and approval limits.';
    case 'step.add': return `Add ${command.step?.type || 'a'} step${command.step?.label ? ` “${command.step.label}”` : ''}.`;
    case 'step.update': return `Update step “${command.stepId}”.`;
    case 'step.move': return `Move step “${command.stepId}”.`;
    case 'step.delete': return `Delete step “${command.stepId}”.`;
    case 'workflow.validate': return 'Validate the selected workflow revision.';
    case 'workflow.test': return `Test the workflow in ${command.mode} mode.`;
    case 'workflow.publish': return 'Publish the selected workflow revision.';
    case 'run.start': return 'Start a workflow run.';
    case 'run.cancel': return 'Cancel the active run.';
    case 'run.resume': return 'Resume the run from its safe checkpoint.';
    case 'run.retry': return 'Retry the failed run.';
    case 'decision.approve': return 'Approve the proposed effect.';
    case 'decision.deny': return 'Deny the proposed effect.';
    case 'connection.disconnect': return 'Disconnect the selected account or service.';
    case 'connector.test': return 'Test the selected connector version.';
    case 'connector.publish': return 'Publish the selected connector version.';
    case 'connector.rollback': return 'Roll the connector back to the selected version.';
    case 'skill.activate': return 'Activate the selected skill version.';
    case 'skill.pause': return 'Pause the selected skill.';
    case 'skill.rollback': return 'Roll the skill back to the selected version.';
    default: return command.type;
  }
}

function semanticDiff(commands) {
  return commands.map((command, index) => ({
    index,
    type: command.type,
    category: command.type.split('.')[0],
    description: describeCommand(command),
    effectful: EFFECTFUL_COMMANDS.has(command.type),
    requiresApproval: EFFECTFUL_COMMANDS.has(command.type) || command.type === 'decision.approve',
    baseRevision: command.baseRevision ?? null,
  }));
}

module.exports = { describeCommand, semanticDiff };
