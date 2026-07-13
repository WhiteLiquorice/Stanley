const SENSITIVE_KEY = /(authorization|cookie|credential|password|secret|token|api[-_]?key|private[-_]?key)/i;

function secretValues(secrets = {}) {
  return Object.values(secrets).filter((value) => typeof value === 'string' && value.length >= 3).sort((a, b) => b.length - a.length);
}

function redactText(value, secrets = {}) {
  let text = String(value ?? '');
  for (const secret of secretValues(secrets)) text = text.split(secret).join('[REDACTED]');
  return text.replace(/(bearer\s+)[a-z0-9._~+\/-]+=*/gi, '$1[REDACTED]');
}

function redact(value, secrets = {}, seen = new WeakSet()) {
  if (typeof value === 'string') return redactText(value, secrets);
  if (Array.isArray(value)) return value.map((item) => redact(item, secrets, seen));
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  const out = {};
  for (const [key, item] of Object.entries(value)) out[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(item, secrets, seen);
  return out;
}

function selectSecrets(requiredRefs = [], available = {}) {
  const selected = {};
  for (const ref of requiredRefs) {
    if (!Object.prototype.hasOwnProperty.call(available, ref)) throw new Error(`Missing vault reference: ${ref}`);
    selected[ref] = String(available[ref]);
  }
  return selected;
}

function containsSecret(value, secrets = {}) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return secretValues(secrets).some((secret) => serialized.includes(secret));
}

module.exports = { SENSITIVE_KEY, containsSecret, redact, redactText, secretValues, selectSecrets };
