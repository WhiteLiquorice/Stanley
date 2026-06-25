/**
 * Webhook publisher — delivers events to configured endpoints with
 * HMAC signatures and retry-friendly logging. (Integration Hub, Tier 3)
 */
const functions = require('firebase-functions');
const crypto = require('crypto');
const { db, FieldValue } = require('../lib/firestore');
const { isValidEventType } = require('./eventTypes');

const TIMEOUT_MS = 10000;

/** Sign payload so receivers can verify authenticity. */
function signPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

/**
 * Publish an event to every active integration subscribed to it.
 * Fire-and-log: a failing endpoint never blocks the caller.
 */
async function publishEvent(orgId, eventType, data) {
  if (!isValidEventType(eventType)) {
    console.warn(`Unknown webhook event type: ${eventType}`);
    return { delivered: 0 };
  }

  const integrationsSnap = await db
    .collection('integrations')
    .where('orgId', '==', orgId)
    .where('isActive', '==', true)
    .get();

  const subscribers = integrationsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((i) => i.webhookUrl && (!i.events || i.events.length === 0 || i.events.includes(eventType)));

  if (subscribers.length === 0) return { delivered: 0 };

  const payload = {
    event: eventType,
    orgId,
    data,
    timestamp: new Date().toISOString(),
  };

  let delivered = 0;
  await Promise.all(
    subscribers.map(async (integration) => {
      const logEntry = {
        orgId,
        integrationId: integration.id,
        eventType,
        url: integration.webhookUrl,
        createdAt: FieldValue.serverTimestamp(),
      };
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const response = await fetch(integration.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Bridgeway-Event': eventType,
            'X-Bridgeway-Signature': integration.secret ? signPayload(payload, integration.secret) : '',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timer);
        logEntry.status = response.ok ? 'delivered' : 'failed';
        logEntry.httpStatus = response.status;
        if (response.ok) delivered += 1;
      } catch (err) {
        logEntry.status = 'failed';
        logEntry.error = err.message;
      }
      await db.collection('webhookDeliveries').add(logEntry);
    })
  );

  return { delivered };
}

/** Firestore triggers that publish core lifecycle events. */
exports.onAppointmentWrite = functions.firestore
  .document('appointments/{apptId}')
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    if (!after) return null;

    const base = {
      appointmentId: context.params.apptId,
      clientId: after.clientId,
      serviceId: after.serviceId || null,
      staffId: after.staffId || null,
    };

    try {
      if (!before) {
        await publishEvent(after.orgId, 'appointment.created', base);
      } else if (before.status !== after.status) {
        const eventByStatus = {
          completed: 'appointment.completed',
          cancelled: 'appointment.cancelled',
          no_show: 'appointment.no_show',
        };
        const event = eventByStatus[after.status];
        if (event) await publishEvent(after.orgId, event, { ...base, previousStatus: before.status });
      }
    } catch (err) {
      console.error('Webhook publish failed:', err);
    }
    return null;
  });

exports.onClientCreated = functions.firestore.document('clients/{clientId}').onCreate(async (snap, context) => {
  const client = snap.data();
  try {
    await publishEvent(client.orgId, 'client.created', {
      clientId: context.params.clientId,
      name: client.displayName || client.name || '',
    });
  } catch (err) {
    console.error('Webhook publish failed:', err);
  }
  return null;
});

exports.publishEvent = publishEvent;
exports.signPayload = signPayload;
