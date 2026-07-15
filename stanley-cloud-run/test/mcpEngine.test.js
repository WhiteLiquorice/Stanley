const test = require('node:test');
const assert = require('node:assert/strict');
const { McpService, callMcpTool } = require('../src/mcp-engine');

function fakeDb(workflows) {
  const credentials = new Map();
  return {
    collection() {
      return { doc(uid) {
        return { collection(name) {
          if (name === 'credentials') return { doc: () => ({ set: async (value) => credentials.set(uid, value), get: async () => ({ exists: credentials.has(uid), data: () => credentials.get(uid) }) }) };
          if (name === 'workflows') return { limit: () => ({ get: async () => ({ docs: workflows.map((value) => ({ id: value.id, data: () => value })) }) }) };
          throw new Error(`Unexpected collection ${name}`);
        } };
      } };
    },
  };
}

test('MCP keys authenticate tenants and expose only published tools', async () => {
  const workflows = [
    { id: 'published', name: 'Published', activeProductionReleaseId: 'rel-1', contract: { inputSchema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } },
    { id: 'draft', name: 'Draft' },
  ];
  let submitted = null;
  const service = new McpService({ db: fakeDb(workflows), loadWorkflow: async (_uid, id) => workflows.find((item) => item.id === id), submitRun: async (uid, id, options) => { submitted = { uid, id, options }; return { id: 'run-1', state: 'queued' }; } });
  const key = await service.rotateKey('tenant-1');
  assert.equal(await service.authenticate(key), 'tenant-1');
  assert.equal(await service.authenticate(`${key}x`), null);
  const tools = await service.tools('tenant-1');
  assert.deepEqual(tools.map((item) => item.name), ['workflow_published']);
  await assert.rejects(() => service.call('tenant-1', 'workflow_published', {}), /required/);
  const result = await service.call('tenant-1', 'workflow_published', { name: 'Ada' });
  assert.equal(submitted.options.trigger, 'MCP');
  assert.match(result.content[0].text, /run-1/);
});

test('MCP client negotiates a session before calling a tool', async () => {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body); calls.push({ body, headers: init.headers });
    if (body.method === 'initialize') return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-03-26', capabilities: {} } }), { status: 200, headers: { 'content-type': 'application/json', 'mcp-session-id': 'session-1' } });
    if (body.method === 'notifications/initialized') return new Response('', { status: 202 });
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'done' }] } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const result = await callMcpTool({ serverUrl: 'https://mcp.example/rpc', toolName: 'search', arguments: { q: 'Stanley' }, fetchImpl });
  assert.equal(calls.length, 3);
  assert.equal(calls[1].headers['Mcp-Session-Id'], 'session-1');
  assert.equal(calls[2].body.params.arguments.q, 'Stanley');
  assert.equal(result.content[0].text, 'done');
});
