class BrowserCapacityError extends Error {
  constructor(message) { super(message); this.name = 'BrowserCapacityError'; this.code = 'BROWSER_CAPACITY'; }
}

class BrowserLifecycleManager {
  constructor(options = {}) {
    this.maxPerTenant = Number(options.maxPerTenant || process.env.BROWSER_MAX_SESSIONS_PER_TENANT || 3);
    this.maxTotal = Number(options.maxTotal || process.env.BROWSER_MAX_SESSIONS_TOTAL || 20);
    this.maxRuntimeMs = Number(options.maxRuntimeMs || process.env.BROWSER_MAX_RUNTIME_MS || 15 * 60 * 1000);
    this.clock = options.clock || (() => Date.now());
    this.sessions = new Map();
  }
  reap() {
    const now = this.clock();
    for (const [id, lease] of this.sessions) if (lease.expiresAt <= now) this.sessions.delete(id);
  }
  acquire({ uid, runId }) {
    this.reap();
    if (this.sessions.has(runId)) return this.sessions.get(runId);
    const tenantCount = [...this.sessions.values()].filter((lease) => lease.uid === uid).length;
    if (tenantCount >= this.maxPerTenant) throw new BrowserCapacityError('Tenant browser-session limit reached. Retry after another run finishes.');
    if (this.sessions.size >= this.maxTotal) throw new BrowserCapacityError('Browser capacity is temporarily full. Retry shortly.');
    const now = this.clock();
    const lease = { uid, runId, startedAt: now, heartbeatAt: now, expiresAt: now + this.maxRuntimeMs };
    this.sessions.set(runId, lease);
    return lease;
  }
  heartbeat(runId) {
    const lease = this.sessions.get(runId);
    if (!lease) return null;
    lease.heartbeatAt = this.clock();
    return lease;
  }
  assertAlive(runId) {
    this.reap();
    const lease = this.sessions.get(runId);
    if (!lease) throw Object.assign(new Error('Browser runtime lease expired.'), { code: 'BROWSER_RUNTIME_EXPIRED' });
    return lease;
  }
  release(runId) { return this.sessions.delete(runId); }
  stats() { this.reap(); return { active: this.sessions.size, maxTotal: this.maxTotal }; }
}

const sharedLifecycle = new BrowserLifecycleManager();
module.exports = { BrowserCapacityError, BrowserLifecycleManager, sharedLifecycle };
