/**
 * Churn risk scoring. (CLV Dashboard, Tier 1)
 * Weighted factors: inactivity (40%), declining frequency (30%),
 * narrow service usage (20%), negative signals (10%).
 */
const { db, toDate, daysBetween, daysAgo } = require('../lib/firestore');

async function scoreChurnRisk(clientId, orgId) {
  const snap = await db
    .collection('appointments')
    .where('orgId', '==', orgId)
    .where('clientId', '==', clientId)
    .orderBy('startTime', 'desc')
    .limit(100)
    .get();

  const appointments = snap.docs.map((d) => d.data());
  const completed = appointments.filter((a) => a.status === 'completed');

  if (completed.length === 0) {
    return { churnRiskScore: 50, riskFactors: ['no completed appointments'], recommendation: 'Reach out with a first-visit offer.' };
  }

  const riskFactors = [];

  // Factor 1: days since last visit (40%). 0 risk at 0 days, full risk at 90+.
  const lastVisit = toDate(completed[0].startTime);
  const daysSince = daysBetween(lastVisit, new Date());
  const inactivityRisk = Math.min(1, daysSince / 90);
  if (daysSince >= 60) riskFactors.push(`${daysSince} days since last visit`);

  // Factor 2: frequency trend (30%). Compare visits in last 60d vs prior 60d.
  const recent = completed.filter((a) => toDate(a.startTime) >= daysAgo(60)).length;
  const prior = completed.filter((a) => {
    const t = toDate(a.startTime);
    return t >= daysAgo(120) && t < daysAgo(60);
  }).length;
  let trendRisk = 0.5; // neutral when not enough history
  if (prior > 0) {
    trendRisk = Math.max(0, Math.min(1, (prior - recent) / prior));
    if (recent < prior) riskFactors.push('visit frequency declining');
  }

  // Factor 3: service diversity (20%). Single-service clients are easier to lose.
  const services = new Set(completed.map((a) => a.serviceId).filter(Boolean));
  const diversityRisk = services.size <= 1 ? 1 : services.size === 2 ? 0.5 : 0;
  if (services.size <= 1) riskFactors.push('uses only one service');

  // Factor 4: negative signals (10%) — cancellations/no-shows in last 90 days.
  const negatives = appointments.filter(
    (a) => ['cancelled', 'no_show'].includes(a.status) && toDate(a.startTime) >= daysAgo(90)
  ).length;
  const negativeRisk = Math.min(1, negatives / 3);
  if (negatives > 0) riskFactors.push(`${negatives} cancellation(s)/no-show(s) in 90 days`);

  const churnRiskScore = Math.round(
    100 * (0.4 * inactivityRisk + 0.3 * trendRisk + 0.2 * diversityRisk + 0.1 * negativeRisk)
  );

  let recommendation = 'Healthy — no action needed.';
  if (churnRiskScore >= 70) recommendation = 'High risk — send a win-back offer and personal follow-up.';
  else if (churnRiskScore >= 40) recommendation = 'Moderate risk — include in re-engagement campaign.';

  return { churnRiskScore, riskFactors, recommendation, daysSinceLastVisit: daysSince };
}

module.exports = { scoreChurnRisk };
