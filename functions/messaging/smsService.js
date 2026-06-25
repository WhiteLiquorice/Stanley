/**
 * SMS delivery via Twilio. Configure with:
 *   firebase functions:config:set twilio.sid="ACxxx" twilio.token="xxx" twilio.from="+15551234567"
 */
const functions = require('firebase-functions');
const { db, FieldValue } = require('../lib/firestore');

let twilioClient = null;
function getClient() {
  if (!twilioClient) {
    const cfg = functions.config().twilio || {};
    const sid = cfg.sid || process.env.TWILIO_ACCOUNT_SID;
    const token = cfg.token || process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) throw new Error('Twilio credentials not configured.');
    twilioClient = require('twilio')(sid, token);
  }
  return twilioClient;
}

/**
 * Send one SMS and log the delivery. Respects client opt-out.
 * Returns { sent: boolean, reason?: string }.
 */
async function sendSms({ orgId, clientId, to, body, campaignId = null }) {
  if (clientId) {
    const clientSnap = await db.collection('clients').doc(clientId).get();
    if (clientSnap.exists && clientSnap.data().smsOptIn === false) {
      return { sent: false, reason: 'client opted out of SMS' };
    }
  }

  const from = functions.config().twilio?.from || process.env.TWILIO_FROM;

  try {
    const message = await getClient().messages.create({ to, from, body });
    await db.collection('messageLogs').add({
      orgId,
      clientId: clientId || null,
      campaignId,
      channel: 'sms',
      to,
      status: 'sent',
      providerId: message.sid,
      sentAt: FieldValue.serverTimestamp(),
    });
    return { sent: true };
  } catch (err) {
    console.error(`SMS to ${to} failed:`, err.message);
    await db.collection('messageLogs').add({
      orgId,
      clientId: clientId || null,
      campaignId,
      channel: 'sms',
      to,
      status: 'failed',
      error: err.message,
      sentAt: FieldValue.serverTimestamp(),
    });
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendSms };
