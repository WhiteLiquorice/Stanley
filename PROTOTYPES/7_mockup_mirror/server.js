const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());

// Serve assets relatively
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Mock API Endpoints for Base44 app
app.get('/api/apps/6a45e76a80fe6c2e813d1a99/entities/User/me', (req, res) => {
  res.json({
    id: "user-1",
    email: "teacher@school.edu",
    name: "Teacher Mom"
  });
});

app.post('/api/app-logs/6a45e76a80fe6c2e813d1a99/log-user-in-app/:page', (req, res) => {
  res.json({ success: true });
});

app.get('/api/apps/6a45e76a80fe6c2e813d1a99/entities/Workflow', (req, res) => {
  res.json([
    {
      id: "wf-1",
      name: "Sync School Grades",
      title: "Sync School Grades",
      label: "Sync School Grades",
      workflowName: "Sync School Grades",
      workflow_name: "Sync School Grades",
      nodes: [],
      edges: [],
      created_date: "2026-07-02T00:00:00Z"
    }
  ]);
});

app.get('/api/apps/6a45e76a80fe6c2e813d1a99/entities/ExecutionLog', (req, res) => {
  res.json([]);
});

app.get('/api/apps/public/prod/public-settings/by-id/6a45e76a80fe6c2e813d1a99', (req, res) => {
  res.json({
    theme: "dark",
    appName: "FlowPilot"
  });
});

app.post('/api/apps/6a45e76a80fe6c2e813d1a99/analytics/track/batch', (req, res) => {
  res.json({ success: true });
});

// Fallback for all other requests (SPA router support)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = 5174;
app.listen(PORT, () => {
  console.log(`Mockup Mirror running on http://localhost:${PORT}`);
});
