import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  useNodesState, 
  useEdgesState, 
  addEdge, 
  Position,
  Handle,
  ReactFlowProvider
} from '@xyflow/react';
import type { Connection, Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { 
  Play, 
  Plus, 
  Loader, 
  Save, 
  Type, 
  Globe, 
  Database, 
  Clock, 
  Trash2, 
  ExternalLink, 
  RefreshCw, 
  X, 
  GitFork, 
  ArrowRight, 
  Bookmark,
  Sparkles,
  Code
} from 'lucide-react';
import './Views.css';

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

// React Flow Custom Node Component
function WorkflowNodeComponent({ data, selected }: any) {
  const { type, label, data: nodeData, onDelete, id } = data;

  const getIcon = (type: string) => {
    switch (type) {
      case 'trigger': return <Globe size={14}/>;
      case 'navigate': return <Globe size={14}/>;
      case 'click': return <Plus size={14}/>;
      case 'type': return <Type size={14}/>;
      case 'wait': return <Clock size={14}/>;
      case 'scrape': return <Database size={14}/>;
      case 'open_tab': return <ExternalLink size={14}/>;
      case 'switch_tab': return <RefreshCw size={14}/>;
      case 'close_tab': return <X size={14}/>;
      case 'if': case 'condition': return <GitFork size={14}/>;
      case 'goto': return <ArrowRight size={14}/>;
      case 'label': return <Bookmark size={14}/>;
      case 'ai_prompt': return <Sparkles size={14}/>;
      case 'js_code': return <Code size={14}/>;
      default: return <Plus size={14}/>;
    }
  };

  return (
    <div className={`mock-node ${type} ${selected ? 'selected-node' : ''}`}>
      {type !== 'trigger' && (
        <Handle 
          type="target" 
          position={Position.Top} 
          style={{ background: 'var(--border-strong)', width: 8, height: 8 }} 
        />
      )}
      
      <div className="node-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {getIcon(type)} 
          <span>{label || type}</span>
        </div>
        {type !== 'trigger' && (
          <button 
            className="delete-node-btn" 
            onClick={(e) => { e.stopPropagation(); onDelete(id); }}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      <div className="node-content">
        {type === 'trigger' && `URL: ${nodeData?.url || 'None'}`}
        {type === 'navigate' && `URL: ${nodeData?.url || 'None'}`}
        {type === 'click' && `Target: ${nodeData?.description || nodeData?.selector || 'None'}`}
        {type === 'type' && `Type: ${nodeData?.value || ''} into ${nodeData?.description || nodeData?.selector || ''}`}
        {type === 'wait' && `Wait: ${nodeData?.ms || '1000'}ms`}
        {type === 'scrape' && `Selector: ${nodeData?.selector || 'body'}`}
        {type === 'open_tab' && `URL: ${nodeData?.url || 'Blank'} [${nodeData?.label || 'No Label'}]`}
        {type === 'switch_tab' && `Tab: ${nodeData?.tab || nodeData?.index || '0'}`}
        {type === 'close_tab' && `Tab: ${nodeData?.tab || nodeData?.index || '0'}`}
        {(type === 'if' || type === 'condition') && `Condition: ${nodeData?.condition?.type || 'always'}`}
        {type === 'goto' && `Goto: ${nodeData?.label || 'None'}`}
        {type === 'label' && `Label: ${nodeData?.label || 'None'}`}
        {type === 'ai_prompt' && `Prompt: ${nodeData?.prompt ? (nodeData.prompt.substring(0, 30) + '...') : 'None'}`}
        {type === 'js_code' && `Script: ${nodeData?.code ? (nodeData.code.substring(0, 30) + '...') : 'None'}`}
      </div>

      <Handle 
        type="source" 
        position={Position.Bottom} 
        style={{ background: 'var(--border-strong)', width: 8, height: 8 }} 
      />
    </div>
  );
}

const nodeTypes = {
  workflowNode: WorkflowNodeComponent
};

export function CockpitInner() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Selection details
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  
  // React Flow state hooks
  const [nodes, setNodes, onNodesChange] = useNodesState<MyRFNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<MyRFEdge>([]);
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowUrl, setNewWorkflowUrl] = useState('https://www.google.com');

  // Custom run modal state
  const [runWorkflowId, setRunWorkflowId] = useState<string | null>(null);
  const [customStartUrl, setCustomStartUrl] = useState('');

  // Logs modal state
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [pollingLogs, setPollingLogs] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_AUTO_RETRIES = 3;
  // Workflow queued for re-launch (for Retry button)
  const [pendingRetryWorkflowId, setPendingRetryWorkflowId] = useState<string | null>(null);

  // AI Chatbot states
  interface ChatMessage {
    id: string;
    role: 'user' | 'stanley';
    content: string;
    actionsApplied?: string[];
  }
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'stanley', content: 'Hi! I\'m Stanley, your automation copilot. Tell me what you want to automate, or ask me to add/edit steps in your flow!' }
  ]);
  const [chatLoading, setChatLoading] = useState(false);

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
    fetchWorkflowsAndRuns();
  }, []);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.source !== window || !e.data || e.data.ns !== 'stanley-extension') return;
      if (e.data.cmd === 'ping_response') {
        setExtensionActive(true);
      } else if (e.data.cmd === 'workflow_event') {
        const { action, log, error } = e.data;
        if (action === 'native_log') {
          setActiveRun(prev => {
            if (!prev) return null;
            const updatedLogs = [...(prev.logs || []), log];
            nativeRunLogsRef.current = updatedLogs;
            return { ...prev, logs: updatedLogs };
          });
        } else if (action === 'native_complete') {
          setNativeRunning(false);
          setActiveRun(prev => {
            if (!prev) return null;
            const updatedLogs = [...(prev.logs || []), '[System] Native run completed successfully ✅'];
            nativeRunLogsRef.current = updatedLogs;
            
            const runDuration = `${Math.round((Date.now() - nativeRunStartTimeRef.current) / 1000)}s`;
            const finalRun = {
              id: nativeRunIdRef.current,
              workflowId: selectedWorkflowRef.current?.id || prev.workflowId,
              workflowName: selectedWorkflowRef.current?.name || prev.workflowName,
              status: 'Success',
              trigger: 'Browser Extension',
              duration: runDuration,
              timestamp: new Date().toLocaleString(),
              logs: updatedLogs
            };
            
            fetch(`${API_URL}/runs`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(finalRun)
            })
              .then(() => fetchWorkflowsAndRuns())
              .catch(err => console.error('Failed to save native run:', err));

            return { ...prev, status: 'Success', logs: updatedLogs };
          });
        } else if (action === 'native_failed') {
          setNativeRunning(false);
          setActiveRun(prev => {
            if (!prev) return null;
            const updatedLogs = [...(prev.logs || []), `[System] Native run failed ❌: ${error}`];
            nativeRunLogsRef.current = updatedLogs;

            const runDuration = `${Math.round((Date.now() - nativeRunStartTimeRef.current) / 1000)}s`;
            const finalRun = {
              id: nativeRunIdRef.current,
              workflowId: selectedWorkflowRef.current?.id || prev.workflowId,
              workflowName: selectedWorkflowRef.current?.name || prev.workflowName,
              status: 'Failed',
              trigger: 'Browser Extension',
              duration: runDuration,
              timestamp: new Date().toLocaleString(),
              logs: updatedLogs
            };

            fetch(`${API_URL}/runs`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(finalRun)
            })
              .then(() => fetchWorkflowsAndRuns())
              .catch(err => console.error('Failed to save native run:', err));

            return { ...prev, status: 'Failed', logs: updatedLogs };
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

  const loadWorkflowInEditor = (wf: Workflow) => {
    setSelectedWorkflow(wf);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);

    // Map standard nodes to React Flow nodes with layout fallback if position missing
    const rfNodes: MyRFNode[] = wf.nodes.map((node, index) => {
      const defaultPos = { x: 100, y: 50 + index * 140 };
      return {
        id: node.id,
        type: 'workflowNode',
        position: node.position || defaultPos,
        data: {
          id: node.id,
          type: node.type,
          label: node.label,
          data: node.data || {},
          onDelete: () => {} // Injected dynamically
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
            clearInterval(interval);
            // Refresh list
            const runsRes = await fetch(`${API_URL}/runs`);
            setRuns(await runsRes.json());

            // Auto-retry on failure (up to MAX_AUTO_RETRIES)
            if (data.status === 'Failed') {
              setRetryCount(prev => {
                const next = prev + 1;
                if (next < MAX_AUTO_RETRIES && data.workflowId) {
                  // Brief pause then relaunch
                  setTimeout(async () => {
                    try {
                      const reRunRes = await fetch(`${API_URL}/run/${data.workflowId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({})
                      });
                      const reRunData = await reRunRes.json();
                      if (reRunData.success) {
                        setActiveRunId(reRunData.runId);
                        setActiveRun(prev2 => prev2 ? {
                          ...prev2,
                          id: reRunData.runId,
                          status: 'Running',
                          logs: [...(prev2.logs || []), `[System] Auto-retry ${next}/${MAX_AUTO_RETRIES}...`]
                        } : null);
                      }
                    } catch (_) {}
                  }, 1500);
                } else {
                  // Max retries hit — store workflowId for manual Retry button
                  setPendingRetryWorkflowId(data.workflowId);
                }
                return next;
              });
            } else {
              // Success — reset counters
              setRetryCount(0);
              setPendingRetryWorkflowId(null);
            }
          }
        } catch (err) {
          console.error(err);
          setPollingLogs(false);
        }
      };
      
      poll();
      interval = window.setInterval(poll, 1500);
    }
    return () => clearInterval(interval);
  }, [activeRunId]);

  const applyChatActions = useCallback((actions: any[]) => {
    if (!selectedWorkflow) return [];
    const wf = JSON.parse(JSON.stringify(selectedWorkflow));
    const appliedLogs: string[] = [];

    actions.forEach(action => {
      switch (action.type) {
        case 'add_node': {
          const node = action.node;
          if (!node.id) node.id = Math.random().toString(36).substring(2, 9);
          if (!node.position) {
            const lastNode = wf.nodes[wf.nodes.length - 1];
            node.position = {
              x: lastNode && lastNode.position ? lastNode.position.x : 250,
              y: lastNode && lastNode.position ? lastNode.position.y + 140 : 150
            };
          }
          wf.nodes.push(node);
          appliedLogs.push(`Added node: "${node.label || node.type}"`);
          break;
        }
        case 'delete_node': {
          const id = action.nodeId;
          wf.nodes = wf.nodes.filter((n: any) => n.id !== id);
          wf.edges = wf.edges.filter((e: any) => e.source !== id && e.target !== id);
          appliedLogs.push(`Deleted node: ID ${id}`);
          break;
        }
        case 'update_node': {
          const id = action.nodeId;
          const node = wf.nodes.find((n: any) => n.id === id);
          if (node) {
            const updates = action.nodeUpdates;
            if (updates.label !== undefined) node.label = updates.label;
            if (updates.data !== undefined) node.data = { ...node.data, ...updates.data };
            appliedLogs.push(`Updated node: "${node.label || node.type}"`);
          }
          break;
        }
        case 'add_edge': {
          const edge = action.edge;
          const srcExists = wf.nodes.some((n: any) => n.id === edge.source);
          const tgtExists = wf.nodes.some((n: any) => n.id === edge.target);
          if (srcExists && tgtExists) {
            const edgeExists = wf.edges.some((e: any) => e.source === edge.source && e.target === edge.target);
            if (!edgeExists) {
              wf.edges.push(edge);
              appliedLogs.push(`Connected: ${edge.source} ➔ ${edge.target}`);
            }
          }
          break;
        }
        case 'delete_edge': {
          const { source, target } = action;
          wf.edges = wf.edges.filter((e: any) => !(e.source === source && e.target === target));
          appliedLogs.push(`Disconnected: ${source} ➔ ${target}`);
          break;
        }
        case 'set_workflow': {
          if (action.workflow) {
            wf.name = action.workflow.name || wf.name;
            wf.nodes = action.workflow.nodes || [];
            wf.edges = action.workflow.edges || [];
            wf.nodes.forEach((n: any, idx: number) => {
              if (!n.position) n.position = { x: 250, y: 50 + idx * 140 };
            });
            appliedLogs.push(`Replaced workflow with "${wf.name}"`);
          }
          break;
        }
      }
    });

    if (appliedLogs.length > 0) {
      loadWorkflowInEditor(wf);
      // Automatically save to local server state so it persists
      fetch(`${API_URL}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wf)
      }).then(res => res.json())
        .then(updatedWf => {
          setWorkflows(prev => prev.map(w => w.id === updatedWf.id ? updatedWf : w));
        })
        .catch(err => console.error('Failed to auto-save chat changes:', err));
    }
    return appliedLogs;
  }, [selectedWorkflow]);

  const handleSendChatMessage = async (textToSend?: string) => {
    const text = (textToSend || chatInput).trim();
    if (!text) return;

    if (!textToSend) setChatInput('');

    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      role: 'user',
      content: text
    };

    setChatMessages(prev => [...prev, userMsg]);
    setChatLoading(true);

    try {
      // Step 1: Get the Gemini API key from the local vault server.
      // If the server is offline, give a clear, actionable error instead of a cryptic JSON parse failure.
      let apiKey: string | null = null;
      try {
        const vaultRes = await fetch(`${API_URL}/vault`, { signal: AbortSignal.timeout(3000) });
        if (vaultRes.ok) {
          const secrets: any[] = await vaultRes.json();
          const googleSecret = secrets.find(
            s => s.name === 'Google API Key' || s.name?.toLowerCase().includes('gemini')
          );
          if (googleSecret?.value && !googleSecret.value.startsWith('AIzaSyMockKey')) {
            apiKey = googleSecret.value;
          }
        }
      } catch {
        // Server offline — fall through to show helpful message
      }

      if (!apiKey) {
        throw new Error(
          'Stanley needs a Gemini API key to chat. Make sure the backend server is running ' +
          '(npm run dev:backend) and add a real "Google API Key" in the Credential Vault.'
        );
      }

      // Step 2: Build the Gemini request directly from the frontend.
      const systemInstruction = `You are "Stanley", the AI Copilot for Project Stanley, an enterprise browser automation suite.
Your goal is to help the user build, edit, and understand their low-code browser automation workflows.
You must respond in strict JSON matching this schema:
{
  "message": "A conversational explanation of what you did or how you answered.",
  "actions": []
}

The current workflow is provided in the prompt as a JSON object with:
- name: string
- nodes: Array of { id, type, label, data: { ... }, position: { x, y } }
- edges: Array of { source, target, condition: ... }

Supported Node Types:
- 'trigger': Start step, takes "url" in data.
- 'navigate': Go to a URL, takes "url" in data.
- 'click': Click an element, takes "description" and optionally "selector" in data.
- 'type': Type text into an input, takes "description", "value", and optionally "selector" in data.
- 'wait': Wait for some milliseconds, takes "ms" (string) in data.
- 'scrape': Extract text from a selector, takes "selector" in data.
- 'open_tab': Open a new browser tab, takes "url" and "label" in data.
- 'switch_tab': Switch active tab, takes "tab" or "index" in data.
- 'close_tab': Close tab, takes "tab" or "index" in data.
- 'if': Decision node, takes "condition" object in data: { type: "always"|"contains"|"notContains"|"exists"|"notExists", value: string }
- 'goto': Jump to a labeled step, takes "label" in data.
- 'label': Step label target, takes "label" in data.
- 'ai_prompt': Run AI analysis, takes "prompt" and "system" (optional) in data.
- 'js_code': Execute custom javascript, takes "code" in data.

Supported Actions in your response:
1. {"type": "add_node", "node": { "id": "unique_string", "type": "node_type", "label": "Label", "data": { ... }, "position": { "x": number, "y": number } }}
2. {"type": "delete_node", "nodeId": "node_id_to_delete"}
3. {"type": "update_node", "nodeId": "node_id_to_update", "nodeUpdates": { "label": "New Label", "data": { ... } }}
4. {"type": "add_edge", "edge": { "source": "source_id", "target": "target_id", "condition": ... }}
5. {"type": "delete_edge", "source": "source_id", "target": "target_id"}
6. {"type": "set_workflow", "workflow": { "name": "New Name", "nodes": [...], "edges": [...] }}

Rules:
- Keep the graph clean. When adding nodes, space them 140px apart on the y-axis.
- Connect new nodes using "add_edge".
- If the user asks a general question, answer in "message" and leave "actions" empty.
- Always output valid, parseable JSON. Do NOT wrap in markdown code fences.`;

      const contents: any[] = [];
      chatMessages.forEach(m => {
        contents.push({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
        });
      });
      const currentContext = `Current Workflow State: ${JSON.stringify(selectedWorkflow || null)}\n\nUser Request: ${text}`;
      contents.push({ role: 'user', parts: [{ text: currentContext }] });

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: { responseMimeType: 'application/json' }
        })
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        throw new Error(`Gemini API error: ${errText}`);
      }

      const geminiData = await geminiRes.json();
      const resultText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      let parsed: any = {};
      try {
        parsed = JSON.parse(resultText);
      } catch {
        parsed = { message: resultText, actions: [] };
      }

      let applied: string[] = [];
      if (parsed.actions && Array.isArray(parsed.actions)) {
        applied = applyChatActions(parsed.actions);
      }

      const stanleyMsg: ChatMessage = {
        id: Math.random().toString(),
        role: 'stanley',
        content: parsed.message || 'Done!',
        actionsApplied: applied.length > 0 ? applied : undefined
      };

      setChatMessages(prev => [...prev, stanleyMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: Math.random().toString(),
        role: 'stanley',
        content: `Error: ${err.message}`
      };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleCreateWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkflowName.trim()) return;

    const newWf: Workflow = {
      id: Math.random().toString(36).substring(2, 9),
      name: newWorkflowName,
      nodes: [
        { id: '1', type: 'trigger', label: 'Start Trigger', data: { url: newWorkflowUrl }, position: { x: 100, y: 50 } }
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
        loadWorkflowInEditor(newWf);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenRunModal = (wf: Workflow) => {
    setRunWorkflowId(wf.id);
    const triggerNode = wf.nodes.find(n => n.type === 'trigger');
    setCustomStartUrl(triggerNode?.data?.url || 'https://');
  };

  const handleRunWorkflow = async () => {
    if (!runWorkflowId) return;

    try {
      const res = await fetch(`${API_URL}/run/${runWorkflowId}`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startUrl: customStartUrl })
      });
      const data = await res.json();
      if (data.success) {
        setRunWorkflowId(null);
        setActiveRunId(data.runId);
        setActiveRun({
          id: data.runId,
          workflowId: runWorkflowId,
          workflowName: workflows.find(w => w.id === runWorkflowId)?.name || 'Workflow',
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

  const fetchSecretsMap = async (): Promise<Record<string, string>> => {
    try {
      const res = await fetch(`${API_URL}/vault`);
      if (res.ok) {
        const secretsList = await res.json();
        const secretsMap: Record<string, string> = {};
        secretsList.forEach((s: any) => {
          secretsMap[s.id] = s.value;
          secretsMap[s.name] = s.value; // key by name and id
        });
        return secretsMap;
      }
    } catch (err) {
      console.error('Error fetching vault credentials:', err);
    }
    return {};
  };

  const handleRunWorkflowInBrowser = async () => {
    if (!runWorkflowId) return;
    const wf = workflows.find(w => w.id === runWorkflowId);
    if (!wf) return;

    setRunWorkflowId(null);
    setNativeRunning(true);
    
    const runId = Math.random().toString(36).substring(2, 9);
    nativeRunIdRef.current = runId;
    nativeRunStartTimeRef.current = Date.now();
    nativeRunLogsRef.current = ['[System] Connecting to browser extension engine...'];

    const mockRun: Run = {
      id: runId,
      workflowId: wf.id,
      workflowName: wf.name,
      status: 'Running',
      trigger: 'Browser Extension',
      duration: '0s',
      timestamp: new Date().toLocaleString(),
      logs: nativeRunLogsRef.current
    };
    setActiveRun(mockRun);

    const secrets = await fetchSecretsMap();

    // Compile workflow nodes and edges
    const compiledWf = JSON.parse(JSON.stringify(wf));
    const triggerNode = compiledWf.nodes.find((n: any) => n.type === 'trigger');
    if (triggerNode && triggerNode.data) {
      triggerNode.data.url = customStartUrl;
    }

    window.postMessage({
      ns: 'stanley-web',
      cmd: 'run_native_workflow',
      workflow: compiledWf,
      secrets: secrets
    }, '*');
  };

  const handleCloseLogs = () => {
    setActiveRun(null);
    setActiveRunId(null);     // stop any polling
    setPollingLogs(false);
    setRetryCount(0);
    setPendingRetryWorkflowId(null);
  };

  const handleCancelRun = () => {
    if (nativeRunning) {
      window.postMessage({ ns: 'stanley-web', cmd: 'cancel_native' }, '*');
      setNativeRunning(false);
      setActiveRun(prev => prev ? {
        ...prev,
        status: 'Failed',
        logs: [...(prev.logs || []), '[System] Native run cancellation requested.']
      } : null);
      setPendingRetryWorkflowId(null);
    } else {
      handleCloseLogs();
    }
  };

  const handleManualRetry = async () => {
    if (!pendingRetryWorkflowId) return;
    try {
      const res = await fetch(`${API_URL}/run/${pendingRetryWorkflowId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.success) {
        setRetryCount(0);
        setPendingRetryWorkflowId(null);
        setActiveRunId(data.runId);
        setActiveRun(prev => prev ? {
          ...prev,
          id: data.runId,
          status: 'Running',
          logs: [...(prev.logs || []), '[System] Manual retry started...']
        } : null);
      }
    } catch (err) {
      console.error('Retry failed:', err);
    }
  };

  const handleDeleteWorkflow = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete workflow "${name}"?`)) return;
    try {
      const res = await fetch(`${API_URL}/workflows/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setWorkflows(workflows.filter(w => w.id !== id));
        if (selectedWorkflow?.id === id) {
          setSelectedWorkflow(null);
          setNodes([]);
          setEdges([]);
        }
      }
    } catch (err) {
      console.error('Error deleting workflow:', err);
    }
  };

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

  const addNode = (type: string) => {
    if (!selectedWorkflow) return;
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
      position: { x: 150, y: 150 },
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
    <div className="view-container" style={{ maxWidth: '100%' }}>
      <div className="view-header">
        <div>
          <h1>Automation Cockpit</h1>
          <p>Monitor, design, and execute your visual flow automations.</p>
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

      <div className="editor-workspace" style={{ marginTop: '1.5rem', height: 'calc(100vh - 280px)', overflow: 'hidden' }}>
        {/* Left Side: Monitor, Saved workflows list and logs history */}
        <div className="glass-panel" style={{ width: '45%', display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1rem', overflowY: 'auto' }}>
          {/* Workflows Directory */}
          <div className="data-table-container">
            <h3 style={{ marginBottom: '0.75rem', fontSize: '0.95rem', borderBottom: '1px solid var(--border-strong)', paddingBottom: '0.5rem' }}>Workflows Directory</h3>
            {loading ? (
              <div className="loading-state"><Loader className="spinner"/> Loading workflows...</div>
            ) : workflows.length === 0 ? (
              <div className="empty-state">No workflows found. Create one to get started!</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Steps</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {workflows.map((w) => (
                    <tr 
                      key={w.id} 
                      onClick={() => loadWorkflowInEditor(w)} 
                      style={{ cursor: 'pointer', background: selectedWorkflow?.id === w.id ? 'rgba(59, 130, 246, 0.08)' : 'transparent' }}
                    >
                      <td className="font-medium">{w.name}</td>
                      <td>{w.nodes.length} nodes</td>
                      <td>
                        <div className="action-buttons" onClick={(e) => e.stopPropagation()}>
                          <button className="btn btn-primary btn-sm" onClick={() => handleOpenRunModal(w)} title="Run Workflow">
                            <Play size={12} /> Run
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => handleDeleteWorkflow(w.id, w.name)} title="Delete Workflow">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Recent Runs Logs list */}
          <div className="data-table-container">
            <h3 style={{ marginBottom: '0.75rem', fontSize: '0.95rem', borderBottom: '1px solid var(--border-strong)', paddingBottom: '0.5rem' }}>Execution Logs & History</h3>
            {loading ? (
              <div className="loading-state"><Loader className="spinner"/> Loading runs...</div>
            ) : runs.length === 0 ? (
              <div className="empty-state">No execution logs found. Run an automation to see details.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Workflow</th>
                    <th>Status</th>
                    <th>Time</th>
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
                      <td>{r.timestamp.split(',')[1]?.trim() || r.timestamp}</td>
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

        {/* Right Side: Split-screen visual editor graph */}
        <div style={{ width: '55%', display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
          {selectedWorkflow ? (
            <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
              <div className="editor-header" style={{ borderBottom: '1px solid var(--border-strong)', padding: '0.5rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="font-medium" style={{ fontSize: '0.9rem' }}>Visual Graph: {selectedWorkflow.name}</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    className={`btn btn-sm ${showChat ? 'btn-primary' : 'btn-secondary'}`} 
                    style={showChat ? { background: 'linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)', border: 'none', boxShadow: '0 0 10px rgba(168, 85, 247, 0.4)' } : {}}
                    onClick={() => setShowChat(!showChat)}
                  >
                    <Sparkles size={14} style={{ marginRight: '4px' }} className={chatLoading ? 'spinner' : ''} />
                    {showChat ? 'Close Copilot' : 'Chat with Stanley'}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={handleSaveWorkflow}>
                    <Save size={14} /> Save Draft
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Visual Editor sidebar for dragging nodes */}
                <div style={{ width: '130px', padding: '0.5rem', background: 'rgba(255,255,255,0.01)', borderRight: '1px solid var(--border-strong)', display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto' }}>
                  <button className="node-item btn-node" style={{ padding: '4px', fontSize: '0.75rem', marginBottom: 0 }} onClick={() => addNode('navigate')}><Globe size={12}/> Navigate</button>
                  <button className="node-item btn-node" style={{ padding: '4px', fontSize: '0.75rem', marginBottom: 0 }} onClick={() => addNode('click')}><Plus size={12}/> Click</button>
                  <button className="node-item btn-node" style={{ padding: '4px', fontSize: '0.75rem', marginBottom: 0 }} onClick={() => addNode('type')}><Type size={12}/> Type</button>
                  <button className="node-item btn-node" style={{ padding: '4px', fontSize: '0.75rem', marginBottom: 0 }} onClick={() => addNode('scrape')}><Database size={12}/> Scrape</button>
                  <button className="node-item btn-node" style={{ padding: '4px', fontSize: '0.75rem', marginBottom: 0 }} onClick={() => addNode('open_tab')}><ExternalLink size={12}/> Open Tab</button>
                  <button className="node-item btn-node" style={{ padding: '4px', fontSize: '0.75rem', marginBottom: 0 }} onClick={() => addNode('switch_tab')}><RefreshCw size={12}/> Switch Tab</button>
                  <button className="node-item btn-node" style={{ padding: '4px', fontSize: '0.75rem', marginBottom: 0 }} onClick={() => addNode('close_tab')}><X size={12}/> Close Tab</button>
                  <button className="node-item btn-node" style={{ padding: '4px', fontSize: '0.75rem', marginBottom: 0 }} onClick={() => addNode('if')}><GitFork size={12}/> If Branch</button>
                  <button className="node-item btn-node" style={{ padding: '4px', fontSize: '0.75rem', marginBottom: 0 }} onClick={() => addNode('goto')}><ArrowRight size={12}/> Goto</button>
                  <button className="node-item btn-node" style={{ padding: '4px', fontSize: '0.75rem', marginBottom: 0 }} onClick={() => addNode('label')}><Bookmark size={12}/> Label</button>
                  <button className="node-item btn-node" style={{ padding: '4px', fontSize: '0.75rem', marginBottom: 0 }} onClick={() => addNode('wait')}><Clock size={12}/> Wait</button>
                  <button className="node-item btn-node" style={{ padding: '4px', fontSize: '0.75rem', marginBottom: 0, background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.4)' }} onClick={() => addNode('ai_prompt')}><Sparkles size={12}/> AI Prompt</button>
                  <button className="node-item btn-node" style={{ padding: '4px', fontSize: '0.75rem', marginBottom: 0, background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.4)' }} onClick={() => addNode('js_code')}><Code size={12}/> JS Script</button>
                </div>

                {/* Canvas graph */}
                <div className="editor-canvas canvas-bg" style={{ flex: 1, position: 'relative' }}>
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
                    <Background color="#ffffff" gap={16} />
                    <Controls />
                  </ReactFlow>
                </div>

                {/* Chatbot sidebar panel */}
                {showChat && (
                  <div className="chatbot-sidebar">
                    <div className="chat-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a855f7' }}>
                        <Sparkles size={16} />
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Stanley Copilot</span>
                      </div>
                      <button 
                        style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}
                        onClick={() => setShowChat(false)}
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div className="chat-messages">
                      {chatMessages.map((msg) => (
                        <div key={msg.id} className={`chat-message ${msg.role}`}>
                          <div className={`chat-avatar ${msg.role}`}>
                            {msg.role === 'stanley' ? 'S' : 'U'}
                          </div>
                          <div>
                            <div className="chat-bubble">
                              {msg.content}
                              
                              {msg.actionsApplied && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '6px' }}>
                                  {msg.actionsApplied.map((log, index) => (
                                    <span key={index} className="action-badge">
                                      ✓ {log}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {chatLoading && (
                        <div className="chat-message stanley">
                          <div className="chat-avatar stanley">S</div>
                          <div className="chat-bubble" style={{ minWidth: '60px' }}>
                            <div className="typing-indicator">
                              <div className="typing-dot" />
                              <div className="typing-dot" />
                              <div className="typing-dot" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="chat-suggestions">
                      <button 
                        className="suggestion-chip" 
                        onClick={() => handleSendChatMessage('Create a google search automation flow')}
                      >
                        🔍 Google Search Flow
                      </button>
                      <button 
                        className="suggestion-chip" 
                        onClick={() => handleSendChatMessage('Add a wait node for 3 seconds')}
                      >
                        ⏱️ Add 3s Wait
                      </button>
                      <button 
                        className="suggestion-chip" 
                        onClick={() => handleSendChatMessage('Write a JS script to scrape article links')}
                      >
                        💻 Scrape JS Script
                      </button>
                    </div>

                    <div className="chat-input-container">
                      <input 
                        type="text" 
                        className="chat-input"
                        placeholder="Ask Stanley to help..."
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSendChatMessage();
                          }
                        }}
                        disabled={chatLoading}
                      />
                      <button 
                        className="btn btn-primary" 
                        style={{ padding: '4px 10px', fontSize: '0.8rem', background: '#a855f7', borderColor: '#a855f7' }}
                        onClick={() => handleSendChatMessage()}
                        disabled={chatLoading}
                      >
                        Send
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Node properties bottom sheet */}
              <div style={{ height: '140px', borderTop: '1px solid var(--border-strong)', padding: '0.5rem 1rem', overflowY: 'auto', background: 'var(--bg-surface-elevated)' }}>
                {currentNode ? (
                  <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '150px' }}>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Display Label</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                        value={currentNode.data.label || ''} 
                        onChange={(e) => updateNodeTitle(e.target.value)} 
                      />
                    </div>

                    {(currentNode.data.type === 'trigger' || currentNode.data.type === 'navigate') && (
                      <div style={{ flex: 2, minWidth: '200px' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Target URL</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                          value={currentNode.data.data?.url || ''} 
                          onChange={(e) => updateNodeDataField('url', e.target.value)} 
                        />
                      </div>
                    )}

                    {(currentNode.data.type === 'click' || currentNode.data.type === 'type' || currentNode.data.type === 'scrape') && (
                      <>
                        <div style={{ flex: 1, minWidth: '150px' }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Element Description</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                            placeholder="e.g. login button"
                            value={currentNode.data.data?.description || ''} 
                            onChange={(e) => updateNodeDataField('description', e.target.value)} 
                          />
                        </div>
                        <div style={{ flex: 1.5, minWidth: '180px' }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>CSS Selector</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                            placeholder="e.g. #submit"
                            value={currentNode.data.data?.selector || ''} 
                            onChange={(e) => updateNodeDataField('selector', e.target.value)} 
                          />
                        </div>
                      </>
                    )}

                    {currentNode.data.type === 'type' && (
                      <div style={{ flex: 1, minWidth: '150px' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Value to Type</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                          placeholder="e.g. vault:Email"
                          value={currentNode.data.data?.value || ''} 
                          onChange={(e) => updateNodeDataField('value', e.target.value)} 
                        />
                      </div>
                    )}

                    {currentNode.data.type === 'wait' && (
                      <div style={{ flex: 1, minWidth: '120px' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Wait Duration (ms)</label>
                        <input 
                          type="number" 
                          className="form-input" 
                          style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                          value={currentNode.data.data?.ms || '1000'} 
                          onChange={(e) => updateNodeDataField('ms', e.target.value)} 
                        />
                      </div>
                    )}

                    {currentNode.data.type === 'open_tab' && (
                      <>
                        <div style={{ flex: 1.5, minWidth: '150px' }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Start URL (Optional)</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                            value={currentNode.data.data?.url || ''} 
                            onChange={(e) => updateNodeDataField('url', e.target.value)} 
                          />
                        </div>
                        <div style={{ flex: 1, minWidth: '120px' }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Tab Label</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                            value={currentNode.data.data?.label || ''} 
                            onChange={(e) => updateNodeDataField('label', e.target.value)} 
                          />
                        </div>
                      </>
                    )}

                    {(currentNode.data.type === 'switch_tab' || currentNode.data.type === 'close_tab') && (
                      <div style={{ flex: 1, minWidth: '150px' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Tab ID/Label/Index</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                          value={currentNode.data.data?.tab || currentNode.data.data?.index || ''} 
                          onChange={(e) => {
                            updateNodeDataField('tab', e.target.value);
                            updateNodeDataField('index', e.target.value);
                          }} 
                        />
                      </div>
                    )}

                    {(currentNode.data.type === 'if' || currentNode.data.type === 'condition') && (
                      <>
                        <div style={{ flex: 1, minWidth: '150px' }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Condition Type</label>
                          <select 
                            className="form-input select-workflow"
                            style={{ padding: '4px 8px', fontSize: '0.8rem', height: 'auto' }}
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
                          <div style={{ flex: 1, minWidth: '150px' }}>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Condition Value</label>
                            <input 
                              type="text" 
                              className="form-input" 
                              style={{ padding: '4px 8px', fontSize: '0.8rem' }}
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

                    {(currentNode.data.type === 'goto' || currentNode.data.type === 'label') && (
                      <div style={{ flex: 1, minWidth: '150px' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Label Name</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                          value={currentNode.data.data?.label || ''} 
                          onChange={(e) => updateNodeDataField('label', e.target.value)} 
                        />
                      </div>
                    )}

                    {currentNode.data.type === 'ai_prompt' && (
                      <>
                        <div style={{ flex: 2, minWidth: '250px' }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{"AI Prompt Instructions (supports dynamic {{lastScrape}} or {{nodeId}} interpolation)"}</label>
                          <textarea 
                            className="form-input" 
                            style={{ padding: '6px 8px', fontSize: '0.8rem', minHeight: '60px', fontFamily: 'monospace' }}
                            rows={3}
                            placeholder="e.g. Summarize the following news articles in 3 bullet points: {{lastScrape}}"
                            value={currentNode.data.data?.prompt || ''} 
                            onChange={(e) => updateNodeDataField('prompt', e.target.value)} 
                          />
                        </div>
                        <div style={{ flex: 1.5, minWidth: '200px' }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>System Instruction (Optional)</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                            placeholder="e.g. You are a precise financial analyst."
                            value={currentNode.data.data?.system || ''} 
                            onChange={(e) => updateNodeDataField('system', e.target.value)} 
                          />
                        </div>
                      </>
                    )}

                    {currentNode.data.type === 'js_code' && (
                      <div style={{ flex: 1, minWidth: '350px' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: '2px' }}>
                          {"JavaScript Script (Execution context has `agent`, `scraped`, `secrets`, `log`, `ai`, and `variables`)"}
                        </label>
                        <textarea 
                          className="form-input" 
                          style={{ padding: '6px 8px', fontSize: '0.75rem', minHeight: '120px', fontFamily: 'Courier New, monospace', lineHeight: '1.3' }}
                          rows={6}
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
                ) : currentEdge ? (
                  <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1.5, minWidth: '180px' }}>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Routing Condition</label>
                      <select 
                        className="form-input select-workflow"
                        style={{ padding: '4px 8px', fontSize: '0.8rem', height: 'auto' }}
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
                      <div style={{ flex: 1, minWidth: '150px' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Condition Value</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                          value={currentEdge.data?.condition?.value || ''} 
                          onChange={(e) => {
                            const type = currentEdge.data?.condition?.type || '';
                            updateEdgeConditionField(type, e.target.value);
                          }} 
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', paddingTop: '1.5rem', fontSize: '0.85rem' }}>
                    Select a node or edge on the visual graph to configure its parameters.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem' }}>
              <GitFork size={48} style={{ marginBottom: '1rem', color: 'var(--border-strong)' }} />
              <h3>No Workflow Selected</h3>
              <p style={{ fontSize: '0.85rem', maxWidth: '300px', margin: '0.5rem auto 0 auto' }}>
                Select a workflow from the directory on the left to display its interactive visual node graph and properties.
              </p>
            </div>
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

      {/* Run Workflow URL Input Modal */}
      {runWorkflowId && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <h2>Trigger Automation</h2>
            <div className="form-group">
              <label>Enter Starting URL for this Run</label>
              <input 
                type="text" 
                className="form-input" 
                value={customStartUrl} 
                onChange={(e) => setCustomStartUrl(e.target.value)} 
                placeholder="https://..." 
                required
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setRunWorkflowId(null)}>Cancel</button>
              {extensionActive && (
                <button 
                  className="btn btn-primary" 
                  style={{ background: 'linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)', borderColor: 'transparent', boxShadow: '0 0 10px rgba(168, 85, 247, 0.4)' }} 
                  onClick={handleRunWorkflowInBrowser}
                >
                  <Play size={14} style={{ display: 'inline', marginRight: '4px' }}/> Run in Browser
                </button>
              )}
              <button className="btn btn-primary" onClick={handleRunWorkflow}>
                <Play size={14} style={{ display: 'inline', marginRight: '4px' }}/> Launch Headless Run
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logs Details Modal */}
      {activeRun && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel logs-modal">
            <div className="modal-header">
              <h2>Execution Logs: {activeRun.workflowName}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {pollingLogs && retryCount > 0 && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Retry {retryCount}/{MAX_AUTO_RETRIES}
                  </span>
                )}
                <span className={`badge badge-${activeRun.status.toLowerCase()}`}>
                  {activeRun.status}
                </span>
              </div>
            </div>
            
            <div className="log-output-box">
              {activeRun.logs && activeRun.logs.map((log, index) => (
                <div key={index} className="log-line">
                  {log}
                </div>
              ))}
              {pollingLogs && (
                <div className="log-line active-polling">
                  <Loader className="spinner inline"/> Running...
                  {retryCount > 0 && ` (auto-retry ${retryCount}/${MAX_AUTO_RETRIES})`}
                </div>
              )}
              {/* Terminal failure state — max retries exhausted */}
              {activeRun.status === 'Failed' && !pollingLogs && retryCount >= MAX_AUTO_RETRIES && (
                <div className="log-line" style={{ color: 'var(--error)', marginTop: '0.5rem', fontWeight: 600 }}>
                  ⚠️ Workflow failed after {MAX_AUTO_RETRIES} attempts.
                </div>
              )}
            </div>

            <div className="modal-actions">
              {nativeRunning && (
                <button
                  className="btn btn-secondary"
                  style={{ borderColor: 'var(--error)', color: 'var(--error)' }}
                  onClick={handleCancelRun}
                >
                  Cancel Run
                </button>
              )}
              {/* Manual Retry button — shown only after all auto-retries are exhausted */}
              {activeRun.status === 'Failed' && !pollingLogs && retryCount >= MAX_AUTO_RETRIES && pendingRetryWorkflowId && (
                <button className="btn btn-secondary" onClick={handleManualRetry}>
                  <RefreshCw size={14} style={{ display: 'inline', marginRight: '4px' }}/> Retry
                </button>
              )}
              {/* Only allow closing when not actively running */}
              {!pollingLogs && (
                <button className="btn btn-primary" onClick={handleCloseLogs}>
                  Close Logs
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Cockpit() {
  return (
    <ReactFlowProvider>
      <CockpitInner />
    </ReactFlowProvider>
  );
}
