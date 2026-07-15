const fs = require('fs');
const path = require('path');

const targetArg = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const target = targetArg || path.resolve(__dirname, '../../../branchingEngine.js');
const checkOnly = process.argv.includes('--check');
const raw = fs.readFileSync(target, 'utf8'); const crlf = raw.includes('\r\n'); let source = raw.replace(/\r\n/g, '\n');

const cacheStart = '    // 1. Pre-Execution Cache Check: Did another user already auto-generate a Python API script for this?';
const browserStart = '    if (!usedCachedApi) {';
const connectorBlock = `    // Connector Engine: approved tenant artifacts run before browser execution.
    if (opts.connectorRuntime && url && url !== 'about:blank' && effectiveNode.type !== 'navigate' && effectiveNode.type !== 'trigger') {
      const connector = await opts.connectorRuntime.executeForNode({
        uid: opts.uid, runId: opts.runId, workflowId: workflow.id, node: effectiveNode,
        goal, url, input: { ...ctx.variables, ...ctx.stepParams },
        approval: opts.connectorApproval, trustMode: opts.trust?.policy?.mode || 'live',
      });
      if (connector.executed) {
        scraped[effectiveNode.id] = connector.result;
        ctx.lastScrape = typeof connector.result === 'string' ? connector.result : JSON.stringify(connector.result);
        usedCachedApi = true;
        ctx.lastError = null;
        onLog(\`\${label} Executed approved connector \${connector.connectorId}@\${connector.version}.\`);
      }
    }

`;

const recoveryStart = '        // 2. Python API Generation Fallback';
const visualStart = '        // 3. Visual RPA Fallback (if Python API failed or wasn\'t applicable)';
const recoveryReplacement = `        // Connector generation is deliberate and lifecycle-gated. Failed execution
        // is recorded for grouped repair; browser fallback remains available here.

`;

function replaceBetween(input, start, end, replacement) {
  const from = input.indexOf(start); const to = input.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Connector patch anchor changed: ${start}`);
  return input.slice(0, from) + replacement + input.slice(to);
}

function applyConnectorHooks(input) {
  let output = input;
  if (!output.includes('Executed approved connector')) output = replaceBetween(output, cacheStart, browserStart, connectorBlock);
  if (output.includes(recoveryStart)) output = replaceBetween(output, recoveryStart, visualStart, recoveryReplacement);
  return output;
}

if (require.main === module) {
  const patched = applyConnectorHooks(source);
  if (checkOnly) console.log(`Connector hooks are applicable to ${target}.`);
  else { fs.writeFileSync(target, crlf ? patched.replace(/\n/g, '\r\n') : patched); console.log(`Applied Connector Engine hooks to ${target}.`); }
}

module.exports = { applyConnectorHooks };
