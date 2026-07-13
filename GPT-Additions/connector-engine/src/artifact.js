const crypto = require('crypto');

const READ_METHODS = new Set(['GET', 'HEAD']);
const ALL_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);
const PUBLICATION_STATES = new Set(['discovered', 'generated', 'inspected', 'tested', 'approved', 'published', 'rejected', 'retired']);
const PROTECTED_POLICY_FIELDS = Object.freeze([
  'tenantId', 'readWrite', 'targetDomains', 'allowedMethods', 'allowedImports',
  'requiredVaultRefs', 'approvalPolicy', 'idempotencyPolicy', 'networkPolicy',
]);

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function hash(value) { return crypto.createHash('sha256').update(stableStringify(value)).digest('hex'); }

function normalizeDomain(value) {
  const domain = String(value || '').trim().toLowerCase().replace(/^\*\./, '');
  if (!domain || domain.length > 253 || domain.endsWith('.') || !/^[a-z0-9.-]+$/.test(domain) || domain.includes('..')) throw new Error(`Invalid target domain: ${value}`);
  if (domain === 'localhost' || /^(0|10|127|169\.254|192\.168)\./.test(domain) || /^172\.(1[6-9]|2\d|3[01])\./.test(domain)) throw new Error(`Private target domains are forbidden: ${value}`);
  return domain;
}

