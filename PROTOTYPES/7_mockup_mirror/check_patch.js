const fs = require('fs');
const path = require('path');

const jsPath = path.join(__dirname, 'assets', 'index-CEWLV0u9.js');
const code = fs.readFileSync(jsPath, 'utf8');

const occurrences = [];
let idx = 0;
while ((idx = code.indexOf('Bypassed', idx)) !== -1) {
  occurrences.push(idx);
  idx += 8;
}

console.log('Occurrences of "Bypassed":', occurrences.length);
occurrences.forEach(o => {
  console.log(`- at ${o}: ${code.substring(o - 50, o + 100)}`);
});
