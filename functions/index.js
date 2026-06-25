const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule }                    = require('firebase-functions/v2/scheduler')
const { defineSecret }                  = require('firebase-functions/params')
const { onDocumentUpdated }             = require('firebase-functions/v2/firestore')
const admin                             = require('firebase-admin')
const stripe                            = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { google }                        = require('googleapis')
const sgMail                            = require('@sendgrid/mail')
const twilio                            = require('twilio')

// ── Secret Manager bindings (production) ─────────────────────────────────────
// Locally these fall back to the .env file in this directory.
// In production, set them once with:
//   npx firebase-tools secrets:set GOOGLE_CLIENT_ID
//   npx firebase-tools secrets:set GOOGLE_CLIENT_SECRET
const googleClientId     = defineSecret('GOOGLE_CLIENT_ID')
const googleClientSecret = defineSecret('GOOGLE_CLIENT_SECRET')
const stripeSecretKey    = defineSecret('STRIPE_SECRET_KEY')
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET')

admin.initializeApp()
const db = admin.firestore()

function makeOAuth2Client(redirectUri) {
  // defineSecret values are accessible via .value() inside a function handler
  const clientId     = googleClientId.value()     || process.env.GOOGLE_CLIENT_ID
  const clientSecret = googleClientSecret.value() || process.env.GOOGLE_CLIENT_SECRET
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

// ─── Stripe ───────────────────────────────────────────────────────────────────

exports.createCheckoutSession = onRequest({ cors: true, secrets: [stripeSecretKey] }, async (req, res) => {
  const { email, orgName, priceId, subscriptionTier } = req.body
  if (!email || !orgName || !priceId) return res.status(400).send({ error: 'email, orgName, and priceId are required' })
  try {
    const customer = await stripe.customers.create({ 
      email, 
      name: orgName, 
      metadata: { org_name: orgName } 
    })
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      metadata: { 
        org_name: orgName,
        subscriptionTier: subscriptionTier || 'full-stack'
      },
      success_url: 'https://admin.bridgewayapps.com/onboarding?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://bridgewayapps.com/#pricing',
    })
    res.status(200).send({ url: session.url })
  } catch (err) { res.status(500).send({ error: err.message }) }
})

exports.createPortalSession = onRequest({ cors: true, secrets: [stripeSecretKey] }, async (req, res) => {
  const { stripe_customer_id } = req.body
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: stripe_customer_id,
      return_url: 'https://admin.bridgewayapps.com/billing',
    })
    res.status(200).send({ url: session.url })
  } catch (err) { res.status(500).send({ error: err.message }) }
})

exports.registerStanleyUser = onRequest({ cors: true, secrets: [stripeSecretKey] }, async (req, res) => {
  const { email, password, sessionId, referralSource, referralDetails } = req.body

  if (!email || !password || !sessionId) {
    return res.status(400).send({ error: 'email, password, and sessionId are required' })
  }

  const cleanEmail = email.trim().toLowerCase()

  try {
    const activeStripe = require('stripe')(stripeSecretKey.value() || process.env.STRIPE_SECRET_KEY)

    console.log(`Retrieving Stripe session: ${sessionId}`)
    const session = await activeStripe.checkout.sessions.retrieve(sessionId)

    if (!session) {
      return res.status(400).send({ error: 'Invalid checkout session ID' })
    }

    if (session.payment_status !== 'paid') {
      return res.status(400).send({ error: 'Checkout session is not paid' })
    }

    const regRef = db.collection('stanley_registrations').doc(sessionId)
    const regDoc = await regRef.get()

    if (regDoc.exists) {
      return res.status(400).send({ error: 'This payment checkout session has already been used to register an account' })
    }

    console.log(`Creating user in Auth for email: ${cleanEmail}`)
    let userRecord
    try {
      userRecord = await admin.auth().createUser({
        email: cleanEmail,
        password: password,
        emailVerified: false
      })
    } catch (authErr) {
      if (authErr.code === 'auth/email-already-in-use') {
        return res.status(400).send({ error: 'An account with this email address already exists' })
      }
      throw authErr
    }

    const uid = userRecord.uid

    console.log(`Setting custom claims for UID: ${uid}`)
    await admin.auth().setCustomUserClaims(uid, { stanley: true })

    await regRef.set({
      uid: uid,
      email: cleanEmail,
      referralSource: referralSource || null,
      referralDetails: referralDetails || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    })

    console.log(`Creating Firestore document under stanley_users/${uid}`)
    await db.collection('stanley_users').doc(uid).set({
      email: cleanEmail,
      status: 'active',
      paid: true,
      referralSource: referralSource || null,
      referralDetails: referralDetails || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    })

    res.status(200).send({ success: true, uid: uid })
  } catch (err) {
    console.error('Error registering Stanley user:', err)
    res.status(500).send({ error: err.message || 'Internal server error' })
  }
})

exports.connectStripeAccount = onCall({ cors: true, secrets: [stripeSecretKey] }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'User must be logged in')

  const { orgId, returnUrl, refreshUrl } = request.data
  if (!orgId) throw new HttpsError('invalid-argument', 'orgId is required')

  const location = 'us-central1'
  const serviceId = 'bridgeway-db'
  const projectId = process.env.GCLOUD_PROJECT || 'bridgeway-apps'
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true'
  const baseUrl = isEmulator 
    ? `http://127.0.0.1:9399/v1alpha/projects/${projectId}/locations/${location}/services/${serviceId}:executeGraphql`
    : `https://firebasedataconnect.googleapis.com/v1alpha/projects/${projectId}/locations/${location}/services/${serviceId}:executeGraphql`

  let headers = { 'Content-Type': 'application/json' }
  if (!isEmulator) {
    const authClient = await admin.credential.applicationDefault().getAccessToken()
    headers['Authorization'] = `Bearer ${authClient.access_token}`
  }

  const queryGet = `
    query GetStripeAccountId($orgId: UUID!) {
      orgSettings(where: { orgId: { eq: $orgId } }) {
        stripeAccountId
      }
    }
  `
  let accountId = null
  try {
    const responseGet = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: queryGet, variables: { orgId } })
    })
    const resultGet = await responseGet.json()
    if (resultGet.data?.orgSettings?.[0]?.stripeAccountId) {
      accountId = resultGet.data.orgSettings[0].stripeAccountId
    }
  } catch (e) {
    console.error('Error fetching orgSetting:', e)
  }

  if (!accountId) {
    const account = await stripe.accounts.create({ type: 'standard' })
    accountId = account.id

    const queryUpsert = `
      mutation UpdateStripeAccountId($orgId: UUID!, $stripeAccountId: String!) {
        orgSetting_upsert(data: { orgId: $orgId, stripeAccountId: $stripeAccountId })
      }
    `
    try {
      await fetch(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: queryUpsert, variables: { orgId, stripeAccountId: accountId } })
      })
    } catch (e) {
      console.error('Error upserting orgSetting:', e)
    }
  }

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl || 'https://admin.bridgewayapps.com/settings',
    return_url: returnUrl || 'https://admin.bridgewayapps.com/settings',
    type: 'account_onboarding',
  })

  return { url: accountLink.url }
})

