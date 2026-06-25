/**
 * Staff matching — ranks staff candidates for an appointment by skills,
 * availability, client preference history, and workload balance.
 * (Smart Resource Allocation, Tier 1)
 */
const functions = require('firebase-functions');
const { db, toDate, assertOrgMember } = require('../lib/firestore');

const WEIGHTS = {
  clientPreference: 0.4, // client has seen this staff member before
  workloadBalance: 0.3, // favor less-booked staff
  skillMatch: 0.2, // staff offers this service
  recency: 0.1, // staff served this client recently
};

async function rankStaffForAppointment(orgId, appointmentId) {
  const apptSnap = await db.collection('appointments').doc(appointmentId).get();
  if (!apptSnap.exists || apptSnap.data().orgId !== orgId) {
    throw new functions.https.HttpsError('not-found', 'Appointment not found.');
  }
  const appt = apptSnap.data();

  const [staffSnap, historySnap] = await Promise.all([
    db.collection('staffMembers').where('orgId', '==', orgId).where('isActive', '==', true).get(),
    db
      .collection('appointments')
      .where('orgId', '==', orgId)
      .where('clientId', '==', appt.clientId)
      .where('status', '==', 'completed')
      .orderBy('startTime', 'desc')
      .limit(50)
      .get(),
  ]);

  const staff = staffSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const history = historySnap.docs.map((d) => d.data());

  // Count of past visits per staff member for this client.
  const visitsByStaff = {};
  history.forEach((h) => {
    if (h.staffId) visitsByStaff[h.staffId] = (visitsByStaff[h.staffId] || 0) + 1;
  });
  const maxVisits = Math.max(1, ...Object.values(visitsByStaff));

  // Current open workload per staff member (next 7 days).
  const weekAhead = new Date(Date.now() + 7 * 86400000);
  const workloadSnap = await db
    .collection('appointments')
    .where('orgId', '==', orgId)
    .where('status', '==', 'scheduled')
    .where('startTime', '<=', weekAhead)
    .get();
  const workloadByStaff = {};
  workloadSnap.docs.forEach((d) => {
    const sid = d.data().staffId;
    if (sid) workloadByStaff[sid] = (workloadByStaff[sid] || 0) + 1;
  });
  const maxWorkload = Math.max(1, ...Object.values(workloadByStaff), 1);

  const apptStart = toDate(appt.startTime);

  const ranked = staff
    .map((member) => {
      const skills = member.serviceIds || member.skills || [];
      const offersService = !appt.serviceId || skills.includes(appt.serviceId);
      if (!offersService) return null;

      // Hard constraint: skip staff with an overlapping appointment.
      const unavailable = (member.timeOff || []).some((block) => {
        const s = toDate(block.start);
        const e = toDate(block.end);
        return apptStart && s && e && apptStart >= s && apptStart < e;
      });
      if (unavailable) return null;

      const preferenceScore = (visitsByStaff[member.id] || 0) / maxVisits;
      const workloadScore = 1 - (workloadByStaff[member.id] || 0) / maxWorkload;
      const lastVisit = history.find((h) => h.staffId === member.id);
      const recencyScore = lastVisit ? 1 : 0;

      const score =
        WEIGHTS.clientPreference * preferenceScore +
        WEIGHTS.workloadBalance * workloadScore +
        WEIGHTS.skillMatch * 1 +
        WEIGHTS.recency * recencyScore;

      return {
        staffId: member.id,
        staffName: member.displayName || member.name,
        score: Math.round(score * 100),
        pastVisitsWithClient: visitsByStaff[member.id] || 0,
        upcomingAppointments: workloadByStaff[member.id] || 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return { appointmentId, rankedStaffOptions: ranked };
}

exports.matchStaff = functions.https.onCall(async (data, context) => {
  const { orgId, appointmentId } = data || {};
  if (!orgId || !appointmentId) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId and appointmentId are required.');
  }
  await assertOrgMember(context, orgId);
  return rankStaffForAppointment(orgId, appointmentId);
});

exports.rankStaffForAppointment = rankStaffForAppointment;
