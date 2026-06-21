'use strict';
/**
 * stanley-setup.exe entry point
 *
 * Extracts the Stanley daemon to %APPDATA%\Stanley\, writes the Chrome
 * Native Messaging manifest, and registers the registry key.
 * No admin rights required — everything goes into HKCU and APPDATA.
 */

const fs           = require('fs');
const path         = require('path');
const os           = require('os');
const { execSync } = require('child_process');

// Embedded daemon binary — replaced at build time by build.js
const DAEMON_B64 = require('./embedded-daemon.js');

const INSTALL_DIR   = path.join(process.env.APPDATA || os.homedir(), 'Stanley');
const DAEMON_EXE    = path.join(INSTALL_DIR, 'stanley.exe');
const MANIFEST_PATH = path.join(INSTALL_DIR, 'com.project.stanley.json');
const REG_KEY       = 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.project.stanley';

const ALLOWED_ORIGINS = [
  'chrome-extension://kpmjfgchdfpgpndghjddcblfefphdbgo/',
  'chrome-extension://lhflgogbdfclcdljgfclnchmgnmgacpa/'
];

function line(msg) { process.stderr.write(msg + '\n'); }

async function install() {
  line('');
  line('  Stanley — installing daemon...');
  line('');

  // 1. Create install directory
  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  line(`  Directory : ${INSTALL_DIR}`);

  // 2. Extract daemon exe
  const buf = Buffer.from(DAEMON_B64, 'base64');
  fs.writeFileSync(DAEMON_EXE, buf);
  line(`  Daemon    : ${DAEMON_EXE}`);

  // 3. Write Native Messaging manifest
  const manifest = {
    name: 'com.project.stanley',
    description: 'Project Stanley Desktop Daemon Host',
    path: DAEMON_EXE,
    type: 'stdio',
    allowed_origins: ALLOWED_ORIGINS
  };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  line(`  Manifest  : ${MANIFEST_PATH}`);

  // 4. Register in Chrome's registry (no admin — HKCU)
  execSync(
    `reg add "${REG_KEY}" /ve /t REG_SZ /d "${MANIFEST_PATH}" /f`,
    { stdio: 'pipe' }
  );
  line(`  Registry  : ${REG_KEY}`);

  line('');
  line('  Done! Restart Chrome to activate Stanley.');
  line('');
}

install().catch(err => {
  process.stderr.write('\n  Installation failed: ' + err.message + '\n\n');
  process.exit(1);
});
