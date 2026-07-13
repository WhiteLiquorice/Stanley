const fs = require('fs');
const path = require('path');

const checkOnly = process.argv.includes('--check');
const targetArg = process.argv.slice(2).find((arg) => arg !== '--check');
const target = targetArg || path.resolve(__dirname, '../../../stanley-cloud-run/branchingEngine.js');
const before = `      } catch (err) {
        // Step failed after all retries! Let's become agentic upon failure!
        onLog(\`\${label} failed: "\${err.message}". Initiating Agentic Recovery...\`);`;
const after = `      } catch (err) {
        if (opts.allowAgenticRecovery !== true) {
          onLog(\`\${label} failed: "\${err.message}". Recovery is constrained to the authored graph.\`);
          throw err;
        }
        // This workflow explicitly authorizes open-ended agentic recovery.
        onLog(\`\${label} failed: "\${err.message}". Initiating Agentic Recovery...\`);`;

const source = fs.readFileSync(target, 'utf8');
if (source.includes(after)) {
  console.log('Engine policy patch already applied.');
  process.exit(0);
}
if (!source.includes(before)) throw new Error('Engine recovery block changed; refusing to apply an unsafe fuzzy patch.');
if (checkOnly) {
  console.log(`Engine policy patch is applicable to ${target}`);
  process.exit(0);
}
fs.writeFileSync(target, source.replace(before, after));
console.log(`Applied constrained-recovery patch to ${target}`);
