/**
 * Nightly service performance rollup. (Service Analytics, Tier 1)
 * Writes one serviceMetrics doc per service per month.
 */
const functions = require('firebase-functions');
const { db, FieldValue, batchWrite, toDate, monthKey, daysAgo, logFunctionRun } = require('../lib/firestore');

async function rollupOrgServices(orgId) {
  const snap = await db
    .collection('appointments')
    .where('orgId', '==', orgId)
    .where('startTime', '>=', daysAgo(62)) // current + previous month
    .get();

  const appointments = snap.docs.map((d) => d.data());
  const thisMonth = monthKey(new Date());
  const lastMonth = monthKey(new Date(new Date().setUTCMonth(new Date().getUTCMonth() - 1)));

  // Aggregate per (serviceId, month).
  const agg = {};
  appointments.forEach((a) => {
    if (!a.serviceId) return;
    const mk = monthKey(toDate(a.startTime));
    if (mk !== thisMonth && mk !== lastMonth) return;
    const key = `${a.serviceId}_${mk}`;
    agg[key] = agg[key] || {
      serviceId: a.serviceId,
      serviceName: a.serviceName || '',
      month: mk,
      bookings: 0,
      completed: 0,
      noShows: 0,
      cancellations: 0,
      revenue: 0,
      ratingSum: 0,
      ratingCount: 0,
    };
    const row = agg[key];
    row.bookings += 1;
    if (a.status === 'completed') {
      row.completed += 1;
      row.revenue += a.totalAmount || a.price || 0;
    }
    if (a.status === 'no_show') row.noShows += 1;
    if (a.status === 'cancelled') row.cancellations += 1;
    if (typeof a.clientRating === 'number') {
      row.ratingSum += a.clientRating;
      row.ratingCount += 1;
    }
  });

  const operations = Object.values(agg).map((row) => {
    const prior = agg[`${row.serviceId}_${lastMonth}`];
    return {
      type: 'set',
      ref: db.collection('serviceMetrics').doc(`${orgId}_${row.serviceId}_${row.month}`),
      data: {
        orgId,
        serviceId: row.serviceId,
        serviceName: row.serviceName,
        month: row.month,
        bookings: row.bookings,
        completed: row.completed,
        revenue: Math.round(row.revenue * 100) / 100,
        noShowRate: row.bookings ? Math.round((row.noShows / row.bookings) * 1000) / 1000 : 0,
        cancellationRate: row.bookings ? Math.round((row.cancellations / row.bookings) * 1000) / 1000 : 0,
        averageRating: row.ratingCount ? Math.round((row.ratingSum / row.ratingCount) * 100) / 100 : null,
        previousMonthBookings: row.month === thisMonth && prior ? prior.bookings : null,
        previousMonthRevenue:
          row.month === thisMonth && prior ? Math.round(prior.revenue * 100) / 100 : null,
        updatedAt: FieldValue.serverTimestamp(),
      },
    };
  });

  await batchWrite(operations);
  return operations.length;
}

exports.rollupServiceMetrics = functions
  .runWith({ timeoutSeconds: 540 })
  .pubsub.schedule('30 2 * * *')
  .timeZone('UTC')
  .onRun(async () => {
    const orgs = await db.collection('organizations').get();
    let rows = 0;
    for (const org of orgs.docs) {
      try {
        rows += await rollupOrgServices(org.id);
      } catch (err) {
        console.error(`Service rollup failed for ${org.id}:`, err);
      }
    }
    await logFunctionRun('rollupServiceMetrics', null, 'success', { rows });
    return null;
  });

exports.rollupOrgServices = rollupOrgServices;
