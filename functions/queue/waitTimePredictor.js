/**
 * Wait time estimation for queue entries.
 * Sum of expected service time for everyone ahead, divided by the number
 * of staff actively serving (parallelism), padded by historical variance.
 */
const { db, toDate } = require('../lib/firestore');

const VARIANCE_PADDING = 1.15; // services run ~15% over on average

async function estimateWaitMinutes(orgId, queueId) {
  const snap = await db
    .collection('queueEntries')
    .where('orgId', '==', orgId)
    .where('status', 'in', ['waiting', 'in-service'])
    .orderBy('checkInTime', 'asc')
    .get();

  const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const myIndex = entries.findIndex((e) => e.id === queueId);
  if (myIndex <= 0) return 0;

  const ahead = entries.slice(0, myIndex);

  // Active parallelism: distinct staff currently serving, minimum 1.
  const activeStaff = new Set(
    entries.filter((e) => e.status === 'in-service' && e.staffAssignedId).map((e) => e.staffAssignedId)
  );
  const parallelism = Math.max(1, activeStaff.size);

  // Remaining minutes for in-service entries; full duration for waiting ones.
  const totalMinutesAhead = ahead.reduce((sum, e) => {
    const duration = e.expectedServiceTime || 30;
    if (e.status === 'in-service' && e.actualServiceStartTime) {
      const elapsed = (Date.now() - toDate(e.actualServiceStartTime).getTime()) / 60000;
      return sum + Math.max(0, duration - elapsed);
    }
    return sum + duration;
  }, 0);

  return Math.round((totalMinutesAhead / parallelism) * VARIANCE_PADDING);
}

module.exports = { estimateWaitMinutes };
