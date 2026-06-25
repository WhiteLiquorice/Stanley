/**
 * Client Lifetime Value calculation. (CLV Dashboard, Tier 1)
 * CLV = historical revenue + projected next-12-month revenue,
 * projected from observed visit frequency and average ticket.
 */
const { db, toDate, daysBetween } = require('../lib/firestore');

const TIER_THRESHOLDS = { gold: 1000, silver: 400 }; // by lifetime value

async function calculateCLV(clientId, orgId) {
  const snap = await db
    .collection('appointments')
    .where('orgId', '==', orgId)
    .where('clientId', '==', clientId)
    .where('status', '==', 'completed')
    .orderBy('startTime', 'asc')
    .get();

  const appointments = snap.docs.map((d) => d.data());

  if (appointments.length === 0) {
    return {
      historicalValue: 0,
      projectedValue: 0,
      lifeTimeValue: 0,
      appointmentCount: 0,
      averageTicketValue: 0,
      lastAppointmentDate: null,
      daysSinceLastVisit: null,
      tier: 'bronze',
      preferredServices: [],
    };
  }

  const historicalValue = appointments.reduce((sum, a) => sum + (a.totalAmount || a.price || 0), 0);
  const averageTicketValue = historicalValue / appointments.length;

  const first = toDate(appointments[0].startTime);
  const last = toDate(appointments[appointments.length - 1].startTime);
  const daysSinceLastVisit = daysBetween(last, new Date());

  // Visit frequency: appointments per 30 days over the client's active span.
  const activeSpanDays = Math.max(30, daysBetween(first, last));
  const visitsPerMonth = appointments.length / (activeSpanDays / 30);

  // Projection decays with inactivity: a client unseen for 90+ days
  // contributes little projected value.
  const inactivityFactor = Math.max(0, 1 - daysSinceLastVisit / 120);
  const projectedValue = Math.round(visitsPerMonth * 12 * averageTicketValue * inactivityFactor * 100) / 100;

  const lifeTimeValue = Math.round((historicalValue + projectedValue) * 100) / 100;

  const tier =
    lifeTimeValue >= TIER_THRESHOLDS.gold ? 'gold' : lifeTimeValue >= TIER_THRESHOLDS.silver ? 'silver' : 'bronze';

  // Top 3 services by visit count.
  const serviceCounts = {};
  appointments.forEach((a) => {
    const key = a.serviceName || a.serviceId;
    if (key) serviceCounts[key] = (serviceCounts[key] || 0) + 1;
  });
  const preferredServices = Object.entries(serviceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  return {
    historicalValue: Math.round(historicalValue * 100) / 100,
    projectedValue,
    lifeTimeValue,
    appointmentCount: appointments.length,
    averageTicketValue: Math.round(averageTicketValue * 100) / 100,
    lastAppointmentDate: last,
    daysSinceLastVisit,
    visitsPerMonth: Math.round(visitsPerMonth * 100) / 100,
    tier,
    preferredServices,
  };
}

module.exports = { calculateCLV, TIER_THRESHOLDS };
