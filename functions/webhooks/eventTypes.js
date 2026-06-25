/**
 * Webhook event catalog. (Integration Hub, Tier 3)
 * Every outbound event has a stable name and a documented payload shape.
 */
const EVENT_TYPES = {
  'appointment.created': 'Fires when a new appointment is booked.',
  'appointment.completed': 'Fires when an appointment is marked completed.',
  'appointment.cancelled': 'Fires when an appointment is cancelled.',
  'appointment.no_show': 'Fires when an appointment is marked as a no-show.',
  'client.created': 'Fires when a new client record is created.',
  'client.churn_risk': 'Fires when a client crosses the high churn-risk threshold.',
  'payment.received': 'Fires when a payment is recorded.',
  'feedback.submitted': 'Fires when a client submits feedback.',
  'giftcard.issued': 'Fires when a gift card is issued.',
  'giftcard.redeemed': 'Fires when a gift card is redeemed.',
};

function isValidEventType(type) {
  return Object.prototype.hasOwnProperty.call(EVENT_TYPES, type);
}

module.exports = { EVENT_TYPES, isValidEventType };
