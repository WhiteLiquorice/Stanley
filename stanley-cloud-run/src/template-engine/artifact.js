const crypto = require('crypto');

const STATES = new Set(['draft', 'approved', 'published', 'retired']);
const VISIBILITIES = new Set(['tenant', 'organization', 'public']);
const SECRET_KEY = /(password|secret|token|api[-_]?key|authorization|cookie)/i;

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function slug(value) { return String(value || 'template').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'template'; }

function sanitize(value, key = '') {
  if (SECRET_KEY.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([childKey, item]) => [childKey, sanitize(item, childKey)]));
}

function makeMission(prompt) {
  return { id: 'mission', type: 'mission', label: 'Mission', data: { prompt }, position: { x: 40, y: 40 } };
}

function makeTrigger(domain = '') {
  return { id: 'trigger', type: 'trigger', label: 'Start workflow', data: { url: domain ? `https://${domain}` : 'about:blank' }, position: { x: 320, y: 40 } };
}

function normalizeWorkflow(workflow, prompt) {
  const nodes = clone(workflow?.nodes || []).map((node, index) => ({ ...node, position: node.position || { x: 320, y: 180 + index * 140 }, data: sanitize(node.data || {}) }));
  const edges = clone(workflow?.edges || []).map((edge) => ({ source: edge.source, target: edge.target, ...(edge.condition ? { condition: edge.condition } : {}), ...(edge.kind ? { kind: edge.kind } : {}) }));
  let trigger = nodes.find((node) => ['trigger', 'webhook_trigger', 'schedule_trigger'].includes(node.type));
  if (!trigger) { trigger = makeTrigger(); nodes.unshift(trigger); }
  let mission = nodes.find((node) => node.type === 'mission');
  if (!mission) { mission = makeMission(prompt); nodes.unshift(mission); }
  if (!edges.some((edge) => edge.kind === 'context' && edge.source === mission.id && edge.target === trigger.id)) edges.unshift({ source: mission.id, target: trigger.id, kind: 'context' });
  return { nodes, edges };
}

function templateFromConnector(connector, options = {}) {
  if (!connector || connector.publicationState !== 'published') throw new Error('Only published connectors can become templates.');
  const passedTests = (connector.testResults || []).some((report) => report.passed === true);
  if (!passedTests && Number(connector.successCount || 0) < 1) throw new Error('Connector needs a passing regression or verified execution before template promotion.');
  const prompt = connector.description || `Use ${connector.name} to ${connector.operationName}.`;
  const trigger = makeTrigger(connector.targetDomains?.[0] || '');
  const operation = { id: 'connector_operation', type: 'connector', label: connector.name || connector.operationName, data: { connectorId: connector.connectorId, connectorVersion: connector.version, operationName: connector.operationName, readOnly: connector.readWrite === 'read', connectorInput: {} }, position: { x: 320, y: connector.readWrite === 'write' ? 360 : 220 } };
  const nodes = [makeMission(prompt), trigger];
  const edges = [{ source: 'mission', target: 'trigger', kind: 'context' }];
  if (connector.readWrite === 'write') {
    nodes.push({ id: 'approve_write', type: 'approval', label: 'Approve write', data: { context: `Approve ${connector.name || connector.operationName}` }, position: { x: 320, y: 220 } });
    edges.push({ source: 'trigger', target: 'approve_write' }, { source: 'approve_write', target: operation.id });
  } else edges.push({ source: 'trigger', target: operation.id });
  nodes.push(operation);
  return createTemplate({
    templateId: options.templateId || `connector_${slug(connector.connectorId)}`,
    tenantId: connector.tenantId, version: options.version || connector.version || 'v1', name: options.name || connector.name,
    description: options.description || prompt, category: 'API', visibility: options.visibility || 'tenant',
    workflow: { nodes, edges, inputSchema: connector.inputSchema || {}, outputSchema: connector.outputSchema || {} },
    requiredVaultRefs: connector.requiredVaultRefs || [],
    provenance: { type: 'connector', id: connector.connectorId, version: connector.version, fingerprint: connector.fingerprint, targetDomains: connector.targetDomains || [] },
    health: healthFrom(connector), createdBy: options.createdBy,
  }, options);
}

