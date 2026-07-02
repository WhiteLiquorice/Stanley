const fs = require('fs');
const path = require('path');

const jsPath = path.join(__dirname, 'assets', 'index-CEWLV0u9.js');
const code = fs.readFileSync(jsPath, 'utf8');

const targetStr = 'No steps configured yet';
const idx = code.indexOf(targetStr);
if (idx !== -1) {
  console.log(code.substring(idx, idx + 1500).replace(/\n/g, ' '));
}
