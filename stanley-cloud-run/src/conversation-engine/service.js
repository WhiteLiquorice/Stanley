const crypto = require('crypto');
const { commandDefinitionsForModel, validateConversationPlan } = require('./commandContract');
const { conversationContext, sanitizeMessage } = require('./context');
const { classifyIntent } = require('./intent');
const { semanticDiff } = require('./semanticDiff');
const { createProposal } = require('./proposal');
const { capabilityPlanForCommand } = require('../capability-engine');

function parseJson(text) {
  const cleaned = String(text || '').replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(cleaned); }
  catch { throw Object.assign(new Error('Conversation planner returned invalid JSON.'), { status: 502 }); }
}

function requestId(seed, index) {
  return `chat:${crypto.createHash('sha256').update(`${seed}:${index}`).digest('hex').slice(0, 24)}`;
}

class ConversationService {
  constructor({ callModel, loadWorkflow = null, proposalStore = null, capabilityRegistry = null, maxMessageChars = 6000, clock = () => new Date().toISOString() } = {}) {
    if (typeof callModel !== 'function') throw new Error('Conversation service requires a model caller.');
    this.callModel = callModel;
    this.loadWorkflow = loadWorkflow;
    this.proposalStore = proposalStore;
    this.capabilityRegistry = capabilityRegistry;
    this.maxMessageChars = maxMessageChars;
    this.clock = clock;
  }

  async plan(uid, input = {}) {
    const originalMessage = String(input.message || '').trim();
    const message = sanitizeMessage(originalMessage);
    if (!message) throw Object.assign(new Error('Conversation message is required.'), { status: 400 });
    if (message.length > this.maxMessageChars) throw Object.assign(new Error(`Conversation message exceeds ${this.maxMessageChars} characters.`), { status: 413 });
    const workflow = input.workflowId && this.loadWorkflow ? await this.loadWorkflow(uid, input.workflowId) : null;
    const context = conversationContext({ workflow, answers: input.answers });
    const intentHint = classifyIntent(message, Boolean(workflow));
    const capabilityContext = this.capabilityRegistry ? await this.capabilityRegistry.contextFor(uid, message) : null;
    const seed = `${uid}:${input.conversationId || 'new'}:${message}:${workflow?.id || ''}:${workflow?.revision || workflow?.version || 0}`;
    const system = `You are Stanley's constrained conversation planner. Return one JSON object only. You never execute, persist, browse, call tools, request secrets, or invent workflow IDs, revisions, existing node IDs, connector IDs, skill IDs, run IDs, or decision IDs. Use only the supplied command definitions and capability manifest. Prefer capabilities in this order: an active skill, a native integration, a published connector, then bounded browser nodes. For a new workflow, emit exactly one workflow.create command containing name, mission, a typed trigger, ordered steps with unique temporary localId values, and capabilityPlan listing every selected manifest capability. A selected skill represents the complete primary execution path: record it in capabilityPlan and keep steps as a safe fallback; never copy or recreate its internal nodes. Use the exact node shapes in the manifest examples. Use separate step commands only to edit an existing workflow. Any step that writes to an external system must have an approval step immediately before it. Never include raw credentials; use symbolic vault:Name references. Ask concise clarification questions instead of guessing material URLs, recipients, accounts, resources, schedules, destructive intent, or required values. Questions and commands are mutually exclusive. Every command must include the supplied deterministic requestId for its index. Existing-workflow mutations must use the supplied workflow id and revision. Output schema: {"intent":"create|edit|run|inspect|repair|explain|manage","summary":"plain language","questions":[{"id":"short","prompt":"question","required":true,"options":[]}],"commands":[]}.`;
    const user = JSON.stringify({
      message,
      intentHint,
      context,
      commandDefinitions: commandDefinitionsForModel().map((definition, index) => ({ ...definition, requestId: requestId(seed, index) })),
      ...(capabilityContext ? { capabilityManifest: capabilityContext.manifest } : {}),
    });
    const modelResult = await this.callModel({ system, user });
    const rawPlan = parseJson(modelResult.text);
    if (Array.isArray(rawPlan.commands)) rawPlan.commands = rawPlan.commands.map((command, index) => ({ ...command, requestId: requestId(seed, index) }));
    if (capabilityContext && Array.isArray(rawPlan.commands)) rawPlan.commands = rawPlan.commands.map((command) => command.type === 'workflow.create' ? { ...command, capabilityPlan: capabilityPlanForCommand(command, capabilityContext) } : command);
    const plan = validateConversationPlan(rawPlan);
    const diff = semanticDiff(plan.commands);
    const conversationId = String(input.conversationId || `conv_${crypto.randomUUID()}`);
    const proposal = plan.commands.length ? createProposal({ conversationId, plan, diff, clock: this.clock }) : null;
    if (proposal && this.proposalStore) await this.proposalStore.saveProposal(uid, proposal);
    return {
      conversationId,
      intentHint,
      plan,
      diff,
      proposal: proposal ? { id: proposal.id, fingerprint: proposal.fingerprint, canApply: proposal.canApply, expiresAt: proposal.expiresAt } : null,
      proposalStored: Boolean(proposal && this.proposalStore),
      model: modelResult.model || 'unknown',
      durationMs: Number(modelResult.durationMs || 0),
      capabilityContextTokens: capabilityContext?.estimatedInputTokens || 0,
      persisted: false,
      executed: false,
    };
  }
}

module.exports = { ConversationService, parseJson };
