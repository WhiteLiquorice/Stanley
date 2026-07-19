const crypto = require('crypto');

const GOOGLE_SCOPES = [
  'openid', 'email', 'profile',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.file',
];

function configured() { return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REDIRECT_URI); }
function connectionRef(db, uid) { return db.collection('stanley_oauth_connections').doc(uid).collection('providers').doc('google'); }
function stateRef(db, state) { return db.collection('stanley_oauth_states').doc(crypto.createHash('sha256').update(state).digest('hex')); }

async function exchangeToken(fields) {
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw Object.assign(new Error(payload.error_description || payload.error || 'Google token exchange failed.'), { status: 502 });
  return payload;
}

class GoogleOAuthService {
  constructor(db) { this.db = db; }
  async start(uid) {
    if (!configured()) throw Object.assign(new Error('Google OAuth is not configured on the runner.'), { status: 503 });
    const state = crypto.randomBytes(32).toString('base64url');
    await stateRef(this.db, state).create({ uid, createdAt: new Date().toISOString(), expiresAtMs: Date.now() + 600000 });
    const query = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI, response_type: 'code', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', scope: GOOGLE_SCOPES.join(' '), state });
    return `https://accounts.google.com/o/oauth2/v2/auth?${query}`;
  }
  async callback(code, state) {
    if (!configured()) throw Object.assign(new Error('Google OAuth is not configured on the runner.'), { status: 503 });
    const pendingRef = stateRef(this.db, state);
    const pending = await pendingRef.get();
    if (!pending.exists || Number(pending.data().expiresAtMs || 0) < Date.now()) throw Object.assign(new Error('Google authorization state is invalid or expired.'), { status: 400 });
    const uid = pending.data().uid;
    const tokens = await exchangeToken({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI, grant_type: 'authorization_code' });
    const ref = connectionRef(this.db, uid);
    const existing = await ref.get();
    const refreshToken = tokens.refresh_token || existing.data()?.refreshToken;
    if (!refreshToken) throw Object.assign(new Error('Google did not return a refresh token. Revoke Stanley in Google Account settings, then reconnect.'), { status: 409 });
    const now = new Date().toISOString();
    await this.db.runTransaction(async (transaction) => {
      const freshState = await transaction.get(pendingRef);
      if (!freshState.exists) throw Object.assign(new Error('Google authorization state was already used.'), { status: 409 });
      transaction.delete(pendingRef);
      transaction.set(ref, { provider: 'google', state: 'connected', refreshToken, accessToken: tokens.access_token, expiresAtMs: Date.now() + Number(tokens.expires_in || 3600) * 1000, scope: tokens.scope || GOOGLE_SCOPES.join(' '), createdAt: existing.data()?.createdAt || now, updatedAt: now }, { merge: true });
    });
    return uid;
  }
  async status(uid) {
    const snapshot = await connectionRef(this.db, uid).get();
    if (!snapshot.exists) return { configured: configured(), connected: false };
    const data = snapshot.data();
    return { configured: configured(), connected: data.state === 'connected', scopes: String(data.scope || '').split(' ').filter(Boolean), updatedAt: data.updatedAt || null };
  }
  async disconnect(uid) { await connectionRef(this.db, uid).delete(); }
  async accessToken(uid) {
    const ref = connectionRef(this.db, uid); const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data().state !== 'connected') return null;
    const connection = snapshot.data();
    if (connection.accessToken && Number(connection.expiresAtMs || 0) > Date.now() + 60000) return connection.accessToken;
    if (!connection.refreshToken || !configured()) return null;
    const tokens = await exchangeToken({ refresh_token: connection.refreshToken, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, grant_type: 'refresh_token' });
    await ref.set({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token || connection.refreshToken, expiresAtMs: Date.now() + Number(tokens.expires_in || 3600) * 1000, updatedAt: new Date().toISOString() }, { merge: true });
    return tokens.access_token;
  }
}

function installGoogleOAuthRoutes({ app, service, authenticateUser }) {
  app.get('/v1/oauth/google/start', async (req, res) => { try { const uid = await authenticateUser(req); return res.json({ success: true, authorizationUrl: await service.start(uid) }); } catch (error) { return res.status(error.status || 500).json({ success: false, error: error.message }); } });
  app.get('/v1/oauth/google/callback', async (req, res) => {
    const appUrl = String(process.env.STANLEY_APP_URL || '').replace(/\/$/, '');
    try { if (!req.query.code || !req.query.state) throw Object.assign(new Error('Google did not return an authorization code.'), { status: 400 }); await service.callback(String(req.query.code), String(req.query.state)); if (appUrl) return res.redirect(`${appUrl}/dashboard/vault?google=connected`); return res.status(200).send('Google connected. You can close this window.'); }
    catch (error) { if (appUrl) return res.redirect(`${appUrl}/dashboard/vault?google=error&message=${encodeURIComponent(error.message)}`); return res.status(error.status || 500).send(error.message); }
  });
  app.get('/v1/oauth/google', async (req, res) => { try { const uid = await authenticateUser(req); return res.json({ success: true, ...(await service.status(uid)) }); } catch (error) { return res.status(error.status || 500).json({ success: false, error: error.message }); } });
  app.delete('/v1/oauth/google', async (req, res) => { try { const uid = await authenticateUser(req); await service.disconnect(uid); return res.json({ success: true }); } catch (error) { return res.status(error.status || 500).json({ success: false, error: error.message }); } });
}

module.exports = { GOOGLE_SCOPES, GoogleOAuthService, configured, installGoogleOAuthRoutes };
