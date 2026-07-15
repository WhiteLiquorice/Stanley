const crypto = require('crypto');

function safeUrl(value) {
  try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return ''; }
}
function digest(value) { return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12); }
function sanitizeSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    schemaVersion: snapshot.schemaVersion,
    url: safeUrl(snapshot.url),
    titleHash: digest(snapshot.title),
    elements: (snapshot.elements || []).map((element) => ({
      ref: element.ref, role: element.role, nameHash: digest(element.name), tag: element.tag,
      ordinal: element.ordinal, disabled: element.disabled, editable: element.editable,
    })),
  };
}

class PrivacySafeTrace {
  constructor({ store, uid, runId, clock = () => new Date().toISOString(), retentionDays = 14 }) {
    Object.assign(this, { store, uid, runId, clock, retentionDays });
    this.sequence = 0;
    this.networkEvents = 0;
    this.maxEvents = 1000;
    this.maxNetworkEvents = 300;
    this.pending = new Set();
    this.listeners = [];
  }
  record(kind, fields = {}) {
    if (this.sequence >= this.maxEvents) return Promise.resolve(null);
    if (kind.startsWith('network_') && ++this.networkEvents > this.maxNetworkEvents) return Promise.resolve(null);
    const occurredAt = this.clock();
    const event = {
      schemaVersion: 1, sequence: ++this.sequence, kind, occurredAt,
      nodeId: fields.nodeId || null, phase: fields.phase || null, outcome: fields.outcome || null,
      url: safeUrl(fields.url || ''), method: fields.method || null, status: fields.status || null,
      errorCode: fields.errorCode || null, snapshot: sanitizeSnapshot(fields.snapshot),
      expiresAt: new Date(Date.parse(occurredAt) + this.retentionDays * 86400000),
    };
    const write = Promise.resolve(this.store.appendTrace(this.uid, this.runId, event)).finally(() => this.pending.delete(write));
    this.pending.add(write);
    return write;
  }
  attach(page) {
    const onRequest = (request) => { this.record('network_request', { url: request.url(), method: request.method() }).catch(() => {}); };
    const onResponse = (response) => { this.record('network_response', { url: response.url(), status: response.status() }).catch(() => {}); };
    page.on('request', onRequest); page.on('response', onResponse);
    this.listeners.push(() => { page.off('request', onRequest); page.off('response', onResponse); });
  }
  async close() { for (const remove of this.listeners.splice(0)) remove(); await Promise.allSettled([...this.pending]); }
}

module.exports = { PrivacySafeTrace, digest, safeUrl, sanitizeSnapshot };
