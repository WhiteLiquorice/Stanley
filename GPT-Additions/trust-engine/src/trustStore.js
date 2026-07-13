const crypto = require('crypto');
const { createReceipt, redactEvidence } = require('./evidence');

function documentId(prefix = '') {
  return `${prefix}${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
}

function expiryDate(createdAt, days) {
  const milliseconds = Date.parse(createdAt) + Number(days || 14) * 24 * 60 * 60 * 1000;
  return new Date(milliseconds);
}

class TrustStore {
  constructor(db, options = {}) {
    if (!db) throw new Error('TrustStore requires a Firestore-compatible database.');
    this.db = db;
    this.clock = options.clock || (() => new Date().toISOString());
  }

  user(uid) {
    return this.db.collection('stanley_users').doc(uid);
  }

  run(uid, runId) {
    return this.user(uid).collection('runs').doc(runId);
  }

  async writeCheckpoint(uid, runId, checkpoint) {
    const id = checkpoint.id || documentId('cp-');
    const record = {
      schemaVersion: 1,
      id,
      runId,
      sequence: Number(checkpoint.sequence || 0),
      nodeId: checkpoint.nodeId || null,
      phase: checkpoint.phase || 'after',
      workflowFingerprint: checkpoint.workflowFingerprint || checkpoint.state?.workflowFingerprint || null,
      resumable: checkpoint.resumable !== false,
      state: redactEvidence(checkpoint.state || {}),
      createdAt: checkpoint.createdAt || this.clock(),
    };
    record.expiresAt = expiryDate(record.createdAt, checkpoint.retentionDays);
    await this.run(uid, runId).collection('checkpoints').doc(id).set(record);
    await this.run(uid, runId).set({
      latestCheckpointId: id,
      latestCheckpointSequence: record.sequence,
      updatedAt: this.clock(),
    }, { merge: true });
    return record;
  }

  async latestCheckpoint(uid, runId) {
    const snapshot = await this.run(uid, runId).collection('checkpoints')
      .orderBy('sequence', 'desc').limit(1).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  async writeReceipt(uid, fields) {
    const receipt = createReceipt(fields, { now: this.clock() });
    receipt.expiresAt = expiryDate(receipt.occurredAt, fields.policy?.evidenceRetentionDays);
    await this.run(uid, fields.runId).collection('receipts').doc(receipt.id).set(receipt);
    return receipt;
  }

  async listReceipts(uid, runId, limit = 100) {
    const snapshot = await this.run(uid, runId).collection('receipts')
      .orderBy('occurredAt', 'asc').limit(Math.min(Number(limit) || 100, 500)).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async openException(uid, exception) {
    const id = exception.id || documentId('ex-');
    const record = {
      schemaVersion: 1,
      id,
      runId: exception.runId,
      workflowId: exception.workflowId,
      nodeId: exception.nodeId || null,
      kind: exception.kind || 'execution_failure',
      severity: exception.severity || 'error',
      title: exception.title || 'Workflow needs attention',
      summary: exception.summary || '',
      evidence: redactEvidence(exception.evidence || {}),
      state: 'open',
      createdAt: exception.createdAt || this.clock(),
      updatedAt: this.clock(),
    };
    await this.user(uid).collection('exceptions').doc(id).set(record);
    await this.run(uid, exception.runId).set({
      openExceptionId: id,
      trustState: 'needs_attention',
      updatedAt: this.clock(),
    }, { merge: true });
    return record;
  }

  async listExceptions(uid, { state = 'open', limit = 50 } = {}) {
    let query = this.user(uid).collection('exceptions');
    if (state && state !== 'all') query = query.where('state', '==', state);
    const snapshot = await query.limit(Math.min(Number(limit) || 50, 200)).get();
    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  }

  async resolveException(uid, exceptionId, resolution = {}) {
    const ref = this.user(uid).collection('exceptions').doc(exceptionId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return null;
    const state = resolution.state === 'dismissed' ? 'dismissed' : 'resolved';
    const patch = {
      state,
      resolution: redactEvidence({
        action: resolution.action || 'reviewed',
        note: resolution.note || '',
        correctedValue: resolution.correctedValue,
      }),
      resolvedAt: this.clock(),
      updatedAt: this.clock(),
    };
    await ref.update(patch);
    return { id: snapshot.id, ...snapshot.data(), ...patch };
  }
}

module.exports = { TrustStore, documentId, expiryDate };
