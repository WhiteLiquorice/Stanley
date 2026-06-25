/**
 * Demand forecasting — predicts appointment volume per day-of-week and hour
 * from the trailing 90 days of history. (Smart Resource Allocation, Tier 1)
 */
const functions = require('firebase-functions');
const { db, daysAgo, toDate, assertOrgMember, logFunctionRun } = require('../lib/firestore');

const LOOKBACK_DAYS = 90;

/**
 * Build per-slot demand profile from history.
 * Returns { dailyForecasts, weeklyTrends, confidenceScore }.
 */
async function buildForecast(orgId, rangeStart, rangeEnd) {
  const since = daysAgo(LOOKBACK_DAYS);
  const snap = await db
    .collection('appointments')
    .where('orgId', '==', orgId)
    .where('createdAt', '>=', since)
    .get();

  const appointments = snap.docs.map((d) => d.data());

  // Bucket history: [dayOfWeek][hour] -> count
  const buckets = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const weeksObserved = LOOKBACK_DAYS / 7;

  appointments.forEach((appt) => {
    const start = toDate(appt.startTime || appt.scheduledAt || appt.createdAt);
    if (!start) return;
    buckets[start.getUTCDay()][start.getUTCHours()] += 1;
  });

  // Average count per slot per week = expected demand for that slot.
  const profile = buckets.map((hours) => hours.map((count) => count / weeksObserved));

  // Project the profile onto each day in the requested range.
  const dailyForecasts = [];
  const start = toDate(rangeStart);
  const end = toDate(rangeEnd);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    const hourly = profile[dow].map((expected, hour) => ({
      hour,
      expectedAppointments: Math.round(expected * 100) / 100,
    }));
    dailyForecasts.push({
      date: d.toISOString().slice(0, 10),
      dayOfWeek: dow,
      expectedTotal: Math.round(hourly.reduce((s, h) => s + h.expectedAppointments, 0) * 10) / 10,
      hourly: hourly.filter((h) => h.expectedAppointments > 0),
    });
  }

  // Week-over-week trend: compare last 4 weeks vs prior 4 weeks.
  const last28 = appointments.filter((a) => toDate(a.createdAt) >= daysAgo(28)).length;
  const prior28 = appointments.filter((a) => {
    const c = toDate(a.createdAt);
    return c >= daysAgo(56) && c < daysAgo(28);
  }).length;
  const growthRate = prior28 > 0 ? (last28 - prior28) / prior28 : 0;

  // Confidence scales with sample size; caps at 0.95.
  const confidenceScore = Math.min(0.95, appointments.length / 500);

  return {
    dailyForecasts,
    weeklyTrends: { last28Days: last28, prior28Days: prior28, growthRate },
    confidenceScore,
    sampleSize: appointments.length,
  };
}

exports.forecastDemand = functions.https.onCall(async (data, context) => {
  const { orgId, rangeStart, rangeEnd } = data || {};
  if (!orgId || !rangeStart || !rangeEnd) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId, rangeStart, rangeEnd are required.');
  }
  await assertOrgMember(context, orgId);

  try {
    const forecast = await buildForecast(orgId, rangeStart, rangeEnd);
    await logFunctionRun('forecastDemand', orgId, 'success', { sampleSize: forecast.sampleSize });
    return forecast;
  } catch (err) {
    console.error('forecastDemand failed:', err);
    await logFunctionRun('forecastDemand', orgId, 'error', { message: err.message });
    throw new functions.https.HttpsError('internal', 'Forecast generation failed.');
  }
});

exports.buildForecast = buildForecast;
