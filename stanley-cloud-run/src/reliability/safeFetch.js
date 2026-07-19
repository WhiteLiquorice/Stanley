const dns = require('node:dns').promises;
const net = require('node:net');

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

function isPrivateIp(address) {
  if (net.isIPv4(address)) return isPrivateIpv4(address);
  if (!net.isIPv6(address)) return true;
  const normalized = address.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized)) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIpv4(mapped[1]) : false;
}

async function assertSafeUrl(value, { allowedHosts = [], resolver = dns.lookup } = {}) {
  let url;
  try { url = new URL(String(value)); } catch { throw Object.assign(new Error('Outbound URL is invalid.'), { code: 'EGRESS_URL_INVALID' }); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw Object.assign(new Error('Outbound URL must use HTTP(S) without embedded credentials.'), { code: 'EGRESS_URL_INVALID' });
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (allowedHosts.length && !allowedHosts.map((item) => item.toLowerCase()).includes(host)) {
    throw Object.assign(new Error(`Outbound host is not allowlisted: ${host}`), { code: 'EGRESS_HOST_DENIED' });
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host === 'metadata.google.internal') {
    throw Object.assign(new Error('Outbound requests to local or metadata hosts are blocked.'), { code: 'EGRESS_PRIVATE_NETWORK' });
  }
  const addresses = net.isIP(host) ? [{ address: host }] : await resolver(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) {
    throw Object.assign(new Error('Outbound requests to private or reserved networks are blocked.'), { code: 'EGRESS_PRIVATE_NETWORK' });
  }
  return url;
}

function withoutCrossOriginCredentials(headers = {}) {
  const next = { ...headers };
  for (const key of Object.keys(next)) if (/^(authorization|cookie|proxy-authorization)$/i.test(key)) delete next[key];
  return next;
}

async function safeFetch(value, init = {}, options = {}) {
  if (!options.enabled) return fetch(value, init);
  let current = await assertSafeUrl(value, options);
  let request = { ...init, redirect: 'manual' };
  const maxRedirects = Math.max(0, Math.min(Number(options.maxRedirects ?? 3), 5));
  for (let redirect = 0; redirect <= maxRedirects; redirect++) {
    const response = await fetch(current, request);
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    if (redirect === maxRedirects) throw Object.assign(new Error('Outbound request exceeded its redirect limit.'), { code: 'EGRESS_REDIRECT_LIMIT' });
    const location = response.headers.get('location');
    if (!location) return response;
    const next = await assertSafeUrl(new URL(location, current).toString(), options);
    if (next.origin !== current.origin) request = { ...request, headers: withoutCrossOriginCredentials(request.headers) };
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && String(request.method || 'GET').toUpperCase() === 'POST')) {
      request = { ...request, method: 'GET', body: undefined };
    }
    current = next;
  }
  throw new Error('Unreachable redirect state.');
}

module.exports = { assertSafeUrl, isPrivateIp, safeFetch, withoutCrossOriginCredentials };
