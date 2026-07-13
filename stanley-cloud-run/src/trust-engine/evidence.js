const crypto = require('crypto');

const SECRET_KEY = /(authorization|cookie|password|passwd|secret|token|api[-_]?key|private[-_]?key|session)/i;
const URL_KEY = /(url|uri|href|endpoint)/i;

function redactUrl(value) {
  try {
    const parsed = new URL(value);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return value;
  }
}

function redactEvidence(value, options = {}, depth = 0, key = '') {
  const maxDepth = Number(options.maxDepth || 8);
  const maxStringLength = Number(options.maxStringLength || 2000);
  const maxArrayLength = Number(options.maxArrayLength || 100);

  if (SECRET_KEY.test(key)) return '[REDACTED]';
  if (depth > maxDepth) return '[MAX_DEPTH]';
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    const safe = URL_KEY.test(key) ? redactUrl(value) : value;
    return safe.length > maxStringLength ? `${safe.slice(0, maxStringLength)}...[TRUNCATED]` : safe;
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, maxArrayLength).map((item) => redactEvidence(item, options, depth + 1, key));
    if (value.length > maxArrayLength) items.push(`[${value.length - maxArrayLength} MORE ITEMS]`);
    return items;
  }
  if (typeof value === 'object') {
    const output = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      output[childKey] = redactEvidence(childValue, options, depth + 1, childKey);
    }
    return output;
  }
  return String(value);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function proofHash(receipt) {
  const hashable = { ...receipt };
  delete hashable.proofHash;
  return crypto.createHash('sha256').update(stableStringify(hashable)).digest('hex');
}

function createReceipt(fields, options = {}) {
  const now = options.now || new Date().toISOString();
  const receipt = {
    schemaVersion: 1,
    id: fields.id || crypto.randomBytes(10).toString('hex'),
    runId: fields.runId,
    workflowId: fields.workflowId,
    nodeId: fields.nodeId || null,
    kind: fields.kind,
    outcome: fields.outcome || 'recorded',
    mode: fields.mode || 'live',
    occurredAt: fields.occurredAt || now,
    policy: redactEvidence(fields.policy || {}),
    evidence: redactEvidence(fields.evidence || {}, options.redaction),
  };
  receipt.proofHash = proofHash(receipt);
  return receipt;
}

module.exports = { createReceipt, proofHash, redactEvidence, stableStringify };
