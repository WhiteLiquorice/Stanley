import React, { useState, useEffect, useRef } from 'react';
import './App.css';

interface ConsoleLogEntry {
  type: string;
  text: string;
  timestamp: string;
}

interface StepRecord {
  timestamp: string;
  thought: string;
  actionType: string;
  payload: string;
  executionResult?: string;
  executionError?: string;
}

const BACKEND_URL = 'http://localhost:3001';

export default function App() {
  const [startUrl, setStartUrl] = useState('https://www.google.com');
  const [isInitialized, setIsInitialized] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [goal, setGoal] = useState('');
  const [steps, setSteps] = useState<StepRecord[]>([]);
  const [logs, setLogs] = useState<ConsoleLogEntry[]>([]);
  const [manualCode, setManualCode] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState<string | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const stepsEndRef = useRef<HTMLDivElement>(null);

  // Poll for logs and screenshot when initialized
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isInitialized) {
      interval = setInterval(() => {
        refreshScreenshot();
        refreshLogs();
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isInitialized]);

  // Scroll to bottom of logs/steps on update
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  const apiRequest = async (path: string, method = 'GET', body?: object) => {
    try {
      const options: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (body) {
        options.body = JSON.stringify(body);
      }
      const res = await fetch(`${BACKEND_URL}${path}`, options);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP error ${res.status}`);
      }
      return data;
    } catch (err) {
      const e = err as Error;
      setError(e.message);
      throw e;
    }
  };

  const handleInitialize = async () => {
    setError(null);
    setStatusMsg('Launching Chromium Browser...');
    try {
      await apiRequest('/api/initialize', 'POST', { startUrl });
      setIsInitialized(true);
      setStatusMsg('Browser active. Capturing viewport...');
      await refreshScreenshot();
      await refreshLogs();
    } catch {
      setStatusMsg('Failed to initialize.');
    }
  };

  const handleCleanup = async () => {
    setError(null);
    setStatusMsg('Stopping browser session...');
    try {
      await apiRequest('/api/cleanup', 'POST');
      setIsInitialized(false);
      setScreenshot(null);
      setLogs([]);
      setSteps([]);
      setStatusMsg('Browser closed.');
    } catch {
      setStatusMsg('Error during cleanup.');
    }
  };

  const refreshScreenshot = async () => {
    try {
      const data = await apiRequest('/api/screenshot');
      if (data.screenshot) {
        setScreenshot(data.screenshot);
      }
    } catch (err) {
      console.error("Failed to fetch screenshot:", err);
    }
  };

  const refreshLogs = async () => {
    try {
      const data = await apiRequest('/api/logs');
      if (data.logs) {
        setLogs(data.logs);
      }
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    }
  };

  const handleClearLogs = async () => {
    try {
      await apiRequest('/api/logs/clear', 'POST');
      setLogs([]);
    } catch (err) {
      console.error("Failed to clear logs:", err);
    }
  };

  const handleExecuteManualCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim() || !isInitialized) return;
    setError(null);
    setStatusMsg('Executing console command...');
    try {
      const data = await apiRequest('/api/console', 'POST', { jsCode: manualCode });
      if (data.success) {
        setStatusMsg('Console command completed.');
        if (data.logs) setLogs(data.logs);
        setManualCode('');
      } else {
        setError(data.error || 'Execution returned an error.');
      }
      await refreshScreenshot();
    } catch (err) {
      console.error("Execution failed:", err);
    }
  };

  const handleRunAgentStep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim() || !isInitialized || isThinking) return;

    setIsThinking(true);
    setError(null);
    setStatusMsg('Stanley is analyzing the viewport...');

    try {
      const data = await apiRequest('/api/step', 'POST', { goal });
      if (data.success) {
        const newStep: StepRecord = {
          timestamp: new Date().toLocaleTimeString(),
          thought: data.thought,
          actionType: data.actionType,
          payload: data.payload,
          executionResult: data.executionResult,
          executionError: data.executionError,
        };
        setSteps(prev => [...prev, newStep]);
        if (data.logs) setLogs(data.logs);
        if (data.screenshot) setScreenshot(data.screenshot);
        
        if (data.actionType === 'finish') {
          setStatusMsg('Goal achieved! Automation finished.');
        } else {
          setStatusMsg(`Executed action: ${data.actionType}.`);
        }
      } else {
        setError(data.error || 'Agent execution step failed.');
      }
    } catch (err) {
      console.error("Agent step failed:", err);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className="stanley-container">
      {/* Top Header */}
      <header className="stanley-header">
        <div className="header-brand">
          <div className="glow-dot"></div>
          <h1>STANLEY</h1>
          <span className="brand-badge">Visual Web Agent</span>
        </div>
        <div className="status-display">
          {statusMsg && <span className="status-text">{statusMsg}</span>}
          {error && <span className="error-text">Error: {error}</span>}
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="stanley-workspace">
        
        {/* Left Control Panel / Browser Simulator */}
        <section className="workspace-left">
          <div className="panel-card setup-card">
            <h2>Browser Management</h2>
            <div className="form-group inline-group">
              <input 
                type="text" 
                value={startUrl} 
                onChange={(e) => setStartUrl(e.target.value)}
                placeholder="Target URL..." 
                disabled={isInitialized}
              />
              {!isInitialized ? (
                <button className="btn btn-primary" onClick={handleInitialize}>
                  Initialize Session
                </button>
              ) : (
                <button className="btn btn-danger" onClick={handleCleanup}>
                  Close Session
                </button>
              )}
            </div>
          </div>

          <div className="panel-card viewport-card">
            <div className="panel-card-header">
              <h2>Viewport Simulator</h2>
              {isInitialized && (
                <button className="btn btn-icon" onClick={refreshScreenshot} title="Reload Viewport">
                  🔄
                </button>
              )}
            </div>
            <div className="viewport-screen">
              {screenshot ? (
                <img src={screenshot} alt="Page Viewport" className="screenshot-img" />
              ) : (
                <div className="viewport-placeholder">
                  <span className="placeholder-icon">🖥️</span>
                  <p>{isInitialized ? 'Capturing browser window...' : 'Initialize session to start visual tracking'}</p>
                </div>
              )}
            </div>
          </div>

          <div className="panel-card manual-console-card">
            <h2>Invisible Console Override (DevTools)</h2>
            <form onSubmit={handleExecuteManualCode} className="form-group inline-group">
              <input 
                type="text" 
                value={manualCode} 
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="document.querySelector('input').click();" 
                disabled={!isInitialized}
              />
              <button type="submit" className="btn btn-secondary" disabled={!isInitialized || !manualCode.trim()}>
                Run JS
              </button>
            </form>
          </div>
        </section>

        {/* Right Automation Panel / Console Logs */}
        <section className="workspace-right">
          
          {/* Chat Controller */}
          <div className="panel-card chat-card">
            <h2>Automation Controller</h2>
            <form onSubmit={handleRunAgentStep} className="form-group inline-group">
              <input 
                type="text" 
                value={goal} 
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Explain the workflow you want Stanley to complete..." 
                disabled={!isInitialized || isThinking}
              />
              <button type="submit" className="btn btn-gradient" disabled={!isInitialized || isThinking || !goal.trim()}>
                {isThinking ? 'Analyzing...' : 'Instruct Agent'}
              </button>
            </form>

            <div className="steps-container">
              <h3>Agent Thoughts & Action Timeline</h3>
              <div className="steps-log">
                {steps.length === 0 ? (
                  <p className="no-data-msg">No actions executed yet. Enter a goal above to direct Stanley.</p>
                ) : (
                  steps.map((s, idx) => (
                    <div key={idx} className="step-bubble">
                      <div className="step-bubble-header">
                        <span className="step-time">{s.timestamp}</span>
                        <span className={`action-badge ${s.actionType}`}>{s.actionType.toUpperCase()}</span>
                      </div>
                      <p className="step-thought"><strong>Thought:</strong> {s.thought}</p>
                      <div className="step-details">
                        {s.payload && (
                          <div className="step-detail-row">
                            <span className="label">Payload:</span>
                            <code>{s.payload}</code>
                          </div>
                        )}
                        {s.executionResult && (
                          <div className="step-detail-row">
                            <span className="label text-success">Result:</span>
                            <code>{s.executionResult}</code>
                          </div>
                        )}
                        {s.executionError && (
                          <div className="step-detail-row">
                            <span className="label text-danger">Error:</span>
                            <code>{s.executionError}</code>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
                <div ref={stepsEndRef} />
              </div>
            </div>
          </div>

          {/* Console Output */}
          <div className="panel-card console-card">
            <div className="panel-card-header">
              <h2>Page DevTools Console (Invisible Log)</h2>
              {isInitialized && logs.length > 0 && (
                <button className="btn btn-icon" onClick={handleClearLogs} title="Clear Console">
                  🗑️
                </button>
              )}
            </div>
            <div className="console-terminal">
              {logs.length === 0 ? (
                <p className="no-data-msg">Terminal is clear. Intercepted logs will display here.</p>
              ) : (
                logs.map((l, idx) => (
                  <div key={idx} className={`console-row ${l.type}`}>
                    <span className="log-time">[{l.timestamp.split('T')[1].slice(0, 8)}]</span>
                    <span className="log-type">[{l.type.toUpperCase()}]</span>
                    <span className="log-text">{l.text}</span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>

        </section>

      </div>
    </div>
  );
}
