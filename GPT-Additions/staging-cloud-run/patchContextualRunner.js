const fs = require('fs');
const target = process.argv[2] || 'src/contextualRunner.js';
const raw = fs.readFileSync(target, 'utf8'); const crlf = raw.includes('\r\n'); let source = raw.replace(/\r\n/g, '\n');
const signature = 'async function runWorkflowWithContext(workflow, secrets, input, { db, uid, runId, policy = {}, onLog: reportLog } = {}) {';
const patchedSignature = 'async function runWorkflowWithContext(workflow, secrets, input, { db, uid, runId, policy = {}, onLog: reportLog, connectorRuntime = null, connectorApproval = null, trust = null, orchestration = null } = {}) {';
const optionsAnchor = `      db: engineDb,
      runId,`;
const optionsPatched = `      db: engineDb,
      uid,
      runId,
      connectorRuntime,
      connectorApproval,
      trust,
      orchestration,`;
if (!source.includes('orchestration = null')) {
  if (!source.includes(signature) || !source.includes(optionsAnchor)) throw new Error('Contextual runner anchors changed; refusing a fuzzy patch.');
  source = source.replace(signature, patchedSignature).replace(optionsAnchor, optionsPatched);
}
fs.writeFileSync(target, crlf ? source.replace(/\n/g, '\r\n') : source);
console.log(`Applied staging context propagation to ${target}.`);
