/**
 * Monthly Recurring Revenue rollup. (Recurring Revenue Dashboard, Tier 2)
 * Runs on the 1st of each month and snapshots MRR into mrrHistory.
 */
const functions = require('firebase-functions');
const { db, FieldValue, monthKey, toDate, logFunctionRun } = require('../lib/firestore');

async function snapshotOrgMrr(orgId) {
  const snap = await db
    .collection('clients')
    .where('orgId', '==', orgId)
    .where('isRecurring', '==', true)
    .get();

  const recurring = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const month = monthKey(new Date());
  const monthStart = new Date(`${month}-01T00:00:00Z`);

  const active = recurring.filter((c) => !c.subscriptionCancelledAt);
  const totalMRR = active.reduce((s, c) => s + (c.recurringRevenuePerMonth || 0), 0);
  const newThisMonth = active.filter(
    (c) => c.subscriptionStartDate && toDate(c.subscriptionStartDate) >= monthStart
  ).length;
  const cancelledThisMonth = recurring.filter(
    (c) => c.subscriptionCancelledAt && toDate(c.subscriptionCancelledAt) >= monthStart
  ).length;

  await db
    .collection('mrrHistory')
    .doc(`${orgId}_${month}`)
    .set({
      orgId,
      month,
      totalMRR: Math.round(totalMRR * 100) / 100,
      activeSubscriptions: active.length,
      newSubscriptions: newThisMonth,
      canceledSubscriptions: cancelledThisMonth,
      averageARPU: active.length ? Math.round((totalMRR / active.length) * 100) / 100 : 0,
      updatedAt: FieldValue.serverTimestamp(),
    });

  return totalMRR;
}

exports.snapshotMrr = functions.pubsub
  .schedule('0 4 1 * *') // 4 AM UTC on the 1st
  .timeZone('UTC')
  .onRun(async () => {
    const orgs = await db.collection('organizations').get();
    for (const org of orgs.docs) {
      try {
        await snapshotOrgMrr(org.id);
      } catch (err) {
        console.error(`MRR snapshot failed for ${org.id}:`, err);
      }
    }
    await logFunctionRun('snapshotMrr', null, 'success', { orgs: orgs.size });
    return null;
  });

exports.snapshotOrgMrr = snapshotOrgMrr;
