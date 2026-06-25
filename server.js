const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
// Use the branching-aware runner so the web "Test Run" honors the same engine the
// visual Editor builds against (conditional edges, if/goto/label, ai_prompt, js_code,
// stable multi-tab ids). The original linear ./runner.js only followed the first edge.
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
      name: 'Google Search Automation (Basic)',
      nodes: [
        { id: '1', type: 'trigger', label: 'Start Trigger', data: { url: 'https://www.google.com' }, position: { x: 250, y: 50 } },
        { id: '2', type: 'type', label: 'Enter Query', data: { selector: 'textarea[name="q"]', value: 'Project Stanley enterprise automation' }, position: { x: 250, y: 150 } },
        { id: '3', type: 'click', label: 'Submit Search', data: { selector: 'input[name="btnK"]:visible' }, position: { x: 250, y: 250 } },
        { id: '4', type: 'wait', label: 'Wait for Results', data: { ms: '3000' }, position: { x: 250, y: 350 } },
        { id: '5', type: 'scrape', label: 'Scrape Text', data: { selector: '#search' }, position: { x: 250, y: 450 } }
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
} else {
  // Migrate existing workflows to use input[name="btnK"]:visible
  try {
    const workflows = JSON.parse(fs.readFileSync(WORKFLOWS_FILE, 'utf-8'));
    let migrated = false;
    workflows.forEach(wf => {
      if (wf.nodes) {
        wf.nodes.forEach(node => {
          if (node.data && node.data.selector === 'input[name="btnK"]') {
            node.data.selector = 'input[name="btnK"]:visible';
            migrated = true;
          }
        });
      }
    });
    if (migrated) {
      fs.writeFileSync(WORKFLOWS_FILE, JSON.stringify(workflows, null, 2));
      console.log('[Server] Migrated workflows.json input[name="btnK"] selector to input[name="btnK"]:visible');
    }
  } catch (e) {
    console.error('[Server] Failed to migrate existing workflows:', e);
  }
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

app.post('/api/runs', (req, res) => {
  const runs = readData(RUNS_FILE);
  const run = req.body;
  const idx = runs.findIndex(r => r.id === run.id);
  if (idx !== -1) {
    runs[idx] = run;
  } else {
    runs.unshift(run);
  }
  writeData(RUNS_FILE, runs);
  res.json(run);
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

  // Clone workflow to prevent modifying persistent DB in memory
  const workflowCopy = JSON.parse(JSON.stringify(workflow));
  if (req.body && req.body.startUrl) {
    const triggerNode = workflowCopy.nodes.find(n => n.type === 'trigger');
    if (triggerNode && triggerNode.data) {
      triggerNode.data.url = req.body.startUrl;
    }
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
    workflowCopy,
    (logMsg) => {
      if (activeRuns[runId]) {
        activeRuns[runId].logs.push(logMsg);
      }
    },
    // Pass secrets to the runner, keyed by BOTH id and name so workflows can
    // reference a secret either way (e.g. "vault:Email" or "vault:1").
    readData(VAULT_FILE).reduce((acc, curr) => {
      if (curr.id) acc[curr.id] = curr.value;
      if (curr.name) acc[curr.name] = curr.value;
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

// REST Endpoints - Workflow Recorder ("record once, replay")
const recorder = require('./stanley-daemon/recorder.js');

app.post('/api/record/start', async (req, res) => {
  try {
    const recordingId = await recorder.startRecording(req.body && req.body.url);
    res.json({ success: true, recordingId });
  } catch (err) {
    res.status(500).json({ error: `Failed to start recording: ${err.message}` });
  }
});

app.post('/api/record/stop', async (req, res) => {
  const { recordingId, name, save } = req.body || {};
  if (!recordingId) return res.status(400).json({ error: 'recordingId is required.' });
  try {
    const workflow = await recorder.stopRecording(recordingId, name);
    if (save) {
      const workflows = readData(WORKFLOWS_FILE);
      workflows.push(workflow);
      writeData(WORKFLOWS_FILE, workflows);
    }
    res.json({ success: true, workflow });
  } catch (err) {
    res.status(500).json({ error: `Failed to stop recording: ${err.message}` });
  }
});

app.post('/api/record/cancel', async (req, res) => {
  const { recordingId } = req.body || {};
  try {
    await recorder.cancelRecording(recordingId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: `Failed to cancel recording: ${err.message}` });
  }
});

// REST Endpoints - AI Chat Copilot
app.post('/api/ai/chat', async (req, res) => {
  const { message, workflow, history } = req.body;
  
  // 1. Get API Keys from environment or vault.json
  let apiKey = process.env.GEMINI_API_KEY;
  let lmStudioKey = null;
  const secrets = readData(VAULT_FILE);
  
  const googleSecret = secrets.find(s => s.name === 'Google API Key' || s.id === '2');
  if (googleSecret && googleSecret.value && !googleSecret.value.startsWith('AIzaSyMockKey')) {
    apiKey = googleSecret.value;
  }
  
  const lmSecret = secrets.find(s => s.name?.toLowerCase().replace(/\s+/g, '').includes('lmstudio'));
  if (lmSecret && lmSecret.value) {
    lmStudioKey = lmSecret.value;
  }
  
  if (!apiKey && !lmStudioKey) {
    return res.status(400).json({ 
      error: 'Google Gemini API Key or LM Studio Key is missing. Please add a valid API key in your Credential Vault first.' 
    });
  }

  // 2. Call AI
  try {
    const systemInstruction = `You are "Stanley", the AI Copilot for Project Stanley, an enterprise browser automation suite.
Your goal is to help the user build, edit, and understand their low-code browser automation workflows.
You must respond in strict JSON matching this schema:
{
  "message": "A conversational explanation of what you did or how you answered.",
  "actions": [
    // Array of actions to apply to the current workflow
  ]
}

The current workflow is provided in the prompt as a JSON object with:
- name: string
- nodes: Array of { id, type, label, data: { ... }, position: { x, y } }
- edges: Array of { source, target, condition: ... }

Supported Node Types:
- 'trigger': Start step, takes "url" in data.
- 'navigate': Go to a URL, takes "url" in data.
- 'click': Click an element, takes "description" and optionally "selector" in data.
- 'type': Type text into an input, takes "description", "value" (can be "vault:SecretName" for vault items), and optionally "selector" in data.
- 'wait': Wait for some milliseconds, takes "ms" (string) in data.
- 'scrape': Extract text from a selector, takes "selector" in data.
- 'open_tab': Open a new browser tab, takes "url" and "label" in data.
- 'switch_tab': Switch active tab, takes "tab" or "index" in data.
- 'close_tab': Close tab, takes "tab" or "index" in data.
- 'if': Decision node for branching, takes "condition" object in data: { type: "always"|"contains"|"notContains"|"exists"|"notExists", value: string }
- 'goto': Jump to a labeled step, takes "label" in data.
- 'label': Step label target for goto, takes "label" in data.
- 'ai_prompt': Run AI analysis via Gemini, takes "prompt" and "system" (optional) in data.
- 'js_code': Execute custom javascript block, takes "code" in data.

Supported Actions in your response:
1. {"type": "add_node", "node": { "id": "unique_string", "type": "node_type", "label": "Label", "data": { ... }, "position": { "x": number, "y": number } }}
2. {"type": "delete_node", "nodeId": "node_id_to_delete"}
3. {"type": "update_node", "nodeId": "node_id_to_update", "nodeUpdates": { "label": "New Label", "data": { ... } }}
4. {"type": "add_edge", "edge": { "source": "source_id", "target": "target_id", "condition": ... }}
5. {"type": "delete_edge", "source": "source_id", "target": "target_id"}
6. {"type": "set_workflow", "workflow": { "name": "New Name", "nodes": [...], "edges": [...] }}

Rules:
- Keep the graph clean. When adding nodes, calculate a logical position (e.g. down the y-axis, spacing nodes by 140px).
- Connect nodes using "add_edge" so the workflow has a logical flow.
- If the user asks a general question, explain it clearly in "message" and leave "actions" empty.
- Always output valid, parseable JSON. Do not include markdown code block formatting (like \`\`\`json) in your raw response body, just output the raw JSON string.`;

    const currentContext = `Current Workflow State: ${JSON.stringify(workflow || null)}\n\nUser Request: ${message}`;
    let resultText = '{}';

    if (lmStudioKey) {
      // Call LM Studio OpenAI-compatible completions
      const messages = [
        { role: 'system', content: systemInstruction }
      ];
      if (history && Array.isArray(history)) {
        history.forEach(h => {
          messages.push({
            role: h.role === 'user' ? 'user' : 'assistant',
            content: h.content
          });
        });
      }
      messages.push({ role: 'user', content: currentContext });

      const lmUrl = 'http://localhost:1234/v1/chat/completions';
      const lmResponse = await fetch(lmUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(lmStudioKey !== 'lm-studio' && lmStudioKey !== 'local' ? { 'Authorization': `Bearer ${lmStudioKey}` } : {})
        },
        body: JSON.stringify({
          model: 'local-model',
          messages,
          temperature: 0.2
        })
      });

      if (!lmResponse.ok) {
        const errText = await lmResponse.text();
        return res.status(500).json({ error: `LM Studio API error: ${errText}` });
      }

      const data = await lmResponse.json();
      resultText = data.choices?.[0]?.message?.content || '{}';
    } else {
      // Call Gemini
      const contents = [];
      if (history && Array.isArray(history)) {
        history.forEach(h => {
          contents.push({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.content }]
          });
        });
      }
      contents.push({
        role: 'user',
        parts: [{ text: currentContext }]
      });

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: contents,
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(500).json({ error: `Gemini API error: ${errText}` });
      }

      const data = await response.json();
      resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    }

    res.json(JSON.parse(resultText));
  } catch (err) {
    res.status(500).json({ error: `Failed to call AI Chat: ${err.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`[Server] Stanley Enterprise server listening on port ${PORT}`);
});
