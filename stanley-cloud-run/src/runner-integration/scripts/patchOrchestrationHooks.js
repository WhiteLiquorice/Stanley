const fs = require('fs');
const path = require('path');

const targetArg = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
const target = targetArg || path.resolve(__dirname, '../../../branchingEngine.js');
const checkOnly = process.argv.includes('--check');
const beforeAnchor = `    const goal = effectiveNode.data?.description || ctx.missionPrompt || \`Locate and perform action on the page.\`;`;
const beforeReplacement = `    if (opts.orchestration && typeof opts.orchestration.beforeNode === 'function') {
      await opts.orchestration.beforeNode(effectiveNode, ctx);
    }

${beforeAnchor}`;
const afterAnchor = `    if (onBlocked && typeof agent.isPageBlocked === 'function') {`;
const afterReplacement = `    if (opts.orchestration && typeof opts.orchestration.afterNode === 'function') {
      await opts.orchestration.afterNode(effectiveNode, scraped[effectiveNode.id], ctx);
    }

${afterAnchor}`;

function applyOrchestrationHooks(input) {
  let output = input;
  if (!output.includes(beforeReplacement)) { if (!output.includes(beforeAnchor)) throw new Error('Orchestration before-node anchor changed; refusing a fuzzy patch.'); output = output.replace(beforeAnchor, beforeReplacement); }
  if (!output.includes(afterReplacement)) { if (!output.includes(afterAnchor)) throw new Error('Orchestration after-node anchor changed; refusing a fuzzy patch.'); output = output.replace(afterAnchor, afterReplacement); }
  return output;
}

if (require.main === module) {
  const raw = fs.readFileSync(target, 'utf8'); const crlf = raw.includes('\r\n'); const patched = applyOrchestrationHooks(raw.replace(/\r\n/g, '\n'));
  if (checkOnly) console.log(`Orchestration hooks are applicable to ${target}.`); else { fs.writeFileSync(target, crlf ? patched.replace(/\n/g, '\r\n') : patched); console.log(`Applied orchestration hooks to ${target}.`); }
}

module.exports = { applyOrchestrationHooks };
