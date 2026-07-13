/**
 * secretsResolver.js — server-side vault resolution for automated (scheduled /
 * webhook) runs, where there's no browser to resolve secrets client-side.
 *
 * Reads stanley_users/{uid}/vault with the Admin SDK and builds the same
 * { reference: value } map the web app's fetchSecretsMap produces — including the
 * Login Credentials dotted sub-keys (Name.username / Name.password). Secrets
 * resolved here never leave the backend.
 */

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} uid
 * @returns {Promise<Record<string,string>>}
 */
async function resolveSecrets(db, uid) {
  const snap = await db.collection('stanley_users').doc(uid).collection('vault').get();
  const map = {};
  snap.forEach((doc) => {
    const s = { id: doc.id, ...doc.data() };
    if (s.value != null) {
      map[s.id] = s.value;
      if (s.name) map[s.name] = s.value;
    }
    // Login Credentials expose username/email + password as dotted sub-keys.
    if (s.username != null) {
      map[`${s.id}.username`] = s.username;
      map[`${s.id}.email`] = s.username;
      if (s.name) {
        map[`${s.name}.username`] = s.username;
        map[`${s.name}.email`] = s.username;
      }
    }
    if (s.password != null) {
      map[`${s.id}.password`] = s.password;
      if (s.name) map[`${s.name}.password`] = s.password;
    }
  });
  return map;
}

module.exports = { resolveSecrets };
