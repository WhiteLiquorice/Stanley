const crypto = require('crypto');
const { assertSchema, validateSchema } = require('../connector-engine/src/schemaValidator');

function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function fingerprint(value) { return crypto.createHash('sha256').update(stable(value)).digest('hex'); }
function objectSchema(value, fallback = {}) { return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback; }

function normalizeWorkflowContract(workflow) {
  const declared = objectSchema(workflow.contract);
  return {
    schemaVersion: 1,
    inputSchema: objectSchema(declared.inputSchema || workflow.inputSchema, { type: 'object', additionalProperties: true }),
    outputSchema: objectSchema(declared.outputSchema || workflow.outputSchema, { type: 'object' }),
    outputNodeId: declared.outputNodeId || workflow.outputNodeId || null,
    description: String(declared.description || workflow.description || '').slice(0, 1000),
  };
}

function normalizeModelPolicy(workflow) {
  const requested = objectSchema(workflow.modelPolicy); const profile = ['deterministic', 'fast', 'balanced', 'quality'].includes(requested.profile) ? requested.profile : 'balanced';
  const defaults = { deterministic: [0, 0], fast: [4, 12000], balanced: [12, 30000], quality: [25, 60000] }[profile];
  return { schemaVersion: 1, profile, maxModelCalls: Math.max(0, Math.min(50, Number(requested.maxModelCalls ?? defaults[0]))), maxContextChars: Math.max(2000, Math.min(100000, Number(requested.maxContextChars ?? (defaults[1] || 2000)))), allowVision: profile !== 'deterministic' && requested.allowVision !== false, fallbackEnabled: profile !== 'deterministic' && requested.fallbackEnabled !== false, extractionProfile: requested.extractionProfile === 'quality' ? 'quality' : 'fast' };
}

function normalizeContextPolicy(workflow) {
  const requested = objectSchema(workflow.contextPolicy);
  return { schemaVersion: 1, defaultVisibility: ['model', 'ephemeral', 'hidden'].includes(requested.defaultVisibility) ? requested.defaultVisibility : 'ephemeral', maxObservationChars: Math.max(500, Math.min(30000, Number(requested.maxObservationChars || 6000))), retainNodeOutputs: Math.max(1, Math.min(30, Number(requested.retainNodeOutputs || 8))) };
}

function workflowOutput(workflow, scraped) { const contract = normalizeWorkflowContract(workflow); if (contract.outputNodeId) return scraped?.[contract.outputNodeId]; return scraped || {}; }
function validateWorkflowInput(workflow, input) { return assertSchema(input || {}, normalizeWorkflowContract(workflow).inputSchema, 'workflow input'); }
function validateWorkflowOutput(workflow, scraped) { const output = workflowOutput(workflow, scraped); assertSchema(output, normalizeWorkflowContract(workflow).outputSchema, 'workflow output'); return output; }

function releaseSnapshot(workflow, fields = {}) {
  const snapshot = { schemaVersion: 1, workflowId: workflow.id, name: workflow.name, nodes: workflow.nodes || [], edges: workflow.edges || [], contract: normalizeWorkflowContract(workflow), modelPolicy: normalizeModelPolicy(workflow), contextPolicy: normalizeContextPolicy(workflow), executionPolicy: workflow.executionPolicy || {}, trustPolicy: workflow.trustPolicy || {}, regressionCases: workflow.regressionCases || [], createdAt: fields.createdAt || new Date().toISOString(), createdBy: fields.createdBy || null, notes: String(fields.notes || '').slice(0, 2000) };
  return { ...snapshot, fingerprint: fingerprint(snapshot) };
}

module.exports = { fingerprint, normalizeContextPolicy, normalizeModelPolicy, normalizeWorkflowContract, releaseSnapshot, validateSchema, validateWorkflowInput, validateWorkflowOutput, workflowOutput };