exports.createPaymentIntent = onCall({ cors: true, secrets: [stripeSecretKey] }, async (request) => {
  const { orgId, amount } = request.data
  if (!orgId || !amount) throw new HttpsError('invalid-argument', 'orgId and amount are required')

  const location = 'us-central1'
  const serviceId = 'bridgeway-db'
  const projectId = process.env.GCLOUD_PROJECT || 'bridgeway-apps'
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true'
  const baseUrl = isEmulator 
    ? `http://127.0.0.1:9399/v1alpha/projects/${projectId}/locations/${location}/services/${serviceId}:executeGraphql`
    : `https://firebasedataconnect.googleapis.com/v1alpha/projects/${projectId}/locations/${location}/services/${serviceId}:executeGraphql`

  let headers = { 'Content-Type': 'application/json' }
  if (!isEmulator) {
    const authClient = await admin.credential.applicationDefault().getAccessToken()
    headers['Authorization'] = `Bearer ${authClient.access_token}`
  }

  const queryGet = `
    query GetStripeAccountId($orgId: UUID!) {
      orgSettings(where: { orgId: { eq: $orgId } }) {
        stripeAccountId
      }
    }
  `
  let accountId = null
  try {
    const responseGet = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: queryGet, variables: { orgId } })
    })
    const resultGet = await responseGet.json()
    if (resultGet.data?.orgSettings?.[0]?.stripeAccountId) {
      accountId = resultGet.data.orgSettings[0].stripeAccountId
    }
  } catch (e) {
    console.error('Error fetching orgSetting:', e)
  }

  if (!accountId) {
    throw new HttpsError('failed-precondition', 'Organization has not connected a Stripe account')
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
    }, {
      stripeAccount: accountId,
    })

    return { clientSecret: paymentIntent.client_secret }
  } catch (e) {
    console.error('Error creating payment intent:', e)
    throw new HttpsError('internal', e.message)
  }
})

