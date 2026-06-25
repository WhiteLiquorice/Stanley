/**
 * Client segmentation — predefined and custom rule-based segments,
 * evaluated against the clientMetrics rollup. (Client Segmentation, Tier 2)
 */
const functions = require('firebase-functions');
const { db, FieldValue, fetchAll, assertOrgMember, logFunctionRun } = require('../lib/firestore');

const PREDEFINED_SEGMENTS = {
  high_value: {
    name: 'High Value',
    test: (m) => m.lifeTimeValue >= 1000,
  },
  at_risk: {
    name: 'At Risk',
    test: (m) => m.churnRiskScore >= 70,
  },
  inactive_60: {
    name: 'Inactive 60+ Days',
    test: (m) => m.daysSinceLastVisit >= 60,
  },
  frequent: {
    name: 'Frequent Visitors',
    test: (m) => (m.visitsPerMonth || 0) >= 1.5,
  },
  new_clients: {
    name: 'New (under 30 days)',
    test: (m) => m.appointmentCount <= 1 && (m.daysSinceLastVisit === null || m.daysSinceLastVisit < 30),
  },
};

/** Evaluate one custom rule: { field, operator, value }. */
function evaluateRule(metrics, rule) {
  const actual = metrics[rule.field];
  switch (rule.operator) {
    case '>=': return actual >= rule.value;
    case '<=': return actual <= rule.value;
    case '>': return actual > rule.value;
    case '<': return actual < rule.value;
    case '==': return actual === rule.value;
    case 'includes': return Array.isArray(actual) && actual.includes(rule.value);
    default: return false;
  }
}

async function evaluateSegment(orgId, segment) {
  const allMetrics = await fetchAll('clientMetrics', [['orgId', '==', orgId]]);

  let members;
  if (segment.type === 'predefined') {
    const def = PREDEFINED_SEGMENTS[segment.key];
    if (!def) throw new Error(`Unknown predefined segment: ${segment.key}`);
    members = allMetrics.filter(def.test);
  } else {
    const rules = segment.rules || [];
    members = allMetrics.filter((m) => rules.every((rule) => evaluateRule(m, rule)));
  }

  return members.map((m) => ({
    clientId: m.clientId,
    clientName: m.clientName,
    lifeTimeValue: m.lifeTimeValue,
    churnRiskScore: m.churnRiskScore,
    daysSinceLastVisit: m.daysSinceLastVisit,
  }));
}

exports.getSegmentMembers = functions.https.onCall(async (data, context) => {
  const { orgId, segmentKey, segmentId } = data || {};
  if (!orgId || (!segmentKey && !segmentId)) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId and segmentKey or segmentId are required.');
  }
  await assertOrgMember(context, orgId);

  let segment;
  if (segmentKey) {
    segment = { type: 'predefined', key: segmentKey };
  } else {
    const snap = await db.collection('clientSegments').doc(segmentId).get();
    if (!snap.exists || snap.data().orgId !== orgId) {
      throw new functions.https.HttpsError('not-found', 'Segment not found.');
    }
    segment = snap.data();
  }

  const members = await evaluateSegment(orgId, segment);
  return { members, count: members.length };
});

/** Nightly: refresh member counts on saved segments so list views are instant. */
exports.refreshSegmentCounts = functions.pubsub
  .schedule('15 3 * * *')
  .timeZone('UTC')
  .onRun(async () => {
    const segSnap = await db.collection('clientSegments').get();
    for (const doc of segSnap.docs) {
      try {
        const members = await evaluateSegment(doc.data().orgId, doc.data());
        await doc.ref.update({ memberCount: members.length, updatedAt: FieldValue.serverTimestamp() });
      } catch (err) {
        console.error(`Segment count refresh failed for ${doc.id}:`, err);
      }
    }
    await logFunctionRun('refreshSegmentCounts', null, 'success', { segments: segSnap.size });
    return null;
  });

exports.PREDEFINED_SEGMENTS = PREDEFINED_SEGMENTS;
exports.evaluateSegment = evaluateSegment;
