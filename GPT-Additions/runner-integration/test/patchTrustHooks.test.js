const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTrustHooks } = require('../scripts/patchTrustHooks');

const fixture = `async function executeGraph(opts, effectiveNode, ctx, scraped, agent, onBlocked, onLog, label) {
    const goal = effectiveNode.data?.description || ctx.missionPrompt || \`Locate and perform action on the page.\`;
    try {
      return goal;
    } catch (err) {
        if (opts.allowAgenticRecovery !== true) {
          onLog(\`\${label} failed: "\${err.message}". Recovery is constrained to the authored graph.\`);
          throw err;
        }
    }
    if (onBlocked && typeof agent.isPageBlocked === 'function') {
      await onBlocked();
    }
}`;

test('adds each Trust Engine hook exactly once', () => {
  const once = applyTrustHooks(fixture);
  const twice = applyTrustHooks(once);
  assert.equal(once, twice);
  assert.match(once, /trust\.beforeNode/);
  assert.match(once, /trust\.afterNode/);
  assert.match(once, /trust\.nodeFailed/);
  assert.doesNotThrow(() => new Function(once));
});
