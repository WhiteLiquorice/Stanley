function requestId(prefix = 'mcp') { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

async function readMcpResponse(response) {
  const text = await response.text();
  if (!response.ok) throw new Error(`MCP server returned ${response.status}: ${text.slice(0, 300)}`);
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    const data = text.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).find((line) => line && line !== '[DONE]');
    if (!data) throw new Error('MCP server returned an empty event stream.');
    return JSON.parse(data);
  }
  return text ? JSON.parse(text) : null;
}

async function callMcpTool({ serverUrl, toolName, arguments: toolArguments = {}, token = '', fetchImpl = fetch }) {
  if (!toolName) throw new Error('MCP tool name is required.');
  const parsed = new URL(serverUrl);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname))) throw new Error('MCP server must use HTTPS.');
  const commonHeaders = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const post = async (body, sessionId = '') => {
    const response = await fetchImpl(parsed.toString(), { method: 'POST', headers: { ...commonHeaders, ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}) }, body: JSON.stringify(body) });
    return { payload: await readMcpResponse(response), sessionId: response.headers.get('mcp-session-id') || sessionId };
  };
  const initialized = await post({ jsonrpc: '2.0', id: requestId('init'), method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'Stanley', version: '1.0.0' } } });
  if (initialized.payload?.error) throw new Error(initialized.payload.error.message || 'MCP initialization failed.');
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, initialized.sessionId);
  const called = await post({ jsonrpc: '2.0', id: requestId('tool'), method: 'tools/call', params: { name: toolName, arguments: toolArguments } }, initialized.sessionId);
  if (called.payload?.error) throw new Error(called.payload.error.message || 'MCP tool failed.');
  return called.payload?.result;
}

module.exports = { callMcpTool, readMcpResponse, requestId };

