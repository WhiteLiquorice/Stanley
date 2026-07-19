const crypto = require('node:crypto');
const { classifyError } = require('./errors');

function tenantHash(uid) { return crypto.createHash('sha256').update(String(uid || '')).digest('hex').slice(0, 12); }
function cleanFields(fields = {}) {
  const allowed = ['runId', 'workflowId', 'state', 'attempt', 'durationMs', 'nodeId', 'nodeType', 'code', 'dispatchMode', 'waitType'];
  return Object.fromEntries(allowed.filter((key) => fields[key] !== undefined && fields[key] !== null).map((key) => [key, fields[key]]));
}
function emitTelemetry(name, fields = {}, logger = console.log) {
  const event = {
    schemaVersion: 1, component: 'stanley-runner', event: name,
    occurredAt: new Date().toISOString(),
    ...(fields.uid ? { tenantHash: tenantHash(fields.uid) } : {}),
    ...cleanFields(fields),
  };
  logger(JSON.stringify(event));
  return event;
}
function errorTelemetry(error) { const classified = classifyError(error); return { code: classified.code, retryable: classified.retryable }; }

module.exports = { cleanFields, emitTelemetry, errorTelemetry, tenantHash };
