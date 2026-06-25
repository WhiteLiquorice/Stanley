/**
 * Capacity planning — projects appointment volume 3–12 months out and
 * recommends staffing levels. (Capacity Planning, Tier 3)
 */
const functions = require('firebase-functions');
const { db, toDate, monthKey, assertOrgMember } = require('../lib/firestore');

const HOURS_PER_STAFF_PER_MONTH = 140; // ~35 bookable hours/week with buffer

async function buildCapacityForecast(orgId, monthsAhead = 6) {
  // Twelve months of history, grouped by month.
  const yearAgo = new Date();
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);

  const snap = await db
    .collection('appointments')
    .where('orgId', '==', orgId)
    .where('startTime', '>=', yearAgo)
    .get();

  const monthly = {};
  snap.docs.forEach((d) => {
    const a = d.data();
    const mk = monthKey(toDate(a.startTime));
    monthly[mk] = monthly[mk] || { appointments: 0, hours: 0 };
    monthly[mk].appointments += 1;
    monthly[mk].hours += (a.durationMinutes || 30) / 60;
  });

  const months = Object.keys(monthly).sort();
  if (months.length < 3) {
    return { error: 'Need at least 3 months of history for a forecast.', monthsOfHistory: months.length };
  }

  // Linear regression over monthly appointment counts.
  const ys = months.map((m) => monthly[m].appointments);
  const n = ys.length;
  const xMean = (n - 1) / 2;
  const yMean = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  ys.forEach((y, x) => {
    num += (x - xMean) * (y - yMean);
    den += (x - xMean) ** 2;
  });
  const slope = den ? num / den : 0;
  const avgHoursPerAppt = months.reduce((s, m) => s + monthly[m].hours, 0) / ys.reduce((s, y) => s + y, 0);

  // Current staffing.
  const staffSnap = await db
    .collection('staffMembers')
    .where('orgId', '==', orgId)
    .where('isActive', '==', true)
    .get();
  const currentStaff = staffSnap.size;
  const currentCapacityHours = currentStaff * HOURS_PER_STAFF_PER_MONTH;

  const projections = [];
  const now = new Date();
  for (let i = 1; i <= monthsAhead; i++) {
    const future = new Date(now);
    future.setUTCMonth(future.getUTCMonth() + i);
    const projectedAppointments = Math.max(0, Math.round(yMean + slope * (n - 1 + i)));
    const projectedHours = Math.round(projectedAppointments * avgHoursPerAppt);
    const staffNeeded = Math.ceil(projectedHours / HOURS_PER_STAFF_PER_MONTH);
    projections.push({
      month: monthKey(future),
      projectedAppointments,
      projectedHours,
      staffNeeded,
      currentStaff,
      shortfall: Math.max(0, staffNeeded - currentStaff),
      utilizationAtCurrentStaff: currentCapacityHours
        ? Math.round((projectedHours / currentCapacityHours) * 100)
        : null,
    });
  }

  const firstShortfall = projections.find((p) => p.shortfall > 0);
  return {
    history: months.map((m) => ({ month: m, ...monthly[m], hours: Math.round(monthly[m].hours) })),
    monthlyGrowth: Math.round(slope * 10) / 10,
    projections,
    recommendation: firstShortfall
      ? `Hire ${firstShortfall.shortfall} additional staff before ${firstShortfall.month} to meet projected demand.`
      : 'Current staffing covers projected demand for the forecast window.',
  };
}

exports.forecastCapacity = functions.https.onCall(async (data, context) => {
  const { orgId, monthsAhead } = data || {};
  if (!orgId) throw new functions.https.HttpsError('invalid-argument', 'orgId is required.');
  await assertOrgMember(context, orgId);
  return buildCapacityForecast(orgId, Math.min(12, monthsAhead || 6));
});

exports.buildCapacityForecast = buildCapacityForecast;
