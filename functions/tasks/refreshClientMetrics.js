/**
 * Scheduled daily job (2 AM UTC) — refreshes clientMetrics for every org.
 * Powers the CLV Dashboard without per-request recomputation.
 */
const functions = require('firebase-functions');
const { db, FieldValue, batchWrite, logFunctionRun } = require('../lib/firestore');
const { calculateCLV } = require('../analytics/clvCalculator');
const { scoreChurnRisk } = require('../analytics/churnPredictor');

const CONCURRENCY = 10;

async function refreshOrgMetrics(orgId) {
  const clientsSnap = await db
    .collection('clients')
    .where('orgId', '==', orgId)
    .where('isDeleted', '!=', true)
    .get();

  const clients = clientsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const operations = [];

  // Process clients in small concurrent groups to bound memory and read rate.
  for (let i = 0; i < clients.length; i += CONCURRENCY) {
    const group = clients.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      group.map(async (client) => {
        const [clv, churn] = await Promise.all([
          calculateCLV(client.id, orgId),
          scoreChurnRisk(client.id, orgId),
        ]);
        return { client, clv, churn };
      })
    );

    results.forEach(({ client, clv, churn }) => {
      operations.push({
        type: 'set',
        ref: db.collection('clientMetrics').doc(`${orgId}_${client.id}`),
        data: {
          clientId: client.id,
          clientName: client.displayName || client.name || '',
          orgId,
          totalSpent: clv.historicalValue,
          appointmentCount: clv.appointmentCount,
          averageTicketValue: clv.averageTicketValue,
          lastAppointmentDate: clv.lastAppointmentDate,
          daysSinceLastVisit: clv.daysSinceLastVisit,
          churnRiskScore: churn.churnRiskScore,
          churnRecommendation: churn.recommendation,
          lifeTimeValue: clv.lifeTimeValue,
          projectedValue: clv.projectedValue,
          tier: clv.tier,
          preferredServices: clv.preferredServices,
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
      operations.push({
        type: 'update',
        ref: db.collection('clients').doc(client.id),
        data: {
          lastMetricsRefresh: FieldValue.serverTimestamp(),
          churnRiskFlag: churn.churnRiskScore >= 70,
        },
      });
    });
  }

  await batchWrite(operations);
  return clients.length;
}

exports.refreshClientMetrics = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .pubsub.schedule('0 2 * * *')
  .timeZone('UTC')
  .onRun(async () => {
    const orgsSnap = await db.collection('organizations').get();
    let totalClients = 0;

    for (const org of orgsSnap.docs) {
      try {
        totalClients += await refreshOrgMetrics(org.id);
      } catch (err) {
        console.error(`Metrics refresh failed for org ${org.id}:`, err);
        await logFunctionRun('refreshClientMetrics', org.id, 'error', { message: err.message });
      }
    }

    await logFunctionRun('refreshClientMetrics', null, 'success', {
      orgCount: orgsSnap.size,
      clientCount: totalClients,
    });
    return null;
  });

exports.refreshOrgMetrics = refreshOrgMetrics;
