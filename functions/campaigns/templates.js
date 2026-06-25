/**
 * Built-in campaign message templates with {{variable}} substitution.
 * (Marketing Campaigns, Tier 1)
 */
const TEMPLATES = {
  no_show_recovery: {
    subject: 'We missed you, {{clientName}}!',
    body: `Hi {{clientName}},

We're sorry we missed you for your {{serviceName}} appointment. Life happens!

Tap the link below to pick a new time that works for you — we'd love to see you soon.

{{rescheduleLink}}

— {{orgName}}`,
    sms: "Hi {{clientName}}, we missed you at {{orgName}}! Reschedule your {{serviceName}} here: {{rescheduleLink}}",
  },
  appointment_reminder: {
    subject: 'Reminder: your {{serviceName}} appointment {{whenPhrase}}',
    body: `Hi {{clientName}},

This is a friendly reminder about your upcoming appointment:

  Service: {{serviceName}}
  When: {{appointmentTime}}
  With: {{staffName}}

Need to make a change? Use this link: {{rescheduleLink}}

See you soon!
— {{orgName}}`,
    sms: 'Reminder: {{serviceName}} at {{orgName}} {{whenPhrase}} ({{appointmentTime}}). Changes: {{rescheduleLink}}',
  },
  service_upsell: {
    subject: 'Loved your {{serviceName}}? Try this next',
    body: `Hi {{clientName}},

Thanks for coming in for your {{serviceName}}! Based on what you enjoy, we think you'd love {{recommendedService}}.

Book it here: {{bookingLink}}

— {{orgName}}`,
    sms: 'Thanks for visiting {{orgName}}! We think you would love {{recommendedService}}. Book: {{bookingLink}}',
  },
  win_back: {
    subject: "It's been a while, {{clientName}} — here's {{offerText}}",
    body: `Hi {{clientName}},

It's been {{daysSinceLastVisit}} days since your last visit, and we miss you!

Come back and enjoy {{offerText}} on your next appointment.

Book now: {{bookingLink}}

— {{orgName}}`,
    sms: 'We miss you at {{orgName}}! Enjoy {{offerText}} on your next visit: {{bookingLink}}',
  },
  referral_invite: {
    subject: 'Share {{orgName}} with a friend — you both win',
    body: `Hi {{clientName}},

Know someone who'd love {{orgName}}? Share your personal referral link and you'll both receive {{offerText}}.

Your link: {{referralLink}}

— {{orgName}}`,
    sms: 'Refer a friend to {{orgName}} and you both get {{offerText}}! Your link: {{referralLink}}',
  },
  birthday_special: {
    subject: 'Happy Birthday, {{clientName}}! 🎉',
    body: `Happy Birthday, {{clientName}}!

To celebrate, enjoy {{offerText}} on any appointment this month.

Book your birthday treat: {{bookingLink}}

— {{orgName}}`,
    sms: 'Happy Birthday from {{orgName}}, {{clientName}}! Enjoy {{offerText}} this month: {{bookingLink}}',
  },
};

/** Replace {{tokens}} with values; unknown tokens become empty strings. */
function renderTemplate(template, variables) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    variables[key] !== undefined && variables[key] !== null ? String(variables[key]) : ''
  );
}

function renderMessage(templateKey, variables, customTemplate = null) {
  const tpl = customTemplate || TEMPLATES[templateKey];
  if (!tpl) throw new Error(`Unknown campaign template: ${templateKey}`);
  return {
    subject: renderTemplate(tpl.subject, variables),
    body: renderTemplate(tpl.body, variables),
    sms: renderTemplate(tpl.sms || tpl.body, variables),
  };
}

module.exports = { TEMPLATES, renderTemplate, renderMessage };
