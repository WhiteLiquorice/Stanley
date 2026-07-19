const ERROR_CODES = Object.freeze({
  TRANSIENT_NETWORK: 'TRANSIENT_NETWORK',
  RATE_LIMITED: 'RATE_LIMITED',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  PERMANENT_PROVIDER_ERROR: 'PERMANENT_PROVIDER_ERROR',
  BROWSER_CAPACITY: 'BROWSER_CAPACITY',
  SELECTOR_DRIFT: 'SELECTOR_DRIFT',
  EFFECT_UNKNOWN: 'EFFECT_UNKNOWN',
  EFFECT_ALREADY_CLAIMED: 'EFFECT_ALREADY_CLAIMED',
  POLICY_BLOCKED: 'POLICY_BLOCKED',
  CANCELLED: 'CANCELLED',
  DEADLINE_EXCEEDED: 'DEADLINE_EXCEEDED',
  HUMAN_INTERVENTION_REQUIRED: 'HUMAN_INTERVENTION_REQUIRED',
  RUN_LEASED: 'RUN_LEASED',
  RUN_LEASE_LOST: 'RUN_LEASE_LOST',
});

class ReliabilityError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'ReliabilityError';
    this.code = code;
    this.status = options.status;
    this.retryable = options.retryable === true;
    this.retryAfterMs = options.retryAfterMs;
    this.details = options.details || null;
  }
}

function retryAfterMs(value, now = Date.now()) {
  if (value === undefined || value === null || value === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.min(300000, Math.round(seconds * 1000)));
  const at = Date.parse(String(value));
  return Number.isFinite(at) ? Math.max(0, Math.min(300000, at - now)) : null;
}

function classifyError(error, hints = {}) {
  if (error instanceof ReliabilityError) return error;
  const message = String(error?.message || error || 'Unexpected failure.');
  const status = Number(error?.status || error?.statusCode || hints.status || 0);
  const code = String(error?.code || '').toUpperCase();
  const retryHeader = hints.retryAfter ?? error?.retryAfter;
  if (code === 'ABORT_ERR' || /cancel(?:led|ed)|aborted/i.test(message)) return new ReliabilityError(ERROR_CODES.CANCELLED, message, { cause: error, status: 499 });
  if (code === 'BROWSER_CAPACITY') return new ReliabilityError(ERROR_CODES.BROWSER_CAPACITY, message, { cause: error, retryable: true, status: 503 });
  if (status === 429 || /rate.?limit|too many requests|quota/i.test(message)) return new ReliabilityError(ERROR_CODES.RATE_LIMITED, message, { cause: error, retryable: true, status: 429, retryAfterMs: retryAfterMs(retryHeader) });
  if ([401, 403].includes(status) || /invalid.?grant|token expired|authentication required/i.test(message)) return new ReliabilityError(ERROR_CODES.AUTHENTICATION_REQUIRED, message, { cause: error, status: status || 401 });
  if ([408, 425, 502, 503, 504].includes(status) || /ECONNRESET|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT|network/i.test(`${code} ${message}`)) return new ReliabilityError(status ? ERROR_CODES.PROVIDER_UNAVAILABLE : ERROR_CODES.TRANSIENT_NETWORK, message, { cause: error, retryable: true, status: status || 503 });
  if (status >= 400 && status < 500) return new ReliabilityError(ERROR_CODES.PERMANENT_PROVIDER_ERROR, message, { cause: error, status });
  if (/selector|locator|element.*not found|strict mode violation/i.test(message)) return new ReliabilityError(ERROR_CODES.SELECTOR_DRIFT, message, { cause: error, status: 422 });
  if (/validation|schema|missing .*field|required/i.test(message)) return new ReliabilityError(ERROR_CODES.VALIDATION_FAILED, message, { cause: error, status: 422 });
  return new ReliabilityError(ERROR_CODES.PERMANENT_PROVIDER_ERROR, message, { cause: error, status: status || 500 });
}

function retryDecision(error, options = {}) {
  const classified = classifyError(error, options);
  const attempt = Math.max(1, Number(options.attempt || 1));
  const maxAttempts = Math.max(1, Number(options.maxAttempts || 1));
  const effectState = options.effectState || 'none';
  const readWrite = options.readWrite || 'read';
  if (attempt >= maxAttempts || !classified.retryable) return { retry: false, error: classified, reason: attempt >= maxAttempts ? 'attempt_budget_exhausted' : 'permanent' };
  if (readWrite === 'write' && !['none', 'failed_safe'].includes(effectState)) return { retry: false, error: new ReliabilityError(ERROR_CODES.EFFECT_UNKNOWN, 'Write outcome is not proven safe to retry.', { cause: classified, status: 409 }), reason: 'effect_not_safe' };
  const delayMs = classified.retryAfterMs ?? Math.min(60000, 500 * 2 ** (attempt - 1));
  return { retry: true, error: classified, delayMs, reason: classified.code };
}

module.exports = { ERROR_CODES, ReliabilityError, classifyError, retryAfterMs, retryDecision };
