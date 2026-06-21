import { useState, useEffect } from 'react';
import { Play, Plus, Loader } from 'lucide-react';
import './Views.css';

interface Workflow {
  id: string;
  name: string;
  nodes: any[];
  edges: any[];
}

interface Run {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  trigger: string;
  duration: string;
  timestamp: string;
  logs?: string[];
}

export function Cockpit() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowUrl, setNewWorkflowUrl] = useState('https://www.google.com');

  // Logs modal state
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [pollingLogs, setPollingLogs] = useState(false);

  const API_URL = 'http://localhost:3001/api';

  useEffect(() => {
    fetchWorkflowsAndRuns();
  }, []);

  const fetchWorkflowsAndRuns = async () => {
    try {
      setLoading(true);
      const [wfRes, runsRes] = await Promise.all([
        fetch(`${API_URL}/workflows`),
        fetch(`${API_URL}/runs`)
      ]);
      const wfs = await wfRes.json();
      const runData = await runsRes.json();
      setWorkflows(wfs);
      setRuns(runData);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Poll active run
  useEffect(() => {
    let interval: number;
    if (activeRunId) {
      setPollingLogs(true);
      const poll = async () => {
        try {
          const res = await fetch(`${API_URL}/runs/${activeRunId}`);
          const data = await res.json();
          setActiveRun(data);
          if (data.status !== 'Running') {
            setPollingLogs(false);
            // Refresh list
            const runsRes = await fetch(`${API_URL}/runs`);
            setRuns(await runsRes.json());
          }
        } catch (err) {
          console.error(err);
          setPollingLogs(false);
        }
      };
      
      poll(); // initial check
      interval = window.setInterval(poll, 1500);
    }
    return () => clearInterval(interval);
  }, [activeRunId]);

  const handleCreateWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkflowName.trim()) return;

    const newWf: Workflow = {
      id: Math.random().toString(36).substring(2, 9),
      name: newWorkflowName,
      nodes: [
        { id: '1', type: 'trigger', label: 'Start Trigger', data: { url: newWorkflowUrl } }
      ],
      edges: []
    };

    try {
      const res = await fetch(`${API_URL}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWf)
      });
      if (res.ok) {
        setWorkflows([...workflows, newWf]);
        setShowCreateModal(false);
        setNewWorkflowName('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRunWorkflow = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/run/${id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setActiveRunId(data.runId);
        setActiveRun({
          id: data.runId,
          workflowId: id,
          workflowName: workflows.find(w => w.id === id)?.name || 'Workflow',
          status: 'Running',
          trigger: 'Manual API',
          duration: '0s',
          timestamp: new Date().toLocaleString(),
          logs: ['[System] Connecting to browser...']
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const viewLogs = async (run: Run) => {
    try {
      const res = await fetch(`${API_URL}/runs/${run.id}`);
      const data = await res.json();
      setActiveRun(data);
      setActiveRunId(null); // disable active polling
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h1>Automation Cockpit</h1>
          <p>Monitor and manage your enterprise workflows.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          <Plus size={16} /> New Automation
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card glass-panel">
          <div className="stat-title">Total Automations</div>
          <div className="stat-value">{workflows.length}</div>
          <div className="stat-trend text-accent-green">Ready to execute</div>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-title">Success Rate</div>
          <div className="stat-value">
            {runs.length > 0 
              ? `${((runs.filter(r => r.status === 'Success').length / runs.length) * 100).toFixed(1)}%` 
              : '100%'}
          </div>
          <div className="stat-trend text-accent-green">Optimal</div>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-title">Total Executions</div>
          <div className="stat-value">{runs.length}</div>
          <div className="stat-trend text-text-tertiary">Run history count</div>
        </div>
      </div>

      <div className="cockpit-sections">
        {/* Workflows List */}
        <div className="data-table-container glass-panel">
          <div className="table-header">
            <h3>Available Workflows</h3>
          </div>
          {loading ? (
            <div className="loading-state"><Loader className="spinner"/> Loading workflows...</div>
          ) : workflows.length === 0 ? (
            <div className="empty-state">No workflows found. Create one to get started!</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Workflow Name</th>
                  <th>Steps</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {workflows.map((w) => (
                  <tr key={w.id}>
                    <td className="font-medium">{w.name}</td>
                    <td>{w.nodes.length} nodes</td>
                    <td>
                      <div className="action-buttons">
                        <button className="btn btn-primary btn-sm" onClick={() => handleRunWorkflow(w.id)}>
                          <Play size={14} /> Run
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Runs List */}
        <div className="data-table-container glass-panel" style={{ marginTop: '2rem' }}>
          <div className="table-header">
            <h3>Execution Logs & History</h3>
          </div>
          {loading ? (
            <div className="loading-state"><Loader className="spinner"/> Loading logs...</div>
          ) : runs.length === 0 ? (
            <div className="empty-state">No run history found. Run a workflow to see results!</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Workflow</th>
                  <th>Status</th>
                  <th>Time</th>
                  <th>Duration</th>
                  <th>Logs</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.workflowName}</td>
                    <td>
                      <span className={`badge badge-${r.status.toLowerCase()}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>{r.timestamp}</td>
                    <td>{r.duration}</td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => viewLogs(r)}>
                        View Logs
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create Workflow Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <h2>Create Workflow</h2>
            <form onSubmit={handleCreateWorkflow}>
              <div className="form-group">
                <label>Workflow Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={newWorkflowName} 
                  onChange={(e) => setNewWorkflowName(e.target.value)} 
                  placeholder="e.g. Google Search scraper" 
                  required
                />
              </div>
              <div className="form-group">
                <label>Initial Trigger URL</label>
                <input 
                  type="url" 
                  className="form-input" 
                  value={newWorkflowUrl} 
                  onChange={(e) => setNewWorkflowUrl(e.target.value)} 
                  placeholder="https://example.com" 
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Logs Details Modal */}
      {activeRun && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel logs-modal">
            <div className="modal-header">
              <h2>Execution Logs: {activeRun.workflowName}</h2>
              <span className={`badge badge-${activeRun.status.toLowerCase()}`}>
                {activeRun.status}
              </span>
            </div>
            
            <div className="log-output-box">
              {activeRun.logs && activeRun.logs.map((log, index) => (
                <div key={index} className="log-line">
                  {log}
                </div>
              ))}
              {pollingLogs && (
                <div className="log-line active-polling">
                  <Loader className="spinner inline"/> Running... (polling logs)
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setActiveRun(null)}>
                Close Logs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
