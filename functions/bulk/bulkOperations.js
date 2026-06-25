/**
 * Bulk operations — batch update / soft-delete / tag across records.
 * (Bulk Operations, Tier 2)
 */
const functions = require('firebase-functions');
const { db, FieldValue, batchWrite, assertOrgMember } = require('../lib/firestore');

const ALLOWED_COLLECTIONS = ['clients', 'appointments', 'services', 'inventory'];
// Per-collection whitelist of fields callers may bulk-update.
const ALLOWED_FIELDS = {
  clients: ['tags', 'notes', 'emailOptIn', 'smsOptIn', 'isRecurring'],
  appointments: ['status', 'staffId', 'startTime'],
  services: ['isActive', 'price', 'category'],
  inventory: ['isArchived', 'quantity', 'reorderLevel'],
};

/** Validate every target doc belongs to the org before touching anything. */
async function loadAndValidate(collectionName, ids, orgId) {
  const refs = ids.map((id) => db.collection(collectionName).doc(id));
  const snaps = await db.getAll(...refs);
  const invalid = snaps.filter((s) => !s.exists || s.data().orgId !== orgId);
  if (invalid.length > 0) {
    throw new functions.https.HttpsError(
      'permission-denied',
      `${invalid.length} record(s) not found or belong to another organization.`
    );
  }
  return snaps;
}

exports.bulkUpdate = functions.https.onCall(async (data, context) => {
  const { orgId, collection: collectionName, ids, updateData } = data || {};
  if (!orgId || !collectionName || !Array.isArray(ids) || ids.length === 0 || !updateData) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId, collection, ids, updateData are required.');
  }
  if (!ALLOWED_COLLECTIONS.includes(collectionName)) {
    throw new functions.https.HttpsError('invalid-argument', `Bulk updates not allowed on ${collectionName}.`);
  }
  if (ids.length > 1000) {
    throw new functions.https.HttpsError('invalid-argument', 'Maximum 1000 records per bulk operation.');
  }
  const disallowed = Object.keys(updateData).filter((f) => !ALLOWED_FIELDS[collectionName].includes(f));
  if (disallowed.length > 0) {
    throw new functions.https.HttpsError('invalid-argument', `Fields not allowed: ${disallowed.join(', ')}`);
  }
  await assertOrgMember(context, orgId);

  const snaps = await loadAndValidate(collectionName, ids, orgId);
  await batchWrite(
    snaps.map((s) => ({
      type: 'update',
      ref: s.ref,
      data: { ...updateData, updatedAt: FieldValue.serverTimestamp() },
    }))
  );
  return { updated: snaps.length };
});

exports.bulkDelete = functions.https.onCall(async (data, context) => {
  const { orgId, collection: collectionName, ids } = data || {};
  if (!orgId || !collectionName || !Array.isArray(ids) || ids.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId, collection, ids are required.');
  }
  if (!ALLOWED_COLLECTIONS.includes(collectionName)) {
    throw new functions.https.HttpsError('invalid-argument', `Bulk deletes not allowed on ${collectionName}.`);
  }
  await assertOrgMember(context, orgId);

  const snaps = await loadAndValidate(collectionName, ids, orgId);
  // Soft delete — cleanup job purges after 30 days.
  await batchWrite(
    snaps.map((s) => ({
      type: 'update',
      ref: s.ref,
      data: {
        isDeleted: true,
        deletedAt: FieldValue.serverTimestamp(),
        deletedBy: context.auth.uid,
      },
    }))
  );
  return { deleted: snaps.length };
});

exports.bulkTag = functions.https.onCall(async (data, context) => {
  const { orgId, ids, tags } = data || {};
  if (!orgId || !Array.isArray(ids) || !Array.isArray(tags) || tags.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId, ids, tags are required.');
  }
  await assertOrgMember(context, orgId);

  const snaps = await loadAndValidate('clients', ids, orgId);
  await batchWrite(
    snaps.map((s) => ({
      type: 'update',
      ref: s.ref,
      data: { tags: FieldValue.arrayUnion(...tags), updatedAt: FieldValue.serverTimestamp() },
    }))
  );
  return { tagged: snaps.length };
});
