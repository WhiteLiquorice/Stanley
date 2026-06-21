const { spawn } = require('child_process');
const http = require('http');

const PORT = 3002; // Use a different port for testing to avoid conflicts
let serverProcess;

function startServer() {
  return new Promise((resolve, reject) => {
    console.log('[E2E Test] Starting backend server on port ' + PORT + '...');
    serverProcess = spawn('node', ['server.js'], {
      env: { ...process.env, PORT: PORT },
      stdio: 'pipe'
    });

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('server listening on port')) {
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('[Server Error] ' + data.toString().trim());
    });

    serverProcess.on('error', (err) => {
      reject(err);
    });
  });
}

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            body: data
          });
        }
      });
    });

    req.on('error', (err) => { reject(err); });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  try {
    await startServer();
    console.log('✓ Server started successfully.');

    // 1. Test Workflows CRUD
    console.log('\n[E2E Test] Testing Workflows API...');
    const wfRes = await request('GET', '/api/workflows');
    if (wfRes.statusCode !== 200) throw new Error('Failed to get workflows');
    console.log('✓ GET /api/workflows returned ' + wfRes.body.length + ' item(s)');

    const testWf = {
      id: 'test-wf-999',
      name: 'E2E Test Scraper',
      nodes: [
        { id: '1', type: 'trigger', label: 'Start', data: { url: 'https://example.com' } },
        { id: '2', type: 'wait', label: 'Wait', data: { ms: '1000' } },
        { id: '3', type: 'scrape', label: 'Scrape', data: { selector: 'h1' } }
      ],
      edges: [
        { source: '1', target: '2' },
        { source: '2', target: '3' }
      ]
    };

    const createWfRes = await request('POST', '/api/workflows', testWf);
    if (createWfRes.statusCode !== 200 || createWfRes.body.id !== 'test-wf-999') {
      throw new Error('Failed to create workflow');
    }
    console.log('✓ POST /api/workflows created workflow successfully.');

    // 2. Test Vault API
    console.log('\n[E2E Test] Testing Credential Vault API...');
    const vaultRes = await request('GET', '/api/vault');
    if (vaultRes.statusCode !== 200) throw new Error('Failed to get vault secrets');
    console.log('✓ GET /api/vault returned ' + vaultRes.body.length + ' item(s)');

    const testSecret = {
      id: 'test-secret-123',
      name: 'Test Credentials',
      value: 'supersecretpassword123',
      type: 'Password',
      expires: 'Never',
      status: 'Active'
    };

    const createSecretRes = await request('POST', '/api/vault', testSecret);
    if (createSecretRes.statusCode !== 200 || createSecretRes.body.id !== 'test-secret-123') {
      throw new Error('Failed to save secret in vault');
    }
    console.log('✓ POST /api/vault saved secret successfully.');

    // 3. Test Runner execution
    console.log('\n[E2E Test] Testing Workflow Runner execution...');
    const runRes = await request('POST', `/api/run/${testWf.id}`);
    if (runRes.statusCode !== 200 || !runRes.body.success) {
      throw new Error('Failed to trigger workflow run');
    }
    const runId = runRes.body.runId;
    console.log('✓ Workflow execution triggered. Run ID: ' + runId);

    // Poll logs until status is no longer "Running"
    console.log('[E2E Test] Polling execution status...');
    let attempts = 0;
    let finished = false;
    let finalRun = null;

    while (attempts < 20 && !finished) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await request('GET', `/api/runs/${runId}`);
      if (statusRes.statusCode !== 200) throw new Error('Failed to fetch run status');
      
      finalRun = statusRes.body;
      console.log(`  [Status] ${finalRun.status} (${finalRun.logs.length} logs received)`);
      
      if (finalRun.status !== 'Running') {
        finished = true;
      }
      attempts++;
    }

    if (!finished || finalRun.status !== 'Success') {
      console.log('Logs on failure:', finalRun ? finalRun.logs : 'No logs');
      throw new Error('Workflow execution failed or timed out. Final Status: ' + (finalRun ? finalRun.status : 'Unknown'));
    }

    console.log('✓ Workflow executed successfully.');
    console.log('✓ Verification log trace:');
    finalRun.logs.forEach(l => console.log('    ' + l));

    // Cleanup test data
    console.log('\n[E2E Test] Cleaning up test data...');
    await request('DELETE', `/api/workflows/${testWf.id}`);
    await request('DELETE', `/api/vault/${testSecret.id}`);
    console.log('✓ Test data cleaned up.');

    console.log('\n=====================================');
    console.log('ALL E2E TESTS PASSED SUCCESSFULLY! (100%)');
    console.log('=====================================');
    cleanup(0);

  } catch (err) {
    console.error('\n✗ E2E TEST FAILED:');
    console.error(err);
    cleanup(1);
  }
}

function cleanup(exitCode) {
  if (serverProcess) {
    console.log('[E2E Test] Stopping backend server...');
    serverProcess.kill();
  }
  process.exit(exitCode);
}

runTests();
