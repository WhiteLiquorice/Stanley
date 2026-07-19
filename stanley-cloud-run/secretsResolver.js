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
function splitReference(ref) {
  const match = String(ref || '').match(/^(.*)\.(username|email|password)$/);
  return match ? { base: match[1], field: match[2] } : { base: String(ref || ''), field: 'value' };
}

function valueForReference(secret, field) {
  if (field === 'username' || field === 'email') return secret.username;
  if (field === 'password') return secret.password;
  return secret.value;
}

async function resolveSecrets(db, uid, references = null) {
  const vault = db.collection('stanley_users').doc(uid).collection('vault');
  if (Array.isArray(references)) {
    const map = {};
    const unique = [...new Set(references.map(String).filter(Boolean))];
    for (const ref of unique) {
      const { base, field } = splitReference(ref);
      let snapshot = await vault.doc(base).get();
      if (!snapshot.exists) {
        const named = await vault.where('name', '==', base).limit(1).get();
        snapshot = named.docs[0] || null;
      }
      if (!snapshot?.exists) continue;
      const value = valueForReference(snapshot.data(), field);
      if (value != null) map[ref] = value;
    }
    return map;
  }

  const snap = await vault.get();
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

module.exports = { resolveSecrets, splitReference, valueForReference };
