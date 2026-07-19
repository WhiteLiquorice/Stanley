const crypto = require('crypto');

function safeId(value) { return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32); }

class BrowserRuntimeStore {
  constructor(db, { cipher, clock = () => new Date().toISOString() } = {}) { this.db = db; this.cipher = cipher; this.clock = clock; }
  user(uid) { return this.db.collection('stanley_users').doc(uid); }
  sessionRef(uid, sessionId) { return this.user(uid).collection('browserSessions').doc(safeId(sessionId)); }
  run(uid, runId) { return this.user(uid).collection('runs').doc(runId); }
  async loadSession(uid, sessionId) {
    if (!this.cipher?.enabled) return null;
    const snapshot = await this.sessionRef(uid, sessionId).get();
    if (!snapshot.exists) return null;
    const record = snapshot.data();
    if (record.tenantId !== uid || record.sessionIdHash !== safeId(sessionId)) throw new Error('Browser session tenant binding failed.');
    return this.cipher.decrypt(record.encryptedState, `${uid}:${sessionId}`);
  }
  async saveSession(uid, sessionId, state, retentionDays = 30) {
    if (!this.cipher?.enabled) return null;
    if (Buffer.byteLength(JSON.stringify(state), 'utf8') > 750000) throw new Error('Browser session state exceeds the encrypted persistence limit.');
    const now = this.clock();
    const record = {
      schemaVersion: 1, tenantId: uid, sessionIdHash: safeId(sessionId),
      encryptedState: this.cipher.encrypt(state, `${uid}:${sessionId}`), updatedAt: now,
      expiresAt: new Date(Date.parse(now) + Math.min(Math.max(Number(retentionDays || 30), 1), 90) * 86400000),
    };
    await this.sessionRef(uid, sessionId).set(record);
    return { updatedAt: now, expiresAt: record.expiresAt };
  }
  async appendTrace(uid, runId, event) {
    const id = `${String(event.sequence || 0).padStart(6, '0')}-${crypto.randomBytes(4).toString('hex')}`;
    await this.run(uid, runId).collection('browserTrace').doc(id).set(event);
    return event;
  }
  async appendTraceBatch(uid, runId, events) {
    if (!events.length) return [];
    const batch = this.db.batch();
    for (const event of events) {
      const id = `${String(event.sequence || 0).padStart(6, '0')}-${crypto.randomBytes(4).toString('hex')}`;
      batch.set(this.run(uid, runId).collection('browserTrace').doc(id), event);
    }
    await batch.commit();
    return events;
  }
  async listTrace(uid, runId, limit = 500) {
    const snapshot = await this.run(uid, runId).collection('browserTrace').limit(Math.min(Math.max(Number(limit || 500), 1), 1000)).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((left, right) => Number(left.sequence) - Number(right.sequence));
  }
  takeoverRef(uid, runId) { return this.run(uid, runId).collection('browserControl').doc('takeover'); }
  commandRef(uid, runId, commandId) { return this.takeoverRef(uid, runId).collection('commands').doc(commandId); }
}

module.exports = { BrowserRuntimeStore, safeId };
