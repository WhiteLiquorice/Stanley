const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

function safeName(value) { return String(value || 'artifact.bin').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'artifact.bin'; }
function artifactId() { return `art-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`; }

class ArtifactService {
  constructor({ db, bucket, clock = () => new Date().toISOString(), maxBytes = 10 * 1024 * 1024 }) { Object.assign(this, { db, bucket, clock, maxBytes }); }
  ref(uid, id) { return this.db.collection('stanley_users').doc(uid).collection('artifacts').doc(id); }
  objectPath(uid, id, name) { return `tenants/${encodeURIComponent(uid)}/artifacts/${id}/${safeName(name)}`; }
  async create(uid, { name, mimeType = 'application/octet-stream', buffer, source = 'upload', runId = null }) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw Object.assign(new Error('Artifact content is required.'), { status: 400 });
    if (buffer.length > this.maxBytes) throw Object.assign(new Error(`Artifact exceeds the ${this.maxBytes}-byte limit.`), { status: 413 });
    const id = artifactId(); const filename = safeName(name); const objectPath = this.objectPath(uid, id, filename); const createdAt = this.clock();
    await this.bucket.file(objectPath).save(buffer, { resumable: false, contentType: mimeType, metadata: { metadata: { tenantId: uid, artifactId: id, runId: runId || '' } } });
    const record = { schemaVersion: 1, id, tenantId: uid, name: filename, mimeType, size: buffer.length, objectPath, source, runId, createdAt, expiresAt: new Date(Date.parse(createdAt) + 14 * 86400000) };
    try { await this.ref(uid, id).set(record); }
    catch (error) { await this.bucket.file(objectPath).delete({ ignoreNotFound: true }).catch(() => {}); throw error; }
    return record;
  }
  async get(uid, id) { const snap = await this.ref(uid, id).get(); const record = snap.exists ? snap.data() : null; return record?.tenantId === uid ? record : null; }
  async list(uid, limit = 100) { const snap = await this.db.collection('stanley_users').doc(uid).collection('artifacts').limit(Math.min(Math.max(Number(limit) || 100, 1), 200)).get(); return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt))); }
  async delete(uid, id) { const artifact = await this.get(uid, id); if (!artifact) throw Object.assign(new Error('Artifact not found.'), { status: 404 }); await this.bucket.file(artifact.objectPath).delete({ ignoreNotFound: true }); await this.ref(uid, id).delete(); return artifact; }
  async localPath(uid, id) {
    const artifact = await this.get(uid, id); if (!artifact) throw Object.assign(new Error('Artifact not found.'), { status: 404 });
    const target = path.join(os.tmpdir(), `stanley-${crypto.createHash('sha256').update(`${uid}:${id}`).digest('hex').slice(0, 18)}-${safeName(artifact.name)}`);
    await this.bucket.file(artifact.objectPath).download({ destination: target }); return { path: target, artifact, cleanup: () => fs.unlink(target).catch(() => {}) };
  }
  async fromDownload(uid, download, runId) {
    const stream = await download.createReadStream(); const chunks = []; let size = 0;
    for await (const chunk of stream) { size += chunk.length; if (size > this.maxBytes) { await download.cancel().catch(() => {}); throw Object.assign(new Error('Downloaded artifact exceeds the safe size limit.'), { status: 413 }); } chunks.push(chunk); }
    return this.create(uid, { name: download.suggestedFilename(), buffer: Buffer.concat(chunks), source: 'browser_download', runId });
  }
  async signedUrl(uid, id) { const artifact = await this.get(uid, id); if (!artifact) throw Object.assign(new Error('Artifact not found.'), { status: 404 }); const [url] = await this.bucket.file(artifact.objectPath).getSignedUrl({ action: 'read', expires: Date.now() + 5 * 60 * 1000 }); return { artifact, url }; }
}

module.exports = { ArtifactService, artifactId, safeName };
