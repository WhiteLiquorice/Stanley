const { createArtifact, normalizeDomain } = require('./artifact');

function serverUrl(spec, operation) {
  const raw = operation.servers?.[0]?.url || spec.servers?.[0]?.url;
  if (!raw || raw.includes('{')) throw new Error('OpenAPI import requires a fixed HTTPS server URL.');
  const parsed = new URL(raw); if (parsed.protocol !== 'https:') throw new Error('OpenAPI servers must use HTTPS.'); return parsed;
}

function importOpenApi(spec, options = {}) {
  if (!spec || typeof spec !== 'object' || !spec.paths) throw new Error('A parsed OpenAPI document with paths is required.');
  const artifacts = [];
  for (const [route, pathItem] of Object.entries(spec.paths)) {
    if (route.includes('{')) continue;
    for (const method of ['get', 'head', 'post', 'put', 'patch', 'delete']) {
      const operation = pathItem?.[method]; if (!operation) continue;
      const server = serverUrl(spec, operation); const upper = method.toUpperCase(); const readWrite = ['GET', 'HEAD'].includes(upper) ? 'read' : 'write';
      const operationName = operation.operationId || `${method}_${route}`.replace(/[^a-z0-9]+/gi, '_'); const connectorId = `${options.connectorPrefix || 'openapi'}_${operationName}`.replace(/[^a-z0-9_-]/gi, '_').slice(0, 128);
      const auth = options.auth || null; const requiredVaultRefs = auth?.vaultRef ? [auth.vaultRef] : [];
      const headerExpression = auth?.type === 'bearer' ? `, headers={"Authorization": "Bearer " + vault.get(${JSON.stringify(auth.vaultRef)})}` : '';
      const bodyExpression = readWrite === 'write' ? ', json_body=inputs.get("body")' : '';
      const source = `response = http.request(${JSON.stringify(upper)}, ${JSON.stringify(new URL(route.replace(/^\//, ''), server.toString().replace(/\/?$/, '/')).toString())}, params=inputs.get("query", {})${bodyExpression}${headerExpression})\ntry:\n    payload = response.json()\nexcept Exception:\n    payload = {"text": response.text}\nresult = {"status": response.status_code, "data": payload}`;
      const properties = { query: { type: 'object', additionalProperties: true } }; if (readWrite === 'write') properties.body = operation.requestBody?.content?.['application/json']?.schema || { type: 'object' }; if (readWrite === 'write') properties.idempotencyKey = { type: 'string', minLength: 1, maxLength: 200 };
      artifacts.push(createArtifact({ connectorId, tenantId: options.tenantId, version: 'v1', name: operation.summary || operationName, description: operation.description || `Imported from ${spec.info?.title || 'OpenAPI'}`, operationName, source, targetDomains: [normalizeDomain(server.hostname)], readWrite, allowedMethods: [upper], requiredVaultRefs, inputSchema: { type: 'object', properties, additionalProperties: false, required: readWrite === 'write' ? ['body', 'idempotencyKey'] : [] }, outputSchema: { type: 'object', required: ['status', 'data'], properties: { status: { type: 'integer' }, data: {} } }, regressionCases: [], generationMetadata: { source: 'openapi', title: spec.info?.title, openapiVersion: spec.openapi || spec.swagger } }));
    }
  }
  return artifacts;
}

function createOAuthConnectionDefinition(fields) {
  for (const name of ['connectionId', 'tenantId', 'authorizationUrl', 'tokenUrl', 'clientIdVaultRef', 'clientSecretVaultRef']) if (!fields[name]) throw new Error(`Missing OAuth field: ${name}`);
  const authorization = new URL(fields.authorizationUrl); const token = new URL(fields.tokenUrl);
  if (authorization.protocol !== 'https:' || token.protocol !== 'https:') throw new Error('OAuth endpoints must use HTTPS.');
  return Object.freeze({ schemaVersion: 1, connectionId: fields.connectionId, tenantId: fields.tenantId, type: 'oauth2', authorizationUrl: authorization.toString(), tokenUrl: token.toString(), scopes: [...new Set(fields.scopes || [])].sort(), clientIdVaultRef: fields.clientIdVaultRef, clientSecretVaultRef: fields.clientSecretVaultRef, accessTokenVaultRef: fields.accessTokenVaultRef || `${fields.connectionId}.access_token`, refreshTokenVaultRef: fields.refreshTokenVaultRef || `${fields.connectionId}.refresh_token`, state: 'unconfigured', createdAt: fields.createdAt || new Date().toISOString() });
}

module.exports = { createOAuthConnectionDefinition, importOpenApi, serverUrl };
