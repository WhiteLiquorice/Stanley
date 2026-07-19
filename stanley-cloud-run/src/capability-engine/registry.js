const { OPERATIONS } = require('../native-integration-engine/catalog');

const KIND_PRIORITY = Object.freeze({ skill: 40, native_integration: 30, connector: 20, browser: 10 });
const STOP_WORDS = new Set(['a', 'an', 'and', 'at', 'do', 'for', 'from', 'in', 'into', 'it', 'my', 'of', 'on', 'or', 'the', 'to', 'with']);

function words(value) {
  return [...new Set(String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter((word) => word.length > 1 && !STOP_WORDS.has(word)))];
}

function schemaShape(schema = {}) {
  const properties = schema && typeof schema.properties === 'object' ? schema.properties : {};
  return {
    required: Array.isArray(schema.required) ? schema.required.slice(0, 12) : [],
    fields: Object.entries(properties).slice(0, 16).map(([name, definition]) => ({
      name,
      type: Array.isArray(definition?.type) ? definition.type.join('|') : String(definition?.type || 'any'),
    })),
  };
}

function successRate(item) {
  const total = Number(item.successCount || 0) + Number(item.failureCount || 0);
  return total ? Number(item.successCount || 0) / total : null;
}

function nativeCapability(operation) {
  return {
    kind: 'native_integration', id: operation.id, name: operation.name, description: `${operation.readWrite} ${operation.app} operation`,
    app: operation.app, readWrite: operation.readWrite, approvalRequired: operation.approvalRequired === true,
    requiredVaultRefs: operation.requiredVaultRefs || [], input: schemaShape(operation.inputSchema),
    node: { type: 'native_integration', data: { integrationName: operation.id, params: {} } },
  };
}

function connectorCapability(connector) {
  return {
    kind: 'connector', id: connector.connectorId, version: connector.version, name: connector.name,
    description: connector.description || connector.operationName || '', operationName: connector.operationName,
    domains: connector.targetDomains || [], readWrite: connector.readWrite, approvalRequired: connector.readWrite === 'write',
    requiredVaultRefs: connector.requiredVaultRefs || [], input: schemaShape(connector.inputSchema), successRate: successRate(connector),
    node: { type: 'connector', data: { connectorId: connector.connectorId, connectorInput: {}, readOnly: connector.readWrite === 'read' } },
  };
}

function skillCapability(skill) {
  return {
    kind: 'skill', id: skill.skillId, version: skill.version, name: skill.name, description: skill.description || skill.operationName || '',
    operationName: skill.operationName, tags: skill.match?.tags || [], domains: skill.targetDomains || [],
    readWrite: skill.writeCapable ? 'write' : 'read', approvalRequired: skill.writeCapable === true,
    requiredVaultRefs: skill.requiredVaultRefs || [], input: schemaShape(skill.inputSchema), successRate: successRate(skill),
    confidence: Number(skill.confidence || 0), reuse: 'Set workflow.create capabilityPlan to this skill. Do not copy its internal nodes.',
  };
}

const BROWSER_CAPABILITY = Object.freeze({
  kind: 'browser', id: 'browser_workflow', name: 'Browser workflow',
  description: 'Use bounded browser nodes when no verified API capability fits.', readWrite: 'write', approvalRequired: false,
  nodeTypes: ['navigate', 'click', 'type', 'wait', 'scrape', 'extract', 'extract_list', 'paginate', 'scroll_until', 'dom_extract_list', 'visit_each', 'filter_list', 'assertion', 'agent'],
});

function haystack(capability) {
  return words([capability.id, capability.name, capability.description, capability.app, capability.operationName, ...(capability.tags || []), ...(capability.domains || [])].filter(Boolean).join(' '));
}

function relevance(capability, queryWords) {
  const terms = new Set(haystack(capability));
  let overlap = 0;
  for (const word of queryWords) {
    if (terms.has(word)) overlap += word.length > 5 ? 5 : 3;
    else if ([...terms].some((term) => term.includes(word) || word.includes(term))) overlap += 1;
  }
  const health = capability.successRate === null || capability.successRate === undefined ? 0 : capability.successRate * 4;
  return overlap * 10 + KIND_PRIORITY[capability.kind] + health + Number(capability.confidence || 0) * 3;
}

function goldenExamples(capabilities) {
  const byKind = (kind) => capabilities.find((item) => item.kind === kind);
  const examples = [];
  const skill = byKind('skill');
  if (skill) examples.push({ request: `Reuse ${skill.name}`, capabilityPlan: [{ kind: 'skill', id: skill.id, version: skill.version }], steps: [{ localId: 'safe-fallback', type: 'agent', data: { goal: 'Complete the requested task if the preferred skill is unavailable.', maxSteps: 6 } }], note: 'The runtime executes the selected skill before this bounded fallback graph.' });
  const native = byKind('native_integration');
  if (native) examples.push({ request: `Use ${native.name}`, capabilityPlan: [{ kind: 'native_integration', id: native.id }], steps: [{ localId: 'native-operation', type: 'native_integration', data: { integrationName: native.id, params: {} } }] });
  const connector = byKind('connector');
  if (connector) examples.push({ request: `Use ${connector.name}`, capabilityPlan: [{ kind: 'connector', id: connector.id, version: connector.version }], steps: [{ localId: 'call-api', type: 'connector', data: { connectorId: connector.id, connectorInput: {}, readOnly: connector.readWrite === 'read' } }] });
  examples.push({ request: 'Perform a website task with no API match', capabilityPlan: [{ kind: 'browser', id: 'browser_workflow' }], steps: [{ localId: 'open', type: 'navigate', data: { url: 'https://example.com' } }, { localId: 'collect', type: 'extract_list', data: { selector: '.result', schema: [{ title: 'string', url: 'string' }] } }] });
  return examples;
}

