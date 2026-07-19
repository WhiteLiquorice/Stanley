const runnerUrl = String(process.env.STANLEY_CERT_RUNNER_URL || '').replace(/\/$/, '');
const token = process.env.STANLEY_CERT_ID_TOKEN || '';
const allowRuns = process.env.STANLEY_CERT_ALLOW_RUNS === 'true';
const allowExternalWrites = process.env.STANLEY_CERT_ALLOW_EXTERNAL_WRITES === 'true';
const canaries = process.env.STANLEY_CERT_CANARIES_JSON ? JSON.parse(process.env.STANLEY_CERT_CANARIES_JSON) : [];
const passed = [], skipped = [], failed = [];

async function request(path, init = {}, authenticated = true) {
  const response = await fetch(`${runnerUrl}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `${path} returned ${response.status}`);
  return payload;
}
async function poll(runId, timeoutMs = 180000) { const deadline = Date.now() + timeoutMs; while (Date.now() < deadline) { const { run } = await request(`/v1/runs/${encodeURIComponent(runId)}`); if (['completed', 'failed', 'cancelled', 'pending_approval', 'waiting'].includes(run.state)) return run; await new Promise((resolve) => setTimeout(resolve, 1500)); } throw new Error(`Canary run ${runId} did not settle before timeout.`); }
async function gate(name, fn) { try { await fn(); passed.push(name); } catch (error) { failed.push(`${name}: ${error.message}`); } }
function assertCanaryOutput(output, expected = {}) {
  if (!Object.keys(expected).length) return;
  if (!Array.isArray(output)) throw new Error('expected an array output');
  if (expected.minItems && output.length < Number(expected.minItems)) throw new Error(`expected at least ${expected.minItems} output records, received ${output.length}`);
  for (const [index, record] of output.entries()) for (const field of expected.requiredFields || []) if (!String(record?.[field] || '').trim()) throw new Error(`output record ${index + 1} is missing ${field}`);
  if (expected.uniqueBy) { const values = output.map((record) => String(record?.[expected.uniqueBy] || '').trim().toLowerCase()).filter(Boolean); if (new Set(values).size !== values.length) throw new Error(`${expected.uniqueBy} output values are not unique`); }
}

if (!runnerUrl) skipped.push('live runner health and credentialed canaries (STANLEY_CERT_RUNNER_URL is unset)');
else {
  await gate('runner health', async () => { const health = await request('/health', {}, false); if (!health.ok) throw new Error('runner did not report healthy'); if (health.reliability?.profile !== 'v2') throw new Error(`reliability profile is ${health.reliability?.profile || 'unknown'}, expected v2`); });
  if (!token) skipped.push('authenticated account, OAuth, preflight, and run canaries (STANLEY_CERT_ID_TOKEN is unset)');
  else {
    await gate('Google OAuth status contract', async () => { const status = await request('/v1/oauth/google'); if (typeof status.connected !== 'boolean') throw new Error('status response is malformed'); });
    if (!allowRuns) skipped.push('workflow canaries (STANLEY_CERT_ALLOW_RUNS is not true)');
    for (const canary of allowRuns ? canaries : []) {
      if (!canary.workflowId) { failed.push('canary entry is missing workflowId'); continue; }
      if (canary.sideEffect === true && !allowExternalWrites) { skipped.push(`${canary.name || canary.workflowId} (external writes require STANLEY_CERT_ALLOW_EXTERNAL_WRITES=true)`); continue; }
      await gate(`canary: ${canary.name || canary.workflowId}`, async () => {
        await request(`/v1/workflows/${encodeURIComponent(canary.workflowId)}/preflight`);
        const submission = await request(`/v1/workflows/${encodeURIComponent(canary.workflowId)}/runs`, { method: 'POST', headers: { 'X-Idempotency-Key': `cert:${canary.workflowId}:${Date.now()}` }, body: JSON.stringify({ input: canary.input || {} }) });
        let run = submission.run; if (!['completed', 'failed', 'cancelled', 'pending_approval', 'waiting'].includes(run.state)) run = await poll(run.id);
        if (canary.expectApproval) { if (!['pending_approval', 'waiting'].includes(run.state)) throw new Error(`expected approval pause, got ${run.state}`); const rejected = await request(`/v1/runs/${encodeURIComponent(run.id)}/approval`, { method: 'POST', body: JSON.stringify({ decision: 'reject' }) }); if (rejected.run.state !== 'cancelled') throw new Error('approval rejection did not cancel the run'); }
        else if (run.state !== 'completed') throw new Error(run.error || `run ended in ${run.state}`);
        else assertCanaryOutput(run.output, canary.expectedOutput || {});
      });
    }
    if (allowRuns && !canaries.length) skipped.push('workflow canaries (STANLEY_CERT_CANARIES_JSON is empty)');
  }
}
console.log(`Capability certification: ${passed.length} passed, ${skipped.length} skipped, ${failed.length} failed.`);
passed.forEach((item) => console.log(`PASS ${item}`)); skipped.forEach((item) => console.log(`SKIP ${item}`)); failed.forEach((item) => console.error(`FAIL ${item}`));
if (failed.length) process.exit(1);
