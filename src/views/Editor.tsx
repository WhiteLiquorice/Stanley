import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap, 
  useNodesState, 
  useEdgesState, 
  addEdge, 
  ReactFlowProvider
} from '@xyflow/react';
import type { Connection, Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { 
  Save, 
  Play, 
  ChevronRight, 
  Type, 
  Globe, 
  Database, 
  Clock, 
  Plus, 
  Loader, 
  ExternalLink,
  RefreshCw,
  X,
  GitFork,
  ArrowRight,
  Bookmark,
  Sparkles,
  Code,
  Circle,
  Square
} from 'lucide-react';
import './Views.css';
import BoutiqueNode from '../components/BoutiqueNode';

// Interface definitions matching the backend data structure
interface NodeData {
  url?: string;
  selector?: string;
  value?: string;
  ms?: string;
  label?: string;
  tab?: string;
  index?: string;
  description?: string;
  condition?: {
    type: string;
    value?: string;
  };
  prompt?: string;
  system?: string;
  code?: string;
}

interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  data?: NodeData;
  position?: { x: number; y: number };
}

interface WorkflowEdge {
  source: string;
  target: string;
  condition?: any;
}

interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// React Flow generic data interfaces for typing node.data and edge.data
interface CustomNodeData extends Record<string, unknown> {
  id: string;
  type: string;
  label: string;
  data: NodeData;
  onDelete: (id: string) => void;
}

interface CustomEdgeData extends Record<string, unknown> {
  condition?: any;
}

type MyRFNode = RFNode<CustomNodeData>;
type MyRFEdge = RFEdge<CustomEdgeData>;

const nodeTypes = {
  workflowNode: BoutiqueNode,
};

