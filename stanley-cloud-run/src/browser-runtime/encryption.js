const crypto = require('crypto');

function parseKey(value) {
  if (!value) return null;
  const text = String(value).trim();
  const candidates = [Buffer.from(text, 'base64'), Buffer.from(text, 'hex')];
  const exact = candidates.find((candidate) => candidate.length === 32);
  if (exact) return exact;
  if (process.env.NODE_ENV === 'production') throw new Error('BROWSER_SESSION_ENCRYPTION_KEY must encode exactly 32 bytes.');
  return crypto.createHash('sha256').update(text).digest();
}

class SessionCipher {
  constructor(key) { this.key = Buffer.isBuffer(key) ? key : parseKey(key); }
  get enabled() { return Boolean(this.key); }
  encrypt(value, associatedData) {
    if (!this.key) throw new Error('Encrypted browser sessions are not configured.');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(String(associatedData)));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return { algorithm: 'A256GCM', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
  }
  decrypt(record, associatedData) {
    if (!this.key) throw new Error('Encrypted browser sessions are not configured.');
    if (record?.algorithm !== 'A256GCM') throw new Error('Unsupported browser-session encryption format.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(record.iv, 'base64'));
    decipher.setAAD(Buffer.from(String(associatedData)));
    decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
  }
}

module.exports = { SessionCipher, parseKey };
