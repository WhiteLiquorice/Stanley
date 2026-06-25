/**
 * Expense tracking + profitability. (Expense Tracking, Tier 3)
 */
const functions = require('firebase-functions');
const { db, FieldValue, toDate, monthKey, assertOrgMember } = require('../lib/firestore');

const CATEGORIES = ['supplies', 'rent', 'utilities', 'marketing', 'payroll', 'equipment', 'other'];

exports.recordExpense = functions.https.onCall(async (data, context) => {
  const { orgId, amount, category, description, serviceId, date, receiptUrl } = data || {};
  if (!orgId || !amount || amount <= 0 || !category) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId, positive amount, and category are required.');
  }
  if (!CATEGORIES.includes(category)) {
    throw new functions.https.HttpsError('invalid-argument', `Category must be one of: ${CATEGORIES.join(', ')}`);
  }
  await assertOrgMember(context, orgId);

  const ref = await db.collection('expenses').add({
    orgId,
    amount: Math.round(amount * 100) / 100,
    category,
    description: (description || '').slice(0, 500),
    serviceId: serviceId || null,
    date: date ? new Date(date) : new Date(),
    receiptUrl: receiptUrl || null,
    createdBy: context.auth.uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
});

exports.getProfitability = functions.https.onCall(async (data, context) => {
  const { orgId, rangeStart, rangeEnd } = data || {};
  if (!orgId || !rangeStart || !rangeEnd) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId, rangeStart, rangeEnd are required.');
  }
  await assertOrgMember(context, orgId);

  const start = toDate(rangeStart);
  const end = toDate(rangeEnd);

  const [expenseSnap, apptSnap] = await Promise.all([
    db.collection('expenses').where('orgId', '==', orgId).where('date', '>=', start).where('date', '<=', end).get(),
    db
      .collection('appointments')
      .where('orgId', '==', orgId)
      .where('status', '==', 'completed')
      .where('startTime', '>=', start)
      .where('startTime', '<=', end)
      .get(),
  ]);

  const expenses = expenseSnap.docs.map((d) => d.data());
  const appointments = apptSnap.docs.map((d) => d.data());

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalRevenue = appointments.reduce((s, a) => s + (a.totalAmount || a.price || 0), 0);

  // By category
  const byCategory = {};
  expenses.forEach((e) => {
    byCategory[e.category] = Math.round(((byCategory[e.category] || 0) + e.amount) * 100) / 100;
  });

  // By month
  const byMonth = {};
  expenses.forEach((e) => {
    const mk = monthKey(toDate(e.date));
    byMonth[mk] = byMonth[mk] || { expenses: 0, revenue: 0 };
    byMonth[mk].expenses += e.amount;
  });
  appointments.forEach((a) => {
    const mk = monthKey(toDate(a.startTime));
    byMonth[mk] = byMonth[mk] || { expenses: 0, revenue: 0 };
    byMonth[mk].revenue += a.totalAmount || a.price || 0;
  });

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netProfit: Math.round((totalRevenue - totalExpenses) * 100) / 100,
    profitMargin: totalRevenue ? Math.round(((totalRevenue - totalExpenses) / totalRevenue) * 1000) / 10 : null,
    byCategory,
    byMonth: Object.entries(byMonth)
      .map(([month, v]) => ({
        month,
        revenue: Math.round(v.revenue * 100) / 100,
        expenses: Math.round(v.expenses * 100) / 100,
        profit: Math.round((v.revenue - v.expenses) * 100) / 100,
      }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  };
});

exports.EXPENSE_CATEGORIES = CATEGORIES;
