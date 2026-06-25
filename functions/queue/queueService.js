/**
 * Queue management — check-in, staff assignment, completion.
 * Real-time consumers subscribe directly to the queueEntries collection.
 * (Queue Management, Tier 1)
 */
const functions = require('firebase-functions');
const { db, FieldValue, assertOrgMember } = require('../lib/firestore');
const { estimateWaitMinutes } = require('./waitTimePredictor');

exports.checkIn = functions.https.onCall(async (data, context) => {
  const { orgId, appointmentId } = data || {};
  if (!orgId || !appointmentId) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId and appointmentId are required.');
  }
  // Kiosk runs under an org service account; clients may check themselves in.
  await assertOrgMember(context, orgId);

  const apptRef = db.collection('appointments').doc(appointmentId);
  const apptSnap = await apptRef.get();
  if (!apptSnap.exists || apptSnap.data().orgId !== orgId) {
    throw new functions.https.HttpsError('not-found', 'Appointment not found.');
  }
  const appt = apptSnap.data();

  // Idempotency: one queue entry per appointment.
  const existing = await db
    .collection('queueEntries')
    .where('appointmentId', '==', appointmentId)
    .where('status', 'in', ['waiting', 'in-service'])
    .limit(1)
    .get();
  if (!existing.empty) {
    return { queueId: existing.docs[0].id, alreadyCheckedIn: true };
  }

  let serviceDuration = 30;
  if (appt.serviceId) {
    const svcSnap = await db.collection('services').doc(appt.serviceId).get();
    if (svcSnap.exists) serviceDuration = svcSnap.data().durationMinutes || 30;
  }

  const entryRef = await db.collection('queueEntries').add({
    orgId,
    appointmentId,
    clientId: appt.clientId,
    clientName: appt.clientName || '',
    serviceId: appt.serviceId || null,
    serviceName: appt.serviceName || '',
    checkInTime: FieldValue.serverTimestamp(),
    expectedServiceTime: serviceDuration,
    actualServiceStartTime: null,
    actualServiceEndTime: null,
    staffAssignedId: appt.staffId || null,
    status: 'waiting',
    createdAt: FieldValue.serverTimestamp(),
  });

  await apptRef.update({ checkedInAt: FieldValue.serverTimestamp(), status: 'checked_in' });

  const estimatedWaitMinutes = await estimateWaitMinutes(orgId, entryRef.id);
  await entryRef.update({ estimatedWaitMinutes });

  return { queueId: entryRef.id, estimatedWaitMinutes, alreadyCheckedIn: false };
});

exports.assignStaff = functions.https.onCall(async (data, context) => {
  const { orgId, queueId, staffId } = data || {};
  if (!orgId || !queueId || !staffId) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId, queueId, staffId are required.');
  }
  await assertOrgMember(context, orgId);

  const ref = db.collection('queueEntries').doc(queueId);
  const snap = await ref.get();
  if (!snap.exists || snap.data().orgId !== orgId) {
    throw new functions.https.HttpsError('not-found', 'Queue entry not found.');
  }

  await ref.update({
    staffAssignedId: staffId,
    status: 'in-service',
    actualServiceStartTime: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

exports.completeService = functions.https.onCall(async (data, context) => {
  const { orgId, queueId } = data || {};
  if (!orgId || !queueId) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId and queueId are required.');
  }
  await assertOrgMember(context, orgId);

  const ref = db.collection('queueEntries').doc(queueId);
  const snap = await ref.get();
  if (!snap.exists || snap.data().orgId !== orgId) {
    throw new functions.https.HttpsError('not-found', 'Queue entry not found.');
  }
  const entry = snap.data();

  await ref.update({ status: 'completed', actualServiceEndTime: FieldValue.serverTimestamp() });
  if (entry.appointmentId) {
    await db.collection('appointments').doc(entry.appointmentId).update({ status: 'completed' });
  }
  return { ok: true };
});