exports.stripeWebhook = onRequest({ cors: true, secrets: [stripeSecretKey, stripeWebhookSecret] }, async (req, res) => {
  const sig = req.headers['stripe-signature']
  let event
  try {
    if (process.env.FUNCTIONS_EMULATOR === 'true') {
      event = req.body;
    } else {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)
    }
  } catch (err) { return res.status(400).send(`Webhook Error: ${err.message}`) }
  
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const metadata = session.metadata || {}

    // Handle Booking Payment
    if (metadata.bookingId) {
      console.log(`Booking payment completed for booking ${metadata.bookingId}`)
      
      const location = 'us-central1'
      const serviceId = 'bridgeway-db'
      const projectId = process.env.GCLOUD_PROJECT || 'bridgeway-apps'
      
      const query = `
        mutation UpdateBookingPaymentStatus($bookingId: UUID!) {
          booking_update(id: $bookingId, data: { paymentStatus: "paid" })
        }
      `
      
      const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true'
      const baseUrl = isEmulator 
        ? `http://127.0.0.1:9399/v1alpha/projects/${projectId}/locations/${location}/services/${serviceId}:executeGraphql`
        : `https://firebasedataconnect.googleapis.com/v1alpha/projects/${projectId}/locations/${location}/services/${serviceId}:executeGraphql`

      try {
        let headers = { 'Content-Type': 'application/json' }
        if (!isEmulator) {
          const authClient = await admin.credential.applicationDefault().getAccessToken()
          headers['Authorization'] = `Bearer ${authClient.access_token}`
        }

        const response = await fetch(baseUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query,
            variables: { bookingId: metadata.bookingId }
          })
        })
        const result = await response.json()
        if (result.errors) {
          console.error('Data Connect errors updating booking:', result.errors)
        } else {
          console.log(`Updated booking ${metadata.bookingId} paymentStatus to paid`)
        }
      } catch (err) {
        console.error('Failed to update booking in Data Connect:', err)
      }
      
      res.send()
      return
    }

    // Intercept Stanley Checkout Session
    const isStanley = metadata.product === 'stanley' || 
                      (session.amount_total === 3000 && !metadata.bookingId) ||
                      (metadata.subscriptionTier === 'stanley');
                      
    if (isStanley) {
      const customerId = session.customer;
      let email = session.customer_details ? session.customer_details.email : null;
      
      if (customerId && !email) {
        const customer = await stripe.customers.retrieve(customerId);
        email = customer.email;
      }
      
      if (!email) {
        console.error("No email found for Stanley checkout session");
        return res.send();
      }
      
      email = email.toLowerCase().trim();
      console.log(`[Stripe Webhook] Processing Stanley payment for: ${email}`);
      
      let uid = null;
      try {
        const userRecord = await admin.auth().getUserByEmail(email);
        uid = userRecord.uid;
      } catch (e) {
        // User not registered yet
      }
      
      if (uid) {
        await db.collection('users').doc(uid).set({
          email,
          status: 'active',
          paid: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        console.log(`[Stripe Webhook] Activated existing user ${uid} via email match.`);
      } else {
        await db.collection('pending_payments').doc(email).set({
          email,
          status: 'active',
          paid: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`[Stripe Webhook] Stored pending payment document for email: ${email}`);
      }
      return res.send();
    }

    // Handle SaaS Subscription
    const customerId = session.customer
    if (!customerId) {
      console.log('No customer attached to checkout session, and not a booking')
      return res.send()
    }
    
    const subscriptionId = session.subscription
    const customer = await stripe.customers.retrieve(customerId)
    
    const email = customer.email
    const orgName = metadata.org_name || customer.name || 'New Organization'
    
    // Determine subscription tier from session metadata
    const subscriptionTier = metadata.subscriptionTier || 'full-stack'

    let userId = ''
    try {
      const userRecord = await admin.auth().getUserByEmail(email)
      userId = userRecord.uid
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        const newUser = await admin.auth().createUser({
          email: email,
          displayName: orgName,
        })
        userId = newUser.uid
      } else {
        console.error('Error fetching/creating user:', e)
      }
    }

    if (userId) {
      // Execute Data Connect mutations via direct fetch to local emulator or production REST API
      const location = 'us-central1'
      const serviceId = 'bridgeway-db'
      const projectId = process.env.GCLOUD_PROJECT || 'bridgeway-apps'
      
      const { randomUUID } = require('crypto')
      const orgId = randomUUID()

      const query = `
        mutation ProvisionApp($orgId: UUID!, $name: String!, $subscriptionTier: String!, $email: String!, $userId: String!, $stripeCustomerId: String!, $stripeSubscriptionId: String!) {
          org_insert(data: { id: $orgId, name: $name, subscriptionTier: $subscriptionTier, status: "active", onboardingComplete: false })
          orgSetting_upsert(data: { orgId: $orgId, paymentRequired: true, stripeCustomerId: $stripeCustomerId, stripeSubscriptionId: $stripeSubscriptionId })
          profile_insert(data: { userId: $userId, orgId: $orgId, fullName: $name, email: $email, role: "admin", isActive: true, commissionRatePercentage: 0 })
        }
      `
      
      const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true'
      const baseUrl = isEmulator 
        ? `http://127.0.0.1:9399/v1alpha/projects/${projectId}/locations/${location}/services/${serviceId}:executeGraphql`
        : `https://firebasedataconnect.googleapis.com/v1alpha/projects/${projectId}/locations/${location}/services/${serviceId}:executeGraphql`

      try {
        let headers = { 'Content-Type': 'application/json' }
        if (!isEmulator) {
          const authClient = await admin.credential.applicationDefault().getAccessToken()
          headers['Authorization'] = `Bearer ${authClient.access_token}`
        }

        const response = await fetch(baseUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query,
            variables: {
              orgId,
              name: orgName,
              subscriptionTier,
              email,
              userId,
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId
            }
          })
        })
        const result = await response.json()
        if (result.errors) {
          console.error('Data Connect errors:', result.errors)
        } else {
          console.log(`Provisioned org ${orgName} for user ${userId} with tier ${subscriptionTier}`)
        }
      } catch (err) {
        console.error('Failed to provision in Data Connect:', err)
        // Alert admin about provisioning failure
        try {
          const alertHtml = `
            <p style="margin:0 0 16px 0;font-weight:600;color:#cc0000;">⚠️ SaaS Provisioning Failed</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 16px 0;border:1px solid #eaeaea;border-radius:8px;overflow:hidden;">
              <tr>
                <td style="padding:12px 16px;background-color:#f9f9f9;font-weight:600;border-bottom:1px solid #eaeaea;width:140px;">Customer Email</td>
                <td style="padding:12px 16px;border-bottom:1px solid #eaeaea;">${email || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;background-color:#f9f9f9;font-weight:600;border-bottom:1px solid #eaeaea;">Org Name</td>
                <td style="padding:12px 16px;border-bottom:1px solid #eaeaea;">${orgName || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;background-color:#f9f9f9;font-weight:600;border-bottom:1px solid #eaeaea;">Session ID</td>
                <td style="padding:12px 16px;border-bottom:1px solid #eaeaea;font-size:13px;word-break:break-all;">${session.id || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;background-color:#f9f9f9;font-weight:600;border-bottom:1px solid #eaeaea;">Stripe Customer</td>
                <td style="padding:12px 16px;border-bottom:1px solid #eaeaea;font-size:13px;">${customerId || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;background-color:#f9f9f9;font-weight:600;">Error</td>
                <td style="padding:12px 16px;color:#cc0000;">${err.message || String(err)}</td>
              </tr>
            </table>
            <p style="margin:0;font-size:13px;color:#888888;">This customer paid but their org was not created. Manual intervention is required.</p>
          `
          await sendEmail({
            toEmail: 'contact@bridgewayapps.com',
            toName:  'Bridgeway Admin',
            subject: `🚨 Provisioning Failed — ${email || 'Unknown Customer'}`,
            text:    `SaaS provisioning failed for ${email || 'unknown'}. Session: ${session.id}. Error: ${err.message}. Manual intervention required.`,
            html:    alertHtml,
          }).catch(alertErr => console.error('Failed to send provisioning alert email:', alertErr.message))
        } catch (alertErr) {
          console.error('Failed to send provisioning alert email:', alertErr)
        }
      }
    }
  }
  res.send()
})

exports.syncStripeToSql = onDocumentUpdated('customers/{uid}/subscriptions/{subId}', async (event) => {
  const subData = event.data.after.data()
  if (!subData) return
  console.log(`Syncing subscription ${event.params.subId} for user ${event.params.uid}`)
  // TODO: Update OrgSetting table in Data Connect
})

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function executeDataConnect(query, variables) {
  const location = 'us-central1'
  const serviceId = 'bridgeway-db'
  const projectId = process.env.GCLOUD_PROJECT || 'bridgeway-apps'
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true'
  const baseUrl = isEmulator 
    ? `http://127.0.0.1:9399/v1alpha/projects/${projectId}/locations/${location}/services/${serviceId}:executeGraphql`
    : `https://firebasedataconnect.googleapis.com/v1alpha/projects/${projectId}/locations/${location}/services/${serviceId}:executeGraphql`

  try {
    let headers = { 'Content-Type': 'application/json' }
    if (!isEmulator) {
      const authClient = await admin.credential.applicationDefault().getAccessToken()
      headers['Authorization'] = `Bearer ${authClient.access_token}`
    }

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables })
    })
    const result = await response.json()
    if (result.errors) {
      console.error('Data Connect errors:', result.errors)
      throw new Error('GraphQL Error')
    }
    return result.data
  } catch (err) {
    console.error('Data Connect request failed:', err)
    throw err
  }
}

/** Fetch notification_settings for an org from Supabase via REST */
async function getNotificationSettings(orgId) {
  const query = `
    query GetNotificationSetting($orgId: UUID!) {
      notificationSettings(where: { orgId: { eq: $orgId } }, limit: 1) {
        smsEnabled
        emailEnabled
        reminder24h
        reminder2h
      }
    }
  `
  try {
    const data = await executeDataConnect(query, { orgId })
    const settings = data?.notificationSettings
    return Array.isArray(settings) && settings.length ? settings[0] : null
  } catch (err) {
    return null
  }
}

