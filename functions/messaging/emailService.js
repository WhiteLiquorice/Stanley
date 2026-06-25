/**
 * Email delivery via SendGrid. Set the API key with:
 *   firebase functions:config:set sendgrid.key="SG.xxx" sendgrid.from="hello@yourdomain.com"
 */
const functions = require('firebase-functions');
const { db, FieldValue } = require('../lib/firestore');

let sgMail = null;
function getClient() {
  if (!sgMail) {
    // Lazy require so other functions deploy without the dependency configured.
    sgMail = require('@sendgrid/mail');
    const key = functions.config().sendgrid?.key || process.env.SENDGRID_API_KEY;
    if (!key) throw new Error('SendGrid API key not configured.');
    sgMail.setApiKey(key);
  }
  return sgMail;
}

/**
 * Send one email and log the delivery. Respects client opt-out.
 * Returns { sent: boolean, reason?: string }.
 */
async function sendEmail({ orgId, clientId, to, subject, body, campaignId = null }) {
  if (clientId) {
    const clientSnap = await db.collection('clients').doc(clientId).get();
    if (clientSnap.exists && clientSnap.data().emailOptIn === false) {
      return { sent: false, reason: 'client opted out of email' };
    }
  }

  const from = functions.config().sendgrid?.from || process.env.SENDGRID_FROM;

  try {
    await getClient().send({
      to,
      from,
      subject,
      text: body,
      // Open/click tracking feeds campaign analytics via SendGrid webhooks.
      trackingSettings: {
        clickTracking: { enable: true },
        openTracking: { enable: true },
      },
      customArgs: { orgId, clientId: clientId || '', campaignId: campaignId || '' },
    });

    await db.collection('messageLogs').add({
      orgId,
      clientId: clientId || null,
      campaignId,
      channel: 'email',
      to,
      subject,
      status: 'sent',
      sentAt: FieldValue.serverTimestamp(),
    });
    if (clientId) {
      await db.collection('clients').doc(clientId).update({ lastEmailSentAt: FieldValue.serverTimestamp() });
    }
    return { sent: true };
  } catch (err) {
    console.error(`Email to ${to} failed:`, err.message);
    await db.collection('messageLogs').add({
      orgId,
      clientId: clientId || null,
      campaignId,
      channel: 'email',
      to,
      status: 'failed',
      error: err.message,
      sentAt: FieldValue.serverTimestamp(),
    });
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendEmail };
