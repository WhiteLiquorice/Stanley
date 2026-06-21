const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { runWorkflow } = require('./runner.js');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const WORKFLOWS_FILE = path.join(__dirname, 'workflows.json');
const VAULT_FILE = path.join(__dirname, 'vault.json');
const RUNS_FILE = path.join(__dirname, 'runs.json');

// Initialize database files if they don't exist
if (!fs.existsSync(WORKFLOWS_FILE)) {
  const defaultWorkflows = [
    {
      id: '1',
      name: 'Google Search Automation',
      nodes: [
        { id: '1', type: 'trigger', label: 'Start Trigger', data: { url: 'https://www.google.com' } },
        { id: '2', type: 'type', label: 'Enter Query', data: { selector: 'textarea[name="q"]', value: 'Project Stanley enterprise automation' } },
        { id: '3', type: 'click', label: 'Submit Search', data: { selector: 'input[name="btnK"]' } },
        { id: '4', type: 'wait', label: 'Wait for Results', data: { ms: '3000' } },
        { id: '5', type: 'scrape', label: 'Scrape Text', data: { selector: '#search' } }
      ],
      edges: [
        { source: '1', target: '2' },
        { source: '2', target: '3' },
        { source: '3', target: '4' },
        { source: '4', target: '5' }
      ]
    }
  ];
  fs.writeFileSync(WORKFLOWS_FILE, JSON.stringify(defaultWorkflows, null, 2));
}

if (!fs.existsSync(VAULT_FILE)) {
  const defaultSecrets = [
    { id: '1', name: 'Slack Token', value: 'xoxb-mock-token-12345', type: 'Bot Token', expires: 'Never', status: 'Active' },
    { id: '2', name: 'Google API Key', value: 'AIzaSyMockKey-xyz', type: 'API Key', expires: 'Never', status: 'Active' }
  ];
  fs.writeFileSync(VAULT_FILE, JSON.stringify(defaultSecrets, null, 2));
}

if (!fs.existsSync(RUNS_FILE)) {
  fs.writeFileSync(RUNS_FILE, JSON.stringify([], null, 2));
}

// In-memory active runs log storage
const activeRuns = {};

// Helper read/write functions
function readData(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function writeData(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// REST Endpoints - Workflows
app.get('/api/workflows', (req, res) => {
  res.json(readData(WORKFLOWS_FILE));
});

app.post('/api/workflows', (req, res) => {
  const workflows = readData(WORKFLOWS_FILE);
  const newWorkflow = req.body;
  if (!newWorkflow.id) {
    newWorkflow.id = Math.random().toString(36).substring(2, 9);
  }
  const index = workflows.findIndex(w => w.id === newWorkflow.id);
  if (index !== -1) {
    workflows[index] = newWorkflow;
  } else {
    workflows.push(newWorkflow);
  }
  writeData(WORKFLOWS_FILE, workflows);
  res.json(newWorkflow);
});

app.delete('/api/workflows/:id', (req, res) => {
  const workflows = readData(WORKFLOWS_FILE);
  const filtered = workflows.filter(w => w.id !== req.params.id);
  writeData(WORKFLOWS_FILE, filtered);
  res.json({ success: true });
});

// REST Endpoints - Credential Vault
app.get('/api/vault', (req, res) => {
  res.json(readData(VAULT_FILE));
});

app.post('/api/vault', (req, res) => {
  const secrets = readData(VAULT_FILE);
  const newSecret = req.body;
  if (!newSecret.id) {
    newSecret.id = Math.random().toString(36).substring(2, 9);
  }
  secrets.push(newSecret);
  writeData(VAULT_FILE, secrets);
  res.json(newSecret);
});

app.delete('/api/vault/:id', (req, res) => {
  const secrets = readData(VAULT_FILE);
  const filtered = secrets.filter(s => s.id !== req.params.id);
  writeData(VAULT_FILE, filtered);
  res.json({ success: true });
});

// REST Endpoints - Automation Execution
app.get('/api/runs', (req, res) => {
  res.json(readData(RUNS_FILE));
});

app.get('/api/runs/:id', (req, res) => {
  const runs = readData(RUNS_FILE);
  const run = runs.find(r => r.id === req.params.id);
  
  if (run) {
    // Merge live logs if it's currently running
    const active = activeRuns[req.params.id];
    if (active) {
      run.logs = active.logs;
      run.status = active.status;
    }
    res.json(run);
  } else {
    res.status(404).json({ error: 'Run not found' });
  }
});

app.post('/api/run/:id', async (req, res) => {
  const workflows = readData(WORKFLOWS_FILE);
  const workflow = workflows.find(w => w.id === req.params.id);
  
  if (!workflow) {
    return res.status(404).json({ error: 'Workflow not found' });
  }

  const runId = Math.random().toString(36).substring(2, 9);
  const runs = readData(RUNS_FILE);
  
  const newRun = {
    id: runId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: 'Running',
    trigger: 'Manual API',
    duration: '0s',
    timestamp: new Date().toLocaleString(),
    logs: []
  };

  runs.unshift(newRun); // add to top
  writeData(RUNS_FILE, runs);

  // Initialize live logs tracker
  activeRuns[runId] = {
    status: 'Running',
    logs: ['[System] Initializing run...'],
    startTime: Date.now()
  };

  // Run async so we don't block the HTTP request response
  runWorkflow(
    workflow,
    (logMsg) => {
      if (activeRuns[runId]) {
        activeRuns[runId].logs.push(logMsg);
      }
    },
    // Pass secrets to the runner
    readData(VAULT_FILE).reduce((acc, curr) => {
      acc[curr.id] = curr.value;
      return acc;
    }, {})
  ).then(() => {
    if (activeRuns[runId]) {
      activeRuns[runId].status = 'Success';
      activeRuns[runId].logs.push('[System] Run finished successfully!');
      
      // Update persistent database
      const currentRuns = readData(RUNS_FILE);
      const idx = currentRuns.findIndex(r => r.id === runId);
      if (idx !== -1) {
        currentRuns[idx].status = 'Success';
        currentRuns[idx].duration = `${Math.round((Date.now() - activeRuns[runId].startTime) / 1000)}s`;
        currentRuns[idx].logs = activeRuns[runId].logs;
        writeData(RUNS_FILE, currentRuns);
      }
    }
  }).catch((err) => {
    if (activeRuns[runId]) {
      activeRuns[runId].status = 'Failed';
      activeRuns[runId].logs.push(`[System] Execution failed: ${err.message}`);
      
      const currentRuns = readData(RUNS_FILE);
      const idx = currentRuns.findIndex(r => r.id === runId);
      if (idx !== -1) {
        currentRuns[idx].status = 'Failed';
        currentRuns[idx].duration = `${Math.round((Date.now() - activeRuns[runId].startTime) / 1000)}s`;
        currentRuns[idx].logs = activeRuns[runId].logs;
        writeData(RUNS_FILE, currentRuns);
      }
    }
  });

  res.json({ success: true, runId });
});

app.listen(PORT, () => {
  console.log(`[Server] Stanley Enterprise server listening on port ${PORT}`);
});