function formatApptTime(isoString) {
  const d = new Date(isoString)
  return d.toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

/**
 * Wraps email body HTML in a branded, CAN-SPAM compliant template.
 * Uses table-based layout with inline CSS for maximum email client compatibility.
 * @param {string} subject - Email subject (used in preheader)
 * @param {string} bodyHtml - Inner HTML content to wrap
 * @returns {string} Full HTML email document
 */
function wrapInTemplate(subject, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${subject}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <!-- Preheader (hidden preview text) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    ${subject}
  </div>

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f7;">
    <tr>
      <td align="center" style="padding:24px 16px;">

        <!-- Inner container -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td align="center" style="padding:32px 40px 24px 40px;border-bottom:1px solid #eaeaea;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:28px;font-weight:700;color:#1a1a1a;letter-spacing:-0.5px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                    Bridgeway
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:4px;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#888888;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                    Appointments
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;font-size:16px;line-height:1.6;color:#333333;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px 32px 40px;border-top:1px solid #eaeaea;background-color:#fafafa;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="font-size:12px;line-height:1.5;color:#999999;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                    <p style="margin:0 0 8px 0;font-weight:600;color:#666666;">Bridgeway Apps LLC</p>
                    <p style="margin:0 0 8px 0;">123 Main St, Austin, TX 78701</p>
                    <p style="margin:0 0 8px 0;">
                      You’re receiving this because you have an account or appointment with us.
                    </p>
                    <p style="margin:0;">
                      <a href="mailto:unsubscribe@bridgewayapps.com?subject=Unsubscribe" style="color:#5b6abf;text-decoration:underline;">Unsubscribe</a>
                      &nbsp;&middot;&nbsp;
                      <a href="https://bridgewayapps.com/privacy" style="color:#5b6abf;text-decoration:underline;">Privacy Policy</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- /Inner container -->

      </td>
    </tr>
  </table>
  <!-- /Outer wrapper -->
</body>
</html>`
}

async function sendEmail({ toEmail, toName, subject, text, html }) {
  console.log(`[EMAIL SEND] To: ${toName} <${toEmail}> | Subject: ${subject}`);
  console.log(`[EMAIL BODY] ${text}`);
  return;
}

async function sendSms({ toPhone, body }) {
  console.log(`[SMS SEND] To: ${toPhone} | Body: ${body}`);
  return;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOOKING CONFIRMATION NOTIFICATION
// Fires when a booking doc's status field changes to 'confirmed'
// ═══════════════════════════════════════════════════════════════════════════════

exports.onBookingConfirmed = onDocumentUpdated(
  { document: 'bookings/{bookingId}' },
  async (event) => {
    const before = event.data.before.data()
    const after  = event.data.after.data()

    // Only fire when status transitions to 'confirmed'
    if (before.status === after.status || after.status !== 'confirmed') return

    const ns = await getNotificationSettings(after.orgId || after.org_id)
    if (!ns) return

    const apptTime = formatApptTime(after.scheduledAt || after.preferredDate || after.preferred_date)
    const clientName = after.clientName || after.name || 'there'
    const service    = after.serviceName || 'your appointment'

    const emailText = [
      `Hi ${clientName},`,
      ``,
      `Your appointment for ${service} is confirmed!`,
      `📅 ${apptTime}`,
      ``,
      `If you need to reschedule or cancel, please contact us as soon as possible.`,
      ``,
      `See you soon!`,
    ].join('\n')

    const emailHtml = `
      <p style="margin:0 0 16px 0;">Hi ${clientName},</p>
      <p style="margin:0 0 16px 0;">Your appointment for <strong>${service}</strong> is confirmed!</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;background-color:#f0f4ff;border-radius:8px;width:100%;">
        <tr>
          <td style="padding:16px 20px;font-size:16px;color:#1a1a1a;">
            &#128197;&nbsp; <strong>${apptTime}</strong>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 16px 0;">If you need to reschedule or cancel, please contact us as soon as possible.</p>
      <p style="margin:0;">See you soon!</p>
    `

    const smsBody = `Hi ${clientName}! Your ${service} appointment is confirmed for ${apptTime}. Questions? Just reply to this message.`

    const tasks = []
    if (ns.emailEnabled && (after.clientEmail || after.email)) {
      tasks.push(
        sendEmail({
          toEmail:  after.clientEmail || after.email,
          toName:   clientName,
          subject:  `Your appointment is confirmed — ${service}`,
          text:     emailText,
          html:     emailHtml,
        }).catch(err => console.error('Confirmation email failed:', err.message))
      )
    }
    if (ns.smsEnabled && (after.clientPhone || after.phone)) {
      tasks.push(
        sendSms({ toPhone: after.clientPhone || after.phone, body: smsBody })
          .catch(err => console.error('Confirmation SMS failed:', err.message))
      )
    }
    await Promise.all(tasks)
  }
)

// ═══════════════════════════════════════════════════════════════════════════════
// 24-HOUR REMINDER  (runs every hour; only sends to appointments 23–25h away)
// ═══════════════════════════════════════════════════════════════════════════════

exports.send24hReminders = onSchedule(
  { schedule: 'every 60 minutes' },
  async () => {
    const now      = new Date()
    const windowLo = new Date(now.getTime() + 23 * 60 * 60 * 1000)
    const windowHi = new Date(now.getTime() + 25 * 60 * 60 * 1000)

    const dateLo = windowLo.toISOString().split('T')[0]
    const dateHi = windowHi.toISOString().split('T')[0]

    const query = `
      query GetUpcomingBookings($status: String!, $windowLo: Date!, $windowHi: Date!) {
        bookings(where: {
          status: { eq: $status },
          preferredDate: { ge: $windowLo, le: $windowHi }
        }) {
          id orgId name email phone preferredDate preferredTime reminder24hSent reminder2hSent
          service { name }
        }
      }
    `
    const data = await executeDataConnect(query, { status: 'confirmed', windowLo: dateLo, windowHi: dateHi })
    const bookings = data?.bookings || []

    console.log(`24h reminder job: ${bookings.length} bookings to check`)

    for (const booking of bookings) {
      if (booking.reminder24hSent) continue
      
      const apptDateTime = new Date(`${booking.preferredDate}T${booking.preferredTime || '09:00'}:00Z`)
      if (apptDateTime < windowLo || apptDateTime > windowHi) continue

      const ns = await getNotificationSettings(booking.orgId)
      if (!ns || (!ns.emailEnabled && !ns.smsEnabled) || !ns.reminder24h) {
        // Mark as sent
        await executeDataConnect(`mutation UpdateBooking($id: UUID!, $reminder24hSent: Boolean!) { booking_update(id: $id, data: { reminder24hSent: $reminder24hSent }) }`, { id: booking.id, reminder24hSent: true })
        continue
      }

      const apptTime   = formatApptTime(apptDateTime.toISOString())
      const clientName = booking.name || 'there'
      const service    = booking.service?.name || 'your appointment'

      const emailText = [
        `Hi ${clientName},`,
        ``,
        `Just a reminder — your ${service} appointment is tomorrow.`,
        `📅 ${apptTime}`,
        ``,
        `We look forward to seeing you!`,
      ].join('\n')

      const emailHtml = `
        <p style="margin:0 0 16px 0;">Hi ${clientName},</p>
        <p style="margin:0 0 16px 0;">Just a friendly reminder &mdash; your <strong>${service}</strong> appointment is tomorrow.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;background-color:#f0f4ff;border-radius:8px;width:100%;">
          <tr>
            <td style="padding:16px 20px;font-size:16px;color:#1a1a1a;">
              &#128197;&nbsp; <strong>${apptTime}</strong>
            </td>
          </tr>
        </table>
        <p style="margin:0;">We look forward to seeing you!</p>
      `

      const smsBody = `Reminder: Your ${service} appointment is tomorrow at ${apptTime}. Reply STOP to opt out.`

      const tasks = []
      if (ns.emailEnabled && booking.email) {
        tasks.push(sendEmail({ toEmail: booking.email, toName: clientName, subject: `Appointment reminder — ${service} tomorrow`, text: emailText, html: emailHtml }).catch(e => console.error(e.message)))
      }
      if (ns.smsEnabled && booking.phone) {
        tasks.push(sendSms({ toPhone: booking.phone, body: smsBody }).catch(e => console.error(e.message)))
      }
      await Promise.all(tasks)
      await executeDataConnect(`mutation UpdateBooking($id: UUID!, $reminder24hSent: Boolean!) { booking_update(id: $id, data: { reminder24hSent: $reminder24hSent }) }`, { id: booking.id, reminder24hSent: true })
    }
  }
)

// ═══════════════════════════════════════════════════════════════════════════════
// 2-HOUR REMINDER  (runs every 30 min; SMS only)
// ═══════════════════════════════════════════════════════════════════════════════

exports.send2hReminders = onSchedule(
  { schedule: 'every 30 minutes' },
  async () => {
    const now      = new Date()
    const windowLo = new Date(now.getTime() + 1.5 * 60 * 60 * 1000)
    const windowHi = new Date(now.getTime() + 2.5 * 60 * 60 * 1000)

    const dateLo = windowLo.toISOString().split('T')[0]
    const dateHi = windowHi.toISOString().split('T')[0]

    const query = `
      query GetUpcomingBookings($status: String!, $windowLo: Date!, $windowHi: Date!) {
        bookings(where: {
          status: { eq: $status },
          preferredDate: { ge: $windowLo, le: $windowHi }
        }) {
          id orgId name email phone preferredDate preferredTime reminder24hSent reminder2hSent
          service { name }
        }
      }
    `
    const data = await executeDataConnect(query, { status: 'confirmed', windowLo: dateLo, windowHi: dateHi })
    const bookings = data?.bookings || []

    console.log(`2h reminder job: ${bookings.length} bookings to check`)

    for (const booking of bookings) {
      if (booking.reminder2hSent) continue
      
      const apptDateTime = new Date(`${booking.preferredDate}T${booking.preferredTime || '09:00'}:00Z`)
      if (apptDateTime < windowLo || apptDateTime > windowHi) continue

      const ns = await getNotificationSettings(booking.orgId)
      if (!ns || !ns.smsEnabled || !ns.reminder2h) {
        await executeDataConnect(`mutation UpdateBooking($id: UUID!, $reminder2hSent: Boolean!) { booking_update(id: $id, data: { reminder2hSent: $reminder2hSent }) }`, { id: booking.id, reminder2hSent: true })
        continue
      }

      const clientName = booking.name || 'there'
      const service    = booking.service?.name || 'your appointment'
      const apptTime   = formatApptTime(apptDateTime.toISOString())
      const smsBody    = `Heads up ${clientName} — your ${service} appointment is in about 2 hours (${apptTime}). See you soon! Reply STOP to opt out.`

      if (booking.phone) {
        await sendSms({ toPhone: booking.phone, body: smsBody })
          .catch(err => console.error('2h SMS failed:', err.message))
      }
      await executeDataConnect(`mutation UpdateBooking($id: UUID!, $reminder2hSent: Boolean!) { booking_update(id: $id, data: { reminder2hSent: $reminder2hSent }) }`, { id: booking.id, reminder2hSent: true })
    }
  }
)

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE CALENDAR INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Step 1: Return the Google authorization URL to redirect the user to.
 */
exports.getGoogleOAuthUrl = onCall(async (request) => {
  const { orgId, redirectUri } = request.data
  if (!orgId || !redirectUri) throw new HttpsError('invalid-argument', 'orgId and redirectUri are required')

  const auth = makeOAuth2Client(redirectUri)
  const url = auth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
    ],
    state: orgId,
  })
  return { url }
})

/**
 * Step 2: Exchange authorization code for tokens. Store refresh_token on org doc.
 */
exports.handleGoogleOAuthCallback = onCall(async (request) => {
  const { orgId, code, redirectUri } = request.data
  if (!orgId || !code || !redirectUri) throw new HttpsError('invalid-argument', 'orgId, code, and redirectUri are required')

  const oauth2Client = makeOAuth2Client(redirectUri)
  let tokens
  try {
    const { tokens: t } = await oauth2Client.getToken(code)
    tokens = t
  } catch (err) {
    throw new HttpsError('internal', `Failed to exchange code: ${err.message}`)
  }

  if (!tokens.refresh_token) throw new HttpsError('failed-precondition', 'No refresh token. User must revoke and reconnect.')

  return { 
    success: true,
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiryDate: tokens.expiry_date
  }
})

/**
 * Remove stored Google tokens and disconnect calendar.
 */
exports.disconnectGoogleCalendar = onCall(async (request) => {
  const { orgId } = request.data
  if (!orgId) throw new HttpsError('invalid-argument', 'orgId is required')

  await db.collection('bookingOrgs').doc(orgId).set({
    googleCalendarConnected: false,
    googleRefreshToken: admin.firestore.FieldValue.delete(),
    googleAccessToken: admin.firestore.FieldValue.delete(),
    googleTokenExpiry: admin.firestore.FieldValue.delete(),
  }, { merge: true })

  return { success: true }
})

/**
 * Return busy slots from Google Calendar for a given date.
 * Used by Book.tsx to block already-taken time slots.
 */
exports.getCalendarAvailability = onCall(async (request) => {
  const { orgId, date } = request.data
  if (!orgId || !date) throw new HttpsError('invalid-argument', 'orgId and date are required')

  const orgSnap = await db.collection('bookingOrgs').doc(orgId).get()
  if (!orgSnap.exists) throw new HttpsError('not-found', 'Org not found')

  const org = orgSnap.data()
  if (!org.googleCalendarConnected || !org.googleRefreshToken) return { busySlots: [] }

  const oauth2Client = makeOAuth2Client(null)
  oauth2Client.setCredentials({
    refresh_token: org.googleRefreshToken,
    access_token: org.googleAccessToken,
    expiry_date: org.googleTokenExpiry,
  })
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await db.collection('bookingOrgs').doc(orgId).set({
        googleAccessToken: tokens.access_token,
        googleTokenExpiry: tokens.expiry_date,
      }, { merge: true })
    }
  })

  const [year, month, day] = date.split('-').map(Number)
  const timeMin = new Date(year, month - 1, day, 0, 0, 0).toISOString()
  const timeMax = new Date(year, month - 1, day, 23, 59, 59).toISOString()

  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin, timeMax,
        items: [{ id: org.googleCalendarId || 'primary' }],
      },
    })
    const calId = org.googleCalendarId || 'primary'
    const busySlots = res.data.calendars[calId]?.busy || []
    return { busySlots }
  } catch (err) {
    console.error('Calendar freebusy failed:', err.message)
    return { busySlots: [] } // fail open — don't block all slots
  }
})

/**
 * Create a Google Calendar event when a booking is confirmed.
 * Called from BookingsList when practitioner clicks "Confirm".
 */
exports.createCalendarEvent = onCall(async (request) => {
  const { bookingId } = request.data
  if (!bookingId) throw new HttpsError('invalid-argument', 'bookingId is required')

  const bookingSnap = await db.collection('bookings').doc(bookingId).get()
  if (!bookingSnap.exists) throw new HttpsError('not-found', 'Booking not found')
  const booking = bookingSnap.data()

  const orgSnap = await db.collection('bookingOrgs').doc(booking.orgId).get()
  if (!orgSnap.exists) throw new HttpsError('not-found', 'Org not found')
  const org = orgSnap.data()

  if (!org.googleCalendarConnected || !org.googleRefreshToken) return { eventId: null, htmlLink: null }

  const oauth2Client = makeOAuth2Client(null)
  oauth2Client.setCredentials({
    refresh_token: org.googleRefreshToken,
    access_token: org.googleAccessToken,
    expiry_date: org.googleTokenExpiry,
  })
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await db.collection('bookingOrgs').doc(booking.orgId).set({
        googleAccessToken: tokens.access_token,
        googleTokenExpiry: tokens.expiry_date,
      }, { merge: true })
    }
  })

  const startTime = new Date(booking.scheduledAt)
  const endTime   = new Date(startTime.getTime() + (booking.durationMinutes || 60) * 60 * 1000)

  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
    const res = await calendar.events.insert({
      calendarId: org.googleCalendarId || 'primary',
      requestBody: {
        summary: `${booking.clientName} — ${booking.serviceName}`,
        description: [
          booking.clientEmail ? `Email: ${booking.clientEmail}` : '',
          booking.clientPhone ? `Phone: ${booking.clientPhone}` : '',
          booking.notes ? `Notes: ${booking.notes}` : '',
        ].filter(Boolean).join('\n'),
        start: { dateTime: startTime.toISOString() },
        end:   { dateTime: endTime.toISOString() },
        status: 'confirmed',
      },
    })

    await db.collection('bookings').doc(bookingId).set({
      googleEventId: res.data.id,
      googleEventLink: res.data.htmlLink,
    }, { merge: true })

    return { eventId: res.data.id, htmlLink: res.data.htmlLink }
  } catch (err) {
    console.error('Failed to create calendar event:', err.message)
    return { eventId: null, htmlLink: null } // non-fatal
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// STRIPE CONNECT INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

exports.createStripeConnectAccount = onCall(async (request) => {
  const { orgId, returnUrl, refreshUrl } = request.data
  if (!orgId) throw new HttpsError('invalid-argument', 'orgId is required')

  try {
    const account = await stripe.accounts.create({
      type: 'express',
      metadata: { orgId }
    })

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: refreshUrl || returnUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    })

    return { accountId: account.id, url: accountLink.url }
  } catch (error) {
    throw new HttpsError('internal', error.message)
  }
})

exports.createBookingHoldSession = onCall(async (request) => {
  const { stripeAccountId, amount, currency, successUrl, cancelUrl, bookingDetails } = request.data
  if (!stripeAccountId || !amount) throw new HttpsError('invalid-argument', 'Missing parameters')

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ 
        price_data: { 
          currency: currency || 'usd', 
          product_data: { name: 'No-show Fee / Deposit' }, 
          unit_amount: amount 
        }, 
        quantity: 1 
      }],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: bookingDetails,
    }, {
      stripeAccount: stripeAccountId,
    })

    return { url: session.url }
  } catch (error) {
    throw new HttpsError('internal', error.message)
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// PORTAL INVITES
// ═══════════════════════════════════════════════════════════════════════════════

exports.inviteToPortal = onCall(async (request) => {
  const { email, clientName, portalUrl } = request.data
  if (!email) throw new HttpsError('invalid-argument', 'email is required')

  try {
    const actionCodeSettings = {
      url: portalUrl || 'https://bridgewayapps.com/portal',
      handleCodeInApp: true,
    }
    const link = await admin.auth().generateSignInWithEmailLink(email, actionCodeSettings)
    
    const emailText = [
      `Hi ${clientName || 'there'},`,
      ``,
      `You've been invited to access your client portal.`,
      `Click the link below to sign in instantly without a password:`,
      ``,
      link,
      ``,
      `If you didn't request this, you can safely ignore this email.`,
    ].join('\n')

    const emailHtml = `
      <p style="margin:0 0 16px 0;">Hi ${clientName || 'there'},</p>
      <p style="margin:0 0 16px 0;">You\u2019ve been invited to access your client portal.</p>
      <p style="margin:0 0 24px 0;">Click the button below to sign in instantly &mdash; no password needed:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px auto;">
        <tr>
          <td align="center" style="background-color:#5b6abf;border-radius:8px;">
            <a href="${link}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Open My Portal</a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px 0;font-size:13px;color:#888888;">Or copy and paste this link into your browser:</p>
      <p style="margin:0 0 16px 0;font-size:13px;word-break:break-all;"><a href="${link}" style="color:#5b6abf;">${link}</a></p>
      <p style="margin:0;font-size:13px;color:#888888;">If you didn\u2019t request this, you can safely ignore this email.</p>
    `

    await sendEmail({
      toEmail: email,
      toName: clientName || email,
      subject: 'Your Client Portal Invite',
      text: emailText,
      html: emailHtml,
    })

    return { success: true, note: `Invite sent to ${email}.` }
  } catch (error) {
    console.error('Failed to send invite:', error)
    throw new HttpsError('internal', error.message)
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// GET BILLING INFO
// ═══════════════════════════════════════════════════════════════════════════════

exports.getBillingInfo = onCall(async (request) => {
  const { stripe_customer_id } = request.data
  if (!stripe_customer_id) throw new HttpsError('invalid-argument', 'stripe_customer_id is required')

  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: stripe_customer_id,
      limit: 1,
      status: 'all',
      expand: ['data.default_payment_method']
    })

    if (!subscriptions.data.length) {
      throw new HttpsError('not-found', 'No active subscription found')
    }

    const sub = subscriptions.data[0]
    
    // Get plan name
    let planName = 'Bridgeway Apps'
    if (sub.items.data.length > 0) {
      const price = sub.items.data[0].price
      if (price.nickname) planName = price.nickname
    }

    let paymentMethod = null
    const pm = sub.default_payment_method
    if (pm && pm.card) {
      paymentMethod = {
        brand: pm.card.brand,
        last4: pm.card.last4
      }
    }

    return {
      status: sub.status,
      currentPeriodEnd: sub.current_period_end,
      paymentMethod,
      planName
    }
  } catch (error) {
    throw new HttpsError('internal', error.message)
  }
})

