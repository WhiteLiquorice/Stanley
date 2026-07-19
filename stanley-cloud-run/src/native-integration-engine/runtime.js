const { assertSchema } = require('../connector-engine/src/schemaValidator');
const { getOperation } = require('./catalog');
const { providerFor } = require('./providers');
const fs = require('node:fs/promises');

const SENSITIVE_HEADER = /^(authorization|cookie|x-api-key|x-auth-token)$/i;
const providerCircuits = new Map();
function httpError(status, message, code = 'INTEGRATION_ERROR') { return Object.assign(new Error(message), { status, code }); }
function scalar(value) { return ['string', 'number', 'boolean'].includes(typeof value); }
function render(template, values, { encode = true } = {}) {
  return String(template || '').replace(/\{([A-Za-z][A-Za-z0-9]*)\}|\{connection\.([A-Za-z][A-Za-z0-9]*)\}/g, (_match, direct, nested) => {
    const key = direct || nested; const value = values[key];
    if (value === undefined || value === null || value === '') throw httpError(400, `Missing integration parameter: ${key}`, 'MISSING_INTEGRATION_PARAMETER');
    if (!scalar(value)) throw httpError(400, `Integration parameter ${key} must be a scalar.`, 'INVALID_INTEGRATION_PARAMETER');
    return encode ? encodeURIComponent(String(value)) : String(value);
  });
}
function appendQuery(url, query) {
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (!scalar(item)) throw httpError(400, `Query parameter ${key} must be scalar.`, 'INVALID_INTEGRATION_PARAMETER');
      url.searchParams.append(key, String(item));
    }
  }
}
function appendForm(form, value, prefix = '') {
  if (value === undefined || value === null) return;
  if (scalar(value)) { form.append(prefix, String(value)); return; }
  if (Array.isArray(value)) { value.forEach((item, index) => appendForm(form, item, `${prefix}[${index}]`)); return; }
  if (typeof value === 'object') { for (const [key, item] of Object.entries(value)) appendForm(form, item, prefix ? `${prefix}[${key}]` : key); return; }
  throw httpError(400, `Form parameter ${prefix || 'body'} is unsupported.`, 'INVALID_INTEGRATION_PARAMETER');
}
function requireSecret(secrets, ref) { const value = secrets?.[ref]; if (!value) throw httpError(400, `Missing vault credential: ${ref}`, 'MISSING_VAULT_REFERENCE'); return String(value); }
function applyAuth(provider, secrets, headers, query) {
  const auth = provider.auth || {};
  if (auth.type === 'bearer') headers.Authorization = `Bearer ${requireSecret(secrets, auth.vaultRef)}`;
  else if (auth.type === 'header') headers[auth.name] = `${auth.prefix || ''}${requireSecret(secrets, auth.vaultRef)}`;
  else if (auth.type === 'basic') {
    let username = auth.username || requireSecret(secrets, auth.usernameRef); if (auth.usernameSuffix) username += auth.usernameSuffix;
    const password = auth.password || requireSecret(secrets, auth.passwordRef); headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  } else if (auth.type === 'query') for (const [name, ref] of Object.entries(auth.fields || {})) query[name] = requireSecret(secrets, ref);
}
function safeHost(url, provider, operation, resolvedBaseUrl) {
  if (url.protocol !== 'https:') throw httpError(400, 'Native integrations require HTTPS.', 'UNSAFE_INTEGRATION_URL');
  if (provider.allowedHostSuffix && !url.hostname.endsWith(provider.allowedHostSuffix)) throw httpError(400, `Integration host must end in ${provider.allowedHostSuffix}.`, 'UNSAFE_INTEGRATION_URL');
  if (!provider.allowedHostSuffix) {
    const providerHost = new URL(resolvedBaseUrl).hostname;
    const fixedHost = /^https:\/\//i.test(operation.path) ? new URL(operation.path.replace(/\{[A-Za-z][A-Za-z0-9]*\}/g, 'placeholder')).hostname : providerHost;
    if (url.hostname !== providerHost && url.hostname !== fixedHost) throw httpError(400, 'Integration host is outside the provider allowlist.', 'UNSAFE_INTEGRATION_URL');
  }
}
async function encodeBody(provider, operation, input, headers, options) {
  let body = input.body;
  if (['GET', 'HEAD'].includes(headers.__method)) return undefined;
  if (operation.artifactRequest) {
    if (!options.artifactService || !options.uid) throw httpError(400, 'Artifact integrations require a tenant artifact service.', 'ARTIFACT_SERVICE_REQUIRED');
    const local = await options.artifactService.localPath(options.uid, input.artifactId);
    try {
      const buffer = await fs.readFile(local.path); const mimeType = local.artifact.mimeType || 'application/octet-stream';
      if (operation.artifactRequest.argumentHeader) { headers[operation.artifactRequest.argumentHeader] = JSON.stringify(body || {}); body = undefined; }
      if (operation.artifactRequest.encoding === 'raw') { headers['Content-Type'] = mimeType; return buffer; }
      const form = new FormData();
      for (const [key, value] of Object.entries(body || {})) {
        if (key === operation.artifactRequest.metadataField) form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
        else if (scalar(value)) form.append(key, String(value));
        else form.append(key, JSON.stringify(value));
      }
      form.append(operation.artifactRequest.fileField || 'file', new Blob([buffer], { type: mimeType }), local.artifact.name);
      return form;
    } finally { await local.cleanup(); }
  }
  if (body === undefined || body === null) return undefined;
  if (provider.requestEncoding === 'form') {
    const form = new URLSearchParams(); appendForm(form, body); headers['Content-Type'] = 'application/x-www-form-urlencoded'; return form.toString();
  }
  headers['Content-Type'] = headers['Content-Type'] || 'application/json'; return typeof body === 'string' ? body : JSON.stringify(body);
}
async function readResponse(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') || 0); if (declared > maxBytes) throw httpError(502, 'Integration response exceeded the safe size limit.', 'INTEGRATION_RESPONSE_TOO_LARGE');
  const buffer = Buffer.from(await response.arrayBuffer()); if (buffer.length > maxBytes) throw httpError(502, 'Integration response exceeded the safe size limit.', 'INTEGRATION_RESPONSE_TOO_LARGE');
  if (response.status === 204 || !buffer.length) return { value: null, binary: false };
  const text = buffer.toString('utf8'); const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('json')) { try { return { value: JSON.parse(text), binary: false }; } catch { throw httpError(502, 'Provider returned malformed JSON.', 'INVALID_PROVIDER_RESPONSE'); } }
  if (/^(text\/|application\/(xml|javascript|x-www-form-urlencoded))/i.test(contentType)) return { value: text, binary: false };
  return { value: buffer, binary: true, contentType: contentType || 'application/octet-stream' };
}

