const { TrustRuntime } = require('../../trust-engine');

async function executeTrustedWorkflow({
  store,
  uid,
  runId,
  workflow,
  secrets = {},
  input = {},
  runRecord = {},
  runner,
  runnerOptions = {},
  trustMode,
  resumeCheckpoint = null,
}) {
  if (typeof runner !== 'function') throw new Error('executeTrustedWorkflow requires a runner function.');
  const trust = new TrustRuntime({
    store,
    uid,
    runId,
    workflow,
    overrides: trustMode ? { mode: trustMode } : {},
    resumeCheckpoint,
  });
  const prepared = await trust.begin(input);
  try {
    const result = await runner(prepared.workflow, secrets, input, { ...runnerOptions, trust });
    const trustReport = await trust.finish({ input, scraped: result.scraped || {}, run: runRecord });
    return {
      ...result,
      trustReport,
      trustState: trustReport.verified ? 'verified' : 'needs_attention',
      trustMode: prepared.policy.mode,
    };
  } catch (error) {
    await trust.runFailed(error, { run: runRecord });
    error.trustState = 'needs_attention';
    throw error;
  }
}

module.exports = { executeTrustedWorkflow };