// ── Claude-Additions Feature Set Exports ──────────────────────────────────

// ── Tier 1: Smart Resource Allocation ────────────────────────────────────
const demandForecast = require('./forecasting/demandForecast');
exports.forecastDemand = demandForecast.forecastDemand;

const staffMatcher = require('./scheduling/staffMatcher');
exports.matchStaff = staffMatcher.matchStaff;

// ── Tier 1: CLV Dashboard ────────────────────────────────────────────────
const refreshClientMetrics = require('./tasks/refreshClientMetrics');
exports.refreshClientMetrics = refreshClientMetrics.refreshClientMetrics;

// ── Tier 1: Queue Management ─────────────────────────────────────────────
const queueService = require('./queue/queueService');
exports.queueCheckIn = queueService.checkIn;
exports.queueAssignStaff = queueService.assignStaff;
exports.queueCompleteService = queueService.completeService;

// ── Tier 1: Marketing Campaigns ──────────────────────────────────────────
const triggerEngine = require('./campaigns/triggerEngine');
exports.processCampaignTriggers = triggerEngine.processCampaignTriggers;

// ── Tier 1: Service & Staff Analytics ────────────────────────────────────
const serviceMetrics = require('./analytics/serviceMetricsCalculator');
exports.rollupServiceMetrics = serviceMetrics.rollupServiceMetrics;

