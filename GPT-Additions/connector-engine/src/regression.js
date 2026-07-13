const { executeConnector } = require('./connectorExecutor');
const { redact } = require('./redaction');

async function runConnectorRegressions({ artifact, cases = artifact.regressionCases, secrets = {}, now = new Date().toISOString() }) {
  if (!Array.isArray(cases) || !cases.length) throw new Error('At least one connector regression case is required.');
  const results = [];
  for (const testCase of cases) {
    const startedAt = Date.now();
    try {
      const execution = await executeConnector(artifact, testCase.input || {}, secrets, { mode: artifact.readWrite === 'write' ? 'shadow' : 'live', allowUnpublishedForTest: true, force: true });
      const expected = testCase.expectedOutput;
      const outputMatched = expected === undefined || JSON.stringify(execution.output) === JSON.stringify(expected);
      results.push({ id: testCase.id, label: testCase.label || testCase.id, passed: outputMatched, durationMs: Date.now() - startedAt, mode: execution.mode, assertionResults: execution.assertions.results, error: outputMatched ? null : 'Output did not match expected result.' });
    } catch (error) {
      results.push({ id: testCase.id, label: testCase.label || testCase.id, passed: false, durationMs: Date.now() - startedAt, mode: artifact.readWrite === 'write' ? 'shadow' : 'live', assertionResults: [], error: error.message, code: error.code });
    }
  }
  return redact({ schemaVersion: 1, connectorId: artifact.connectorId, version: artifact.version, passed: results.every((item) => item.passed), total: results.length, passedCount: results.filter((item) => item.passed).length, results, completedAt: now });
}

module.exports = { runConnectorRegressions };
