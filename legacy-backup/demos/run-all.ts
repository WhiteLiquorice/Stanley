/**
 * Runs every numbered demo script in this folder (01-*.ts, 02-*.ts, …)
 * and renames each video output to match the script name, replacing any
 * previous recording for that demo.
 *
 *   npx ts-node demos/run-all.ts
 *
 * To run only specific demos, pass their numbers as args:
 *   npx ts-node demos/run-all.ts 1 3 5
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const DEMOS_DIR  = __dirname;
const ROOT       = path.join(DEMOS_DIR, '..');
const OUTPUT_DIR = path.join(DEMOS_DIR, 'output');

// --- helpers ----------------------------------------------------------------

function webmsNow(): Set<string> {
  if (!fs.existsSync(OUTPUT_DIR)) return new Set();
  return new Set(fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.webm')));
}

function newestOf(files: string[]): string {
  return files
    .map(f => ({ f, t: fs.statSync(path.join(OUTPUT_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0].f;
}

function hr() { console.log('─'.repeat(48)); }

// --- discover scripts -------------------------------------------------------

const filter = process.argv.slice(2); // e.g. ['1', '3']

let scripts = fs.readdirSync(DEMOS_DIR)
  .filter(f => /^\d{2}-.+\.ts$/.test(f))
  .sort();

if (filter.length > 0) {
  scripts = scripts.filter(f => filter.some(n => f.startsWith(n.padStart(2, '0') + '-')));
}

if (scripts.length === 0) {
  console.log('No matching demo scripts found.');
  process.exit(0);
}

hr();
console.log(`Stanley demo runner — ${scripts.length} script(s) queued\n`);
scripts.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
hr();
console.log('');

// --- run each script --------------------------------------------------------

let passed = 0;
let failed = 0;

for (const script of scripts) {
  const scriptPath = path.join(DEMOS_DIR, script);
  const scriptName = path.basename(script, '.ts');        // e.g. "01-morning-briefing"
  const targetPath = path.join(OUTPUT_DIR, `${scriptName}.webm`);

  console.log(`▶  ${script}`);

  const before = webmsNow();

  const result = spawnSync('npx', ['ts-node', scriptPath], {
    stdio: 'inherit',
    cwd: ROOT,
    shell: true
  });

  if (result.status !== 0) {
    console.error(`   ✗  exited with code ${result.status}\n`);
    failed++;
    continue;
  }

  // Find any new webm(s) that appeared during this run
  const after  = webmsNow();
  const newFiles = [...after].filter(f => !before.has(f));

  if (newFiles.length === 0) {
    console.warn('   ⚠  No video produced — script may have crashed before context.close()\n');
    failed++;
    continue;
  }

  // Keep only the newest; delete any extras (e.g. multiple pages recorded)
  const winner = newestOf(newFiles);
  newFiles.filter(f => f !== winner).forEach(f => {
    fs.unlinkSync(path.join(OUTPUT_DIR, f));
    console.log(`   🗑  Removed stale file: ${f}`);
  });

  // Replace previous recording for this demo if one exists
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
    console.log(`   ↻  Replaced previous: ${scriptName}.webm`);
  } else {
    console.log(`   ✓  Saved: ${scriptName}.webm`);
  }

  fs.renameSync(path.join(OUTPUT_DIR, winner), targetPath);
  passed++;
  console.log('');
}

// --- summary ----------------------------------------------------------------

hr();
console.log(`Finished: ${passed} succeeded, ${failed} failed`);
if (passed > 0) console.log(`Output:   ${OUTPUT_DIR}`);
hr();
