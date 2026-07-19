function reserveBucket(bucket = {}, nowMs = Date.now(), options = {}) {
  const ratePerMinute = Math.max(1, Number(options.ratePerMinute || 30));
  const burst = Math.max(1, Number(options.burst || 10));
  const refillPerMs = ratePerMinute / 60_000;
  const previousAt = Number(bucket.updatedAtMs || nowMs);
  const replenished = Math.min(burst, Number(bucket.tokens ?? burst) + Math.max(0, nowMs - previousAt) * refillPerMs);
  const tokens = replenished - 1;
  const delaySeconds = tokens >= 0 ? 0 : Math.min(300, Math.ceil((-tokens / refillPerMs) / 1000));
  return { tokens, updatedAtMs: nowMs, delaySeconds, ratePerMinute, burst };
}

class TenantAdmissionController {
  constructor(db, options = {}) { this.db = db; this.options = options; this.clock = options.clock || (() => Date.now()); }
  ref(uid) { return this.db.collection('stanley_users').doc(uid).collection('runtime').doc('admission'); }
  async reserve(uid) {
    const ref = this.ref(uid);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const reservation = reserveBucket(snapshot.exists ? snapshot.data() : {}, this.clock(), this.options);
      transaction.set(ref, { ...reservation, updatedAt: new Date(reservation.updatedAtMs).toISOString() }, { merge: true });
      return reservation;
    });
  }
}

module.exports = { reserveBucket, TenantAdmissionController };
