const fs = require('fs');
const path = require('path');

const targetArg = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
const target = targetArg || path.resolve(__dirname, '../../../stanley-cloud-run/branchingEngine.js');
const checkOnly = process.argv.includes('--check');

const beforeNodeAnchor = `    const goal = effectiveNode.data?.description || ctx.missionPrompt || \`Locate and perform action on the page.\`;`;
const beforeNodeReplacement = `    if (opts.trust && typeof opts.trust.beforeNode === 'function') {
      await opts.trust.beforeNode(effectiveNode, ctx);
    }

${beforeNodeAnchor}`;

const recoveryBefore = `        if (opts.allowAgenticRecovery !== true) {
          onLog(\`\${label} failed: "\${err.message}". Recovery is constrained to the authored graph.\`);
          throw err;
        }`;
const recoveryAfter = `        if (opts.allowAgenticRecovery !== true) {
          onLog(\`\${label} failed: "\${err.message}". Recovery is constrained to the authored graph.\`);
          if (opts.trust && typeof opts.trust.nodeFailed === 'function') {
            await opts.trust.nodeFailed(effectiveNode, err, ctx);
          }
          throw err;
        }`;

const afterNodeAnchor = `    if (onBlocked && typeof agent.isPageBlocked === 'function') {`;
const afterNodeReplacement = `    if (opts.trust) {
      if (ctx.lastError && typeof opts.trust.nodeFailed === 'function') {
        await opts.trust.nodeFailed(effectiveNode, ctx.lastError, ctx);
      } else if (typeof opts.trust.afterNode === 'function') {
        await opts.trust.afterNode(effectiveNode, scraped[effectiveNode.id], ctx);
      }
    }

${afterNodeAnchor}`;

const rawSource = fs.readFileSync(target, 'utf8');
const usesCrlf = rawSource.includes('\r\n');
let source = rawSource.replace(/\r\n/g, '\n');

function applyTrustHooks(input) {
  let output = input;
  if (!output.includes(beforeNodeReplacement)) {
    if (!output.includes(beforeNodeAnchor)) throw new Error('Trust before-node anchor changed; refusing a fuzzy patch.');
    output = output.replace(beforeNodeAnchor, beforeNodeReplacement);
  }
  if (!output.includes(recoveryAfter)) {
    if (!output.includes(recoveryBefore)) throw new Error('Apply the constrained-recovery policy patch before Trust hooks.');
    output = output.replace(recoveryBefore, recoveryAfter);
  }
  if (!output.includes(afterNodeReplacement)) {
    if (!output.includes(afterNodeAnchor)) throw new Error('Trust after-node anchor changed; refusing a fuzzy patch.');
    output = output.replace(afterNodeAnchor, afterNodeReplacement);
  }
  return output;
}

if (require.main === module) {
  if (checkOnly && !source.includes(recoveryBefore) && !source.includes(recoveryAfter)) {
    const unpatchedRecovery = `      } catch (err) {
        // Step failed after all retries! Let's become agentic upon failure!
        onLog(\`\${label} failed: "\${err.message}". Initiating Agentic Recovery...\`);`;
    const policyRecovery = `      } catch (err) {
        if (opts.allowAgenticRecovery !== true) {
          onLog(\`\${label} failed: "\${err.message}". Recovery is constrained to the authored graph.\`);
          throw err;
        }
        // This workflow explicitly authorizes open-ended agentic recovery.
        onLog(\`\${label} failed: "\${err.message}". Initiating Agentic Recovery...\`);`;
    if (!source.includes(unpatchedRecovery)) throw new Error('Recovery block changed; Trust hooks cannot be checked safely.');
    source = source.replace(unpatchedRecovery, policyRecovery);
  }
  const patched = applyTrustHooks(source);
  if (checkOnly) {
    console.log(`Trust hooks are applicable to ${target} after the recovery-policy patch.`);
  } else {
    fs.writeFileSync(target, usesCrlf ? patched.replace(/\n/g, '\r\n') : patched);
    console.log(`Applied Trust Engine hooks to ${target}.`);
  }
}

module.exports = { applyTrustHooks };
