/**
 * Campaign trigger engine — runs hourly, evaluates active campaigns,
 * and sends matching messages. (Marketing Campaigns, Tier 1)
 *
 * Dedup: one send per (campaign, client, trigger-instance), tracked in
 * campaignSends so reruns never double-send.
 */
const functions = require('firebase-functions');
const { db, FieldValue, toDate, daysAgo, logFunctionRun } = require('../lib/firestore');
const { renderMessage } = require('./templates');
const { sendEmail } = require('../messaging/emailService');
const { sendSms } = require('../messaging/smsService');

/** Find clients/appointments matching a campaign's trigger. */
async function findMatches(campaign) {
  const { orgId, trigger, triggerParams = {} } = campaign;

  switch (trigger) {
    case 'no_show': {
      // No-shows recorded in the last 24 hours.
      const snap = await db
        .collection('appointments')
        .where('orgId', '==', orgId)
        .where('status', '==', 'no_show')
        .where('startTime', '>=', daysAgo(1))
        .get();
      return snap.docs.map((d) => ({ dedupeKey: `noshow_${d.id}`, appointment: { id: d.id, ...d.data() } }));
    }

    case 'appointment_reminder': {
      // Appointments starting within the reminder window (default 24h ± 1h).
      const hoursAhead = triggerParams.hoursBefore || 24;
      const windowStart = new Date(Date.now() + (hoursAhead - 1) * 3600000);
      const windowEnd = new Date(Date.now() + hoursAhead * 3600000);
      const snap = await db
        .collection('appointments')
        .where('orgId', '==', orgId)
        .where('status', '==', 'scheduled')
        .where('startTime', '>=', windowStart)
        .where('startTime', '<', windowEnd)
        .get();
      return snap.docs.map((d) => ({
        dedupeKey: `reminder${hoursAhead}_${d.id}`,
        appointment: { id: d.id, ...d.data() },
      }));
    }

    case 'days_inactive': {
      // Clients whose churn metrics show the configured inactivity.
      const days = triggerParams.daysInactive || 60;
      const snap = await db
        .collection('clientMetrics')
        .where('orgId', '==', orgId)
        .where('daysSinceLastVisit', '>=', days)
        .where('daysSinceLastVisit', '<', days + 7) // one-week window prevents re-sending forever
        .get();
      return snap.docs.map((d) => ({
        dedupeKey: `inactive${days}_${d.data().clientId}`,
        clientMetrics: d.data(),
      }));
    }

    case 'service_completed': {
      const snap = await db
        .collection('appointments')
        .where('orgId', '==', orgId)
        .where('status', '==', 'completed')
        .where('startTime', '>=', daysAgo(1))
        .get();
      return snap.docs.map((d) => ({ dedupeKey: `completed_${d.id}`, appointment: { id: d.id, ...d.data() } }));
    }

    case 'birthday': {
      const today = new Date();
      const mmdd = `${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
      const snap = await db
        .collection('clients')
        .where('orgId', '==', orgId)
        .where('birthdayMMDD', '==', mmdd)
        .get();
      return snap.docs.map((d) => ({
        dedupeKey: `birthday${today.getUTCFullYear()}_${d.id}`,
        client: { id: d.id, ...d.data() },
      }));
    }

    default:
      return [];
  }
}

async function sendForMatch(campaign, match, org) {
  const sendId = `${campaign.id}_${match.dedupeKey}`;
  const sendRef = db.collection('campaignSends').doc(sendId);

  // Atomic claim — exits if another run already handled this match.
  const claimed = await db.runTransaction(async (tx) => {
    const existing = await tx.get(sendRef);
    if (existing.exists) return false;
    tx.set(sendRef, {
      campaignId: campaign.id,
      orgId: campaign.orgId,
      status: 'processing',
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (!claimed) return { skipped: true };

  // Resolve the client.
  const clientId = match.client?.id || match.appointment?.clientId || match.clientMetrics?.clientId;
  const clientSnap = await db.collection('clients').doc(clientId).get();
  if (!clientSnap.exists) {
    await sendRef.update({ status: 'skipped', reason: 'client missing' });
    return { skipped: true };
  }
  const client = { id: clientSnap.id, ...clientSnap.data() };

  const variables = {
    clientName: client.displayName || client.firstName || 'there',
    orgName: org.name || '',
    serviceName: match.appointment?.serviceName || '',
    staffName: match.appointment?.staffName || '',
    appointmentTime: match.appointment?.startTime ? toDate(match.appointment.startTime).toLocaleString() : '',
    whenPhrase: campaign.triggerParams?.hoursBefore === 3 ? 'in 3 hours' : 'tomorrow',
    daysSinceLastVisit: match.clientMetrics?.daysSinceLastVisit || '',
    offerText: campaign.triggerParams?.offerText || '10% off',
    recommendedService: campaign.triggerParams?.recommendedService || '',
    rescheduleLink: `${org.bookingUrl || ''}?client=${client.id}`,
    bookingLink: `${org.bookingUrl || ''}?client=${client.id}`,
    referralLink: `${org.bookingUrl || ''}?ref=${client.id}`,
  };

  const message = renderMessage(campaign.templateKey, variables, campaign.messageTemplate || null);
  const channels = campaign.channels || ['email'];
  const results = {};

  if (channels.includes('email') && client.email) {
    results.email = await sendEmail({
      orgId: campaign.orgId,
      clientId: client.id,
      to: client.email,
      subject: message.subject,
      body: message.body,
      campaignId: campaign.id,
    });
  }
  if (channels.includes('sms') && client.phone) {
    results.sms = await sendSms({
      orgId: campaign.orgId,
      clientId: client.id,
      to: client.phone,
      body: message.sms,
      campaignId: campaign.id,
    });
  }

  await sendRef.update({
    status: 'sent',
    clientId: client.id,
    results,
    sentAt: FieldValue.serverTimestamp(),
  });
  return { sent: true };
}

exports.processCampaignTriggers = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .pubsub.schedule('0 * * * *')
  .timeZone('UTC')
  .onRun(async () => {
    const campaignsSnap = await db.collection('campaigns').where('enabled', '==', true).get();
    let totalSent = 0;

    for (const doc of campaignsSnap.docs) {
      const campaign = { id: doc.id, ...doc.data() };
      try {
        const orgSnap = await db.collection('organizations').doc(campaign.orgId).get();
        if (!orgSnap.exists) continue;
        const org = orgSnap.data();

        const matches = await findMatches(campaign);
        for (const match of matches) {
          const result = await sendForMatch(campaign, match, org);
          if (result.sent) totalSent += 1;
        }
      } catch (err) {
        console.error(`Campaign ${campaign.id} failed:`, err);
        await logFunctionRun('processCampaignTriggers', campaign.orgId, 'error', {
          campaignId: campaign.id,
          message: err.message,
        });
      }
    }

    await logFunctionRun('processCampaignTriggers', null, 'success', {
      campaigns: campaignsSnap.size,
      messagesSent: totalSent,
    });
    return null;
  });

exports.findMatches = findMatches;
