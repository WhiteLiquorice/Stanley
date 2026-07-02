const fs = require('fs');
const path = require('path');

const jsPath = path.join(__dirname, 'assets', 'index-CEWLV0u9.js');
const code = fs.readFileSync(jsPath, 'utf8');

const idx = code.indexOf('aC.Provider');
if (idx !== -1) {
  console.log('Found aC.Provider at:', idx);
  console.log(code.substring(idx - 150, idx + 150));
} else {
  console.log('aC.Provider not found');
}
