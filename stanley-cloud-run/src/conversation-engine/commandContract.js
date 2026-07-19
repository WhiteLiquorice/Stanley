const contract = require('../../shared/workflow-command-contract.json');

const definitions = new Map(contract.commands.map((command) => [command.type, command]));
const MAX_COMMANDS = 40;
const MAX_CREATE_STEPS = 60;
const CREATE_STEP_TYPES = new Set([
  'navigate', 'click', 'type', 'wait', 'scrape', 'open_tab', 'switch_tab', 'close_tab',
  'if', 'ai_prompt', 'integration', 'native_integration', 'connector',
  'ai_agent', 'agent', 'vision', 'approval', 'http_request', 'loop', 'transform',
  'monitor', 'extract', 'extract_list', 'paginate', 'scroll', 'find_text', 'go_back',
  'go_forward', 'send_keys', 'select_dropdown', 'hover', 'drag_drop', 'upload_file',
  'download_file', 'mcp_tool', 'scroll_until', 'dom_extract_list', 'visit_each',
  'filter_list', 'assertion',
]);

class ConversationContractError extends Error {
  constructor(issues) {
    super(`Conversation plan is invalid: ${issues.join(' ')}`);
    this.name = 'ConversationContractError';
    this.status = 422;
    this.issues = issues;
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateCommand(command) {
  const issues = [];
  if (!isObject(command)) return ['Every command must be an object.'];
  const definition = definitions.get(command.type);
  if (!definition) return [`Unsupported command type "${String(command.type || '')}".`];
  for (const field of definition.required) {
    if (command[field] === undefined || command[field] === null || command[field] === '') {
      issues.push(`${command.type} requires ${field}.`);
    }
  }
  if (command.requestId && !/^[a-zA-Z0-9:_-]{8,160}$/.test(String(command.requestId))) {
    issues.push(`${command.type} has an invalid requestId.`);
  }
  if (command.baseRevision !== undefined && (!Number.isInteger(command.baseRevision) || command.baseRevision < 0)) {
    issues.push(`${command.type} requires a non-negative integer baseRevision.`);
  }
  if (command.type === 'workflow.create') {
    if (typeof command.name !== 'string' || !command.name.trim() || command.name.length > 160) issues.push('workflow.create requires a name of at most 160 characters.');
    if (typeof command.mission !== 'string' || !command.mission.trim() || command.mission.length > 6000) issues.push('workflow.create requires a bounded Mission.');
    if (!isObject(command.trigger) || !String(command.trigger.type || '').trim()) issues.push('workflow.create requires a typed trigger.');
    if (!Array.isArray(command.steps) || command.steps.length === 0) issues.push('workflow.create requires at least one step.');
    if (Array.isArray(command.steps) && command.steps.length > MAX_CREATE_STEPS) issues.push(`workflow.create supports at most ${MAX_CREATE_STEPS} steps.`);
    const localIds = new Set();
    if (command.capabilityPlan !== undefined) {
      if (!Array.isArray(command.capabilityPlan) || command.capabilityPlan.length > 8) issues.push('workflow.create capabilityPlan must contain at most eight capabilities.');
      for (const capability of Array.isArray(command.capabilityPlan) ? command.capabilityPlan : []) {
        if (!isObject(capability) || !['skill', 'native_integration', 'connector', 'browser'].includes(capability.kind) || !String(capability.id || '').trim()) issues.push('Every planned capability requires a supported kind and id.');
      }
    }
    for (const step of Array.isArray(command.steps) ? command.steps : []) {
      if (!isObject(step) || !String(step.localId || '').trim() || !CREATE_STEP_TYPES.has(step.type)) {
        issues.push('Every creation step requires a unique localId and supported type.');
        continue;
      }
      if (step.data !== undefined && !isObject(step.data)) issues.push(`Creation step "${step.localId}" data must be an object.`);
      if (localIds.has(step.localId)) issues.push(`Duplicate creation step localId "${step.localId}".`);
      localIds.add(step.localId);
    }
  }
  if (command.type === 'workflow.rename' && (typeof command.name !== 'string' || !command.name.trim() || command.name.length > 160)) issues.push('workflow.rename requires a bounded name.');
  if (command.type === 'workflow.set_mission' && (typeof command.mission !== 'string' || !command.mission.trim() || command.mission.length > 6000)) issues.push('workflow.set_mission requires a bounded Mission.');
  if (command.type === 'workflow.set_trigger' && (!isObject(command.trigger) || !String(command.trigger.type || '').trim())) issues.push('workflow.set_trigger requires a typed trigger.');
  if (command.type === 'workflow.set_policy' && !isObject(command.policy)) issues.push('workflow.set_policy requires a policy object.');
  if (command.type === 'step.add' && (!isObject(command.step) || !String(command.step?.type || '').trim())) issues.push('step.add requires a typed step object.');
  if (command.type === 'step.update' && !isObject(command.changes)) issues.push('step.update requires a changes object.');
  if (command.type === 'step.move' && typeof command.afterStepId !== 'string') issues.push('step.move requires an afterStepId string.');
  return issues;
}

function validateConversationPlan(plan) {
  const issues = [];
  if (!isObject(plan)) throw new ConversationContractError(['Expected an object.']);
  if (!['create', 'edit', 'run', 'inspect', 'repair', 'explain', 'manage'].includes(plan.intent)) {
    issues.push('Intent is unsupported.');
  }
  const questions = Array.isArray(plan.questions) ? plan.questions : [];
  const commands = Array.isArray(plan.commands) ? plan.commands : [];
  if (questions.length > 5) issues.push('A plan may ask at most five clarification questions.');
  if (commands.length > MAX_COMMANDS) issues.push(`A plan may contain at most ${MAX_COMMANDS} commands.`);
  if (questions.length && commands.length) issues.push('A plan must ask questions or propose commands, not both.');
  if (!questions.length && !commands.length && plan.intent !== 'explain' && plan.intent !== 'inspect') {
    issues.push('The plan requires a question or command.');
  }
  for (const question of questions) {
    if (!isObject(question) || !String(question.id || '').trim() || !String(question.prompt || '').trim()) {
      issues.push('Every clarification question requires an id and prompt.');
    }
  }
  const requestIds = new Set();
  commands.forEach((command) => {
    issues.push(...validateCommand(command));
    if (command?.requestId && requestIds.has(command.requestId)) issues.push(`Duplicate requestId "${command.requestId}".`);
    if (command?.requestId) requestIds.add(command.requestId);
  });
  if (issues.length) throw new ConversationContractError(issues);
  return {
    intent: plan.intent,
    summary: String(plan.summary || '').slice(0, 1200),
    questions: questions.map((question) => ({
      id: String(question.id).slice(0, 80),
      prompt: String(question.prompt).slice(0, 500),
      required: question.required !== false,
      options: Array.isArray(question.options) ? question.options.slice(0, 12).map((option) => String(option).slice(0, 160)) : [],
    })),
    commands,
  };
}

function commandDefinitionsForModel() {
  return contract.commands.map(({ type, category, required }) => ({ type, category, required }));
}

module.exports = {
  ConversationContractError,
  commandDefinitionsForModel,
  validateCommand,
  validateConversationPlan,
};