const staffMetrics = require('./analytics/staffMetricsCalculator');
exports.rollupStaffMetrics = staffMetrics.rollupStaffMetrics;

// ── Tier 2: Bulk Operations ──────────────────────────────────────────────
const bulkOps = require('./bulk/bulkOperations');
exports.bulkUpdate = bulkOps.bulkUpdate;
exports.bulkDelete = bulkOps.bulkDelete;
exports.bulkTag = bulkOps.bulkTag;

// ── Tier 2: Custom Reports ───────────────────────────────────────────────
const reports = require('./reports/reportGenerator');
exports.generateCustomReport = reports.generateCustomReport;

// ── Tier 2: Client Segmentation ──────────────────────────────────────────
const segments = require('./segments/segmentationEngine');
exports.getSegmentMembers = segments.getSegmentMembers;
exports.refreshSegmentCounts = segments.refreshSegmentCounts;

// ── Tier 2: Recurring Revenue ────────────────────────────────────────────
const mrr = require('./analytics/mrrCalculator');
exports.snapshotMrr = mrr.snapshotMrr;

// ── Tier 3: Feedback ─────────────────────────────────────────────────────
const feedback = require('./feedback/feedbackService');
exports.submitFeedback = feedback.submitFeedback;
exports.getFeedbackSummary = feedback.getFeedbackSummary;

