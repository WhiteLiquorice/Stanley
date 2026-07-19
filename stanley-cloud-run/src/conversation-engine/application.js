const crypto = require('crypto');
const { validateWorkflow } = require('../workflowContract');
const { validateConversationPlan } = require('./commandContract');
const { WORKFLOW_MUTATION_TYPES, proposalFingerprint } = require('./proposal');
const { semanticDiff } = require('./semanticDiff');

const TRIGGER_TYPES = new Set(['trigger', 'schedule_trigger', 'webhook_trigger']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const SENSITIVE_KEY = /(authorization|cookie|credential|password|secret|token|api[-_]?key|private[-_]?key)/i;

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function shortHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function safeId(value, fallback) {
  const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return normalized || fallback;
}

function safeClone(value, path = '') {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (value.length > 12000) throw httpError(422, `Value at ${path || 'command'} is too long.`);
    if (SENSITIVE_KEY.test(path) && value && !/^vault:[A-Za-z0-9._:-]{1,200}$/.test(value)) {
      throw httpError(422, `Sensitive field ${path} must use a symbolic vault reference.`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 200) throw httpError(422, `Array at ${path || 'command'} is too large.`);
    return value.map((item, index) => safeClone(item, `${path}[${index}]`));
  }
  if (!value || typeof value !== 'object') throw httpError(422, `Unsupported value at ${path || 'command'}.`);
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw httpError(422, `Unsafe field ${key} is not allowed.`);
    result[key] = safeClone(item, path ? `${path}.${key}` : key);
  }
  return result;
}

function triggerNode(trigger, id, position = { x: 260, y: 80 }) {
  if (!trigger || !TRIGGER_TYPES.has(trigger.type)) throw httpError(422, 'Workflow trigger type is unsupported.');
  const { type, ...data } = safeClone(trigger, 'trigger');
  return { id, type, label: String(trigger.label || (type === 'schedule_trigger' ? 'Schedule Trigger' : type === 'webhook_trigger' ? 'Webhook Trigger' : 'Start Trigger')).slice(0, 160), data, position };
}

function stepNode(step, id, index) {
  const data = safeClone(step.data || {}, `steps.${step.localId || id}.data`);
  return {
    id,
    type: step.type,
    label: String(step.label || step.type.replace(/_/g, ' ')).slice(0, 160),
    data,
    position: { x: 260, y: 220 + index * 140 },
  };
}

function createWorkflowFromCommand(command, workflowId, now) {
  const missionId = `mission-${shortHash(command.requestId)}`;
  const triggerId = `trigger-${shortHash(command.requestId)}`;
  const used = new Set([missionId, triggerId]);
  const steps = command.steps.map((step, index) => {
    let id = safeId(step.localId, `step-${index + 1}`);
    if (used.has(id)) id = `${id}-${shortHash(`${command.requestId}:${index}`)}`;
    used.add(id);
    return stepNode(step, id, index);
  });
  const trigger = triggerNode(command.trigger, triggerId);
  const nodes = [
    { id: missionId, type: 'mission', label: 'Mission', data: { prompt: String(command.mission).slice(0, 6000) }, position: { x: 30, y: 30 } },
    trigger,
    ...steps,
  ];
  const edges = [{ source: missionId, target: triggerId, kind: 'context' }];
  let previous = triggerId;
  for (const step of steps) {
    edges.push({ source: previous, target: step.id });
    previous = step.id;
  }
  return {
    id: workflowId, name: String(command.name).slice(0, 160), nodes, edges,
    revision: 1, version: 1, createdAt: now, updatedAt: now,
    executionPolicy: { requireApprovalForSideEffects: true },
    capabilityPlan: safeClone(Array.isArray(command.capabilityPlan) ? command.capabilityPlan.slice(0, 8) : [], 'capabilityPlan'),
  };
}

function flowEdges(workflow) {
  return workflow.edges.filter((edge) => edge.kind !== 'context');
}

function requireNode(workflow, nodeId, { stepOnly = false } = {}) {
  const node = workflow.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw httpError(409, `Step "${nodeId}" no longer exists.`);
  if (stepOnly && ['mission', 'parameter', 'trigger', 'schedule_trigger', 'webhook_trigger'].includes(node.type)) throw httpError(422, `Node "${nodeId}" is not an editable step.`);
  return node;
}

