const path = require('path');
const { spawn } = require('child_process');
const { redactText } = require('./redaction');

const INSPECTOR_PATH = path.resolve(__dirname, '../python/inspect_connector.py');

function pythonBinary() {
  return process.env.STANLEY_PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
}

function spawnJson({ args, input, timeoutMs = 10000, maxOutputBytes = 1_000_000, secrets = {} }) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBinary(), args, {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      env: { PATH: process.env.PATH || '', PYTHONPATH: '', PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1' },
    });
    let stdout = Buffer.alloc(0); let stderr = Buffer.alloc(0); let settled = false;
    const finish = (fn, value) => { if (!settled) { settled = true; clearTimeout(timer); fn(value); } };
    const timer = setTimeout(() => { child.kill(); finish(reject, Object.assign(new Error('Python process timed out.'), { code: 'PYTHON_TIMEOUT' })); }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout = Buffer.concat([stdout, chunk]);
      if (stdout.length > maxOutputBytes) { child.kill(); finish(reject, Object.assign(new Error('Python output exceeded limit.'), { code: 'OUTPUT_LIMIT' })); }
    });
    child.stderr.on('data', (chunk) => { if (stderr.length < 4096) stderr = Buffer.concat([stderr, chunk]).subarray(0, 4096); });
    child.on('error', (error) => finish(reject, Object.assign(new Error(`Python runtime unavailable: ${error.message}`), { code: 'PYTHON_UNAVAILABLE' })));
    child.on('close', (code) => {
      if (settled) return;
      if (code !== 0) return finish(reject, Object.assign(new Error(redactText(stderr.toString('utf8') || 'Python process failed.', secrets)), { code: 'PYTHON_FAILED' }));
      finish(resolve, stdout.toString('utf8'));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

async function inspectPythonSource(source, policy) {
  const output = await spawnJson({ args: [INSPECTOR_PATH, JSON.stringify(policy)], input: source, timeoutMs: 10000 });
  try { return JSON.parse(output); }
  catch { throw Object.assign(new Error('Python AST inspector returned invalid output.'), { code: 'INSPECTOR_INVALID_OUTPUT' }); }
}

module.exports = { INSPECTOR_PATH, inspectPythonSource, pythonBinary, spawnJson };
