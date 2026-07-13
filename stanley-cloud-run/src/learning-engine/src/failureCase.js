const crypto = require('crypto');
const { redactEvidence, stableStringify } = require('../../trust-engine');

function normalizeMessage(message = '') {
  return String(message)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '[url]')
    .replace(/\b[0-9a-f]{8,}\b/gi, '[id]')
    .replace(/\b\d+\b/g, '[number]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function normalizeUrl(value = '') {
  try {
    const parsed = new URL(value);
    const path = parsed.pathname
      .split('/')
      .map((part) => (/^\d+$|^[0-9a-f-]{8,}$/i.test(part) ? ':id' : part))
      .join('/');
    return `${parsed.origin}${path}`;
  } catch {
    return '';
  }
}

function failureFingerprint({ workflowId, nodeId, nodeType, error, url }) {
  const signature = {
    workflowId: workflowId || null,
    nodeId: nodeId || null,
    nodeType: nodeType || null,
    errorName: error?.name || 'Error',
    errorCode: error?.code || null,
    message: normalizeMessage(error?.message || error),
    url: normalizeUrl(url),
  };
  return crypto.createHash('sha256').update(stableStringify(signature)).digest('hex');
}

function createFailureCase(fields, options = {}) {
  const now = options.now || new Date().toISOString();
  const fingerprint = failureFingerprint(fields);
  return {
    schemaVersion: 1,
    id: fields.id || `case-${fingerprint.slice(0, 16)}`,
    fingerprint,
    workflowId: fields.workflowId,
    runId: fields.runId,
    nodeId: fields.nodeId || null,
    nodeType: fields.nodeType || null,
    state: 'open',
    occurrenceCount: Number(fields.occurrenceCount || 1),
    normalizedError: normalizeMessage(fields.error?.message || fields.error),
    evidence: redactEvidence({
      url: normalizeUrl(fields.url),
      error: { name: fields.error?.name, code: fields.error?.code, message: fields.error?.message || String(fields.error || '') },
      nodeData: fields.nodeData,
      pageEvidence: fields.pageEvidence,
      trustReceiptIds: fields.trustReceiptIds,
    }),
    createdAt: fields.createdAt || now,
    updatedAt: now,
  };
}

module.exports = { createFailureCase, failureFingerprint, normalizeMessage, normalizeUrl };
