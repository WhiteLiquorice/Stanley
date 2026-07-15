const crypto = require('crypto');

const ALLOWED_COMMANDS = new Set(['click_ref', 'type_ref', 'resume', 'abort']);
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
function timestampMs(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

class TakeoverBroker {
  constructor(store, { cipher = null, clock = () => Date.now(), leaseMs = 2 * 60 * 1000, waitMs = 5 * 60 * 1000, pollMs = 750 } = {}) {
    Object.assign(this, { store, cipher, clock, leaseMs, waitMs, pollMs });
  }
  async open(uid, runId, fields = {}) {
    const now = this.clock();
    const record = {
      schemaVersion: 1, tenantId: uid, runId, state: 'awaiting_operator', reason: String(fields.reason || 'Browser needs human assistance').slice(0, 500),
      encryptedSnapshot: fields.snapshot && this.cipher?.enabled ? this.cipher.encrypt(fields.snapshot, `${uid}:${runId}:takeover`) : null,
      snapshotUnavailable: Boolean(fields.snapshot && !this.cipher?.enabled), createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.waitMs), leaseExpiresAt: null, tokenHash: null,
    };
    await this.store.takeoverRef(uid, runId).set(record);
    return record;
  }
  async get(uid, runId) {
    const snapshot = await this.store.takeoverRef(uid, runId).get();
    if (!snapshot.exists) return null;
    const record = snapshot.data();
    if (record.tenantId !== uid) throw new Error('Takeover tenant binding failed.');
    const { tokenHash: _tokenHash, encryptedSnapshot, ...safe } = record;
    return { ...safe, snapshot: encryptedSnapshot && this.cipher?.enabled ? this.cipher.decrypt(encryptedSnapshot, `${uid}:${runId}:takeover`) : null };
  }
  async claim(uid, runId) {
    const ref = this.store.takeoverRef(uid, runId);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data().tenantId !== uid) throw Object.assign(new Error('Takeover is not available.'), { status: 404 });
    const current = snapshot.data();
    if (current.state === 'claimed' && timestampMs(current.leaseExpiresAt) > this.clock()) throw Object.assign(new Error('Takeover is already claimed.'), { status: 409 });
    if (timestampMs(current.expiresAt) <= this.clock()) throw Object.assign(new Error('Takeover request expired.'), { status: 410 });
    const token = crypto.randomBytes(24).toString('base64url');
    const now = this.clock();
    await ref.update({ state: 'claimed', tokenHash: hashToken(token), claimedAt: new Date(now).toISOString(), leaseExpiresAt: new Date(now + this.leaseMs), updatedAt: new Date(now).toISOString() });
    return { token, leaseExpiresAt: new Date(now + this.leaseMs).toISOString() };
  }
  async authorize(uid, runId, token) {
    const ref = this.store.takeoverRef(uid, runId);
    const snapshot = await ref.get();
    const record = snapshot.exists ? snapshot.data() : null;
    if (!record || record.tenantId !== uid || record.state !== 'claimed' || timestampMs(record.leaseExpiresAt) <= this.clock()) throw Object.assign(new Error('Takeover lease is unavailable or expired.'), { status: 409 });
    const supplied = Buffer.from(hashToken(token)); const expected = Buffer.from(String(record.tokenHash || ''));
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) throw Object.assign(new Error('Invalid takeover token.'), { status: 403 });
    return { ref, record };
  }
  async heartbeat(uid, runId, token) {
    const { ref } = await this.authorize(uid, runId, token); const now = this.clock();
    const leaseExpiresAt = new Date(now + this.leaseMs).toISOString();
    await ref.update({ leaseExpiresAt, updatedAt: new Date(now).toISOString() }); return { leaseExpiresAt };
  }
  async command(uid, runId, token, command) {
    await this.authorize(uid, runId, token);
    const type = String(command?.type || '');
    if (!ALLOWED_COMMANDS.has(type)) throw Object.assign(new Error('Unsupported takeover command.'), { status: 400 });
    if (['click_ref', 'type_ref'].includes(type) && !/^ax-[a-f0-9]{12}$/.test(String(command.ref || ''))) throw Object.assign(new Error('A valid accessibility reference is required.'), { status: 400 });
    const id = crypto.randomBytes(10).toString('hex');
    const record = { id, type, ref: command.ref || null, value: type === 'type_ref' ? String(command.value || '').slice(0, 10000) : null, state: 'queued', createdAt: new Date(this.clock()).toISOString() };
    await this.store.commandRef(uid, runId, id).set(record); return record;
  }
  async nextCommand(uid, runId) {
    const snapshot = await this.store.takeoverRef(uid, runId).collection('commands').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((item) => item.state === 'queued').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] || null;
  }
  async completeCommand(uid, runId, command, outcome, error = null) {
    await this.store.commandRef(uid, runId, command.id).update({ state: outcome, error: error ? String(error.message || error).slice(0, 500) : null, completedAt: new Date(this.clock()).toISOString() });
  }
  async close(uid, runId, state = 'resumed') {
    await this.store.takeoverRef(uid, runId).set({ state, tokenHash: null, closedAt: new Date(this.clock()).toISOString(), updatedAt: new Date(this.clock()).toISOString() }, { merge: true });
  }
}

module.exports = { ALLOWED_COMMANDS, TakeoverBroker, hashToken, timestampMs };
