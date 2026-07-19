const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const fsPromises = require('node:fs/promises');
const { OPERATIONS, PROVIDERS, executeNativeIntegration } = require('../src/native-integration-engine');

function response(body, init = {}) {
  return new Response(body == null ? null : JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
}

test('native catalog exactly implements every frontend operation id', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/lib/integrationsCatalog.ts'), 'utf8');
  const frontendIds = [...source.matchAll(/\{\s*id:\s*'([^']+)'/g)].map((match) => match[1]);
  const backendIds = OPERATIONS.map((operation) => operation.id);
  assert.equal(frontendIds.length, 227);
  assert.equal(backendIds.length, 227);
  assert.deepEqual(new Set(backendIds), new Set(frontendIds));
  assert.equal(new Set(OPERATIONS.map((operation) => operation.app)).size, 40);
  assert.equal(Object.keys(PROVIDERS).length, 40);
});

test('every operation carries an executable contract and credential declaration', () => {
  for (const operation of OPERATIONS) {
    assert.match(operation.id, /^[a-z][a-z0-9_]+$/);
    assert.ok(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(operation.method));
    assert.ok(['read', 'write'].includes(operation.readWrite));
    assert.equal(operation.approvalRequired, operation.readWrite === 'write');
    assert.equal(operation.inputSchema.type, 'object');
    assert.ok(Array.isArray(operation.requiredVaultRefs));
    assert.ok(operation.requiredVaultRefs.length > 0);
  }
});

test('GitHub read operation resolves path, query, and vault auth deterministically', async () => {
  let request;
  const result = await executeNativeIntegration('github_list_commits', {
    path: { owner: 'openai', repo: 'codex' }, query: { per_page: 5 },
  }, { GitHubToken: 'secret-token' }, { fetchImpl: async (url, init) => { request = { url: String(url), init }; return response([{ sha: 'abc' }]); } });
  assert.equal(request.url, 'https://api.github.com/repos/openai/codex/commits?per_page=5');
  assert.equal(request.init.method, 'GET');
  assert.equal(request.init.headers.Authorization, 'Bearer secret-token');
  assert.deepEqual(result.output, [{ sha: 'abc' }]);
  assert.equal(result.readWrite, 'read');
});

test('Slack write operation sends JSON and receives a stable idempotency key', async () => {
  let request;
  await executeNativeIntegration('slack_post_message', { body: { channel: 'C123', text: 'Hello' } }, { SlackToken: 'xoxb-secret' }, {
    idempotencyKey: 'run-1:node-2',
    fetchImpl: async (url, init) => { request = { url: String(url), init }; return response({ ok: true }); },
  });
  assert.equal(request.url, 'https://slack.com/api/chat.postMessage');
  assert.equal(request.init.headers.Authorization, 'Bearer xoxb-secret');
  assert.equal(request.init.headers['Idempotency-Key'], 'run-1:node-2');
  assert.deepEqual(JSON.parse(request.init.body), { channel: 'C123', text: 'Hello' });
});

test('form providers encode nested request bodies using provider bracket notation', async () => {
  let body;
  await executeNativeIntegration('stripe_create_price', { body: { currency: 'usd', unit_amount: 1200, recurring: { interval: 'month' } } }, { StripeSecretKey: 'sk-secret' }, {
    fetchImpl: async (_url, init) => { body = init.body; return response({ id: 'price_1' }); },
  });
  assert.equal(body, 'currency=usd&unit_amount=1200&recurring%5Binterval%5D=month');
});

test('runtime rejects missing credentials, host injection, and auth overrides', async () => {
  await assert.rejects(() => executeNativeIntegration('github_list_repos', {}, {}, { fetchImpl: async () => response([]) }), /Missing vault credential/);
  await assert.rejects(() => executeNativeIntegration('docusign_list_envelopes', { connection: { accountBaseHost: 'attacker.example.com', accountId: '123' } }, { DocuSignAccessToken: 'secret' }, { fetchImpl: async () => response([]) }), /must end/i);
  await assert.rejects(() => executeNativeIntegration('github_list_repos', { headers: { Authorization: 'Bearer attacker' } }, { GitHubToken: 'secret' }, { fetchImpl: async () => response([]) }), /managed by Stanley/);
});

test('provider failures expose status without leaking response bodies or credentials', async () => {
  await assert.rejects(
    () => executeNativeIntegration('github_list_repos', {}, { GitHubToken: 'top-secret' }, { fetchImpl: async () => response({ message: 'top-secret internal detail' }, { status: 401 }) }),
    (error) => error.code === 'PROVIDER_REQUEST_FAILED' && /GitHub request failed \(401\)/.test(error.message) && !error.message.includes('top-secret'),
  );
});

test('provider resilience retries transient reads but never blindly retries writes', async () => {
  let readCalls = 0;
  const readResult = await executeNativeIntegration('github_list_repos', {}, { GitHubToken: 'secret' }, {
    providerResilience: true, sleepImpl: async () => {},
    fetchImpl: async () => { readCalls += 1; return readCalls < 3 ? response({}, { status: 503 }) : response([{ id: 1 }]); },
  });
  assert.equal(readCalls, 3);
  assert.deepEqual(readResult.output, [{ id: 1 }]);

  let writeCalls = 0;
  await assert.rejects(() => executeNativeIntegration('slack_post_message', { body: { channel: 'C1', text: 'Hi' } }, { SlackToken: 'secret' }, {
    providerResilience: true, sleepImpl: async () => {}, fetchImpl: async () => { writeCalls += 1; return response({}, { status: 503 }); },
  }), /Slack request failed/);
  assert.equal(writeCalls, 1);
});

test('artifact upload operations read tenant artifacts without embedding file content in workflows', async () => {
  const fixture = path.join(os.tmpdir(), `stanley-native-${Date.now()}.txt`);
  await fsPromises.writeFile(fixture, 'artifact payload');
  let request;
  const artifactService = { localPath: async (uid, id) => {
    assert.equal(uid, 'tenant-a'); assert.equal(id, 'artifact-1');
    return { path: fixture, artifact: { name: 'payload.txt', mimeType: 'text/plain' }, cleanup: async () => fsPromises.unlink(fixture).catch(() => {}) };
  } };
  await executeNativeIntegration('drive_upload_file', { artifactId: 'artifact-1', body: {} }, { GoogleOAuthToken: 'secret' }, {
    uid: 'tenant-a', artifactService,
    fetchImpl: async (url, init) => { request = { url: String(url), init }; return response({ id: 'file-1' }); },
  });
  assert.equal(request.url, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=media');
  assert.equal(request.init.headers['Content-Type'], 'text/plain');
  assert.equal(Buffer.from(request.init.body).toString('utf8'), 'artifact payload');
});

test('binary download operations persist provider bytes as tenant artifacts', async () => {
  let created;
  const artifactService = { create: async (uid, artifact) => {
    created = { uid, ...artifact };
    return { id: 'artifact-2', name: artifact.name, mimeType: artifact.mimeType, size: artifact.buffer.length };
  } };
  const result = await executeNativeIntegration('dropbox_download_file', { body: { path: '/report.pdf' } }, { DropboxAccessToken: 'secret' }, {
    uid: 'tenant-a', runId: 'run-1', artifactService,
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers['Dropbox-API-Arg'], JSON.stringify({ path: '/report.pdf' }));
      return new Response(Buffer.from('%PDF-test'), { status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="report.pdf"' } });
    },
  });
  assert.equal(created.uid, 'tenant-a');
  assert.equal(created.name, 'report.pdf');
  assert.equal(created.source, 'native_integration');
  assert.equal(created.buffer.toString('utf8'), '%PDF-test');
  assert.equal(result.output.id, 'artifact-2');
});