export function EditorInner() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWfId, setSelectedWfId] = useState<string>('');
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  
  // React Flow state hooks typed with custom interfaces to support conditional properties
  const [nodes, setNodes, onNodesChange] = useNodesState<MyRFNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<MyRFEdge>([]);
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Run logs state
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [runId, setRunId] = useState<string | null>(null);

  // Recorder state ("record once, replay")
  const [recording, setRecording] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);

  const [extensionActive, setExtensionActive] = useState(false);
  const [nativeRunning, setNativeRunning] = useState(false);

  const nativeRunLogsRef = useRef<string[]>([]);
  const nativeRunStartTimeRef = useRef<number>(0);
  const nativeRunIdRef = useRef<string>('');
  const selectedWorkflowRef = useRef(selectedWorkflow);

  const API_URL = 'http://localhost:3001/api';

  useEffect(() => {
    selectedWorkflowRef.current = selectedWorkflow;
  }, [selectedWorkflow]);

  useEffect(() => {
    fetchWorkflows();
  }, []);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.source !== window || !e.data || e.data.ns !== 'stanley-extension') return;
      if (e.data.cmd === 'ping_response') {
        setExtensionActive(true);
      } else if (e.data.cmd === 'workflow_event') {
        const { action, log, error } = e.data;
        if (action === 'native_log') {
          setLogs(prev => {
            const next = [...prev, log];
            nativeRunLogsRef.current = next;
            return next;
          });
        } else if (action === 'native_complete') {
          setRunning(false);
          setNativeRunning(false);
          setLogs(prev => {
            const next = [...prev, '[System] Native run completed successfully ✅'];
            nativeRunLogsRef.current = next;
            
            const runDuration = `${Math.round((Date.now() - nativeRunStartTimeRef.current) / 1000)}s`;
            const finalRun = {
              id: nativeRunIdRef.current,
              workflowId: selectedWorkflowRef.current?.id || 'unknown',
              workflowName: selectedWorkflowRef.current?.name || 'Workflow',
              status: 'Success',
              trigger: 'Browser Extension',
              duration: runDuration,
              timestamp: new Date().toLocaleString(),
              logs: next
            };
            fetch(`${API_URL}/runs`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(finalRun)
            }).catch(err => console.error('Failed to save native run:', err));

            return next;
          });
        } else if (action === 'native_failed') {
          setRunning(false);
          setNativeRunning(false);
          setLogs(prev => {
            const next = [...prev, `[System] Native run failed ❌: ${error}`];
            nativeRunLogsRef.current = next;

            const runDuration = `${Math.round((Date.now() - nativeRunStartTimeRef.current) / 1000)}s`;
            const finalRun = {
              id: nativeRunIdRef.current,
              workflowId: selectedWorkflowRef.current?.id || 'unknown',
              workflowName: selectedWorkflowRef.current?.name || 'Workflow',
              status: 'Failed',
              trigger: 'Browser Extension',
              duration: runDuration,
              timestamp: new Date().toLocaleString(),
              logs: next
            };
            fetch(`${API_URL}/runs`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(finalRun)
            }).catch(err => console.error('Failed to save native run:', err));

            return next;
          });
        }
      }
    };

    window.addEventListener('message', handleMessage);

    window.postMessage({ ns: 'stanley-web', cmd: 'ping' }, '*');

    const pingInterval = setInterval(() => {
      window.postMessage({ ns: 'stanley-web', cmd: 'ping' }, '*');
    }, 3000);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearInterval(pingInterval);
    };
  }, []);

  const fetchWorkflows = async () => {
    try {
      const res = await fetch(`${API_URL}/workflows`);
      const data = await res.json();
      setWorkflows(data);
      if (data.length > 0) {
        setSelectedWfId(data[0].id);
        loadWorkflowInEditor(data[0]);
      }
    } catch (err) {
      console.error('Error fetching workflows:', err);
    }
  };

  const loadWorkflowInEditor = (wf: Workflow) => {
    setSelectedWorkflow(wf);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);

    // Map standard nodes to React Flow nodes with layout fallback if position missing
    const rfNodes: MyRFNode[] = wf.nodes.map((node, index) => {
      const defaultPos = { x: 250, y: 50 + index * 140 };
      return {
        id: node.id,
        type: 'workflowNode',
        position: node.position || defaultPos,
        data: {
          id: node.id,
          type: node.type,
          label: node.label,
          data: node.data || {},
          onDelete: () => {} // Injected in useEffect dynamically
        }
      };
    });

    // Map standard edges to React Flow edges with labels showing conditions
    const rfEdges: MyRFEdge[] = wf.edges.map((edge, index) => {
      let label = '';
      const cond = edge.condition;
      if (cond) {
        const type = typeof cond === 'string' ? cond : cond.type;
        const val = typeof cond === 'string' ? '' : cond.value;
        
        if (type === 'onSuccess') label = 'Success';
        else if (type === 'onFailure') label = 'Failure';
        else if (type === 'true') label = 'True';
        else if (type === 'false') label = 'False';
        else if (type === 'contains') label = `Contains "${val}"`;
        else if (type === 'notContains') label = `Not Contains "${val}"`;
        else if (type === 'exists') label = `Exists "${val}"`;
        else if (type === 'notExists') label = `Not Exists "${val}"`;
      }
      return {
        id: `e-${edge.source}-${edge.target}-${index}`,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        label,
        data: { condition: cond }
      };
    });

    setNodes(rfNodes);
    setEdges(rfEdges);
  };

  const handleSelectWorkflow = (wfId: string) => {
    setSelectedWfId(wfId);
    const wf = workflows.find(w => w.id === wfId) || null;
    if (wf) loadWorkflowInEditor(wf);
  };

  // Node deletion callback
  const handleDeleteNode = useCallback((id: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== id));
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
    setSelectedNodeId((prev) => (prev === id ? null : prev));
  }, [setNodes, setEdges]);

  // Inject deletion handler dynamically into node data references
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          onDelete: handleDeleteNode
        }
      }))
    );
  }, [handleDeleteNode, setNodes]);

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

    // Convert React Flow nodes and edges back to the standard backend format
    const standardNodes: WorkflowNode[] = nodes.map((node) => ({
      id: node.id,
      type: node.data.type,
      label: node.data.label,
      data: node.data.data,
      position: node.position
    }));

    const standardEdges: WorkflowEdge[] = edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      condition: edge.data?.condition
    }));

    const updatedWorkflow: Workflow = {
      ...selectedWorkflow,
      nodes: standardNodes,
      edges: standardEdges
    };

    try {
      const res = await fetch(`${API_URL}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedWorkflow)
      });
      if (res.ok) {
        alert('Workflow saved successfully!');
        setWorkflows(workflows.map(w => w.id === updatedWorkflow.id ? updatedWorkflow : w));
        setSelectedWorkflow(updatedWorkflow);
      }
    } catch (err) {
      console.error('Error saving workflow:', err);
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

  const fetchSecretsMap = async (): Promise<Record<string, string>> => {
    try {
      const res = await fetch(`${API_URL}/vault`);
      if (res.ok) {
        const secretsList = await res.json();
        const secretsMap: Record<string, string> = {};
        secretsList.forEach((s: any) => {
          secretsMap[s.id] = s.value;
          secretsMap[s.name] = s.value; // key by both name and id
        });
        return secretsMap;
      }
    } catch (err) {
      console.error('Error fetching vault credentials:', err);
    }
    return {};
  };

  const handleRunInBrowser = async () => {
    if (!selectedWorkflow) return;
    setRunning(true);
    setNativeRunning(true);
    
    const runId = Math.random().toString(36).substring(2, 9);
    nativeRunIdRef.current = runId;
    nativeRunStartTimeRef.current = Date.now();
    nativeRunLogsRef.current = ['[System] Connecting to browser extension engine...'];
    setLogs(nativeRunLogsRef.current);

    const secrets = await fetchSecretsMap();

    // Compile current graph
    const standardNodes: WorkflowNode[] = nodes.map((node) => ({
      id: node.id,
      type: node.data.type,
      label: node.data.label,
      data: node.data.data,
      position: node.position
    }));

    const standardEdges: WorkflowEdge[] = edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      condition: edge.data?.condition
    }));

    const workflowToRun = {
      ...selectedWorkflow,
      nodes: standardNodes,
      edges: standardEdges
    };

    window.postMessage({
      ns: 'stanley-web',
      cmd: 'run_native_workflow',
      workflow: workflowToRun,
      secrets: secrets
    }, '*');
  };

  const handleCancelRun = () => {
    if (nativeRunning) {
      window.postMessage({ ns: 'stanley-web', cmd: 'cancel_native' }, '*');
      setRunning(false);
      setNativeRunning(false);
      setLogs(prev => [...prev, '[System] Native run cancellation requested.']);
    } else {
      setRunning(false);
      setRunId(null);
    }
  };

  // Launch a real browser and capture the user's actions into a draft workflow.
  const handleStartRecording = async () => {
    const url = window.prompt('Enter the URL to start recording at:', 'https://');
    if (!url) return;
    try {
      const res = await fetch(`${API_URL}/record/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (data.success) {
        setRecording(true);
        setRecordingId(data.recordingId);
      } else {
        alert(data.error || 'Failed to start recording.');
      }
    } catch (err) {
      console.error('Error starting recording:', err);
      alert('Could not reach the Stanley server to start recording.');
    }
  };

  // Stop capturing, convert the timeline to a workflow, and load it onto the canvas.
  const handleStopRecording = async () => {
    if (!recordingId) return;
    try {
      const res = await fetch(`${API_URL}/record/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordingId })
      });
      const data = await res.json();
      if (data.success && data.workflow) {
        const wf = data.workflow as Workflow;
        setWorkflows((prev) => [...prev, wf]);
        setSelectedWfId(wf.id);
        loadWorkflowInEditor(wf);
      } else {
        alert(data.error || 'Failed to generate workflow from recording.');
      }
    } catch (err) {
      console.error('Error stopping recording:', err);
    } finally {
      setRecording(false);
      setRecordingId(null);
    }
  };

  const addNode = (type: string) => {
    const newNodeId = Math.random().toString(36).substring(2, 9);
    
    // Choose starting template properties
    let nodeData: NodeData = {};
    if (type === 'wait') nodeData = { ms: '1000' };
    else if (type === 'trigger') nodeData = { url: 'https://' };
    else if (type === 'navigate') nodeData = { url: 'https://' };
    else if (type === 'if' || type === 'condition') nodeData = { condition: { type: 'always' } };
    else if (type === 'open_tab') nodeData = { url: '', label: '' };
    else if (type === 'switch_tab' || type === 'close_tab') nodeData = { tab: '' };
    else if (type === 'ai_prompt') nodeData = { prompt: 'Summarize this text: {{lastScrape}}', system: '' };
    else if (type === 'js_code') nodeData = { code: '// Execute Playwright operations on browser context\nconst urls = context.variables.searchResults || [];\nif (urls.length > 0) {\n  await context.agent.navigate(urls[0]);\n  const text = await context.agent.scrapeContent("body");\n  return await context.ai.prompt({ prompt: "Summarize: " + text });\n}' };
    else nodeData = { selector: '' };

    const labelMap: Record<string, string> = {
      trigger: 'Trigger Start',
      navigate: 'Navigate To',
      click: 'Click Element',
      type: 'Type Value',
      wait: 'Delay Timer',
      scrape: 'Scrape Text',
      open_tab: 'Open New Tab',
      switch_tab: 'Switch Tab',
      close_tab: 'Close Tab',
      if: 'Condition Fork',
      goto: 'Goto Label',
      label: 'Label Anchor',
      ai_prompt: 'AI Gemini Prompt',
      js_code: 'Custom JS Script'
    };

    const newNode: MyRFNode = {
      id: newNodeId,
      type: 'workflowNode',
      position: { x: 300, y: 150 },
      data: {
        id: newNodeId,
        type: type,
        label: labelMap[type] || `New ${type}`,
        data: nodeData,
        onDelete: handleDeleteNode
      }
    };

    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(newNodeId);
    setSelectedEdgeId(null);
  };

  // Node Selection callback
  const onSelectionChange = useCallback(({ nodes: selNodes, edges: selEdges }: any) => {
    if (selNodes.length > 0) {
      setSelectedNodeId(selNodes[0].id);
      setSelectedEdgeId(null);
    } else if (selEdges.length > 0) {
      setSelectedEdgeId(selEdges[0].id);
      setSelectedNodeId(null);
    } else {
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    }
  }, []);

  // Update properties on node data
  const updateNodeDataField = (field: string, value: any) => {
    if (!selectedNodeId) return;
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === selectedNodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              data: {
                ...node.data.data,
                [field]: value
              }
            }
          };
        }
        return node;
      })
    );
  };

  // Update visual node title/label
  const updateNodeTitle = (title: string) => {
    if (!selectedNodeId) return;
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === selectedNodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              label: title
            }
          };
        }
        return node;
      })
    );
  };

  // Update properties of edge conditions
  const updateEdgeConditionField = (type: string, value?: string) => {
    if (!selectedEdgeId) return;
    setEdges((eds) =>
      eds.map((edge) => {
        if (edge.id === selectedEdgeId) {
          const condition = type === 'always' ? undefined : { type, value };
          let label = '';
          if (type === 'onSuccess') label = 'Success';
          else if (type === 'onFailure') label = 'Failure';
          else if (type === 'true') label = 'True';
          else if (type === 'false') label = 'False';
          else if (type === 'contains') label = `Contains "${value}"`;
          else if (type === 'notContains') label = `Not Contains "${value}"`;
          else if (type === 'exists') label = `Exists "${value}"`;
          else if (type === 'notExists') label = `Not Exists "${value}"`;

          return {
            ...edge,
            label,
            data: {
              ...edge.data,
              condition
            }
          };
        }
        return edge;
      })
    );
  };

  // Node connection callback
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, type: 'smoothstep', label: '', data: { condition: undefined } }, eds));
    },
    [setEdges]
  );

  const currentNode = useMemo(() => {
    return nodes.find((n) => n.id === selectedNodeId);
  }, [nodes, selectedNodeId]);

  const currentEdge = useMemo(() => {
    return edges.find((e) => e.id === selectedEdgeId);
  }, [edges, selectedEdgeId]);

  return (
    <div className="editor-container">
      <div className="editor-header glass-panel">
        <div className="breadcrumb">
          <span>Saved Flows</span>
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
          {recording ? (
            <button className="btn btn-primary" style={{ background: '#dc2626', borderColor: '#dc2626' }} onClick={handleStopRecording}>
              <Square size={16} /> Stop &amp; Generate
            </button>
          ) : (
            <button className="btn btn-secondary" onClick={handleStartRecording}>
              <Circle size={16} /> Record
            </button>
          )}
          <button className="btn btn-secondary" onClick={handleSaveWorkflow}>
            <Save size={16} /> Save Draft
          </button>
          {extensionActive && (
            <button 
              className="btn btn-primary" 
              style={{ background: 'linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)', borderColor: 'transparent', boxShadow: '0 0 10px rgba(168, 85, 247, 0.4)' }} 
              onClick={handleRunInBrowser} 
              disabled={running}
            >
              {running && nativeRunning ? <Loader className="spinner" size={16}/> : <Play size={16} />} Run in Browser
            </button>
          )}
          <button className="btn btn-primary" onClick={handleTestRun} disabled={running}>
            {running && !nativeRunning ? <Loader className="spinner" size={16}/> : <Play size={16} />} Test Run
          </button>
        </div>
      </div>

      {recording && (
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', margin: '0 0 8px', color: '#dc2626', fontWeight: 600 }}>
          <Circle size={12} fill="#dc2626" />
          Recording… perform your task in the browser window Stanley opened, then click “Stop &amp; Generate”.
        </div>
      )}

      <div className="editor-workspace">
        {/* Left Side: Drag-and-Click Add Nodes Panel */}
        <aside className="editor-sidebar glass-panel">
          <div className="sidebar-section">
            <h3>Start Action</h3>
            <button className="node-item btn-node" onClick={() => addNode('navigate')}><Globe size={14}/> Navigate</button>
          </div>
          <div className="sidebar-section">
            <h3>DOM Actions</h3>
            <button className="node-item btn-node" onClick={() => addNode('click')}><Plus size={14}/> Click Element</button>
            <button className="node-item btn-node" onClick={() => addNode('type')}><Type size={14}/> Type Value</button>
            <button className="node-item btn-node" onClick={() => addNode('scrape')}><Database size={14}/> Scrape Text</button>
          </div>
          <div className="sidebar-section">
            <h3>Multi-Tab Operations</h3>
            <button className="node-item btn-node" onClick={() => addNode('open_tab')}><ExternalLink size={14}/> Open New Tab</button>
            <button className="node-item btn-node" onClick={() => addNode('switch_tab')}><RefreshCw size={14}/> Switch active Tab</button>
            <button className="node-item btn-node" onClick={() => addNode('close_tab')}><X size={14}/> Close active Tab</button>
          </div>
          <div className="sidebar-section">
            <h3>Branching & Control</h3>
            <button className="node-item btn-node" onClick={() => addNode('if')}><GitFork size={14}/> Condition / If</button>
            <button className="node-item btn-node" onClick={() => addNode('goto')}><ArrowRight size={14}/> Goto Label</button>
            <button className="node-item btn-node" onClick={() => addNode('label')}><Bookmark size={14}/> Label Anchor</button>
            <button className="node-item btn-node" onClick={() => addNode('wait')}><Clock size={14}/> Delay Timer</button>
          </div>
          <div className="sidebar-section">
            <h3>AI & Scripting</h3>
            <button className="node-item btn-node" style={{ background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.4)' }} onClick={() => addNode('ai_prompt')}><Sparkles size={14}/> AI Prompt</button>
            <button className="node-item btn-node" style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.4)' }} onClick={() => addNode('js_code')}><Code size={14}/> JS Script</button>
          </div>
        </aside>

        {/* Center React Flow Canvas */}
        <div className="editor-canvas glass-panel canvas-bg" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="react-flow-wrapper">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              onSelectionChange={onSelectionChange}
              fitView
            >
              <Background color="#C8BEFF" gap={20} />
              <Controls />
              <MiniMap 
                nodeColor={(n) => {
                  const type = n.data?.type || '';
                  if (type === 'trigger' || type === 'navigate') return '#3B82F6';
                  if (type === 'click' || type === 'scrape') return '#10B981';
                  if (type === 'type') return '#8B5CF6';
                  if (type === 'if' || type === 'condition') return '#F97316';
                  return '#6B7280';
                }}
                maskColor="rgba(91, 71, 224, 0.05)"
              />
            </ReactFlow>
          </div>
        </div>

        {/* Right Side: Properties Configuration Panel */}
        <aside className="editor-properties glass-panel">
          {currentNode ? (
            <div>
              <div className="properties-header">
                <h3>Configure: {currentNode.data.label || currentNode.data.type}</h3>
              </div>
              <div className="properties-body">
                <div className="form-group">
                  <label>Step Display Label</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={currentNode.data.label || ''} 
                    onChange={(e) => updateNodeTitle(e.target.value)} 
                  />
                </div>

                {(currentNode.data.type === 'trigger' || currentNode.data.type === 'navigate') && (
                  <div className="form-group">
                    <label>Target URL</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={currentNode.data.data?.url || ''} 
                      onChange={(e) => updateNodeDataField('url', e.target.value)} 
                    />
                  </div>
                )}

                {(currentNode.data.type === 'click' || currentNode.data.type === 'type' || currentNode.data.type === 'scrape') && (
                  <>
                    <div className="form-group">
                      <label>Natural Element Description (Optional)</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="e.g. login button, password field"
                        value={currentNode.data.data?.description || ''} 
                        onChange={(e) => updateNodeDataField('description', e.target.value)} 
                      />
                    </div>
                    <div className="form-group">
                      <label>CSS Selector (Fallback / Direct)</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="e.g. #submit-btn, input[name='search']"
                        value={currentNode.data.data?.selector || ''} 
                        onChange={(e) => updateNodeDataField('selector', e.target.value)} 
                      />
                    </div>
                  </>
                )}

                {currentNode.data.type === 'type' && (
                  <div className="form-group">
                    <label>Value to Type</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. my query, vault:Email"
                      value={currentNode.data.data?.value || ''} 
                      onChange={(e) => updateNodeDataField('value', e.target.value)} 
                    />
                  </div>
                )}

                {currentNode.data.type === 'wait' && (
                  <div className="form-group">
                    <label>Wait Duration (ms)</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      value={currentNode.data.data?.ms || '1000'} 
                      onChange={(e) => updateNodeDataField('ms', e.target.value)} 
                    />
                  </div>
                )}

                {currentNode.data.type === 'open_tab' && (
                  <>
                    <div className="form-group">
                      <label>Start URL (Optional)</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="e.g. https://example.com"
                        value={currentNode.data.data?.url || ''} 
                        onChange={(e) => updateNodeDataField('url', e.target.value)} 
                      />
                    </div>
                    <div className="form-group">
                      <label>Stable Tab Label</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="e.g. search-results"
                        value={currentNode.data.data?.label || ''} 
                        onChange={(e) => updateNodeDataField('label', e.target.value)} 
                      />
                    </div>
                  </>
                )}

                {(currentNode.data.type === 'switch_tab' || currentNode.data.type === 'close_tab') && (
                  <>
                    <div className="form-group">
                      <label>Tab Reference (ID / Label / Numeric Index)</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="e.g. main, tab-2, search-results, or 1"
                        value={currentNode.data.data?.tab || currentNode.data.data?.index || ''} 
                        onChange={(e) => {
                          updateNodeDataField('tab', e.target.value);
                          updateNodeDataField('index', e.target.value);
                        }} 
                      />
                    </div>
                  </>
                )}

                {(currentNode.data.type === 'if' || currentNode.data.type === 'condition') && (
                  <>
                    <div className="form-group">
                      <label>Branch Condition Type</label>
                      <select 
                        className="form-input select-workflow"
                        value={currentNode.data.data?.condition?.type || 'always'}
                        onChange={(e) => {
                          const currentCondition = currentNode.data.data?.condition || { type: 'always' };
                          updateNodeDataField('condition', {
                            ...currentCondition,
                            type: e.target.value
                          });
                        }}
                      >
                        <option value="always">Always Evaluate True</option>
                        <option value="contains">Scraped text contains</option>
                        <option value="notContains">Scraped text does not contain</option>
                        <option value="exists">Page element exists</option>
                        <option value="notExists">Page element does not exist</option>
                      </select>
                    </div>

                    {currentNode.data.data?.condition?.type !== 'always' && (
                      <div className="form-group">
                        <label>Condition Matching Value</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="e.g. Log Out, error-msg"
                          value={currentNode.data.data?.condition?.value || ''} 
                          onChange={(e) => {
                            const currentCondition = currentNode.data.data?.condition || { type: 'always' };
                            updateNodeDataField('condition', {
                              ...currentCondition,
                              value: e.target.value
                            });
                          }} 
                        />
                      </div>
                    )}
                  </>
                )}

                {currentNode.data.type === 'goto' && (
                  <div className="form-group">
                    <label>Target Label Name</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. done, search-loop"
                      value={currentNode.data.data?.label || ''} 
                      onChange={(e) => updateNodeDataField('label', e.target.value)} 
                    />
                  </div>
                )}

                {currentNode.data.type === 'label' && (
                  <div className="form-group">
                    <label>Anchor Label Name</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. done, search-loop"
                      value={currentNode.data.data?.label || ''} 
                      onChange={(e) => updateNodeDataField('label', e.target.value)} 
                    />
                  </div>
                )}

                {currentNode.data.type === 'ai_prompt' && (
                  <>
                    <div className="form-group">
                      <label>{"AI Prompt Instructions (supports dynamic {{lastScrape}} or {{nodeId}} interpolation)"}</label>
                      <textarea 
                        className="form-input" 
                        rows={3}
                        style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                        placeholder="e.g. Summarize the following news articles in 3 bullet points: {{lastScrape}}"
                        value={currentNode.data.data?.prompt || ''} 
                        onChange={(e) => updateNodeDataField('prompt', e.target.value)} 
                      />
                    </div>
                    <div className="form-group">
                      <label>System Instruction (Optional)</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="e.g. You are a precise financial analyst."
                        value={currentNode.data.data?.system || ''} 
                        onChange={(e) => updateNodeDataField('system', e.target.value)} 
                      />
                    </div>
                  </>
                )}

                {currentNode.data.type === 'js_code' && (
                  <div className="form-group">
                    <label>{"JavaScript Script (Execution context has `agent`, `scraped`, `secrets`, `log`, `ai`, and `variables`)"}</label>
                    <textarea 
                      className="form-input" 
                      rows={8}
                      style={{ fontFamily: 'Courier New, monospace', fontSize: '0.75rem', lineHeight: '1.3' }}
                      placeholder={`// e.g.
const urls = context.variables.searchResults;
await context.agent.navigate(urls[0]);
const text = await context.agent.scrapeContent('body');
return await context.ai.prompt({ prompt: "Summarize: " + text });`}
                      value={currentNode.data.data?.code || ''} 
                      onChange={(e) => updateNodeDataField('code', e.target.value)} 
                    />
                  </div>
                )}
              </div>
            </div>
          ) : currentEdge ? (
            <div>
              <div className="properties-header">
                <h3>Configure Connection Edge</h3>
              </div>
              <div className="properties-body">
                <div className="form-group">
                  <label>Routing Edge Condition</label>
                  <select 
                    className="form-input select-workflow"
                    value={
                      currentEdge.data?.condition === undefined
                        ? 'always'
                        : typeof currentEdge.data.condition === 'string'
                        ? currentEdge.data.condition
                        : currentEdge.data.condition.type
                    }
                    onChange={(e) => {
                      const type = e.target.value;
                      const val = (currentEdge.data && currentEdge.data.condition && typeof currentEdge.data.condition === 'object') 
                        ? currentEdge.data.condition.value 
                        : '';
                      updateEdgeConditionField(type, val);
                    }}
                  >
                    <option value="always">Always Follow / Unconditional</option>
                    <option value="onSuccess">On Success (Run only if source node succeeds)</option>
                    <option value="onFailure">On Failure (Run only if source node throws)</option>
                    <option value="true">True (Follow if If/Condition node evaluates True)</option>
                    <option value="false">False (Follow if If/Condition node evaluates False)</option>
                    <option value="contains">Scraped text contains</option>
                    <option value="notContains">Scraped text does not contain</option>
                    <option value="exists">Page element exists</option>
                    <option value="notExists">Page element does not exist</option>
                  </select>
                </div>

                {currentEdge.data?.condition !== undefined && 
                 currentEdge.data?.condition !== null &&
                 typeof currentEdge.data?.condition === 'object' && 
                 ['contains', 'notContains', 'exists', 'notExists'].includes(currentEdge.data?.condition?.type || '') && (
                  <div className="form-group">
                    <label>Condition Matching Value</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. Log Out, success-check"
                      value={currentEdge.data?.condition?.value || ''} 
                      onChange={(e) => {
                        const type = currentEdge.data?.condition?.type || '';
                        updateEdgeConditionField(type, e.target.value);
                      }} 
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', marginTop: '2rem' }}>
              Select a node or connection line on the canvas to configure properties.
            </div>
          )}
        </aside>
      </div>

      {/* Editor Logs Overlay */}
      {logs.length > 0 && (
        <div className="editor-logs-panel glass-panel">
          <div className="editor-logs-header">
            <h4>Live Test Logs</h4>
            <div style={{ display: 'flex', gap: '6px' }}>
              {running && (
                <button className="btn btn-secondary btn-sm" style={{ borderColor: 'var(--accent-danger)', color: 'var(--accent-danger)' }} onClick={handleCancelRun}>
                  Cancel Run
                </button>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => setLogs([])}>Clear</button>
            </div>
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

export function Editor() {
  return (
    <ReactFlowProvider>
      <EditorInner />
    </ReactFlowProvider>
  );
}