function insertStep(workflow, command) {
  const id = safeId(command.step.id || command.step.localId, `step-${shortHash(command.requestId)}`);
  if (workflow.nodes.some((node) => node.id === id)) throw httpError(409, `Step "${id}" already exists.`);
  const node = stepNode(command.step, id, workflow.nodes.length);
  const requestedAfter = command.step.afterStepId || command.afterStepId;
  const flow = flowEdges(workflow);
  const trigger = workflow.nodes.find((candidate) => TRIGGER_TYPES.has(candidate.type));
  const afterId = requestedAfter || flow.reduce((current, edge) => edge.target || current, trigger?.id);
  requireNode(workflow, afterId);
  const outgoing = flow.filter((edge) => edge.source === afterId);
  if (outgoing.length > 1) throw httpError(422, `Cannot insert after branching step "${afterId}" without choosing a branch.`);
  workflow.nodes.push(node);
  workflow.edges = workflow.edges.filter((edge) => !(edge.kind !== 'context' && edge.source === afterId && outgoing.includes(edge)));
  workflow.edges.push({ source: afterId, target: id });
  if (outgoing[0]) workflow.edges.push({ ...outgoing[0], source: id });
}

function deleteStep(workflow, stepId) {
  requireNode(workflow, stepId, { stepOnly: true });
  const incoming = flowEdges(workflow).filter((edge) => edge.target === stepId);
  const outgoing = flowEdges(workflow).filter((edge) => edge.source === stepId);
  if (incoming.length > 1 || outgoing.length > 1) throw httpError(422, `Cannot safely delete branching step "${stepId}" in a conversational edit.`);
  workflow.nodes = workflow.nodes.filter((node) => node.id !== stepId);
  workflow.edges = workflow.edges.filter((edge) => edge.source !== stepId && edge.target !== stepId);
  if (incoming[0] && outgoing[0]) workflow.edges.push({ source: incoming[0].source, target: outgoing[0].target, ...(outgoing[0].condition ? { condition: outgoing[0].condition } : {}) });
}

function moveStep(workflow, stepId, afterStepId) {
  if (stepId === afterStepId) throw httpError(422, 'A step cannot be moved after itself.');
  const node = requireNode(workflow, stepId, { stepOnly: true });
  requireNode(workflow, afterStepId);
  const copy = safeClone(node);
  deleteStep(workflow, stepId);
  const outgoing = flowEdges(workflow).filter((edge) => edge.source === afterStepId);
  if (outgoing.length > 1) throw httpError(422, `Cannot move into branching step "${afterStepId}" without choosing a branch.`);
  workflow.nodes.push(copy);
  workflow.edges = workflow.edges.filter((edge) => !(edge.kind !== 'context' && edge.source === afterStepId && outgoing.includes(edge)));
  workflow.edges.push({ source: afterStepId, target: stepId });
  if (outgoing[0]) workflow.edges.push({ ...outgoing[0], source: stepId });
}

function applyExistingCommands(current, commands, now) {
  const workflow = safeClone(current);
  for (const command of commands) {
    switch (command.type) {
      case 'workflow.rename': workflow.name = String(command.name).slice(0, 160); break;
      case 'workflow.set_mission': {
        const mission = workflow.nodes.find((node) => node.type === 'mission');
        if (!mission) throw httpError(409, 'The workflow no longer has a Mission node.');
        mission.data = { ...mission.data, prompt: String(command.mission).slice(0, 6000) };
        break;
      }
      case 'workflow.set_trigger': {
        const index = workflow.nodes.findIndex((node) => TRIGGER_TYPES.has(node.type));
        if (index < 0) throw httpError(409, 'The workflow no longer has a Trigger node.');
        workflow.nodes[index] = triggerNode(command.trigger, workflow.nodes[index].id, workflow.nodes[index].position);
        break;
      }
      case 'workflow.set_policy': workflow.executionPolicy = { ...(workflow.executionPolicy || {}), ...safeClone(command.policy, 'policy') }; break;
      case 'step.add': insertStep(workflow, command); break;
      case 'step.update': {
        const node = requireNode(workflow, command.stepId, { stepOnly: true });
        const changes = safeClone(command.changes, `steps.${command.stepId}.changes`);
        if ('id' in changes || 'type' in changes || 'position' in changes) throw httpError(422, 'Conversational step updates may only change label and data.');
        if (changes.label !== undefined) node.label = String(changes.label).slice(0, 160);
        if (changes.data !== undefined) node.data = { ...(node.data || {}), ...changes.data };
        break;
      }
      case 'step.move': moveStep(workflow, command.stepId, command.afterStepId); break;
      case 'step.delete': deleteStep(workflow, command.stepId); break;
      default: throw httpError(422, `Command "${command.type}" cannot be applied as a workflow edit.`);
    }
  }
  const currentRevision = Number.isInteger(current.revision) ? current.revision : Number(current.version || 0);
  workflow.revision = currentRevision + 1;
  workflow.version = Math.max(Number(current.version || 0), currentRevision) + 1;
  workflow.updatedAt = now;
  return workflow;
}

