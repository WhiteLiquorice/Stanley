const crypto = require('node:crypto');
const { BrowserCapacityError } = require('./lifecycle');

function leaseKey(runId) { return crypto.createHash('sha256').update(String(runId)).digest('hex').slice(0, 32); }
function pruneLeases(leases = {}, now = Date.now()) {
  return Object.fromEntries(Object.entries(leases).filter(([, lease]) => Number(lease.expiresAt || 0) > now));
}

class DistributedBrowserLifecycleManager {
  constructor(db, options = {}) {
    this.db = db;
    this.maxPerTenant = Number(options.maxPerTenant || process.env.BROWSER_MAX_SESSIONS_PER_TENANT || 3);
    this.maxRuntimeMs = Number(options.maxRuntimeMs || process.env.BROWSER_MAX_RUNTIME_MS || 15 * 60 * 1000);
    this.clock = options.clock || (() => Date.now());
  }
  ref(uid) { return this.db.collection('stanley_users').doc(uid).collection('runtime').doc('browserCapacity'); }
  async acquire({ uid, runId }) {
    const key = leaseKey(runId); const ref = this.ref(uid);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref); const now = this.clock();
      const leases = pruneLeases(snapshot.exists ? snapshot.data().leases : {}, now);
      if (leases[key]) return leases[key];
      if (Object.keys(leases).length >= this.maxPerTenant) throw new BrowserCapacityError('Tenant browser-session limit reached across active runner instances.');
      const lease = { uid, runIdHash: key, startedAt: now, heartbeatAt: now, expiresAt: now + this.maxRuntimeMs };
      leases[key] = lease; transaction.set(ref, { schemaVersion: 1, leases, updatedAt: new Date(now).toISOString() }, { merge: true });
      return lease;
    });
  }
  async heartbeat(uid, runId) {
    const key = leaseKey(runId); const ref = this.ref(uid);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref); const now = this.clock(); const leases = pruneLeases(snapshot.exists ? snapshot.data().leases : {}, now);
      if (!leases[key]) throw Object.assign(new Error('Distributed browser runtime lease expired.'), { code: 'BROWSER_RUNTIME_EXPIRED' });
      leases[key] = { ...leases[key], heartbeatAt: now };
      transaction.set(ref, { leases, updatedAt: new Date(now).toISOString() }, { merge: true }); return leases[key];
    });
  }
  async assertAlive(uid, runId) {
    const snapshot = await this.ref(uid).get(); const lease = pruneLeases(snapshot.exists ? snapshot.data().leases : {}, this.clock())[leaseKey(runId)];
    if (!lease) throw Object.assign(new Error('Distributed browser runtime lease expired.'), { code: 'BROWSER_RUNTIME_EXPIRED' });
    return lease;
  }
  async release(uid, runId) {
    const key = leaseKey(runId); const ref = this.ref(uid);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref); if (!snapshot.exists) return false;
      const leases = pruneLeases(snapshot.data().leases, this.clock()); const existed = Boolean(leases[key]); delete leases[key];
      transaction.set(ref, { leases, updatedAt: new Date(this.clock()).toISOString() }, { merge: true }); return existed;
    });
  }
}

module.exports = { DistributedBrowserLifecycleManager, leaseKey, pruneLeases };
