import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const claims = JSON.parse(fs.readFileSync(path.join(root, 'certification', 'claims.json'), 'utf8'));
const publicFiles = [
  'src/views/Landing.tsx',
  'src/views/Guide.tsx',
  'src/views/AdStaging.tsx',
  'src/components/LiveViewPanel.tsx',
];
const prohibited = [
  /local daemon/i,
  /chrome extension/i,
  /residential ip/i,
  /100% (?:data )?privacy/i,
  /never leaves? (?:your )?machine/i,
  /bypass complex anti-bot/i,
  /captcha\s*\/\s*cloudflare bypass/i,
  /bulletproof/i,
  /unlimited tasks locally/i,
  /100% free execution/i,
  /zero network roundtrips/i,
  /offline run support/i,
];

const failures = [];
const ids = new Set();
for (const claim of claims) {
  if (!claim.id || ids.has(claim.id)) failures.push(`Claim ID is missing or duplicated: ${claim.id || '(missing)'}`);
  ids.add(claim.id);
  if (!claim.claim || !claim.localStatus || !claim.deploymentGate) failures.push(`${claim.id}: incomplete certification metadata`);
  for (const relative of [...claim.evidence, ...claim.tests]) {
    if (!fs.existsSync(path.join(root, relative))) failures.push(`${claim.id}: missing evidence file ${relative}`);
  }
  if (claim.localStatus === 'verified' && claim.tests.length === 0) failures.push(`${claim.id}: verified claims require automated tests`);
}

for (const relative of publicFiles) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  for (const pattern of prohibited) {
    if (pattern.test(source)) failures.push(`${relative}: prohibited stale claim matches ${pattern}`);
  }
}

if (failures.length) {
  console.error(`Claim certification failed (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

const verified = claims.filter((claim) => claim.localStatus === 'verified').length;
const implementationOnly = claims.filter((claim) => claim.localStatus === 'implementation-only').length;
console.log(`Claim certification passed: ${verified} locally verified, ${implementationOnly} implementation-only, ${claims.length} total.`);
console.log('Deployment gates remain explicit in certification/claims.json; this command does not certify production infrastructure or credentials.');
