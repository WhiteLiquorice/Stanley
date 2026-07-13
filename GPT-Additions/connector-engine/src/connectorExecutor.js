const path = require('path');
const { evaluateAssertions } = require('../../trust-engine');
const { validateArtifact } = require('./artifact');
const { inspectPythonSource, spawnJson } = require('./pythonInspector');
const { assertSchema } = require('./schemaValidator');
const { containsSecret, redact, redactText, selectSecrets } = require('./redaction');

const RUNNER_PATH = path.resolve(__dirname, '../python/run_connector.py');
const inspectionCache = new Map();

class ConnectorExecutionError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.name = 'ConnectorExecutionError'; this.code = code; this.details = redact(details);
  }
}

function validateExecutionAuthorization(artifact, input, options) {
  const mode = options.mode === 'shadow' ? 'shadow' : 'live';
  if (artifact.publicationState !== 'published' && options.allowUnpublishedForTest !== true) throw new ConnectorExecutionError('NOT_PUBLISHED', 'Only published connectors may execute outside testing.');
  if (artifact.readWrite === 'write' && mode === 'live') {
    const approval = options.approval;
    if (!approval?.approvedBy || approval.connectorFingerprint !== artifact.fingerprint || approval.version !== artifact.version) throw new ConnectorExecutionError('APPROVAL_REQUIRED', 'This connector version requires explicit approval.');
    if (artifact.idempotencyPolicy?.mode === 'required_input_key') {
      const field = artifact.idempotencyPolicy.inputField || 'idempotencyKey';
      if (!input[field] || String(input[field]).length > 200) throw new ConnectorExecutionError('IDEMPOTENCY_REQUIRED', `Write connector input requires ${field}.`);
    }
  }
  return mode;
}

async function inspectArtifact(artifact, options = {}) {
  if (!options.force && inspectionCache.has(artifact.fingerprint)) return inspectionCache.get(artifact.fingerprint);
  const inspection = await inspectPythonSource(artifact.source, artifact);
  if (!inspection.ok) throw new ConnectorExecutionError('INSPECTION_FAILED', `Connector inspection failed: ${inspection.errors.join('; ')}`, { inspection });
  const undeclared = (inspection.vaultRefs || []).filter((ref) => !artifact.requiredVaultRefs.includes(ref));
  if (undeclared.length) throw new ConnectorExecutionError('VAULT_POLICY_VIOLATION', 'Connector source references undeclared vault entries.');
  inspectionCache.set(artifact.fingerprint, inspection);
  return inspection;
}

async function executeConnector(artifactInput, input = {}, availableSecrets = {}, options = {}) {
  const artifact = validateArtifact(artifactInput);
  assertSchema(input, artifact.inputSchema, 'Connector input');
  const mode = validateExecutionAuthorization(artifact, input, options);
  const secrets = selectSecrets(artifact.requiredVaultRefs, availableSecrets);
  const inspection = await inspectArtifact(artifact, options);
  const startedAt = Date.now();
  try {
    const stdout = await spawnJson({
      args: [RUNNER_PATH],
      input: JSON.stringify({ source: artifact.source, inputs: input, vault: secrets, policy: artifact, mode }),
      timeoutMs: artifact.timeoutMs + 1500,
      maxOutputBytes: artifact.maxOutputBytes,
      secrets,
    });
    let output;
    try { output = JSON.parse(stdout); } catch { throw new ConnectorExecutionError('INVALID_OUTPUT', 'Connector must return one valid JSON value.'); }
    if (containsSecret(output, secrets)) throw new ConnectorExecutionError('SECRET_EXFILTRATION', 'Connector output contained secret material.');
    assertSchema(output, artifact.outputSchema, 'Connector output');
    const assertions = evaluateAssertions(artifact.businessAssertions, { input, output, run: { connectorOutput: output, mode } });
    if (!assertions.passed) throw new ConnectorExecutionError('ASSERTION_FAILED', 'Connector completed technically, but its business assertions failed.', { assertions });
    return {
      success: true, output: redact(output, secrets), assertions: redact(assertions, secrets), inspection,
      mode, durationMs: Date.now() - startedAt, executionCostMicros: 0,
    };
  } catch (error) {
    if (error instanceof ConnectorExecutionError) throw error;
    throw new ConnectorExecutionError(error.code || 'EXECUTION_FAILED', redactText(error.message || 'Connector execution failed.', secrets), { durationMs: Date.now() - startedAt });
  }
}

module.exports = { ConnectorExecutionError, RUNNER_PATH, executeConnector, inspectArtifact, validateExecutionAuthorization };