function responseFilename(response, operationId) {
  const disposition = response.headers.get('content-disposition') || '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  try { return decodeURIComponent(encoded || plain || `${operationId}.bin`); } catch { return plain || `${operationId}.bin`; }
}

function retryDelayMs(response, attempt) {
  const retryAfter = response?.headers?.get?.('retry-after');
  if (retryAfter && /^\d+(\.\d+)?$/.test(retryAfter)) return Math.min(Number(retryAfter) * 1000, 30_000);
  return Math.min(500 * (2 ** (attempt - 1)), 5_000);
}

function circuitFor(providerName) {
  if (!providerCircuits.has(providerName)) providerCircuits.set(providerName, { failures: 0, openUntil: 0 });
  return providerCircuits.get(providerName);
}

async function requestProvider(url, init, operation, provider, options) {
  const fetchImpl = options.fetchImpl || fetch;
  if (!options.providerResilience) return fetchImpl(url, init);
  const circuit = circuitFor(provider.app);
  const now = options.now || (() => Date.now());
  if (circuit.openUntil > now()) throw httpError(503, `${provider.app} is temporarily unavailable after repeated provider failures.`, 'PROVIDER_CIRCUIT_OPEN');
  const maxAttempts = operation.readWrite === 'read' ? Math.max(1, Math.min(Number(options.maxAttempts || 3), 4)) : 1;
  const sleep = options.sleepImpl || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetchImpl(url, init);
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === maxAttempts) {
        if (response.ok) { circuit.failures = 0; circuit.openUntil = 0; }
        else if (response.status >= 500) {
          circuit.failures += 1;
          if (circuit.failures >= 5) circuit.openUntil = now() + 30_000;
        }
        return response;
      }
      await response.body?.cancel?.().catch?.(() => {});
      await sleep(retryDelayMs(response, attempt));
    } catch (error) {
      lastError = error;
      circuit.failures += 1;
      if (circuit.failures >= 5) circuit.openUntil = now() + 30_000;
      if (attempt === maxAttempts) throw error;
      await sleep(Math.min(500 * (2 ** (attempt - 1)), 5_000));
    }
  }
  throw lastError || httpError(503, `${provider.app} request failed.`, 'PROVIDER_REQUEST_FAILED');
}

