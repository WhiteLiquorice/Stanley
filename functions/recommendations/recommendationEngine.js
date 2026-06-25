/**
 * Rule-based + collaborative-filtering recommendations.
 * (AI Recommendations, Tier 3 — implemented with the pragmatic approach
 * from the scaffold: co-occurrence rules give most of the value.)
 */
const functions = require('firebase-functions');
const { db, FieldValue, fetchAll, daysAgo, logFunctionRun, assertOrgMember } = require('../lib/firestore');

/**
 * Nightly: build a service co-occurrence matrix per org.
 * "Clients who booked A also booked B" — stored in serviceAffinity.
 */
exports.buildServiceAffinity = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .pubsub.schedule('0 5 * * 0') // weekly, Sunday 5 AM UTC
  .timeZone('UTC')
  .onRun(async () => {
    const orgs = await db.collection('organizations').get();

    for (const org of orgs.docs) {
      try {
        const appointments = await fetchAll('appointments', [
          ['orgId', '==', org.id],
          ['status', '==', 'completed'],
        ]);

        // serviceIds per client
        const byClient = {};
        appointments.forEach((a) => {
          if (!a.clientId || !a.serviceId) return;
          (byClient[a.clientId] = byClient[a.clientId] || new Set()).add(a.serviceId);
        });

        // Co-occurrence counts
        const pairCounts = {};
        const serviceCounts = {};
        Object.values(byClient).forEach((services) => {
          const list = [...services];
          list.forEach((s) => (serviceCounts[s] = (serviceCounts[s] || 0) + 1));
          for (let i = 0; i < list.length; i++) {
            for (let j = 0; j < list.length; j++) {
              if (i === j) continue;
              const key = `${list[i]}__${list[j]}`;
              pairCounts[key] = (pairCounts[key] || 0) + 1;
            }
          }
        });

        // For each service, top 5 affinities by lift = P(B|A) / P(B).
        const totalClients = Object.keys(byClient).length || 1;
        const affinities = {};
        Object.entries(pairCounts).forEach(([key, count]) => {
          const [a, b] = key.split('__');
          const pBgivenA = count / serviceCounts[a];
          const pB = serviceCounts[b] / totalClients;
          const lift = pB > 0 ? pBgivenA / pB : 0;
          (affinities[a] = affinities[a] || []).push({ serviceId: b, lift: Math.round(lift * 100) / 100, support: count });
        });

        const batchOps = Object.entries(affinities).map(([serviceId, related]) => ({
          type: 'set',
          ref: db.collection('serviceAffinity').doc(`${org.id}_${serviceId}`),
          data: {
            orgId: org.id,
            serviceId,
            related: related.sort((x, y) => y.lift - x.lift).slice(0, 5),
            updatedAt: FieldValue.serverTimestamp(),
          },
        }));
        const { batchWrite } = require('../lib/firestore');
        await batchWrite(batchOps);
      } catch (err) {
        console.error(`Affinity build failed for ${org.id}:`, err);
      }
    }

    await logFunctionRun('buildServiceAffinity', null, 'success', { orgs: orgs.size });
    return null;
  });

/**
 * Recommendations for one client: next service, win-back, premium upsell.
 */
exports.getClientRecommendations = functions.https.onCall(async (data, context) => {
  const { orgId, clientId } = data || {};
  if (!orgId || !clientId) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId and clientId are required.');
  }
  await assertOrgMember(context, orgId);

  const [metricsSnap, historySnap] = await Promise.all([
    db.collection('clientMetrics').doc(`${orgId}_${clientId}`).get(),
    db
      .collection('appointments')
      .where('orgId', '==', orgId)
      .where('clientId', '==', clientId)
      .where('status', '==', 'completed')
      .orderBy('startTime', 'desc')
      .limit(20)
      .get(),
  ]);

  const metrics = metricsSnap.exists ? metricsSnap.data() : null;
  const history = historySnap.docs.map((d) => d.data());
  const recommendations = [];

  // Rule 1: service affinity — recommend what similar clients booked next.
  const bookedServiceIds = new Set(history.map((a) => a.serviceId).filter(Boolean));
  for (const serviceId of bookedServiceIds) {
    const affSnap = await db.collection('serviceAffinity').doc(`${orgId}_${serviceId}`).get();
    if (!affSnap.exists) continue;
    for (const rel of affSnap.data().related || []) {
      if (!bookedServiceIds.has(rel.serviceId) && rel.lift > 1.2) {
        recommendations.push({
          type: 'next_service',
          serviceId: rel.serviceId,
          reason: 'Clients with similar history often book this service.',
          confidence: Math.min(0.9, rel.lift / 5),
        });
      }
    }
  }

  // Rule 2: win-back for inactive clients.
  if (metrics && metrics.daysSinceLastVisit >= 60) {
    recommendations.push({
      type: 'win_back',
      reason: `${metrics.daysSinceLastVisit} days since last visit — send a win-back offer.`,
      confidence: 0.8,
    });
  }

  // Rule 3: premium upsell for high spenders.
  if (metrics && metrics.lifeTimeValue >= 500 && metrics.churnRiskScore < 40) {
    recommendations.push({
      type: 'premium_upsell',
      reason: 'High lifetime value and healthy engagement — strong candidate for premium packages.',
      confidence: 0.7,
    });
  }

  // Dedupe by (type, serviceId), keep highest confidence, top 5 overall.
  const seen = new Map();
  recommendations.forEach((r) => {
    const key = `${r.type}_${r.serviceId || ''}`;
    if (!seen.has(key) || seen.get(key).confidence < r.confidence) seen.set(key, r);
  });

  return {
    clientId,
    recommendations: [...seen.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 5),
  };
});
