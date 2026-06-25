/**
 * Shared Firestore helpers used by all Production functions.
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

/** Commit writes in chunks of 500 (Firestore batch limit). */
async function batchWrite(operations) {
  const results = [];
  for (let i = 0; i < operations.length; i += 500) {
    const batch = db.batch();
    operations.slice(i, i + 500).forEach((op) => {
      if (op.type === 'set') batch.set(op.ref, op.data, { merge: op.merge !== false });
      else if (op.type === 'update') batch.update(op.ref, op.data);
      else if (op.type === 'delete') batch.delete(op.ref);
    });
    results.push(await batch.commit());
  }
  return results;
}

/** Fetch all docs matching constraints; returns array of { id, ...data }. */
async function fetchAll(collectionName, constraints = []) {
  let ref = db.collection(collectionName);
  constraints.forEach(([field, op, value]) => {
    ref = ref.where(field, op, value);
  });
  const snap = await ref.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Date helpers — all UTC. */
function startOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n) {
  return startOfDay(new Date(Date.now() - n * 86400000));
}

function daysBetween(a, b) {
  return Math.floor(Math.abs(toDate(b) - toDate(a)) / 86400000);
}

function monthKey(date) {
  const d = toDate(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Normalize Firestore Timestamp | Date | ISO string to Date. */
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return new Date(value);
}

/** Write an audit log entry; never throws. */
async function logFunctionRun(functionName, orgId, status, detail = {}) {
  try {
    await db.collection('functionLogs').add({
      functionName,
      orgId: orgId || null,
      status,
      detail,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error(`Failed to write functionLog for ${functionName}:`, err);
  }
}

/** Assert the caller belongs to the org; throws HttpsError otherwise. */
async function assertOrgMember(context, orgId) {
  const functions = require('firebase-functions');
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }
  const memberSnap = await db
    .collection('organizations')
    .doc(orgId)
    .collection('members')
    .doc(context.auth.uid)
    .get();
  if (!memberSnap.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Not a member of this organization.');
  }
  return memberSnap.data();
}

module.exports = {
  admin,
  db,
  FieldValue,
  Timestamp,
  batchWrite,
  fetchAll,
  startOfDay,
  daysAgo,
  daysBetween,
  monthKey,
  toDate,
  logFunctionRun,
  assertOrgMember,
};
