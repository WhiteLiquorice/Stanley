const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

class MemoryTemplateStore {
  constructor() { this.items = new Map(); this.catalog = new Map(); }
  key(tenantId, templateId, version) { return `${tenantId}:${templateId}:${version}`; }
  async create(template) { const key = this.key(template.tenantId, template.templateId, template.version); if (this.items.has(key)) throw new Error('Template version already exists.'); this.items.set(key, clone(template)); return clone(template); }
  async get(tenantId, templateId, version) { return clone(this.items.get(this.key(tenantId, templateId, version)) || this.catalog.get(`${templateId}:${version}`) || null); }
  async save(template) { this.items.set(this.key(template.tenantId, template.templateId, template.version), clone(template)); return clone(template); }
  async list(tenantId, filters = {}) { const own = [...this.items.values()].filter((item) => item.tenantId === tenantId); const publicItems = [...this.catalog.values()].filter((item) => item.tenantId !== tenantId); return [...own, ...publicItems].filter((item) => (!filters.state || item.state === filters.state) && (!filters.visibility || item.visibility === filters.visibility)).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map(clone); }
  async publish(template) { await this.save(template); if (template.visibility === 'public') this.catalog.set(`${template.templateId}:${template.version}`, clone(template)); return clone(template); }
  async retire(template) { await this.save(template); this.catalog.delete(`${template.templateId}:${template.version}`); return clone(template); }
  async incrementUse(template) { const updated = { ...clone(template), health: { ...template.health, usageCount: Number(template.health?.usageCount || 0) + 1 } }; await this.save(updated); if (updated.visibility === 'public') this.catalog.set(`${updated.templateId}:${updated.version}`, clone(updated)); return clone(updated); }
}

class FirestoreTemplateStore {
  constructor(db) { if (!db) throw new Error('Template store requires Firestore.'); this.db = db; }
  root(tenantId) { return this.db.collection('stanley_users').doc(tenantId).collection('workflow_templates'); }
  catalog() { return this.db.collection('stanley_template_catalog'); }
  ref(tenantId, templateId, version) { return this.root(tenantId).doc(`${templateId}__${version}`); }
  async create(template) { const ref = this.ref(template.tenantId, template.templateId, template.version); const snap = await ref.get(); if (snap.exists) throw new Error('Template version already exists.'); await ref.set(clone(template)); return clone(template); }
  async get(tenantId, templateId, version) { const snap = await this.ref(tenantId, templateId, version).get(); if (snap.exists) return snap.data(); const publicSnap = await this.catalog().doc(`${templateId}__${version}`).get(); return publicSnap.exists ? publicSnap.data() : null; }
  async save(template) { await this.ref(template.tenantId, template.templateId, template.version).set(clone(template)); return clone(template); }
  async list(tenantId, filters = {}) { const limit = Math.min(Number(filters.limit || 200), 200); let query = this.root(tenantId); if (filters.state) query = query.where('state', '==', filters.state); const [ownSnap, publicSnap] = await Promise.all([query.limit(limit).get(), this.catalog().limit(limit).get()]); const byVersion = new Map(); for (const doc of [...publicSnap.docs, ...ownSnap.docs]) { const item = doc.data(); if (!filters.visibility || item.visibility === filters.visibility) byVersion.set(`${item.templateId}:${item.version}`, item); } return [...byVersion.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, limit); }
  async publish(template) { await this.save(template); if (template.visibility === 'public') await this.catalog().doc(`${template.templateId}__${template.version}`).set(clone(template)); return clone(template); }
  async retire(template) { await this.save(template); await this.catalog().doc(`${template.templateId}__${template.version}`).delete().catch(() => {}); return clone(template); }
  async incrementUse(template) { const increment = require('firebase-admin').firestore.FieldValue.increment(1); await this.ref(template.tenantId, template.templateId, template.version).update({ 'health.usageCount': increment }); if (template.visibility === 'public') await this.catalog().doc(`${template.templateId}__${template.version}`).update({ 'health.usageCount': increment }); return this.get(template.tenantId, template.templateId, template.version); }
}

module.exports = { FirestoreTemplateStore, MemoryTemplateStore };
