function installMcpRoutes({ app, authenticateUser, service, handleError }) {
  app.post('/v1/mcp/key', async (req, res) => { try { const uid = await authenticateUser(req); return res.json({ success: true, key: await service.rotateKey(uid) }); } catch (error) { return handleError(res, error); } });
  app.post('/mcp', async (req, res) => {
    const id = req.body?.id ?? null; const reply = (result) => res.json({ jsonrpc: '2.0', id, result }); const fault = (code, message) => res.status(code === -32603 ? 500 : 200).json({ jsonrpc: '2.0', id, error: { code, message } });
    try {
      const key = String(req.headers['x-stanley-mcp-key'] || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')); const uid = await service.authenticate(key); if (!uid) return fault(-32001, 'MCP authentication failed.');
      const method = req.body?.method;
      if (method === 'initialize') return reply({ protocolVersion: '2025-03-26', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'Stanley', version: '1.0.0' } });
      if (method === 'notifications/initialized') return res.status(202).end();
      if (method === 'tools/list') return reply({ tools: await service.tools(uid) });
      if (method === 'tools/call') return reply(await service.call(uid, req.body?.params?.name, req.body?.params?.arguments || {}));
      return fault(-32601, 'Method not found.');
    } catch (error) { return fault(error.code || -32603, error.message || 'MCP request failed.'); }
  });
}
module.exports = { installMcpRoutes };
