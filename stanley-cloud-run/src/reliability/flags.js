const FLAG_DEFAULTS = Object.freeze({
  TRANSACTIONAL_RUN_LEASES: false,
  DETERMINISTIC_TASK_DISPATCH: false,
  EFFECT_LEDGER: false,
  NODE_SCOPED_APPROVALS: false,
  TWO_PHASE_MONITORS: false,
  WORKFLOW_REVISIONS: false,
  SCOPED_SECRET_LOADING: false,
  SAFE_EGRESS: false,
  PROVIDER_RESILIENCE: false,
  DISTRIBUTED_BROWSER_LEASES: false,
  TRACE_BATCHING: false,
  FAIR_QUEUEING: false,
});

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value).trim().toLowerCase());
}

function isReliabilityEnabled(name, env = process.env) {
  if (!(name in FLAG_DEFAULTS)) throw new Error(`Unknown reliability flag: ${name}`);
  if (booleanValue(env.STANLEY_RELIABILITY_V2, false)) return true;
  return booleanValue(env[`STANLEY_${name}`], FLAG_DEFAULTS[name]);
}

function reliabilitySnapshot(env = process.env) {
  return Object.freeze({
    schemaVersion: 1,
    profile: booleanValue(env.STANLEY_RELIABILITY_V2, false) ? 'v2' : 'compatibility',
    flags: Object.freeze(Object.fromEntries(Object.keys(FLAG_DEFAULTS).map((name) => [name, isReliabilityEnabled(name, env)]))),
  });
}

module.exports = { FLAG_DEFAULTS, booleanValue, isReliabilityEnabled, reliabilitySnapshot };