function normalizeStringArray(value, field) {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array.`);
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))].sort();
}

function validateArtifact(input) {
  const artifact = clone(input);
  const required = ['connectorId', 'tenantId', 'version', 'name', 'operationName', 'source', 'targetDomains', 'readWrite'];
  for (const field of required) if (!artifact || artifact[field] === undefined || artifact[field] === '') throw new Error(`Missing connector field: ${field}`);
  if (!/^[a-zA-Z0-9_-]{3,128}$/.test(String(artifact.connectorId))) throw new Error('connectorId has an invalid format.');
  if (!/^[a-zA-Z0-9_-]{2,128}$/.test(String(artifact.tenantId))) throw new Error('tenantId has an invalid format.');
  if (!/^v[1-9]\d*$/.test(String(artifact.version))) throw new Error('Connector version must use immutable vN format.');
  if (typeof artifact.source !== 'string' || !artifact.source.trim() || Buffer.byteLength(artifact.source) > 250_000) throw new Error('Connector source must be 1-250000 bytes.');
  artifact.targetDomains = normalizeStringArray(artifact.targetDomains, 'targetDomains').map(normalizeDomain);
  if (!artifact.targetDomains.length) throw new Error('At least one target domain is required.');
  if (!['read', 'write'].includes(artifact.readWrite)) throw new Error('readWrite must be read or write.');
  artifact.allowedMethods = normalizeStringArray(artifact.allowedMethods, 'allowedMethods').map((method) => method.toUpperCase());
  if (!artifact.allowedMethods.length || !artifact.allowedMethods.every((method) => ALL_METHODS.has(method))) throw new Error('Allowed HTTP methods are invalid.');
  if (artifact.readWrite === 'read' && artifact.allowedMethods.some((method) => !READ_METHODS.has(method))) throw new Error('Read connectors may only use GET or HEAD.');
  artifact.allowedImports = normalizeStringArray(artifact.allowedImports || [], 'allowedImports');
  artifact.requiredVaultRefs = normalizeStringArray(artifact.requiredVaultRefs || [], 'requiredVaultRefs');
  if (artifact.requiredVaultRefs.some((ref) => !/^[a-zA-Z0-9_.:-]{1,128}$/.test(ref))) throw new Error('Vault references contain invalid characters.');
  if (!PUBLICATION_STATES.has(artifact.publicationState || 'generated')) throw new Error('Unknown connector publication state.');
  if (artifact.readWrite === 'write' && artifact.approvalPolicy?.required !== true) throw new Error('Write connectors require approval.');
  if (artifact.readWrite === 'write' && artifact.idempotencyPolicy?.mode === 'none') throw new Error('Write connectors require an idempotency policy.');
  if (!Number.isInteger(artifact.timeoutMs) || artifact.timeoutMs < 100 || artifact.timeoutMs > 30000) throw new Error('timeoutMs must be between 100 and 30000.');
  if (!Number.isInteger(artifact.maxOutputBytes) || artifact.maxOutputBytes < 1 || artifact.maxOutputBytes > 5_000_000) throw new Error('maxOutputBytes is invalid.');
  if (!Number.isInteger(artifact.maxResponseBytes) || artifact.maxResponseBytes < 1 || artifact.maxResponseBytes > 10_000_000) throw new Error('maxResponseBytes is invalid.');
  if (!artifact.inputSchema || typeof artifact.inputSchema !== 'object' || !artifact.outputSchema || typeof artifact.outputSchema !== 'object') throw new Error('Input and output schemas are required.');
  if (!Array.isArray(artifact.businessAssertions) || !Array.isArray(artifact.regressionCases)) throw new Error('Assertions and regression cases must be arrays.');
  return artifact;
}

function protectedPolicy(artifact) {
  return Object.fromEntries(PROTECTED_POLICY_FIELDS.map((field) => [field, clone(artifact[field])]));
}

function protectedPolicyChanges(previous, candidate) {
  return PROTECTED_POLICY_FIELDS.filter((field) => stableStringify(previous?.[field]) !== stableStringify(candidate?.[field]));
}

function fingerprint(artifact) {
  const safe = clone(artifact);
  for (const field of ['approvalHistory', 'testResults', 'successCount', 'failureCount', 'latencyMsTotal', 'executionCostMicros', 'updatedAt', 'publishedAt', 'fingerprint']) delete safe[field];
  function removeSecretValues(value) {
    if (Array.isArray(value)) return value.map(removeSecretValues);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /(password|secret|token|api[-_]?key|authorization|cookie)/i.test(key) ? '[REDACTED]' : removeSecretValues(item)]));
  }
  return hash(removeSecretValues(safe));
}

function createArtifact(input, options = {}) {
  const now = options.now || new Date().toISOString();
  const artifact = validateArtifact({
    schemaVersion: 2,
    publicationState: 'generated',
    description: '',
    sourceLearningCase: null,
    timeoutMs: 15000,
    maxOutputBytes: 1_000_000,
    maxResponseBytes: 2_000_000,
    allowedImports: ['json', 're', 'datetime', 'urllib.parse', 'bs4'],
    allowedMethods: ['GET'],
    requiredVaultRefs: [],
    inputSchema: { type: 'object', additionalProperties: false },
    outputSchema: {},
    businessAssertions: [],
    regressionCases: [],
    approvalHistory: [],
    generationMetadata: {},
    testResults: [],
    rollbackVersion: null,
    idempotencyPolicy: { mode: input.readWrite === 'write' ? 'required_input_key' : 'not_applicable', inputField: 'idempotencyKey' },
    approvalPolicy: { required: input.readWrite === 'write', scope: input.readWrite === 'write' ? 'version' : 'none' },
    networkPolicy: { httpsOnly: true, maxRedirects: 2, maxRequests: 20, connectTimeoutMs: 5000, readTimeoutMs: 15000 },
    healthPolicy: { minRuns: 5, maxFailureRate: 0.25, autoRollbackRepairs: true },
    successCount: 0,
    failureCount: 0,
    latencyMsTotal: 0,
    generationCostMicros: 0,
    executionCostMicros: 0,
    createdAt: now,
    updatedAt: now,
    ...input,
  });
  const complete = { ...artifact, protectedPolicyHash: hash(protectedPolicy(artifact)) };
  complete.fingerprint = fingerprint(complete);
  return Object.freeze(complete);
}

module.exports = {
  ALL_METHODS, PROTECTED_POLICY_FIELDS, PUBLICATION_STATES, READ_METHODS,
  clone, createArtifact, fingerprint, hash, normalizeDomain, protectedPolicy,
  protectedPolicyChanges, stableStringify, validateArtifact,
};
