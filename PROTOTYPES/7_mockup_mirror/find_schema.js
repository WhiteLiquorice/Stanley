const fs = require('fs');
const path = require('path');

const jsPath = path.join(__dirname, 'assets', 'index-CEWLV0u9.js');
const code = fs.readFileSync(jsPath, 'utf8');

// Find references to Workflow properties
console.log('Searching for Workflow entity usage...');
const keywords = ['workflowName', 'workflowId', 'edges', 'nodes', 'graph'];
keywords.forEach(kw => {
  let idx = 0;
  console.log(`\n--- Matches for "${kw}" ---`);
  while ((idx = code.indexOf(kw, idx)) !== -1) {
    console.log(`[${idx}]: ... ${code.substring(idx - 50, idx + 100).replace(/\n/g, ' ')} ...`);
    idx += kw.length;
    if (idx > 500000) break;
  }
});
