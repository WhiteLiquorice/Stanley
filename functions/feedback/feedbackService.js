/**
 * Client feedback collection + low-rating alerts. (Feedback System, Tier 3)
 */
const functions = require('firebase-functions');
const { db, FieldValue } = require('../lib/firestore');
const { sendEmail } = require('../messaging/emailService');

exports.submitFeedback = functions.https.onCall(async (data, context) => {
  const { orgId, appointmentId, serviceRating, staffRating, overallRating, comment, wouldRecommend } = data || {};
  if (!orgId || !appointmentId || !overallRating) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId, appointmentId, overallRating are required.');
  }
  for (const [name, val] of [['serviceRating', serviceRating], ['staffRating', staffRating], ['overallRating', overallRating]]) {
    if (val !== undefined && val !== null && (val < 1 || val > 5)) {
      throw new functions.https.HttpsError('invalid-argument', `${name} must be between 1 and 5.`);
    }
  }

  const apptSnap = await db.collection('appointments').doc(appointmentId).get();
  if (!apptSnap.exists || apptSnap.data().orgId !== orgId) {
    throw new functions.https.HttpsError('not-found', 'Appointment not found.');
  }
  const appt = apptSnap.data();

  // One feedback entry per appointment.
  const existing = await db
    .collection('feedback')
    .where('appointmentId', '==', appointmentId)
    .limit(1)
    .get();
  if (!existing.empty) {
    throw new functions.https.HttpsError('already-exists', 'Feedback already submitted for this appointment.');
  }

  await db.collection('feedback').add({
    orgId,
    clientId: appt.clientId,
    appointmentId,
    serviceId: appt.serviceId || null,
    staffId: appt.staffId || null,
    serviceRating: serviceRating || null,
    staffRating: staffRating || null,
    overallRating,
    comment: (comment || '').slice(0, 2000),
    wouldRecommend: wouldRecommend ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });

  // Write ratings back to the appointment so rollups can read them in one query.
  await apptSnap.ref.update({
    clientRating: overallRating,
    staffRating: staffRating || null,
  });

  // Alert owners on low ratings.
  if (overallRating <= 2) {
    const orgSnap = await db.collection('organizations').doc(orgId).get();
    const alertEmail = orgSnap.exists ? orgSnap.data().alertEmail : null;
    if (alertEmail) {
      await sendEmail({
        orgId,
        clientId: null,
        to: alertEmail,
        subject: `Low rating alert: ${overallRating}/5 from a client`,
        body: `A client left a ${overallRating}/5 rating for appointment ${appointmentId}.\n\nComment: ${comment || '(none)'}\n\nConsider reaching out personally.`,
      });
    }
  }

  return { ok: true };
});

/** Org-wide rating summary for the feedback dashboard. */
exports.getFeedbackSummary = functions.https.onCall(async (data, context) => {
  const { orgId } = data || {};
  if (!orgId) throw new functions.https.HttpsError('invalid-argument', 'orgId is required.');
  const { assertOrgMember } = require('../lib/firestore');
  await assertOrgMember(context, orgId);

  const snap = await db
    .collection('feedback')
    .where('orgId', '==', orgId)
    .orderBy('createdAt', 'desc')
    .limit(500)
    .get();
  const rows = snap.docs.map((d) => d.data());

  const avg = (arr) => (arr.length ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 100) / 100 : null);
  const recommends = rows.filter((r) => r.wouldRecommend !== null);

  return {
    count: rows.length,
    averageOverall: avg(rows.map((r) => r.overallRating).filter(Boolean)),
    averageService: avg(rows.map((r) => r.serviceRating).filter(Boolean)),
    averageStaff: avg(rows.map((r) => r.staffRating).filter(Boolean)),
    npsPercent: recommends.length
      ? Math.round((recommends.filter((r) => r.wouldRecommend).length / recommends.length) * 100)
      : null,
    recent: rows.slice(0, 20).map((r) => ({
      overallRating: r.overallRating,
      comment: r.comment,
      createdAt: r.createdAt,
    })),
  };
});