// ── Tier 3: Recommendations ──────────────────────────────────────────────
const recommendations = require('./recommendations/recommendationEngine');
exports.buildServiceAffinity = recommendations.buildServiceAffinity;
exports.getClientRecommendations = recommendations.getClientRecommendations;

// ── Tier 3: Capacity Planning ────────────────────────────────────────────
const capacity = require('./forecasting/capacityForecast');
exports.forecastCapacity = capacity.forecastCapacity;

// ── Tier 3: Gift Cards ───────────────────────────────────────────────────
const giftCards = require('./payments/giftCardService');
exports.issueGiftCard = giftCards.issueGiftCard;
exports.checkGiftCardBalance = giftCards.checkGiftCardBalance;
exports.redeemGiftCard = giftCards.redeemGiftCard;

// ── Tier 3: Expenses ─────────────────────────────────────────────────────
const expenses = require('./accounting/expenseService');
exports.recordExpense = expenses.recordExpense;
exports.getProfitability = expenses.getProfitability;

// ── Tier 3: Integration Hub (webhooks) ───────────────────────────────────
const webhooks = require('./webhooks/webhookPublisher');
exports.webhookOnAppointmentWrite = webhooks.onAppointmentWrite;
exports.webhookOnClientCreated = webhooks.onClientCreated;