function validateMutationSet(commands) {
  if (!Array.isArray(commands) || commands.length === 0) throw httpError(422, 'Proposal has no workflow changes to apply.');
  if (!commands.every((command) => WORKFLOW_MUTATION_TYPES.has(command.type))) throw httpError(422, 'Proposal contains commands that require a different approval flow.');
  if (commands.some((command) => command.type === 'workflow.create')) {
    if (commands.length !== 1 || commands[0].type !== 'workflow.create') throw httpError(422, 'Workflow creation must be one atomic command.');
    return { create: true };
  }
  const workflowIds = new Set(commands.map((command) => command.workflowId));
  const revisions = new Set(commands.map((command) => command.baseRevision));
  if (workflowIds.size !== 1 || revisions.size !== 1) throw httpError(422, 'A proposal may edit only one workflow revision at a time.');
  return { create: false, workflowId: commands[0].workflowId, baseRevision: commands[0].baseRevision };
}

class ConversationApplicationService {
  constructor({ store, loadWorkflow, clock = () => new Date().toISOString() } = {}) {
    if (!store || typeof store.applyProposal !== 'function' || typeof loadWorkflow !== 'function') throw new Error('Conversation application requires proposal and workflow storage.');
    this.store = store;
    this.loadWorkflow = loadWorkflow;
    this.clock = clock;
  }

  async apply(uid, proposalId, input = {}) {
    if (input.approved !== true) throw httpError(400, 'Explicit approval is required before saving changes.');
    const fingerprint = String(input.fingerprint || '');
    if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw httpError(400, 'A valid reviewed proposal fingerprint is required.');
    const result = await this.store.applyProposal(uid, proposalId, fingerprint, uid, async (repository, proposal) => {
      const plan = validateConversationPlan({ intent: proposal.intent, summary: proposal.summary, questions: [], commands: proposal.commands });
      const expectedDiff = semanticDiff(plan.commands);
      const expectedFingerprint = proposalFingerprint({
        conversationId: proposal.conversationId, intent: plan.intent, summary: plan.summary,
        commands: plan.commands, diff: expectedDiff,
      });
      if (expectedFingerprint !== proposal.fingerprint) throw httpError(409, 'Stored conversation proposal failed integrity validation.');
      if (!plan.commands.every((command) => WORKFLOW_MUTATION_TYPES.has(command.type))) throw httpError(422, 'This proposal cannot be applied as a workflow edit.');
      const mutation = validateMutationSet(plan.commands);
      const now = this.clock();
      if (mutation.create) {
        const workflowId = `wf_${shortHash(`${uid}:${proposal.id}`)}`;
        if (await repository.getWorkflow(workflowId)) throw httpError(409, 'Generated workflow ID already exists.');
        const workflow = createWorkflowFromCommand(plan.commands[0], workflowId, now);
        validateWorkflow(workflow);
        repository.createWorkflow(workflow);
        return { workflowId, revision: workflow.revision, created: true, proposalId: proposal.id };
      }
      const current = await repository.getWorkflow(mutation.workflowId);
      if (!current) throw httpError(404, 'Workflow not found.');
      const currentRevision = Number.isInteger(current.revision) ? current.revision : Number(current.version || 0);
      if (currentRevision !== mutation.baseRevision) throw httpError(409, `Workflow changed from revision ${mutation.baseRevision} to ${currentRevision}. Ask Stanley to prepare a fresh plan.`);
      const workflow = applyExistingCommands(current, plan.commands, now);
      validateWorkflow(workflow);
      repository.updateWorkflow(workflow, current, `conversation-${shortHash(proposal.id)}`);
      return { workflowId: workflow.id, revision: workflow.revision, created: false, proposalId: proposal.id };
    });
    const workflow = await this.loadWorkflow(uid, result.workflowId);
    return { ...result, workflow, persisted: true, executed: false };
  }
}

module.exports = {
  ConversationApplicationService, applyExistingCommands, createWorkflowFromCommand,
  safeClone, validateMutationSet,
};
