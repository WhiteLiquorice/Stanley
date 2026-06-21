import { useState, useEffect } from 'react';
import { Save, Play, ChevronRight, Type, Globe, Database, Clock, Plus, Loader, Trash2 } from 'lucide-react';
import './Views.css';

interface Node {
  id: string;
  type: string;
  label: string;
  data?: {
    url?: string;
    selector?: string;
    value?: string;
    ms?: string;
  };
}

interface Edge {
  source: string;
  target: string;
}

interface Workflow {
  id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
}

export function Editor() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWfId, setSelectedWfId] = useState<string>('');
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);


  // Run logs state
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [runId, setRunId] = useState<string | null>(null);

  const API_URL = 'http://localhost:3001/api';

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const fetchWorkflows = async () => {
    try {
      const res = await fetch(`${API_URL}/workflows`);
      const data = await res.json();
      setWorkflows(data);
      if (data.length > 0) {
        setSelectedWfId(data[0].id);
        setSelectedWorkflow(data[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectWorkflow = (wfId: string) => {
    setSelectedWfId(wfId);
    const wf = workflows.find(w => w.id === wfId) || null;
    setSelectedWorkflow(wf);
    setSelectedNodeId(null);
  };

  // Poll logs for active run in Editor
  useEffect(() => {
    let interval: number;
    if (runId) {
      const poll = async () => {
        try {
          const res = await fetch(`${API_URL}/runs/${runId}`);
          const data = await res.json();
          setLogs(data.logs || []);
          if (data.status !== 'Running') {
            setRunning(false);
            setRunId(null);
          }
        } catch (err) {
          console.error(err);
          setRunning(false);
          setRunId(null);
        }
      };
      
      poll();
      interval = window.setInterval(poll, 1500);
    }
    return () => clearInterval(interval);
  }, [runId]);

  const handleSaveWorkflow = async () => {
    if (!selectedWorkflow) return;
    try {
      const res = await fetch(`${API_URL}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedWorkflow)
      });
      if (res.ok) {
        alert('Workflow saved successfully!');
        // Update local list
        setWorkflows(workflows.map(w => w.id === selectedWorkflow.id ? selectedWorkflow : w));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTestRun = async () => {
    if (!selectedWorkflow) return;
    setRunning(true);
    setLogs(['[System] Triggering test run...']);
    try {
      const res = await fetch(`${API_URL}/run/${selectedWorkflow.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setRunId(data.runId);
      }
    } catch (err) {
      console.error(err);
      setRunning(false);
    }
  };

  const addNode = (type: string) => {
    if (!selectedWorkflow) return;

    const newNodeId = Math.random().toString(36).substring(2, 9);
    const newNode: Node = {
      id: newNodeId,
      type: type,
      label: `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
      data: type === 'wait' ? { ms: '1000' } : type === 'trigger' ? { url: 'https://' } : { selector: '' }
    };

    // Auto connect to the last node
    const lastNode = selectedWorkflow.nodes[selectedWorkflow.nodes.length - 1];
    const newEdges = [...selectedWorkflow.edges];
    if (lastNode) {
      newEdges.push({ source: lastNode.id, target: newNodeId });
    }

    const updatedWorkflow = {
      ...selectedWorkflow,
      nodes: [...selectedWorkflow.nodes, newNode],
      edges: newEdges
    };

    setSelectedWorkflow(updatedWorkflow);
    setSelectedNodeId(newNodeId);
  };

  const deleteNode = (nodeId: string) => {
    if (!selectedWorkflow) return;
    
    // Filter nodes and edges
    const newNodes = selectedWorkflow.nodes.filter(n => n.id !== nodeId);
    // Connect previous node to next node if applicable
    const incomingEdge = selectedWorkflow.edges.find(e => e.target === nodeId);
    const outgoingEdge = selectedWorkflow.edges.find(e => e.source === nodeId);
    let newEdges = selectedWorkflow.edges.filter(e => e.source !== nodeId && e.target !== nodeId);

    if (incomingEdge && outgoingEdge) {
      newEdges.push({ source: incomingEdge.source, target: outgoingEdge.target });
    }

    setSelectedWorkflow({
      ...selectedWorkflow,
      nodes: newNodes,
      edges: newEdges
    });
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
  };

  const updateNodeData = (field: string, value: string) => {
    if (!selectedWorkflow || !selectedNodeId) return;

    const updatedNodes = selectedWorkflow.nodes.map(node => {
      if (node.id === selectedNodeId) {
        return {
          ...node,
          data: {
            ...node.data,
            [field]: value
          }
        };
      }
      return node;
    });

    setSelectedWorkflow({
      ...selectedWorkflow,
      nodes: updatedNodes
    });
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'trigger': return <Globe size={14}/>;
      case 'navigate': return <Globe size={14}/>;
      case 'click': return <Plus size={14}/>;
      case 'type': return <Type size={14}/>;
      case 'wait': return <Clock size={14}/>;
      case 'scrape': return <Database size={14}/>;
      default: return <Plus size={14}/>;
    }
  };

  const currentNode = selectedWorkflow?.nodes.find(n => n.id === selectedNodeId);

  return (
    <div className="editor-container">
      <div className="editor-header glass-panel">
        <div className="breadcrumb">
          <span>Enterprise Editor</span>
          <ChevronRight size={14} className="text-text-tertiary" />
          <select 
            className="form-input select-workflow" 
            value={selectedWfId} 
            onChange={(e) => handleSelectWorkflow(e.target.value)}
          >
            {workflows.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div className="editor-actions">
          <button className="btn btn-secondary" onClick={handleSaveWorkflow}>
            <Save size={16} /> Save Draft
          </button>
          <button className="btn btn-primary" onClick={handleTestRun} disabled={running}>
            {running ? <Loader className="spinner" size={16}/> : <Play size={16} />} Test Run
          </button>
        </div>
      </div>

      <div className="editor-workspace">
        {/* Left Side: Nodes Panel */}
        <aside className="editor-sidebar glass-panel">
          <div className="sidebar-section">
            <h3>Start Action</h3>
            <button className="node-item btn-node" onClick={() => addNode('navigate')}><Globe size={14}/> Navigate</button>
          </div>
          <div className="sidebar-section">
            <h3>DOM Actions</h3>
            <button className="node-item btn-node" onClick={() => addNode('click')}><Plus size={14}/> Click Element</button>
            <button className="node-item btn-node" onClick={() => addNode('type')}><Type size={14}/> Type Value</button>
          </div>
          <div className="sidebar-section">
            <h3>Control & Data</h3>
            <button className="node-item btn-node" onClick={() => addNode('wait')}><Clock size={14}/> Delay Timer</button>
            <button className="node-item btn-node" onClick={() => addNode('scrape')}><Database size={14}/> Scrape Text</button>
          </div>
        </aside>

        {/* Center Canvas */}
        <div className="editor-canvas glass-panel canvas-bg">
          {selectedWorkflow?.nodes.map((node, index) => {
            const top = 60 + index * 100;
            const left = 50 + index * 40;
            return (
              <div 
                key={node.id} 
                className={`mock-node ${node.type} ${selectedNodeId === node.id ? 'selected-node' : ''}`} 
                style={{ top: `${top}px`, left: `${left}px` }}
                onClick={() => setSelectedNodeId(node.id)}
              >
                <div className="node-header">
                  {getIcon(node.type)} 
                  <span>{node.label || node.type}</span>
                  {node.type !== 'trigger' && (
                    <button 
                      className="delete-node-btn" 
                      onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
                <div className="node-content">
                  {node.type === 'trigger' && `URL: ${node.data?.url || 'None'}`}
                  {node.type === 'navigate' && `URL: ${node.data?.url || 'None'}`}
                  {node.type === 'click' && `Selector: ${node.data?.selector || 'None'}`}
                  {node.type === 'type' && `Type: ${node.data?.value || ''} into ${node.data?.selector || ''}`}
                  {node.type === 'wait' && `Wait: ${node.data?.ms || '1000'}ms`}
                  {node.type === 'scrape' && `Selector: ${node.data?.selector || 'body'}`}
                </div>
              </div>
            );
          })}

          {/* Simple connector lines */}
          <svg className="mock-edge" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}>
            {selectedWorkflow?.nodes.map((_, index) => {
              if (index === 0) return null;
              const prevTop = 60 + (index - 1) * 100 + 40;
              const prevLeft = 50 + (index - 1) * 40 + 100;
              const top = 60 + index * 100;
              const left = 50 + index * 40 + 100;
              return (
                <path 
                  key={index} 
                  d={`M ${prevLeft} ${prevTop} C ${prevLeft} ${prevTop + 40}, ${left} ${top - 40}, ${left} ${top}`} 
                  stroke="var(--border-strong)" 
                  strokeWidth="2" 
                  fill="none" 
                />
              );
            })}
          </svg>
        </div>

        {/* Right Side: Properties Panel */}
        <aside className="editor-properties glass-panel">
          {currentNode ? (
            <div>
              <div className="properties-header">
                <h3>Configure: {currentNode.label || currentNode.type}</h3>
              </div>
              <div className="properties-body">
                {(currentNode.type === 'trigger' || currentNode.type === 'navigate') && (
                  <div className="form-group">
                    <label>Target URL</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={currentNode.data?.url || ''} 
                      onChange={(e) => updateNodeData('url', e.target.value)} 
                    />
                  </div>
                )}

                {(currentNode.type === 'click' || currentNode.type === 'type' || currentNode.type === 'scrape') && (
                  <div className="form-group">
                    <label>CSS Selector</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. #submit-btn, input[name='search']"
                      value={currentNode.data?.selector || ''} 
                      onChange={(e) => updateNodeData('selector', e.target.value)} 
                    />
                  </div>
                )}

                {currentNode.type === 'type' && (
                  <div className="form-group">
                    <label>Value to Type</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. my query, vault:1 (for secret)"
                      value={currentNode.data?.value || ''} 
                      onChange={(e) => updateNodeData('value', e.target.value)} 
                    />
                  </div>
                )}

                {currentNode.type === 'wait' && (
                  <div className="form-group">
                    <label>Wait Duration (ms)</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      value={currentNode.data?.ms || '1000'} 
                      onChange={(e) => updateNodeData('ms', e.target.value)} 
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', marginTop: '2rem' }}>
              Select a node on the canvas to configure properties.
            </div>
          )}
        </aside>
      </div>

      {/* Editor Logs Overlay */}
      {logs.length > 0 && (
        <div className="editor-logs-panel glass-panel">
          <div className="editor-logs-header">
            <h4>Live Test Logs</h4>
            <button className="btn btn-secondary btn-sm" onClick={() => setLogs([])}>Clear</button>
          </div>
          <div className="editor-logs-body">
            {logs.map((log, i) => (
              <div key={i} className="log-line">{log}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