function templateFromSkill(skill, options = {}) {
  if (!skill || skill.state !== 'active') throw new Error('Only active skills can become templates.');
  if (Number(skill.successCount || 0) < 1) throw new Error('Skill needs a verified execution before template promotion.');
  const prompt = skill.description || `Run ${skill.name}.`;
  const workflow = normalizeWorkflow({ nodes: skill.nodes, edges: skill.edges }, prompt);
  return createTemplate({
    templateId: options.templateId || `skill_${slug(skill.skillId)}`,
    tenantId: skill.tenantId, version: options.version || skill.version || 'v1', name: options.name || skill.name,
    description: options.description || prompt, category: 'Automation', visibility: options.visibility || 'tenant',
    workflow: { ...workflow, inputSchema: skill.inputSchema || {}, outputSchema: skill.outputSchema || {} },
    requiredVaultRefs: skill.requiredVaultRefs || [],
    provenance: { type: 'skill', id: skill.skillId, version: skill.version, fingerprint: skill.fingerprint, sourceRunId: skill.sourceRunId, workflowId: skill.workflowId, targetDomains: skill.targetDomains || [] },
    health: healthFrom(skill), createdBy: options.createdBy,
  }, options);
}

function healthFrom(source) {
  const successes = Number(source.successCount || 0); const failures = Number(source.failureCount || 0); const total = successes + failures;
  return { successCount: successes, failureCount: failures, verifiedSuccessRate: total ? successes / total : 0, usageCount: 0, lastSuccessfulAt: source.lastExecutionState === 'succeeded' ? source.lastExecutionAt || null : null, compatibility: 'current', driftCount: Number(source.driftCount || 0) };
}

function createTemplate(fields, options = {}) {
  const now = options.now || new Date().toISOString();
  const artifact = {
    schemaVersion: 1, templateId: fields.templateId, tenantId: fields.tenantId, version: fields.version || 'v1',
    name: String(fields.name || '').trim(), description: String(fields.description || '').trim(), category: fields.category || 'Automation',
    state: fields.state || 'draft', visibility: fields.visibility || 'tenant', workflow: sanitize(fields.workflow || {}),
    requiredVaultRefs: [...new Set(fields.requiredVaultRefs || [])].sort(), provenance: sanitize(fields.provenance || { type: 'manual' }),
    health: { successCount: 0, failureCount: 0, verifiedSuccessRate: 0, usageCount: 0, compatibility: 'current', driftCount: 0, ...(fields.health || {}) },
    approvalHistory: fields.approvalHistory || [], createdBy: fields.createdBy || null, createdAt: fields.createdAt || now, updatedAt: now,
  };
  validateTemplate(artifact);
  artifact.fingerprint = hash({ templateId: artifact.templateId, tenantId: artifact.tenantId, version: artifact.version, name: artifact.name, description: artifact.description, category: artifact.category, visibility: artifact.visibility, workflow: artifact.workflow, requiredVaultRefs: artifact.requiredVaultRefs, provenance: artifact.provenance });
  return artifact;
}

function validateTemplate(template) {
  for (const field of ['templateId', 'tenantId', 'version', 'name']) if (!template?.[field]) throw new Error(`Missing template field: ${field}`);
  if (!/^v[1-9]\d*$/.test(template.version)) throw new Error('Template version must use immutable vN format.');
  if (!STATES.has(template.state)) throw new Error('Unknown template state.');
  if (!VISIBILITIES.has(template.visibility)) throw new Error('Unknown template visibility.');
  const nodes = template.workflow?.nodes; const edges = template.workflow?.edges;
  if (!Array.isArray(nodes) || !nodes.length || !Array.isArray(edges)) throw new Error('Template requires a workflow graph.');
  if (nodes.filter((node) => node.type === 'mission').length !== 1) throw new Error('Template requires exactly one mission node.');
  if (nodes.filter((node) => ['trigger', 'webhook_trigger', 'schedule_trigger'].includes(node.type)).length !== 1) throw new Error('Template requires exactly one trigger node.');
  return template;
}

module.exports = { STATES, VISIBILITIES, createTemplate, healthFrom, normalizeWorkflow, sanitize, slug, templateFromConnector, templateFromSkill, validateTemplate };
