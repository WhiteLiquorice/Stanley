'use strict';
/**
 * Build script — produces two executables in stanley-daemon/dist/:
 *
 *   stanley.exe        — the daemon (Chrome Native Messaging host)
 *   stanley-setup.exe  — the installer users download and run once
 *
 * Usage:
 *   node stanley-daemon/build.js
 *
 * Prerequisites:
 *   npm install -g pkg        (or npx pkg works too)
 *   tsc                       (compile foundationAgent.ts first)
 */

const fs           = require('fs');
const path         = require('path');
const { execSync } = require('child_process');

const ROOT      = path.resolve(__dirname, '..');
const DIST      = path.join(__dirname, 'dist');
const DAEMON_JS = path.join(__dirname, 'daemon.js');
const SETUP_JS  = path.join(__dirname, 'installer.js');
const EMBEDDED  = path.join(__dirname, 'embedded-daemon.js');

const DAEMON_EXE = path.join(DIST, 'stanley.exe');
const SETUP_EXE  = path.join(DIST, 'stanley-setup.exe');

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
}

function step(msg) { console.log(`\n── ${msg}`); }

// ── 1. Compile TypeScript ────────────────────────────────────────────────────
step('Compiling TypeScript');
run('npx tsc');

// ── 2. Create dist folder ────────────────────────────────────────────────────
fs.mkdirSync(DIST, { recursive: true });

// ── 3. Bundle daemon → stanley.exe ──────────────────────────────────────────
step('Bundling daemon → stanley.exe');
run(
  [
    'npx @yao-pkg/pkg',
    `"${DAEMON_JS}"`,
    '--target node22-win-x64',
    '--output', `"${DAEMON_EXE}"`,
    // Include playwright's internal assets so channel:chrome browser detection works
    '--public-packages "*"',
    '--compress GZip'
  ].join(' ')
);
console.log(`Built: ${DAEMON_EXE}  (${(fs.statSync(DAEMON_EXE).size / 1e6).toFixed(1)} MB)`);

// ── 4. Embed daemon exe into installer source ────────────────────────────────
step('Embedding daemon into installer');
const b64 = fs.readFileSync(DAEMON_EXE).toString('base64');
fs.writeFileSync(EMBEDDED, `module.exports = '${b64}';\n`);
console.log(`Embedded ${(b64.length / 1e6).toFixed(1)} MB of base64`);

// ── 5. Bundle installer → stanley-setup.exe ──────────────────────────────────
step('Bundling installer → stanley-setup.exe');
run(
  [
    'npx @yao-pkg/pkg',
    `"${SETUP_JS}"`,
    '--target node22-win-x64',
    '--output', `"${SETUP_EXE}"`,
    '--compress GZip'
  ].join(' ')
);
console.log(`Built: ${SETUP_EXE}  (${(fs.statSync(SETUP_EXE).size / 1e6).toFixed(1)} MB)`);

// ── 6. Clean up embedded source (contains the full exe as a string) ───────────
fs.unlinkSync(EMBEDDED);

console.log('\n── Done ──');
console.log(`Distribute: ${SETUP_EXE}`);
