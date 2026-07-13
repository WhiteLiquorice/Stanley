const { evaluateAssertions, redactEvidence } = require('../../trust-engine');
const { applyRepairOperations } = require('./repairProposal');

async function runRegressionSuite({ workflow, proposal, cases = [], executeCase, now = new Date().toISOString() }) {
  if (typeof executeCase !== 'function') throw new Error('Regression suite requires executeCase.');
  if (!Array.isArray(cases) || cases.length === 0) throw new Error('At least one regression case is required.');
  const candidate = applyRepairOperations(workflow, proposal, { allowDraft: true });
  const results = [];
  for (const regressionCase of cases) {
    const startedAt = Date.now();
    try {
      const execution = await executeCase({ workflow: candidate, regressionCase });
      const assertionResult = evaluateAssertions(regressionCase.assertions || workflow.assertions || [], {
        input: regressionCase.input || {},
        scraped: execution.scraped || {},
        run: execution.run || {},
      });
      results.push({
        id: regressionCase.id,
        label: regressionCase.label || regressionCase.id,
        passed: execution.success !== false && assertionResult.passed,
        durationMs: Date.now() - startedAt,
        assertionResults: redactEvidence(assertionResult.results),
        error: execution.success === false ? execution.error || 'Execution failed.' : null,
      });
    } catch (error) {
      results.push({
        id: regressionCase.id,
        label: regressionCase.label || regressionCase.id,
        passed: false,
        durationMs: Date.now() - startedAt,
        assertionResults: [],
        error: error.message || 'Regression execution failed.',
      });
    }
  }
  return {
    schemaVersion: 1,
    proposalId: proposal.id,
    passed: results.every((result) => result.passed),
    total: results.length,
    passedCount: results.filter((result) => result.passed).length,
    results,
    completedAt: now,
  };
}

module.exports = { runRegressionSuite };