async function executeNativeIntegration(operationId, input = {}, secrets = {}, options = {}) {
  const operation = getOperation(operationId); if (!operation) throw httpError(404, `Unknown native integration: ${operationId}`, 'INTEGRATION_NOT_FOUND');
  assertSchema(input || {}, operation.inputSchema, `${operationId} input`);
  const provider = providerFor(operationId); const connection = { ...(provider.connectionDefaults || {}), ...(input.connection || {}) }; const values = { ...connection, ...(input.path || {}) };
  const base = render(provider.baseUrl, values); const target = /^https:\/\//i.test(operation.path) ? render(operation.path, values) : `${base.replace(/\/$/, '')}${render(operation.path, values)}`;
  const url = new URL(target); safeHost(url, provider, operation, base);
  const query = { ...(operation.artifactRequest?.defaultQuery || {}), ...(operation.artifactResponse?.defaultQuery || {}), ...(input.query || {}) }; const headers = { Accept: 'application/json', ...(provider.headers || {}) };
  applyAuth(provider, secrets, headers, query); appendQuery(url, query);
  for (const [name, value] of Object.entries(input.headers || {})) { if (SENSITIVE_HEADER.test(name)) throw httpError(400, `Header ${name} is managed by Stanley.`, 'UNSAFE_INTEGRATION_HEADER'); if (!scalar(value)) throw httpError(400, `Header ${name} must be scalar.`, 'INVALID_INTEGRATION_PARAMETER'); headers[name] = String(value); }
  for (const [name, value] of Object.entries(headers)) if (typeof value === 'string' && value.includes('{connection.')) headers[name] = render(value, connection, { encode: false });
  let requestInput = input;
  if (operation.artifactResponse?.argumentHeader) { headers[operation.artifactResponse.argumentHeader] = JSON.stringify(input.body || {}); requestInput = { ...input, body: undefined }; }
  headers.__method = operation.method; const body = await encodeBody(provider, operation, requestInput, headers, options); delete headers.__method;
  if (operation.readWrite === 'write' && options.idempotencyKey) headers['Idempotency-Key'] = String(options.idempotencyKey).slice(0, 200);
  const response = await requestProvider(url, { method: operation.method, headers, body, signal: AbortSignal.timeout(Math.min(Number(options.timeoutMs || 30000), 120000)) }, operation, provider, options);
  const decoded = await readResponse(response, Number(options.maxResponseBytes || 5 * 1024 * 1024));
  if (!response.ok) throw httpError(502, `${provider.app} request failed (${response.status}).`, 'PROVIDER_REQUEST_FAILED');
  let output = decoded.value;
  if (decoded.binary) {
    if (!operation.artifactResponse || !options.artifactService || !options.uid) throw httpError(502, 'Provider returned binary content outside an artifact-enabled operation.', 'UNEXPECTED_BINARY_RESPONSE');
    output = await options.artifactService.create(options.uid, { name: responseFilename(response, operationId), mimeType: decoded.contentType, buffer: decoded.value, source: 'native_integration', runId: options.runId || null });
  }
  assertSchema(output, operation.outputSchema, `${operationId} output`);
  return { output, status: response.status, operation: operationId, provider: provider.app, readWrite: operation.readWrite };
}

module.exports = { appendForm, executeNativeIntegration, providerCircuits, render, requestProvider, retryDelayMs, safeHost };
