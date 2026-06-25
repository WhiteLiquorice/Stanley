/**
 * Nightly staff performance rollup. (Staff Performance, Tier 1)
 * Writes one staffMetrics doc per staff member per month.
 */
const functions = require('firebase-functions');
const { db, FieldValue, batchWrite, toDate, monthKey, daysAgo, logFunctionRun } = require('../lib/firestore');

async function rollupOrgStaff(orgId) {
  const [apptSnap, staffSnap] = await Promise.all([
    db.collection('appointments').where('orgId', '==', orgId).where('startTime', '>=', daysAgo(31)).get(),
    db.collection('staffMembers').where('orgId', '==', orgId).get(),
  ]);

  const appointments = apptSnap.docs.map((d) => d.data());
  const staff = staffSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const month = monthKey(new Date());

  const operations = staff.map((member) => {
    const mine = appointments.filter((a) => a.staffId === member.id);
    const completed = mine.filter((a) => a.status === 'completed');
    const revenue = completed.reduce((s, a) => s + (a.totalAmount || a.price || 0), 0);
    const ratings = completed.map((a) => a.staffRating).filter((r) => typeof r === 'number');
    const clients = new Set(completed.map((a) => a.clientId));

    // On-time: started within 10 minutes of scheduled start.
    const onTime = completed.filter((a) => {
      const scheduled = toDate(a.startTime);
      const actual = toDate(a.actualStartTime || a.startTime);
      return scheduled && actual && actual - scheduled <= 10 * 60000;
    }).length;

    const hoursBooked = completed.reduce((s, a) => s + (a.durationMinutes || 30) / 60, 0);
    const hoursAvailable = (member.weeklyHours || 40) * 4.3;

    return {
      type: 'set',
      ref: db.collection('staffMetrics').doc(`${orgId}_${member.id}_${month}`),
      data: {
        orgId,
        staffId: member.id,
        staffName: member.displayName || member.name || '',
        month,
        appointmentsCompleted: completed.length,
        onTimeRate: completed.length ? Math.round((onTime / completed.length) * 1000) / 1000 : null,
        averageRating: ratings.length
          ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 100) / 100
          : null,
        hoursBooked: Math.round(hoursBooked * 10) / 10,
        utilizationRate: hoursAvailable ? Math.round((hoursBooked / hoursAvailable) * 1000) / 1000 : null,
        revenueGenerated: Math.round(revenue * 100) / 100,
        clientsServed: clients.size,
        updatedAt: FieldValue.serverTimestamp(),
      },
    };
  });

  await batchWrite(operations);
  return operations.length;
}

exports.rollupStaffMetrics = functions
  .runWith({ timeoutSeconds: 540 })
  .pubsub.schedule('45 2 * * *')
  .timeZone('UTC')
  .onRun(async () => {
    const orgs = await db.collection('organizations').get();
    let rows = 0;
    for (const org of orgs.docs) {
      try {
        rows += await rollupOrgStaff(org.id);
      } catch (err) {
        console.error(`Staff rollup failed for ${org.id}:`, err);
      }
    }
    await logFunctionRun('rollupStaffMetrics', null, 'success', { rows });
    return null;
  });

exports.rollupOrgStaff = rollupOrgStaff;
