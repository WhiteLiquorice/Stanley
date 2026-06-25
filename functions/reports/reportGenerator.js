/**
 * Custom date-range reports — aggregates metrics and returns rows
 * suitable for CSV download or on-screen tables. (Custom Reports, Tier 2)
 */
const functions = require('firebase-functions');
const { db, toDate, assertOrgMember } = require('../lib/firestore');

const AVAILABLE_METRICS = ['appointments', 'revenue', 'newClients', 'noShows', 'serviceBreakdown', 'staffBreakdown'];

async function generateReport(orgId, metrics, rangeStart, rangeEnd) {
  const start = toDate(rangeStart);
  const end = toDate(rangeEnd);

  const apptSnap = await db
    .collection('appointments')
    .where('orgId', '==', orgId)
    .where('startTime', '>=', start)
    .where('startTime', '<=', end)
    .get();
  const appointments = apptSnap.docs.map((d) => d.data());
  const completed = appointments.filter((a) => a.status === 'completed');

  const report = { orgId, rangeStart: start.toISOString(), rangeEnd: end.toISOString(), sections: {} };

  if (metrics.includes('appointments')) {
    report.sections.appointments = {
      total: appointments.length,
      completed: completed.length,
      cancelled: appointments.filter((a) => a.status === 'cancelled').length,
      noShows: appointments.filter((a) => a.status === 'no_show').length,
    };
  }

  if (metrics.includes('revenue')) {
    const total = completed.reduce((s, a) => s + (a.totalAmount || a.price || 0), 0);
    report.sections.revenue = {
      total: Math.round(total * 100) / 100,
      averageTicket: completed.length ? Math.round((total / completed.length) * 100) / 100 : 0,
    };
  }

  if (metrics.includes('newClients')) {
    const newClientsSnap = await db
      .collection('clients')
      .where('orgId', '==', orgId)
      .where('createdAt', '>=', start)
      .where('createdAt', '<=', end)
      .get();
    report.sections.newClients = { total: newClientsSnap.size };
  }

  if (metrics.includes('serviceBreakdown')) {
    const byService = {};
    completed.forEach((a) => {
      const key = a.serviceName || a.serviceId || 'unknown';
      byService[key] = byService[key] || { service: key, bookings: 0, revenue: 0 };
      byService[key].bookings += 1;
      byService[key].revenue += a.totalAmount || a.price || 0;
    });
    report.sections.serviceBreakdown = Object.values(byService)
      .map((r) => ({ ...r, revenue: Math.round(r.revenue * 100) / 100 }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  if (metrics.includes('staffBreakdown')) {
    const byStaff = {};
    completed.forEach((a) => {
      const key = a.staffName || a.staffId || 'unassigned';
      byStaff[key] = byStaff[key] || { staff: key, appointments: 0, revenue: 0 };
      byStaff[key].appointments += 1;
      byStaff[key].revenue += a.totalAmount || a.price || 0;
    });
    report.sections.staffBreakdown = Object.values(byStaff)
      .map((r) => ({ ...r, revenue: Math.round(r.revenue * 100) / 100 }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  return report;
}

/** Flatten a report into CSV text (sections separated by blank lines). */
function reportToCsv(report) {
  const lines = [`Report,${report.rangeStart},${report.rangeEnd}`];
  for (const [name, section] of Object.entries(report.sections)) {
    lines.push('', name);
    if (Array.isArray(section)) {
      if (section.length > 0) {
        const headers = Object.keys(section[0]);
        lines.push(headers.join(','));
        section.forEach((row) => lines.push(headers.map((h) => JSON.stringify(row[h] ?? '')).join(',')));
      }
    } else {
      Object.entries(section).forEach(([k, v]) => lines.push(`${k},${v}`));
    }
  }
  return lines.join('\n');
}

exports.generateCustomReport = functions.https.onCall(async (data, context) => {
  const { orgId, metrics, rangeStart, rangeEnd, format } = data || {};
  if (!orgId || !Array.isArray(metrics) || !rangeStart || !rangeEnd) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId, metrics, rangeStart, rangeEnd are required.');
  }
  const invalid = metrics.filter((m) => !AVAILABLE_METRICS.includes(m));
  if (invalid.length > 0) {
    throw new functions.https.HttpsError('invalid-argument', `Unknown metrics: ${invalid.join(', ')}`);
  }
  await assertOrgMember(context, orgId);

  const report = await generateReport(orgId, metrics, rangeStart, rangeEnd);
  if (format === 'csv') return { csv: reportToCsv(report) };
  return report;
});

exports.generateReport = generateReport;
exports.reportToCsv = reportToCsv;