// ── Project Stanley Gemini Brain ─────────────────────────────────────────
const geminiApiKey = defineSecret('GEMINI_API_KEY')

exports.askStanleyAI = onCall({ cors: true, secrets: [geminiApiKey], maxInstances: 5 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in to use Project Stanley AI.')
  }

  // Double check that the user has an active Stanley license in Firestore
  const uid = request.auth.uid
  const userDoc = await admin.firestore().collection('stanley_users').doc(uid).get()
  if (!userDoc.exists || userDoc.data().status !== 'active') {
    throw new HttpsError('permission-denied', 'No active Project Stanley license found for this user.')
  }

  const { mode, prompt, elements, stepDescription, screenshotBase64 } = request.data
  const apiKey = geminiApiKey.value() || process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'Gemini API key is not configured on the server.')
  }

  if (mode === 'compile') {
    if (!prompt) {
      throw new HttpsError('invalid-argument', 'Missing prompt for compile mode')
    }

    const systemInstruction = `You are the brain of Project Stanley, a local browser automation butler.
Your task is to take a natural language request from a user and translate it into a structured, step-by-step sequence of automation actions in JSON format.

Available actions you can output:
1. navigate: Goto a URL in the current tab. Keys: "action": "navigate", "url": "URL string"
2. click: Click on a specific element. Keys: "action": "click", "description": "Short plain English description of what element to click"
3. type: Type text into an input field. Keys: "action": "type", "description": "Short description of the input field to type into", "value": "Text value to type"
4. wait: Wait for a specific duration in milliseconds. Keys: "action": "wait", "ms": number of milliseconds
5. scrape: Scrape structured visible text content from the current tab. Keys: "action": "scrape", "selector": "Optional CSS selector to scope scrape to"
6. open_tab: Open a new browser tab and optionally navigate to a URL. Keys: "action": "open_tab", "url": "Optional URL string". Returns a new tab index (0-based) you can use with switch_tab.
7. switch_tab: Switch the active browser tab to a different tab by index. Keys: "action": "switch_tab", "index": number (0-indexed, where 0 is the first tab opened)
8. close_tab: Close a browser tab by index. Keys: "action": "close_tab", "index": number (0-indexed)

Multi-tab guidance:
- Tabs are indexed starting at 0. The initial tab opened is always index 0.
- Use open_tab to open a new tab (optionally with a URL), then switch_tab to go back to a previous tab.
- When scraping multiple URLs, open each in a new tab, switch to it, scrape, then switch to the next.

Output MUST be a valid JSON array of objects. Do not wrap it in markdown code fences or backticks. Start with [ and end with ].
Example (multi-tab):
[
  { "action": "navigate", "url": "https://www.google.com" },
  { "action": "open_tab", "url": "https://www.wikipedia.org" },
  { "action": "scrape" },
  { "action": "switch_tab", "index": 0 },
  { "action": "type", "description": "Search input text area", "value": "weather today" },
  { "action": "click", "description": "Search button" },
  { "action": "scrape" },
  { "action": "close_tab", "index": 1 }
]`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `Translate this user prompt into a structured workflow:\n"${prompt}"` }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API Error: ${errText}`);
      }

      const resData = await response.json();
      const text = resData.candidates[0].content.parts[0].text;
      return { actions: JSON.parse(text) };
    } catch (e) {
      throw new HttpsError('internal', `Failed to compile prompt using Gemini: ${e.message}`);
    }
  } else if (mode === 'resolve') {
    if (!stepDescription || !elements || !Array.isArray(elements)) {
      throw new HttpsError('invalid-argument', 'Missing stepDescription or elements for resolve mode')
    }

    const systemInstruction = `You are a helper for a browser automation tool.
You will be given:
1. A target description (what the tool wants to click or type into).
2. A JSON array of active interactive elements on the page, each with a unique 'index'.

Your task is to identify the single element in the array that best matches the description.
Return ONLY the index (as an integer) of the matched element. Do not write explanations, do not return JSON, just output the raw integer. If absolutely nothing matches, return -1.

Example:
Target: "Search bar input"
Elements:
[
  {"index": 0, "tag": "A", "text": "Images"},
  {"index": 1, "tag": "INPUT", "type": "text", "placeholder": "Search Google"},
  {"index": 2, "tag": "BUTTON", "text": "Google Search"}
]
Output:
1`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{
              text: `Target Description: "${stepDescription}"\n\nInteractive Elements List:\n${JSON.stringify(elements, null, 2)}`
            }]
          }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            temperature: 0.1
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API Error: ${errText}`);
      }

      const resData = await response.json();
      const text = resData.candidates[0].content.parts[0].text.trim();
      const index = parseInt(text, 10);
      return { index: isNaN(index) ? -1 : index };
    } catch (e) {
      throw new HttpsError('internal', `Failed to resolve selector using Gemini: ${e.message}`);
    }
  } else if (mode === 'resolveWithVision') {
    if (!stepDescription || !screenshotBase64) {
      throw new HttpsError('invalid-argument', 'Missing stepDescription or screenshotBase64 for resolveWithVision mode')
    }

    const systemInstruction = `You are helping a browser automation tool. Look at this screenshot of a webpage and identify the best Playwright locator to find the element described.
You must return JSON only, with the format:
{
  "strategy": "role" | "text" | "placeholder" | "label",
  "value": "string value to match",
  "roleType": "button" | "link" | "checkbox" | "textbox" | "searchbox" | "spinbutton" (optional, required if strategy is role)
}
Return nothing but the valid JSON string. Do not wrap in markdown fences.`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: `Target Element Description: "${stepDescription}"` },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: screenshotBase64
                }
              }
            ]
          }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API Vision Error: ${errText}`);
      }

      const resData = await response.json();
      const text = resData.candidates[0].content.parts[0].text.trim();
      return JSON.parse(text);
    } catch (e) {
      throw new HttpsError('internal', `Failed to resolve selector using Gemini Vision: ${e.message}`);
    }
  } else {
    throw new HttpsError('invalid-argument', 'Invalid mode, must be "compile", "resolve", or "resolveWithVision".')
  }
})