class CapabilityRegistry {
  constructor({ connectorStore = null, skillStore = null, nativeOperations = OPERATIONS, limits = {} } = {}) {
    this.connectorStore = connectorStore;
    this.skillStore = skillStore;
    this.nativeOperations = nativeOperations;
    this.limits = { total: 18, native: 10, connector: 4, skill: 4, ...limits };
  }

  async tenantCapabilities(uid) {
    const [connectors, skills] = await Promise.all([
      this.connectorStore?.list ? this.connectorStore.list(uid, { state: 'published', limit: 100 }).catch(() => []) : [],
      this.skillStore?.listActive ? this.skillStore.listActive(uid, { limit: 100 }).catch(() => []) : [],
    ]);
    return [
      ...this.nativeOperations.map(nativeCapability),
      ...(connectors || []).map(connectorCapability),
      ...(skills || []).map(skillCapability),
      BROWSER_CAPABILITY,
    ];
  }

  async contextFor(uid, message) {
    const queryWords = words(message);
    const all = await this.tenantCapabilities(uid);
    const ranked = all.map((capability) => ({ capability, score: relevance(capability, queryWords) }))
      .sort((left, right) => right.score - left.score || left.capability.id.localeCompare(right.capability.id));
    const counts = { native_integration: 0, connector: 0, skill: 0, browser: 0 };
    const selected = [];
    for (const item of ranked) {
      const kind = item.capability.kind;
      const kindLimit = this.limits[kind === 'native_integration' ? 'native' : kind] ?? this.limits.total;
      if (counts[kind] >= kindLimit || selected.length >= this.limits.total) continue;
      if (kind !== 'browser' && item.score <= KIND_PRIORITY[kind]) continue;
      selected.push(item.capability); counts[kind] += 1;
    }
    if (!selected.some((item) => item.kind === 'browser')) selected.push(BROWSER_CAPABILITY);
    const manifest = { version: 1, selectionOrder: ['skill', 'native_integration', 'connector', 'browser'], capabilities: selected, goldenExamples: goldenExamples(selected) };
    const serialized = JSON.stringify(manifest);
    return { manifest, allowedReferences: new Set(selected.map((item) => `${item.kind}:${item.id}:${item.version || ''}`)), estimatedInputTokens: Math.ceil(serialized.length / 4) };
  }
}

function normalizeCapabilityPlan(plan, capabilityContext) {
  if (!Array.isArray(plan)) return [];
  const allowed = capabilityContext?.allowedReferences || new Set();
  const normalized = [];
  for (const item of plan.slice(0, 8)) {
    const kind = String(item?.kind || ''); const id = String(item?.id || ''); const version = item?.version ? String(item.version) : '';
    if (!['skill', 'native_integration', 'connector', 'browser'].includes(kind) || !id) throw Object.assign(new Error('Planner selected an invalid capability reference.'), { status: 422 });
    if (!allowed.has(`${kind}:${id}:${version}`) && !allowed.has(`${kind}:${id}:`)) throw Object.assign(new Error(`Planner selected unavailable capability ${kind}:${id}.`), { status: 422 });
    normalized.push({ kind, id, ...(version ? { version } : {}) });
  }
  return normalized;
}

function capabilityPlanForCommand(command, capabilityContext) {
  const explicit = normalizeCapabilityPlan(command?.capabilityPlan, capabilityContext);
  const inferred = [];
  const available = capabilityContext?.manifest?.capabilities || [];
  for (const step of command?.steps || []) {
    const kind = ['integration', 'native_integration'].includes(step.type) ? 'native_integration' : step.type === 'connector' ? 'connector' : null;
    const id = kind === 'native_integration' ? (step.data?.integrationName || step.data?.operationName) : step.data?.connectorId;
    const match = kind && id ? available.find((item) => item.kind === kind && item.id === id) : null;
    if (match) inferred.push({ kind, id, ...(match.version ? { version: match.version } : {}) });
  }
  const browserTypes = new Set(['navigate', 'click', 'type', 'wait', 'scrape', 'extract', 'extract_list', 'paginate', 'scroll_until', 'dom_extract_list', 'visit_each', 'filter_list', 'assertion', 'agent']);
  if ((command?.steps || []).some((step) => browserTypes.has(step.type))) inferred.push({ kind: 'browser', id: 'browser_workflow' });
  return [...explicit, ...inferred].filter((item, index, all) => all.findIndex((candidate) => candidate.kind === item.kind && candidate.id === item.id && candidate.version === item.version) === index).slice(0, 8);
}

module.exports = { BROWSER_CAPABILITY, CapabilityRegistry, capabilityPlanForCommand, goldenExamples, normalizeCapabilityPlan, relevance, schemaShape, words };
