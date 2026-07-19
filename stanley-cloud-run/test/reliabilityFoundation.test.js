const test = require('node:test');
const assert = require('node:assert/strict');
const { FLAG_DEFAULTS, ERROR_CODES, assertSafeUrl, baselineMatches, classifyError, collectVaultReferences, emitTelemetry, isPrivateIp, lintWorkflow, reliabilitySnapshot, reserveBucket, retryAfterMs, retryDecision } = require('../src/reliability');
const { validateWorkflow } = require('../src/workflowContract');
const { claimRunRecord } = require('../src/runLifecycle');
const { goldenWorkflows } = require('./fixtures/goldenWorkflows');
const { workflowNeedsBrowser } = require('../src/contextualRunner');
const { pruneLeases } = require('../src/browser-runtime/distributedLifecycle');

test('reliability flags are compatibility-safe and can be enabled together', () => {
  const baseline = reliabilitySnapshot({});
  assert.equal(baseline.profile, 'compatibility');
  assert.deepEqual(baseline.flags, FLAG_DEFAULTS);
  const enabled = reliabilitySnapshot({ STANLEY_RELIABILITY_V2: 'true' });
  assert.equal(enabled.profile, 'v2');
  assert.ok(Object.values(enabled.flags).every(Boolean));
});

test('error taxonomy separates retryable, permanent, auth, and capacity failures', () => {
  assert.equal(classifyError({ status: 429, message: 'slow down' }).code, ERROR_CODES.RATE_LIMITED);
  assert.equal(classifyError({ status: 401, message: 'expired' }).code, ERROR_CODES.AUTHENTICATION_REQUIRED);
  assert.equal(classifyError({ code: 'BROWSER_CAPACITY', message: 'full' }).code, ERROR_CODES.BROWSER_CAPACITY);
  assert.equal(classifyError({ status: 400, message: 'bad input' }).retryable, false);
  assert.equal(retryAfterMs('2'), 2000);
});

test('writes never retry after an unknown effect outcome', () => {
  const decision = retryDecision({ status: 503, message: 'provider unavailable' }, { attempt: 1, maxAttempts: 3, readWrite: 'write', effectState: 'executing' });
  assert.equal(decision.retry, false);
  assert.equal(decision.error.code, ERROR_CODES.EFFECT_UNKNOWN);
  assert.equal(retryDecision({ status: 503, message: 'provider unavailable' }, { attempt: 1, maxAttempts: 3, readWrite: 'read' }).retry, true);
});

test('golden workflows remain valid under the symbolic execution contract', () => {
  for (const workflow of Object.values(goldenWorkflows)) assert.doesNotThrow(() => validateWorkflow(workflow), workflow.name);
});

test('run leases allow exactly one owner and recover only after expiry', () => {
  const queued = { id: 'run-1', state: 'queued', attempts: 0, logs: [] };
  const first = claimRunRecord(queued, { leaseId: 'lease-a', owner: 'worker-a', nowMs: 1_000, leaseMs: 5_000 });
  assert.equal(first.state, 'running');
  assert.equal(first.attempts, 1);
  assert.equal(claimRunRecord(first, { leaseId: 'lease-b', owner: 'worker-b', nowMs: 2_000, leaseMs: 5_000 }), null);
  const recovered = claimRunRecord(first, { leaseId: 'lease-b', owner: 'worker-b', nowMs: 7_000, leaseMs: 5_000 });
  assert.equal(recovered.lease.id, 'lease-b');
  assert.equal(recovered.attempts, 2);
  assert.match(recovered.logs.at(-1), /abandoned/i);
});

test('monitor baselines commit only against the version that was observed', () => {
  assert.equal(baselineMatches('old', 'old'), true);
  assert.equal(baselineMatches(null, null), true);
  assert.equal(baselineMatches('newer-run', 'old'), false);
});

test('workflow vault resolution is limited to explicit symbolic references', () => {
  const refs = [...collectVaultReferences({ nodes: [
    { type: 'type', data: { value: 'vault:Login.password' } },
    { type: 'mcp_tool', data: { vaultKey: 'mcp.token' } },
    { type: 'integration', data: { integrationName: 'slack_post_message' } },
  ] })];
  assert.ok(refs.includes('Login.password'));
  assert.ok(refs.includes('mcp.token'));
  assert.ok(refs.includes('SlackToken'));
  assert.equal(refs.includes('unrelated.secret'), false);
});

test('safe egress rejects private and metadata targets before a request is sent', async () => {
  assert.equal(isPrivateIp('127.0.0.1'), true);
  assert.equal(isPrivateIp('10.2.3.4'), true);
  assert.equal(isPrivateIp('8.8.8.8'), false);
  await assert.rejects(() => assertSafeUrl('http://127.0.0.1/admin'), /private|local/i);
  await assert.rejects(() => assertSafeUrl('http://metadata.google.internal/computeMetadata/v1'), /metadata/i);
  const publicUrl = await assertSafeUrl('https://api.example.test/path', { resolver: async () => [{ address: '8.8.8.8' }] });
  assert.equal(publicUrl.hostname, 'api.example.test');
});

test('API-only workflows bypass browser startup and URL requirements', () => {
  assert.equal(workflowNeedsBrowser({ nodes: [{ type: 'integration', data: { integrationName: 'github_list_repos' } }] }), false);
  assert.equal(workflowNeedsBrowser({ nodes: [{ type: 'http_request', data: { url: 'https://api.example.test' } }] }), false);
  assert.equal(workflowNeedsBrowser({ nodes: [{ type: 'click', data: { description: 'Submit' } }] }), true);
});

test('preflight lint reports unreachable and ambiguous graph behavior without mutating it', () => {
  const workflow = structuredClone(goldenWorkflows.apiOnlyRead);
  workflow.nodes.push({ id: 'branch', type: 'transform', data: { operation: 'trim' } });
  workflow.nodes.push({ id: 'orphan', type: 'transform', data: { operation: 'trim' } });
  workflow.edges.push({ source: 'trigger', target: 'branch' });
  const report = lintWorkflow(workflow);
  assert.equal(report.valid, true);
  assert.ok(report.warnings.some((warning) => /unreachable/.test(warning)));
  assert.ok(report.warnings.some((warning) => /multiple unconditional/.test(warning)));
});

test('distributed browser capacity ignores expired leases deterministically', () => {
  const leases = pruneLeases({ active: { expiresAt: 2000 }, expired: { expiresAt: 999 } }, 1000);
  assert.deepEqual(Object.keys(leases), ['active']);
});

test('tenant queue admission absorbs bursts and computes a bounded delay', () => {
  const first = reserveBucket({}, 1000, { ratePerMinute: 60, burst: 1 });
  assert.equal(first.delaySeconds, 0);
  const second = reserveBucket(first, 1000, { ratePerMinute: 60, burst: 1 });
  assert.equal(second.delaySeconds, 1);
  const recovered = reserveBucket(second, 3000, { ratePerMinute: 60, burst: 1 });
  assert.equal(recovered.delaySeconds, 0);
});

test('structured telemetry hashes tenants and ignores arbitrary secret fields', () => {
  const output = [];
  const event = emitTelemetry('run_started', { uid: 'tenant-a', runId: 'run-1', secret: 'do-not-log' }, (line) => output.push(line));
  assert.equal(event.runId, 'run-1');
  assert.equal(event.secret, undefined);
  assert.notEqual(event.tenantHash, 'tenant-a');
  assert.equal(JSON.parse(output[0]).event, 'run_started');
});
