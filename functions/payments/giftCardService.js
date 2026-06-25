/**
 * Gift cards — issue, check balance, redeem. (Gift Cards, Tier 3)
 * All balance changes happen inside transactions; every movement is
 * journaled in giftCardTransactions.
 */
const functions = require('firebase-functions');
const crypto = require('crypto');
const { db, FieldValue, toDate, assertOrgMember } = require('../lib/firestore');

/** Human-friendly unique code, e.g. GC-7K2M-9XQ4. Unambiguous alphabet. */
function generateCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const pick = () =>
    Array.from(crypto.randomBytes(4))
      .map((b) => alphabet[b % alphabet.length])
      .join('');
  return `GC-${pick()}-${pick()}`;
}

exports.issueGiftCard = functions.https.onCall(async (data, context) => {
  const { orgId, amount, purchasedBy, recipientEmail, expiresInDays } = data || {};
  if (!orgId || !amount || amount <= 0 || amount > 10000) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId and a positive amount (max 10000) are required.');
  }
  await assertOrgMember(context, orgId);

  // Retry on the (unlikely) code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const ref = db.collection('giftCards').doc(code);
    try {
      await db.runTransaction(async (tx) => {
        const existing = await tx.get(ref);
        if (existing.exists) throw new Error('collision');
        tx.set(ref, {
          orgId,
          initialAmount: amount,
          currentBalance: amount,
          purchasedBy: purchasedBy || context.auth.uid,
          recipientEmail: recipientEmail || null,
          purchaseDate: FieldValue.serverTimestamp(),
          expirationDate: expiresInDays ? new Date(Date.now() + expiresInDays * 86400000) : null,
          isActive: true,
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(db.collection('giftCardTransactions').doc(), {
          giftCardId: code,
          orgId,
          type: 'purchase',
          amount,
          createdBy: context.auth.uid,
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      return { code, amount };
    } catch (err) {
      if (err.message !== 'collision') throw err;
    }
  }
  throw new functions.https.HttpsError('internal', 'Could not generate a unique gift card code.');
});

exports.checkGiftCardBalance = functions.https.onCall(async (data, context) => {
  const { orgId, code } = data || {};
  if (!orgId || !code) throw new functions.https.HttpsError('invalid-argument', 'orgId and code are required.');

  const snap = await db.collection('giftCards').doc(code.trim().toUpperCase()).get();
  if (!snap.exists || snap.data().orgId !== orgId) {
    throw new functions.https.HttpsError('not-found', 'Gift card not found.');
  }
  const card = snap.data();
  const expired = card.expirationDate && toDate(card.expirationDate) < new Date();
  return {
    code: snap.id,
    currentBalance: card.currentBalance,
    isActive: card.isActive && !expired,
    expired: !!expired,
    expirationDate: card.expirationDate || null,
  };
});

exports.redeemGiftCard = functions.https.onCall(async (data, context) => {
  const { orgId, code, amount, appointmentId, clientId } = data || {};
  if (!orgId || !code || !amount || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId, code, and a positive amount are required.');
  }
  await assertOrgMember(context, orgId);

  const ref = db.collection('giftCards').doc(code.trim().toUpperCase());

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().orgId !== orgId) {
      throw new functions.https.HttpsError('not-found', 'Gift card not found.');
    }
    const card = snap.data();
    if (!card.isActive) throw new functions.https.HttpsError('failed-precondition', 'Gift card is inactive.');
    if (card.expirationDate && toDate(card.expirationDate) < new Date()) {
      throw new functions.https.HttpsError('failed-precondition', 'Gift card has expired.');
    }
    if (card.currentBalance < amount) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Insufficient balance: $${card.currentBalance.toFixed(2)} available.`
      );
    }

    const newBalance = Math.round((card.currentBalance - amount) * 100) / 100;
    tx.update(ref, { currentBalance: newBalance, usedBy: clientId || card.usedBy || null });
    tx.set(db.collection('giftCardTransactions').doc(), {
      giftCardId: ref.id,
      orgId,
      type: 'redemption',
      amount,
      appointmentId: appointmentId || null,
      clientId: clientId || null,
      createdBy: context.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { newBalance };
  });

  return { redeemed: amount, remainingBalance: result.newBalance };
});
