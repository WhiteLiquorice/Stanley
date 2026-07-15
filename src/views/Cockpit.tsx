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
  Code,
  Circle,
  Square,
  Target,
  Tag,
  PanelLeft,
  Blocks,
  Beaker,
  UploadCloud
} from 'lucide-react';
import './Views.css';
import { listDocs, setDoc, deleteDoc } from '../lib/firestore';
import { chatCopilot, compilePrompt, runAiAnalysis } from '../lib/stanleyCloud';
import { runHeadless, isHeadlessConfigured } from '../lib/stanleyRunner';
import { TriggersPanel } from '../components/TriggersPanel';
import { getIntegrationLabel, getIntegrationsByApp } from '../lib/integrationsCatalog';
import { WorkflowPlatformModal } from '../components/WorkflowPlatformModal';
import { uploadArtifact } from '../lib/artifactClient';

// Interface definitions matching the backend data structure
interface NodeData {
  [key: string]: any;
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
  schema?: string;
  maxPages?: string;
  actionNodeId?: string;
  goal?: string;
  maxSteps?: string;
  integrationName?: string;
  query?: string;
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
  kind?: string; // 'context' for parameter/mission attachments (excluded from flow)
  sourceHandle?: string | null; // which of the 4 handles the edge attaches to
  targetHandle?: string | null;
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
  scraped?: Record<string, any>;
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
  kind?: string; // 'context' for parameter/mission attachments (not flow)
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
      case 'record': return <Circle size={14} style={{ color: '#ef4444' }} fill="#ef4444" className="spinner-glow" />;
      case 'mission': return <Target size={14}/>;
      case 'parameter': return <Tag size={14}/>;
      case 'extract': return <Database size={14} style={{ color: '#10b981' }}/>;
      case 'extract_list': return <Database size={14} style={{ color: '#059669' }}/>;
      case 'paginate': return <RefreshCw size={14} style={{ color: '#3b82f6' }}/>;
      case 'agent': return <Sparkles size={14} style={{ color: '#a855f7' }}/>;
      case 'integration': return <Globe size={14} style={{ color: '#f59e0b' }}/>;
      default: return <Plus size={14}/>;
    }
  };

  return (
    <div className={`mock-node ${type} ${selected ? 'selected-node' : ''}`}>
      {/* Four connection points. Top/bottom = flow (declared first so edges with
          no saved handle default to vertical flow). Left/right = extra points,
          handy for hanging Parameter/Mission nodes off the side. Any handle
          accepts multiple edges, so several nodes can converge on one. */}
      <Handle type="target" id="top" position={Position.Top} style={{ background: 'var(--border-strong)', width: 9, height: 9 }} />
      <Handle type="source" id="bottom" position={Position.Bottom} style={{ background: 'var(--border-strong)', width: 9, height: 9 }} />
      <Handle type="target" id="left" position={Position.Left} style={{ background: '#a855f7', width: 9, height: 9 }} />
      <Handle type="source" id="right" position={Position.Right} style={{ background: '#a855f7', width: 9, height: 9 }} />

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
        {type === 'record' && `Record URL: ${nodeData?.url || 'None'}`}
        {type === 'mission' && `🎯 ${nodeData?.prompt ? (nodeData.prompt.substring(0, 40) + (nodeData.prompt.length > 40 ? '…' : '')) : 'Set the overall goal…'}`}
        {type === 'parameter' && (() => {
          const keys = Object.keys(nodeData || {});
          return keys.length ? keys.map(k => `${k}: ${String(nodeData[k]).startsWith('vault:') ? '🔒' : nodeData[k]}`).join(', ') : 'Add fields…';
        })()}
        {type === 'extract' && `Extract Schema: ${nodeData?.schema ? nodeData.schema.substring(0, 25) + '...' : 'None'}`}
        {type === 'extract_list' && `List Schema: ${nodeData?.schema ? nodeData.schema.substring(0, 25) + '...' : 'None'}`}
        {type === 'paginate' && `Next: ${nodeData?.selector || nodeData?.description || '?'}, Max: ${nodeData?.maxPages || 3}`}
        {type === 'agent' && `Goal: ${nodeData?.goal || 'None'} [${nodeData?.maxSteps || 8} steps]`}
        {type === 'integration' && `API: ${getIntegrationLabel(nodeData?.integrationName || '')}`}
      </div>
    </div>
  );
}

const nodeTypes = {
  workflowNode: WorkflowNodeComponent
};

const advancedNodeFields: Record<string, Array<{ key: string; label: string; placeholder?: string }>> = {
  scroll: [{ key: 'amount', label: 'Pixels (+ down / - up)', placeholder: '700' }, { key: 'selector', label: 'Or element selector' }],
  find_text: [{ key: 'text', label: 'Text to find' }],
  send_keys: [{ key: 'keys', label: 'Keyboard shortcut', placeholder: 'Control+Enter' }],
  select_dropdown: [{ key: 'selector', label: 'Select selector' }, { key: 'description', label: 'Or accessible label' }, { key: 'value', label: 'Option value' }],
  hover: [{ key: 'selector', label: 'Target selector' }, { key: 'description', label: 'Or element text' }],
  drag_drop: [{ key: 'sourceSelector', label: 'Source selector' }, { key: 'targetSelector', label: 'Target selector' }],
  upload_file: [{ key: 'artifactId', label: 'Tenant artifact ID' }, { key: 'selector', label: 'File input selector' }],
  download_file: [{ key: 'selector', label: 'Download control selector' }, { key: 'description', label: 'Or control description' }],
  mcp_tool: [{ key: 'serverUrl', label: 'MCP endpoint URL' }, { key: 'toolName', label: 'Tool name' }, { key: 'arguments', label: 'Arguments JSON', placeholder: '{}' }, { key: 'vaultKey', label: 'Token vault key' }],
};

const mapActionsToGraph = (actions: any[], prompt: string) => {
  const nodes: any[] = [];
  const edges: any[] = [];
  
  // Find first URL to set the trigger node
  let triggerUrl = 'https://google.com';
  const firstNavigate = actions.find(a => a.action === 'navigate' || a.action === 'trigger');
  if (firstNavigate?.url) {
    triggerUrl = firstNavigate.url;
  }
  
  // Add initial trigger node
  nodes.push({
    id: '1',
    type: 'trigger',
    label: 'Start Trigger',
    data: { url: triggerUrl },
    position: { x: 250, y: 50 }
  });

  // Add Mission supernode
  nodes.push({
    id: 'mission-1',
    type: 'mission',
    label: 'Mission Context',
    data: { prompt: prompt },
    position: { x: 30, y: -50 }
  });

  // Connect Mission to Trigger
  edges.push({
    id: `e-mission-1-1`,
    source: 'mission-1',
    target: '1',
    type: 'smoothstep',
    data: { kind: 'context' }
  });
  
  let currentY = 190;
  let nodeCount = 2;
  
  actions.forEach((a) => {
    // If it was the first navigate, skip adding it as a separate node since it's already the trigger
    if (a === firstNavigate) return;
    
    let nodeType = '';
    let label = '';
    let data: any = {};
    
    switch (a.action) {
      case 'navigate':
        nodeType = 'navigate';
        label = `Navigate to ${a.url}`;
        data = { url: a.url };
        break;
      case 'click':
        nodeType = 'click';
        label = `Click "${a.description}"`;
        data = { description: a.description, selector: a.selector || '' };
        break;
      case 'type':
        nodeType = 'type';
        label = `Type "${a.value}"`;
        data = { description: a.description, value: a.value, selector: a.selector || '' };
        break;
      case 'wait':
        nodeType = 'wait';
        label = `Wait ${a.ms || a.duration || 1000}ms`;
        data = { ms: String(a.ms || a.duration || 1000) };
        break;
      case 'scrape':
        nodeType = 'scrape';
        label = 'Scrape content';
        data = { selector: a.selector || '' };
        break;
      case 'open_tab':
        nodeType = 'open_tab';
        label = 'Open Tab';
        data = { url: a.url || '', label: '' };
        break;
      case 'switch_tab':
        nodeType = 'switch_tab';
        label = `Switch to Tab ${a.index}`;
        data = { tab: String(a.index) };
        break;
      case 'close_tab':
        nodeType = 'close_tab';
        label = `Close Tab ${a.index}`;
        data = { tab: String(a.index) };
        break;
      default:
        return; // skip unknown
    }
    
    const nodeId = String(nodeCount++);
    nodes.push({
      id: nodeId,
      type: nodeType,
      label,
      data,
      position: { x: 250, y: currentY }
    });
    
    // Connect to previous node
    const prevId = String(nodeCount - 2);
    edges.push({
      id: `e-${prevId}-${nodeId}`,
      source: prevId,
      target: nodeId,
      type: 'smoothstep'
    });
    
    currentY += 140;
  });
  
  // Add an AI Prompt node at the end
  const finalNodeId = String(nodeCount++);
  nodes.push({
    id: finalNodeId,
    type: 'ai_prompt',
    label: 'Final AI Analysis',
    data: { prompt: "Analyze the scraped results or execution history and provide the final output requested by the user." },
    position: { x: 250, y: currentY }
  });
  
  // Connect to the AI Prompt node
  const lastRealNodeId = String(nodeCount - 2);
  edges.push({
    id: `e-${lastRealNodeId}-${finalNodeId}`,
    source: lastRealNodeId,
    target: finalNodeId,
    type: 'smoothstep'
  });

  return { nodes, edges };
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

  // Custom run modal state
  const [runWorkflowId, setRunWorkflowId] = useState<string | null>(null);
  const [customStartUrl, setCustomStartUrl] = useState('');

  // Logs modal state
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
  const [showChat, setShowChat] = useState(true);
  const [showLibrary, setShowLibrary] = useState(true);
  const [showNodePalette, setShowNodePalette] = useState(false);
  const [showTriggers, setShowTriggers] = useState(false);
  const [showPlatform, setShowPlatform] = useState(false);
  const [uploadingArtifact, setUploadingArtifact] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'stanley', content: 'Hi! I\'m Stanley, your automation copilot. Tell me what you want to automate, or ask me to add/edit steps in your flow!' }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [generatingFlow, setGeneratingFlow] = useState(false);
  const [usingLmStudio, setUsingLmStudio] = useState(false);
  // Copilot mode: 'edit' tweaks the selected flow via chat; 'build' generates a brand-new flow from a description.
  const [chatMode, setChatMode] = useState<'edit' | 'build'>('edit');

  // Recorder state
  const [recording, setRecording] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recordingNodeId, setRecordingNodeId] = useState<string | null>(null);

  const [extensionActive, setExtensionActive] = useState(false);
  const [nativeRunning, setNativeRunning] = useState(false);

  const nativeRunLogsRef = useRef<string[]>([]);
  const nativeRunStartTimeRef = useRef<number>(0);
  const nativeRunIdRef = useRef<string>('');
  const selectedWorkflowRef = useRef(selectedWorkflow);

  // Only the optional desktop recorder daemon still uses this. All workflow/run
  // CRUD and headless execution go through Firestore + the Cloud Run runner.
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
        const { action, log, error, result, reqId, prompt, context } = e.data;
        if (action === 'run_ai_prompt') {
          runAiAnalysis(prompt, context)
            .then(aiResult => {
              window.postMessage({ ns: 'stanley-web', cmd: 'ai_prompt_response', reqId, result: aiResult }, '*');
            })
            .catch(err => {
              window.postMessage({ ns: 'stanley-web', cmd: 'ai_prompt_response', reqId, result: `AI Error: ${err.message}` }, '*');
            });
        } else if (action === 'native_log') {
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
              logs: updatedLogs,
              scraped: result || {}
            };
            
            setDoc('runs', finalRun.id, finalRun as unknown as Record<string, unknown>)
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

            setDoc('runs', finalRun.id, finalRun as unknown as Record<string, unknown>)
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
      const [wfs, runData, vaultItems] = await Promise.all([
        listDocs('workflows'),
        listDocs('runs').catch(() => []),
        listDocs('vault').catch(() => []),
      ]);
      setWorkflows(wfs as unknown as Workflow[]);
      setRuns(runData as unknown as any[]);
      const lmSecret = vaultItems.find(
        (s: any) => typeof s.name === 'string' &&
          s.name.toLowerCase().replace(/\s+/g, '').includes('lmstudio')
      );
      setUsingLmStudio(!!lmSecret);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Node deletion callback
  const handleDeleteNode = useCallback((id: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== id));
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
    setSelectedNodeId((prev) => (prev === id ? null : prev));
  }, [setNodes, setEdges]);

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
          onDelete: handleDeleteNode
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
      const isContext = (edge as any).kind === 'context';
      return {
        id: `e-${edge.source}-${edge.target}-${index}`,
        source: edge.source,
        target: edge.target,
        sourceHandle: (edge as any).sourceHandle ?? undefined,
        targetHandle: (edge as any).targetHandle ?? undefined,
        type: 'smoothstep',
        label: isContext ? 'context' : label,
        animated: isContext,
        style: isContext ? { stroke: '#a855f7', strokeDasharray: '5 5' } : undefined,
        data: { condition: cond, kind: isContext ? 'context' : undefined }
      };
    });

    setNodes(rfNodes);
    setEdges(rfEdges);
  };

  const handleCrystallizeAgent = (nodeId: string, history: any[]) => {
    if (!history || !Array.isArray(history) || history.length === 0) return;
    
    const agentNode = nodes.find(n => n.id === nodeId);
    if (!agentNode) return;
    
    const newNodes: MyRFNode[] = [];
    const newEdges: MyRFEdge[] = [];
    
    let currentX = agentNode.position.x;
    let currentY = agentNode.position.y;
    
    history.forEach((step, idx) => {
      const stepId = `c_${nodeId}_${idx}_${Math.random().toString(36).substring(2, 5)}`;
      let stepType = step.action;
      if (stepType === 'finish') return;
      
      const labelMap: Record<string, string> = {
        click: 'Crystallized Click',
        type: 'Crystallized Type',
        navigate: 'Crystallized Navigate',
        wait: 'Crystallized Wait',
        scrape: 'Crystallized Scrape'
      };
      
      const nodeData: Record<string, any> = {};
      if (stepType === 'click') {
        nodeData.description = step.description || '';
      } else if (stepType === 'type') {
        nodeData.description = step.description || '';
        nodeData.value = step.value || '';
      } else if (stepType === 'navigate') {
        nodeData.url = step.url || '';
      } else if (stepType === 'wait') {
        nodeData.ms = String(step.ms || '2000');
      } else if (stepType === 'scrape') {
        nodeData.selector = step.selector || '';
      }
      
      newNodes.push({
        id: stepId,
        type: 'workflowNode',
        position: { x: currentX, y: currentY + idx * 140 },
        data: {
          id: stepId,
          type: stepType,
          label: labelMap[stepType] || `Agent Step ${idx + 1}`,
          data: nodeData,
          onDelete: handleDeleteNode
        }
      });
    });
    
    if (newNodes.length === 0) return;
    
    for (let i = 0; i < newNodes.length - 1; i++) {
      newEdges.push({
        id: `e_${newNodes[i].id}_${newNodes[i+1].id}`,
        source: newNodes[i].id,
        target: newNodes[i+1].id,
        sourceHandle: 'bottom',
        targetHandle: 'top',
        type: 'smoothstep',
        data: { condition: 'always' }
      });
    }
    
    const incomingEdges = edges.filter(e => e.target === nodeId);
    const updatedIncoming = incomingEdges.map(e => ({
      ...e,
      target: newNodes[0].id
    }));
    
    const outgoingEdges = edges.filter(e => e.source === nodeId);
    const updatedOutgoing = outgoingEdges.map(e => ({
      ...e,
      source: newNodes[newNodes.length - 1].id
    }));
    
    const filteredNodes = nodes.filter(n => n.id !== nodeId);
    const filteredEdges = edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    
    setNodes([...filteredNodes, ...newNodes]);
    setEdges([...filteredEdges, ...newEdges, ...updatedIncoming, ...updatedOutgoing]);
    setSelectedNodeId(newNodes[0].id);
  };

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

  // Note: cloud headless runs are synchronous — runHeadless() returns the full
  // logs when finished — so there's no run to poll. handleRunWorkflow drives the
  // whole lifecycle (including auto-retry) inline. No polling effect needed.

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
      // Automatically persist to Firestore so changes survive a refresh
      setDoc('workflows', wf.id, wf as unknown as Record<string, unknown>)
        .then(() => {
          setWorkflows(prev => prev.map(w => w.id === wf.id ? wf : w));
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
      const parsed = await chatCopilot(
        text,
        selectedWorkflow || {},
        chatMessages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))
      );

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

  // Create a fresh automation and drop straight into the React Flow editor — no
  // URL-first modal. The start URL is set on the trigger node in the canvas (or
  // the user can begin with an Open Tab node so the run doesn't take over a tab).
  const handleNewAutomation = async () => {
    const newWf: Workflow = {
      id: Math.random().toString(36).substring(2, 9),
      name: `Untitled Automation ${workflows.length + 1}`,
      nodes: [
        { id: '1', type: 'trigger', label: 'Start Trigger', data: { url: 'https://' }, position: { x: 250, y: 60 } }
      ],
      edges: []
    };

    try {
      await setDoc('workflows', newWf.id, newWf as unknown as Record<string, unknown>);
      setWorkflows([...workflows, newWf]);
      loadWorkflowInEditor(newWf);
    } catch (err) {
      console.error(err);
      alert('Failed to create automation. Please try again.');
    }
  };

  useEffect(() => {
    const handleNewAutomationEvent = () => {
      handleNewAutomation();
    };
    window.addEventListener('new-automation', handleNewAutomationEvent);
    return () => window.removeEventListener('new-automation', handleNewAutomationEvent);
  }, [workflows, handleNewAutomation]);

  // Rename the open workflow inline from the editor header; persist on commit.
  const updateWorkflowName = (name: string) => {
    if (!selectedWorkflow) return;
    setSelectedWorkflow({ ...selectedWorkflow, name });
  };
  const commitWorkflowName = async () => {
    if (!selectedWorkflow) return;
    const name = (selectedWorkflow.name || '').trim() || 'Untitled Automation';
    const updated = { ...selectedWorkflow, name };
    setSelectedWorkflow(updated);
    setWorkflows(prev => prev.map(w => w.id === updated.id ? { ...w, name } : w));
    try {
      await setDoc('workflows', updated.id, updated as unknown as Record<string, unknown>);
    } catch (err) {
      console.error('Failed to rename workflow:', err);
    }
  };

  // Build a brand-new workflow from a plain-English description (compile mode).
  // Posts progress into the Copilot chat so it's the single AI surface.
  const handleBuildFlow = async (textToSend?: string) => {
    const prompt = (textToSend || chatInput).trim();
    if (!prompt) return;

    if (!textToSend) setChatInput('');

    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      role: 'user',
      content: prompt
    };
    setChatMessages(prev => [...prev, userMsg]);
    setGeneratingFlow(true);

    try {
      const actions = await compilePrompt(prompt);
      if (!Array.isArray(actions) || actions.length === 0) {
        throw new Error('AI did not return a valid list of workflow actions.');
      }
      const mapped = mapActionsToGraph(actions, prompt);
      const newWfName = `AI: ${prompt.length > 30 ? prompt.substring(0, 27) + '...' : prompt}`;
      const newWf: Workflow = {
        id: Math.random().toString(36).substring(2, 9),
        name: newWfName,
        nodes: mapped.nodes,
        edges: mapped.edges,
      };
      await setDoc('workflows', newWf.id, newWf as unknown as Record<string, unknown>);
      setWorkflows(prev => [...prev, newWf]);
      loadWorkflowInEditor(newWf);

      setChatMessages(prev => [...prev, {
        id: Math.random().toString(),
        role: 'stanley',
        content: `Built a new flow "${newWf.name}" with ${mapped.nodes.length} steps and loaded it into the editor. Switch to Edit Flow to tweak it, or just tell me what to change.`,
        actionsApplied: [`Created workflow "${newWf.name}"`]
      }]);

      // After building, switch to edit mode so follow-up messages refine this flow.
      setChatMode('edit');
    } catch (err: any) {
      console.error(err);
      setChatMessages(prev => [...prev, {
        id: Math.random().toString(),
        role: 'stanley',
        content: `Failed to build the flow: ${err.message}`
      }]);
    } finally {
      setGeneratingFlow(false);
    }
  };

  // Routes the Copilot Send button to the right handler based on the active mode.
  const handleCopilotSend = (textToSend?: string) => {
    if (chatMode === 'build') {
      handleBuildFlow(textToSend);
    } else {
      handleSendChatMessage(textToSend);
    }
  };

  const handleOpenRunModal = (wf: Workflow) => {
    setRunWorkflowId(wf.id);
    const triggerNode = wf.nodes.find(n => n.type === 'trigger');
    setCustomStartUrl(triggerNode?.data?.url || 'https://');
  };

  // Cloud headless run: send the workflow to the Cloud Run service, which executes
  // it with Playwright server-side and returns the logs when finished.
  const handleRunWorkflow = async () => {
    if (!runWorkflowId) return;
    const wf = workflows.find(w => w.id === runWorkflowId);
    if (!wf) return;
    setRunWorkflowId(null);
    await executeCloudRun(wf, customStartUrl);
  };

  // Drives a full synchronous cloud run with inline auto-retry, then persists the
  // finished run to Firestore. Shared by the Run modal and the manual Retry button.
  const executeCloudRun = async (wf: Workflow, startUrl: string) => {
    const runId = Math.random().toString(36).substring(2, 9);
    const startTime = Date.now();

    setPollingLogs(true);
    setRetryCount(0);
    setPendingRetryWorkflowId(null);
    setActiveRun({
      id: runId,
      workflowId: wf.id,
      workflowName: wf.name,
      status: 'Running',
      trigger: 'Cloud Headless',
      duration: '0s',
      timestamp: new Date().toLocaleString(),
      logs: ['[System] Sending workflow to the cloud runner…']
    });

    // Apply the custom start URL to the trigger node, and resolve vault secrets.
    const secrets = await fetchSecretsMap();
    const compiledWf = JSON.parse(JSON.stringify(wf));
    const triggerNode = compiledWf.nodes.find((n: any) => n.type === 'trigger');
    if (triggerNode && triggerNode.data) triggerNode.data.url = startUrl;

    let finalRun: Run | null = null;
    let transportError = false;

    for (let attempt = 0; attempt < MAX_AUTO_RETRIES; attempt++) {
      if (attempt > 0) {
        setActiveRun(prev => prev ? {
          ...prev,
          status: 'Running',
          logs: [...(prev.logs || []), `[System] Auto-retry ${attempt}/${MAX_AUTO_RETRIES - 1}…`]
        } : prev);
      }

      try {
        const result = await runHeadless(compiledWf, secrets);
        const duration = `${Math.round((Date.now() - startTime) / 1000)}s`;
        const logs = (result.logs && result.logs.length)
          ? [...result.logs]
          : [result.success ? '[System] Completed.' : '[System] Run failed.'];
        if (!result.success && result.error) logs.push(`[System] ❌ ${result.error}`);

        finalRun = {
          id: runId,
          workflowId: wf.id,
          workflowName: wf.name,
          status: result.success ? 'Success' : 'Failed',
          trigger: 'Cloud Headless',
          duration,
          timestamp: new Date().toLocaleString(),
          logs,
        };
        setActiveRun(finalRun);
        if (result.success) break;        // retry only on run-level failure
      } catch (err: any) {
        // Transport/auth/config failure — don't hammer the runner in a loop.
        const duration = `${Math.round((Date.now() - startTime) / 1000)}s`;
        finalRun = {
          id: runId,
          workflowId: wf.id,
          workflowName: wf.name,
          status: 'Failed',
          trigger: 'Cloud Headless',
          duration,
          timestamp: new Date().toLocaleString(),
          logs: [`[System] ❌ ${err.message}`],
        };
        setActiveRun(finalRun);
        transportError = true;
        break;
      }
    }

    if (finalRun) {
      if (finalRun.status === 'Failed') {
        // Surface the manual Retry button (skip for transport errors that won't self-heal).
        setRetryCount(MAX_AUTO_RETRIES);
        if (!transportError) setPendingRetryWorkflowId(wf.id);
      }
      await setDoc('runs', finalRun.id, finalRun as unknown as Record<string, unknown>)
        .catch(e => console.error('Failed to save run:', e));
      fetchWorkflowsAndRuns();
    }

    setPollingLogs(false);
  };

  const fetchSecretsMap = async (): Promise<Record<string, string>> => {
    try {
      const secretsList = await listDocs('vault');
      const secretsMap: Record<string, string> = {};
      secretsList.forEach((s: any) => {
        secretsMap[s.id] = s.value;
        secretsMap[s.name] = s.value;
        // Login Credentials expose username/email + password as dotted sub-keys,
        // so a login flow can reference vault:Name.username / vault:Name.password.
        if (s.username != null) {
          secretsMap[`${s.id}.username`] = s.username;
          secretsMap[`${s.name}.username`] = s.username;
          secretsMap[`${s.id}.email`] = s.username;
          secretsMap[`${s.name}.email`] = s.username;
        }
        if (s.password != null) {
          secretsMap[`${s.id}.password`] = s.password;
          secretsMap[`${s.name}.password`] = s.password;
        }
      });
      return secretsMap;
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
    const wf = workflows.find(w => w.id === pendingRetryWorkflowId);
    if (!wf) return;
    const triggerNode = wf.nodes.find(n => n.type === 'trigger');
    await executeCloudRun(wf, triggerNode?.data?.url || customStartUrl || 'https://');
  };

  const handleDeleteWorkflow = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete workflow "${name}"?`)) return;
    try {
      await deleteDoc('workflows', id);
      setWorkflows((current) => current.filter(w => w.id !== id));
      if (selectedWorkflow?.id === id) {
        setSelectedWorkflow(null);
        setNodes([]);
        setEdges([]);
      }
    } catch (err) {
      console.error('Error deleting workflow:', err);
      alert('Failed to delete workflow. Please try again.');
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
      condition: edge.data?.condition,
      ...(edge.data?.kind === 'context' ? { kind: 'context' } : {}),
      ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
      ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {})
    }));

    const updatedWorkflow: Workflow = {
      ...selectedWorkflow,
      nodes: standardNodes,
      edges: standardEdges
    };

    try {
      await setDoc('workflows', updatedWorkflow.id, updatedWorkflow as unknown as Record<string, unknown>);
      alert('Workflow saved successfully!');
      setWorkflows(workflows.map(w => w.id === updatedWorkflow.id ? updatedWorkflow : w));
      setSelectedWorkflow(updatedWorkflow);
    } catch (err) {
      console.error('Error saving workflow:', err);
      alert('Failed to save workflow. Please try again.');
    }
  };

  const viewLogs = (run: Run) => {
    // Runs are stored in full (logs included) in Firestore, so the row we already
    // have is the complete record — just show it. No server round-trip needed.
    setActiveRun(run);
    setPollingLogs(false);
    setPendingRetryWorkflowId(null);
  };

  // Launch a real browser and capture the user's actions starting at the record node's URL
  const handleStartRecordingNode = async (nodeId: string, startUrl: string) => {
    const url = startUrl.trim() || 'https://';
    try {
      const res = await fetch(`${API_URL}/record/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (res.ok && data.recordingId) {
        setRecording(true);
        setRecordingId(data.recordingId);
        setRecordingNodeId(nodeId);
      } else {
        alert(data.error || 'Failed to start recording.');
      }
    } catch (err) {
      console.error('Error starting recording:', err);
      alert('Could not reach the Stanley server to start recording.');
    }
  };

  // Stop capturing, map nodes, and splice them inline into the canvas
  const handleStopRecordingNode = async (nodeId: string) => {
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

        // Find the record node to get its position
        const recordNode = nodes.find(n => n.id === nodeId);
        if (!recordNode) return;

        const posX = recordNode.position.x;
        const posY = recordNode.position.y;

        const idMap = new Map<string, string>();
        const newNodes: MyRFNode[] = wf.nodes.map((node, index) => {
          const newId = Math.random().toString(36).substring(2, 9);
          idMap.set(node.id, newId);
          return {
            id: newId,
            type: 'workflowNode',
            position: { x: posX + index * 50, y: posY + index * 140 },
            data: {
              id: newId,
              type: node.type,
              label: node.label,
              data: node.data || {},
              onDelete: handleDeleteNode
            }
          };
        });

        const newEdges: MyRFEdge[] = wf.edges.map(edge => ({
          id: `e-${Math.random().toString(36).substring(2, 9)}`,
          source: idMap.get(edge.source) || edge.source,
          target: idMap.get(edge.target) || edge.target,
          data: edge.condition ? { condition: edge.condition } : undefined
        }));

        const firstNewNodeId = newNodes.length > 0 ? newNodes[0].id : null;
        const lastNewNodeId = newNodes.length > 0 ? newNodes[newNodes.length - 1].id : null;

        const updatedEdges = edges.map(edge => {
          if (edge.target === nodeId && firstNewNodeId) {
            return { ...edge, target: firstNewNodeId };
          }
          if (edge.source === nodeId && lastNewNodeId) {
            return { ...edge, source: lastNewNodeId };
          }
          return edge;
        }).filter(edge => edge.source !== nodeId && edge.target !== nodeId);

        const finalEdges = [...updatedEdges, ...newEdges];
        const finalNodes = nodes.filter(n => n.id !== nodeId).concat(newNodes);

        setNodes(finalNodes);
        setEdges(finalEdges);
        setSelectedNodeId(null);
      } else {
        alert(data.error || 'Failed to generate workflow from recording.');
      }
    } catch (err) {
      console.error('Error stopping recording:', err);
    } finally {
      setRecording(false);
      setRecordingId(null);
      setRecordingNodeId(null);
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
    else if (type === 'record') nodeData = { url: 'https://' };
    else if (type === 'mission') nodeData = { prompt: '' };
    else if (type === 'parameter') nodeData = { value: '' };
    else if (type === 'extract') nodeData = { selector: '', schema: '{\n  "title": "string",\n  "description": "string"\n}' };
    else if (type === 'extract_list') nodeData = { selector: '', schema: '[\n  {\n    "name": "string",\n    "price": "string"\n  }\n]' };
    else if (type === 'paginate') nodeData = { selector: '', description: '', maxPages: '3', actionNodeId: '' };
    else if (type === 'agent') nodeData = { goal: '', maxSteps: '8' };
    else if (type === 'integration') nodeData = { integrationName: 'gmail_list_messages', query: '' };
    else if (type === 'scroll') nodeData = { amount: '700', selector: '' };
    else if (type === 'find_text') nodeData = { text: '' };
    else if (type === 'send_keys') nodeData = { keys: 'Enter' };
    else if (type === 'select_dropdown') nodeData = { selector: '', description: '', value: '' };
    else if (type === 'hover') nodeData = { selector: '', description: '' };
    else if (type === 'drag_drop') nodeData = { sourceSelector: '', targetSelector: '' };
    else if (type === 'upload_file') nodeData = { artifactId: '', selector: 'input[type="file"]' };
    else if (type === 'download_file') nodeData = { selector: '', description: '' };
    else if (type === 'mcp_tool') nodeData = { serverUrl: 'https://', toolName: '', vaultKey: '' };
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
      js_code: 'Custom JS Script',
      record: 'Record Steps',
      mission: 'Mission Goal',
      parameter: 'Parameter Set',
      extract: 'Extract Data',
      extract_list: 'Extract List',
      paginate: 'Paginate Scrape',
      agent: 'Agent Mode',
      integration: 'API Integration'
      , scroll: 'Scroll Page', find_text: 'Find Text', go_back: 'Browser Back', go_forward: 'Browser Forward', send_keys: 'Send Keys', select_dropdown: 'Select Dropdown', hover: 'Hover Element', drag_drop: 'Drag & Drop', upload_file: 'Upload Artifact', download_file: 'Download Artifact', mcp_tool: 'MCP Tool'
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

  // Replace the entire data object of the selected node (used by the parameter
  // node's key/value editor, where keys are arbitrary).
  const replaceSelectedNodeData = (newData: Record<string, any>) => {
    if (!selectedNodeId) return;
    setNodes((nds) =>
      nds.map((node) =>
        node.id === selectedNodeId
          ? { ...node, data: { ...node.data, data: newData } }
          : node
      )
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

  // Disconnect: remove the selected edge (also reachable via Delete/Backspace).
  const handleDeleteEdge = () => {
    if (!selectedEdgeId) return;
    setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
    setSelectedEdgeId(null);
  };

  // Node connection callback. If either endpoint is a mission/parameter node the
  // edge is a CONTEXT edge (attaches goal/params, not execution flow): rendered
  // dashed + purple and tagged kind:'context' so the engine excludes it from routing.
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const endpoints = [params.source, params.target]
          .map((id) => nodes.find((n) => n.id === id));
        const isContext = endpoints.some(
          (n) => n && (n.data.type === 'mission' || n.data.type === 'parameter')
        );
        return addEdge({
          ...params,
          type: 'smoothstep',
          label: isContext ? 'context' : '',
          animated: isContext,
          style: isContext ? { stroke: '#a855f7', strokeDasharray: '5 5' } : undefined,
          data: { condition: undefined, kind: isContext ? 'context' : undefined },
        }, eds);
      });
    },
    [setEdges, nodes]
  );

  const currentNode = useMemo(() => {
    return nodes.find((n) => n.id === selectedNodeId);
  }, [nodes, selectedNodeId]);

  const currentEdge = useMemo(() => {
    return edges.find((e) => e.id === selectedEdgeId);
  }, [edges, selectedEdgeId]);

  return (
    <div className="view-container flex-1 flex flex-col min-h-0" style={{ maxWidth: '100%', height: '100%', gap: '1rem' }}>
      <div className="view-header">
        <div>
          <h1>Automation Cockpit</h1>
          <p>Build with AI, design the visual flow, and execute &mdash; all in one place.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {!showChat && (
            <button className="btn btn-secondary animate-fade-in cursor-pointer" onClick={() => setShowChat(true)}>
              <Sparkles size={16} style={{ marginRight: '4px', color: '#6C47FF' }} /> Open Copilot
            </button>
          )}
        </div>
      </div>

      <div className="stats-grid cockpit-stats-grid">
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

      <div className="editor-workspace cockpit-workspace">
        {/* Left Column: Monitor, Saved workflows list and logs history */}
        {showLibrary && <aside className="glass-panel cockpit-library">
          {/* Workflows Directory */}
          <div className="cockpit-panel-section">
            <div className="cockpit-panel-heading"><div><h3>Automations</h3><span>{workflows.length} saved</span></div><button className="cockpit-icon-button" onClick={() => setShowLibrary(false)} title="Hide automations"><X size={14}/></button></div>
            {loading ? (
              <div className="loading-state"><Loader className="spinner"/> Loading workflows...</div>
            ) : workflows.length === 0 ? (
              <div className="empty-state">No workflows found. Create one to get started!</div>
            ) : (
              <div className="workflow-card-list">{workflows.map((w) => (
                <div key={w.id} className={`workflow-card ${selectedWorkflow?.id === w.id ? 'active' : ''}`} onClick={() => loadWorkflowInEditor(w)}>
                  <div className="workflow-card-copy"><strong>{w.name || 'Untitled automation'}</strong><span>{w.nodes.length} step{w.nodes.length === 1 ? '' : 's'}</span></div>
                  <div className="workflow-card-actions" onClick={(event) => event.stopPropagation()}>
                    <button onClick={() => handleOpenRunModal(w)} title={`Run ${w.name}`}><Play size={13}/></button>
                    <button className="danger" onClick={() => handleDeleteWorkflow(w.id, w.name)} title={`Delete ${w.name}`}><Trash2 size={13}/></button>
                  </div>
                </div>
              ))}</div>
            )}
          </div>

          {/* Recent Runs Logs list */}
          <div className="cockpit-panel-section cockpit-history">
            <div className="cockpit-panel-heading"><div><h3>Recent runs</h3><span>{runs.length} total</span></div></div>
            {loading ? (
              <div className="loading-state"><Loader className="spinner"/> Loading runs...</div>
            ) : runs.length === 0 ? (
              <div className="empty-state">No execution logs found. Run an automation to see details.</div>
            ) : (
              <div className="run-card-list">{runs.slice(0, 8).map((r) => (
                <button key={r.id} className="run-card" onClick={() => viewLogs(r)}><span><strong>{r.workflowName}</strong><small>{r.timestamp.split(',')[1]?.trim() || r.timestamp}</small></span><span className={`badge badge-${r.status.toLowerCase()}`}>{r.status}</span></button>
              ))}</div>
            )}
          </div>
        </aside>}

        {/* Center Column: Visual editor graph */}
        <main className="cockpit-editor-column">
          {selectedWorkflow ? (
            <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
              <div className="editor-header cockpit-editor-header">
                {!showLibrary && <button className="cockpit-icon-button" onClick={() => setShowLibrary(true)} title="Show automations"><PanelLeft size={15}/></button>}
                <input
                  className="font-medium workflow-name-input"
                  style={{ fontSize: '0.9rem', flex: 1, marginRight: '0.5rem', minWidth: 0 }}
                  value={selectedWorkflow.name}
                  onChange={(e) => updateWorkflowName(e.target.value)}
                  onBlur={commitWorkflowName}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  title="Click to rename this automation"
                />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className={`btn btn-sm ${showNodePalette ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowNodePalette((value) => !value)} title="Add a workflow step"><Blocks size={14}/> Add step</button>
                  <button 
                    className={`btn btn-sm ${showChat ? 'btn-primary' : 'btn-secondary'}`} 
                    style={showChat ? { background: 'linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)', border: 'none', boxShadow: '0 0 10px rgba(168, 85, 247, 0.4)' } : {}}
                    onClick={() => setShowChat(!showChat)}
                  >
                    <Sparkles size={14} style={{ marginRight: '4px' }} className={chatLoading ? 'spinner' : ''} />
                    {showChat ? 'Close Copilot' : 'Chat with Stanley'}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowTriggers(true)} title="Schedule this automation or expose a webhook">
                    <Clock size={14} /> Triggers
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowPlatform(true)} title="Test, version, and publish this workflow"><Beaker size={14}/> Test &amp; release</button>
                  <button className="btn btn-secondary btn-sm" onClick={handleSaveWorkflow}>
                    <Save size={14} /> Save Draft
                  </button>
                </div>
              </div>

              {recording && (
                <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', margin: '0.5rem 1rem 0', color: '#dc2626', fontWeight: 600, fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Circle size={12} fill="#dc2626" className="spinner" />
                    <span>Recording steps... Perform actions in the browser window.</span>
                  </div>
                  {recordingNodeId && (
                    <button 
                      className="btn btn-sm btn-primary" 
                      style={{ background: '#dc2626', borderColor: '#dc2626', padding: '2px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                      onClick={() => handleStopRecordingNode(recordingNodeId)}
                    >
                      <Square size={10} /> Stop &amp; Generate
                    </button>
                  )}
                </div>
              )}

              <div className="cockpit-canvas-shell">
                {/* Visual Editor sidebar for dragging nodes */}
                {showNodePalette && <div className="cockpit-node-palette">
                  <div className="cockpit-node-palette-header"><div><strong>Add a step</strong><span>Click to place on canvas</span></div><button className="cockpit-icon-button" onClick={() => setShowNodePalette(false)}><X size={14}/></button></div>
                  <div className="cockpit-node-grid">
                  <button className="node-item btn-node" style={{ padding: '4px', fontSize: '0.75rem', marginBottom: 0, background: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.45)' }} onClick={() => addNode('mission')}><Target size={12}/> Mission</button>
                  <button className="node-item btn-node" style={{ padding: '4px', fontSize: '0.75rem', marginBottom: 0, background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.45)' }} onClick={() => addNode('parameter')}><Tag size={12}/> Parameter</button>
                  <button className="node-item btn-node" style={{ padding: '4px', fontSize: '0.75rem', marginBottom: 0 }} onClick={() => addNode('navigate')}><Globe size={12}/> Navigate</button>
                  <button className="node-item btn-node" style={{ padding: '4px', fontSize: '0.75rem', marginBottom: 0, background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)' }} onClick={() => addNode('record')}><Circle size={12} className="text-accent-danger" fill="#ef4444"/> Record Steps</button>
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
                  <button className="node-item btn-node" style={{ padding: '4px', fontSize: '0.75rem', marginBottom: 0, background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)' }} onClick={() => addNode('extract')}><Database size={12}/> Extract</button>
                  <button className="node-item btn-node" style={{ padding: '4px', fontSize: '0.75rem', marginBottom: 0, background: 'rgba(5, 150, 105, 0.15)', border: '1px solid rgba(5, 150, 105, 0.4)' }} onClick={() => addNode('extract_list')}><Database size={12}/> Extract List</button>
                  <button className="node-item btn-node" style={{ padding: '4px', fontSize: '0.75rem', marginBottom: 0, background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.4)' }} onClick={() => addNode('paginate')}><RefreshCw size={12}/> Paginate</button>
                  <button className="node-item btn-node" style={{ padding: '4px', fontSize: '0.75rem', marginBottom: 0, background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.4)' }} onClick={() => addNode('agent')}><Sparkles size={12}/> Agent</button>
                  <button className="node-item btn-node" style={{ padding: '4px', fontSize: '0.75rem', marginBottom: 0, background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)' }} onClick={() => addNode('integration')}><Globe size={12}/> Integration</button>
                  {['scroll','find_text','go_back','go_forward','send_keys','select_dropdown','hover','drag_drop','upload_file','download_file','mcp_tool'].map((type) => <button key={type} className="node-item btn-node" style={{ padding: '4px', fontSize: '0.75rem', marginBottom: 0 }} onClick={() => addNode(type)}><Blocks size={12}/>{type.replaceAll('_',' ')}</button>)}
                  </div>
                </div>}

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
                    deleteKeyCode={['Backspace', 'Delete']}
                    fitView
                  >
                    <Background color="#C8BEFF" gap={20} />
                    <Controls />
                  </ReactFlow>
                </div>
              </div>

              {/* Node properties bottom sheet */}
              {(currentNode || currentEdge) && <div className="cockpit-inspector">
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

                    {(currentNode.data.type === 'trigger' || currentNode.data.type === 'navigate' || currentNode.data.type === 'record') && (
                      <div style={{ flex: 1.5, minWidth: '200px' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                          {currentNode.data.type === 'record' ? 'Start URL' : 'Target URL'}
                        </label>
                        <input 
                          type="text" 
                          className="form-input" 
                          style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                          value={currentNode.data.data?.url || ''} 
                          onChange={(e) => updateNodeDataField('url', e.target.value)} 
                        />
                      </div>
                    )}

                    {currentNode.data.type === 'record' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '180px' }}>
                        {recording && recordingNodeId === currentNode.id ? (
                          <button 
                            className="btn btn-primary" 
                            style={{ background: '#dc2626', borderColor: '#dc2626', padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }} 
                            onClick={() => handleStopRecordingNode(currentNode.id)}
                          >
                            <Square size={12} /> Stop &amp; Generate
                          </button>
                        ) : (
                          <button 
                            className="btn btn-primary" 
                            style={{ background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)', borderColor: 'transparent', padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', boxShadow: '0 0 8px rgba(239, 68, 68, 0.3)' }} 
                            onClick={() => handleStartRecordingNode(currentNode.id, currentNode.data.data?.url || 'https://')}
                            disabled={recording}
                          >
                            <Circle size={12} fill="#ffffff" /> Start Recording
                          </button>
                        )}
                        {recording && recordingNodeId !== currentNode.id && (
                          <span style={{ fontSize: '0.7rem', color: '#ef4444' }}>Active elsewhere</span>
                        )}
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

                    {advancedNodeFields[currentNode.data.type]?.map((field) => (
                      <div key={field.key} style={{ flex: 1, minWidth: '150px' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{field.label}</label>
                        <input type="text" className="form-input" style={{ padding: '4px 8px', fontSize: '0.8rem' }} placeholder={field.placeholder} value={String(currentNode.data.data?.[field.key] ?? '')} onChange={(event) => updateNodeDataField(field.key, event.target.value)} />
                      </div>
                    ))}

                    {currentNode.data.type === 'upload_file' && (
                      <label className="form-input" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 190, cursor: uploadingArtifact ? 'wait' : 'pointer', padding: '6px 10px', fontSize: '0.75rem' }}>
                        <UploadCloud size={14} />
                        {uploadingArtifact ? 'Uploading artifact...' : 'Choose file (10 MiB max)'}
                        <input
                          type="file"
                          disabled={uploadingArtifact}
                          style={{ display: 'none' }}
                          onChange={async (event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            setUploadingArtifact(true);
                            try {
                              const artifact = await uploadArtifact(file);
                              updateNodeDataField('artifactId', artifact.id);
                              updateNodeDataField('artifactName', artifact.name);
                            } catch (error) {
                              window.alert(error instanceof Error ? error.message : 'Artifact upload failed.');
                            } finally {
                              setUploadingArtifact(false);
                              event.target.value = '';
                            }
                          }}
                        />
                      </label>
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

                    {currentNode.data.type === 'mission' && (
                      <div style={{ flex: 1, minWidth: '350px' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: '2px' }}>
                          {"Mission Goal — the overall objective. Given to the AI on every step so it understands the why, not just the what."}
                        </label>
                        <textarea
                          className="form-input"
                          style={{ padding: '6px 8px', fontSize: '0.8rem', minHeight: '70px' }}
                          rows={3}
                          placeholder="e.g. Book a one-way flight from NYC to LA next Friday for under $300, using the cheapest available fare."
                          value={currentNode.data.data?.prompt || ''}
                          onChange={(e) => updateNodeDataField('prompt', e.target.value)}
                        />
                        <p style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                          Connect this node to anything — the dashed link marks it as context, not a step.
                        </p>
                      </div>
                    )}

                    {currentNode.data.type === 'parameter' && (
                      <div style={{ flex: 1, minWidth: '350px' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px' }}>
                          {"Parameters — fed to the step this node is wired to. Use `value` to set what gets typed/used; reference vault secrets with vault:SecretName."}
                        </label>
                        {Object.entries(currentNode.data.data || {}).map(([k, v], idx) => (
                          <div key={idx} style={{ display: 'flex', gap: '6px', marginBottom: '4px', alignItems: 'center' }}>
                            <input
                              type="text"
                              className="form-input"
                              style={{ padding: '4px 8px', fontSize: '0.75rem', flex: 1 }}
                              placeholder="key (e.g. value, account)"
                              value={k}
                              onChange={(e) => {
                                const entries = Object.entries(currentNode.data.data || {});
                                entries[idx] = [e.target.value, entries[idx][1]];
                                replaceSelectedNodeData(Object.fromEntries(entries));
                              }}
                            />
                            <input
                              type="text"
                              className="form-input"
                              style={{ padding: '4px 8px', fontSize: '0.75rem', flex: 1.5 }}
                              placeholder="value (e.g. vault:WorkEmail)"
                              value={String(v ?? '')}
                              onChange={(e) => {
                                const entries = Object.entries(currentNode.data.data || {});
                                entries[idx] = [entries[idx][0], e.target.value];
                                replaceSelectedNodeData(Object.fromEntries(entries));
                              }}
                            />
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '2px 6px' }}
                              title="Remove field"
                              onClick={() => {
                                const entries = Object.entries(currentNode.data.data || {}).filter((_, i) => i !== idx);
                                replaceSelectedNodeData(Object.fromEntries(entries));
                              }}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ marginTop: '2px', fontSize: '0.7rem' }}
                          onClick={() => {
                            const data = { ...(currentNode.data.data || {}) };
                            let i = 1; let key = 'field';
                            while (Object.prototype.hasOwnProperty.call(data, key)) key = `field${i++}`;
                            replaceSelectedNodeData({ ...data, [key]: '' });
                          }}
                        >
                          <Plus size={12} /> Add field
                        </button>
                      </div>
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

                    {(currentNode.data.type === 'extract' || currentNode.data.type === 'extract_list') && (
                      <>
                        <div style={{ flex: 1.5, minWidth: '200px' }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>CSS Selector (Optional scope)</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                            placeholder="e.g. #results-list, .article-body"
                            value={currentNode.data.data?.selector || ''} 
                            onChange={(e) => updateNodeDataField('selector', e.target.value)} 
                          />
                        </div>
                        <div style={{ flex: 2, minWidth: '300px' }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Target JSON Schema</label>
                          <textarea 
                            className="form-input" 
                            style={{ padding: '6px 8px', fontSize: '0.75rem', minHeight: '80px', fontFamily: 'monospace' }}
                            rows={4}
                            placeholder='e.g. { "title": "string", "price": "number" }'
                            value={currentNode.data.data?.schema || ''} 
                            onChange={(e) => updateNodeDataField('schema', e.target.value)} 
                          />
                        </div>
                      </>
                    )}

                    {currentNode.data.type === 'paginate' && (
                      <>
                        <div style={{ flex: 1, minWidth: '150px' }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Next Page Selector / Description</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                            placeholder="e.g. button.next-page, next arrow link"
                            value={currentNode.data.data?.selector || currentNode.data.data?.description || ''} 
                            onChange={(e) => {
                              updateNodeDataField('selector', e.target.value);
                              updateNodeDataField('description', e.target.value);
                            }} 
                          />
                        </div>
                        <div style={{ flex: 0.5, minWidth: '100px' }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Max Pages</label>
                          <input 
                            type="number" 
                            className="form-input" 
                            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                            min={1}
                            max={50}
                            value={currentNode.data.data?.maxPages || '3'} 
                            onChange={(e) => updateNodeDataField('maxPages', e.target.value)} 
                          />
                        </div>
                        <div style={{ flex: 1, minWidth: '180px' }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Scrape Node to Run on Each Page</label>
                          <select
                            className="form-input select-workflow"
                            style={{ padding: '4px 8px', fontSize: '0.8rem', height: 'auto' }}
                            value={currentNode.data.data?.actionNodeId || ''}
                            onChange={(e) => updateNodeDataField('actionNodeId', e.target.value)}
                          >
                            <option value="">-- Select Scrape Node --</option>
                            {nodes.filter(n => n.id !== currentNode.id && ['scrape', 'extract', 'extract_list', 'ai_prompt'].includes(n.data.type)).map(n => (
                              <option key={n.id} value={n.id}>{n.data.label || `${n.data.type} (${n.id})`}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}

                    {currentNode.data.type === 'agent' && (
                      <>
                        <div style={{ flex: 2, minWidth: '280px' }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Agent Goal (What should the AI explore and find?)</label>
                          <textarea 
                            className="form-input" 
                            style={{ padding: '6px 8px', fontSize: '0.8rem', minHeight: '60px' }}
                            rows={3}
                            placeholder="e.g. Find the contact email link on the page, click it, and copy the email."
                            value={currentNode.data.data?.goal || ''} 
                            onChange={(e) => updateNodeDataField('goal', e.target.value)} 
                          />
                        </div>
                        <div style={{ flex: 0.5, minWidth: '100px' }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Max Steps</label>
                          <input 
                            type="number" 
                            className="form-input" 
                            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                            min={1}
                            max={30}
                            value={currentNode.data.data?.maxSteps || '8'} 
                            onChange={(e) => updateNodeDataField('maxSteps', e.target.value)} 
                          />
                        </div>
                        {/* Trace Crystallization Section */}
                        {(() => {
                          const latestRun = runs.find(r => r.workflowId === selectedWorkflow?.id && r.scraped && r.scraped[currentNode.id]);
                          const trace = latestRun?.scraped?.[currentNode.id];
                          if (trace && Array.isArray(trace) && trace.length > 0) {
                            return (
                              <div style={{ flex: 1.5, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(168, 85, 247, 0.08)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                                <div style={{ fontSize: '0.72rem', color: '#a855f7', fontWeight: 600 }}>Crystallize Execution Trace</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                                  Found successful run with {trace.length} steps taken by the Agent. Bake this trace into static, cheap click/type nodes?
                                </div>
                                <button 
                                  className="btn btn-primary btn-sm" 
                                  style={{ background: '#a855f7', borderColor: '#a855f7', padding: '3px 8px', fontSize: '0.7rem', alignSelf: 'flex-start' }}
                                  onClick={() => handleCrystallizeAgent(currentNode.id, trace)}
                                >
                                  Crystallize Trace
                                </button>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </>
                    )}

                    {currentNode.data.type === 'integration' && (
                      <>
                        <div style={{ flex: 1.5, minWidth: '180px' }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Integration Service</label>
                          <select 
                            className="form-input select-workflow"
                            style={{ padding: '4px 8px', fontSize: '0.8rem', height: 'auto' }}
                            value={currentNode.data.data?.integrationName || 'gmail_list_messages'}
                            onChange={(e) => updateNodeDataField('integrationName', e.target.value)}
                          >
                            {Object.entries(getIntegrationsByApp()).map(([app, items]) => (
                              <optgroup key={app} label={app}>
                                {items.map(item => (
                                  <option key={item.id} value={item.id}>
                                    {item.label}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                        <div style={{ flex: 2, minWidth: '200px' }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Search Query (optional)</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                            placeholder="e.g. from:billing"
                            value={currentNode.data.data?.query || ''} 
                            onChange={(e) => updateNodeDataField('query', e.target.value)} 
                          />
                        </div>
                      </>
                    )}
                  </div>
                ) : currentEdge ? (
                  <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    {currentEdge.data?.kind === 'context' ? (
                      <div style={{ flex: 1, minWidth: '200px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        <span style={{ color: '#a855f7', fontWeight: 600 }}>Context link</span> — attaches a parameter/mission to this step. No routing condition.
                      </div>
                    ) : (
                    <>
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
                    </>
                    )}
                    <div>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ borderColor: 'var(--error)', color: 'var(--error)', display: 'flex', alignItems: 'center', gap: '4px' }}
                        onClick={handleDeleteEdge}
                        title="Remove this connection (or press Delete)"
                      >
                        <Trash2 size={12} /> Disconnect
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>}
            </div>
          ) : (
            <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem' }}>
              <GitFork size={48} style={{ marginBottom: '1rem', color: 'var(--border-strong)' }} />
              <h3>No Workflow Selected</h3>
              <p style={{ fontSize: '0.85rem', maxWidth: '300px', margin: '0.5rem auto 0 auto' }}>
                Select a workflow from the directory on the left, or ask the Copilot to <strong>Build New Flow</strong> from a plain-English description.
              </p>
            </div>
          )}
        </main>

        {/* Right Column: Stanley Copilot (Always Visible!) */}
        {showChat && (
          <aside className="glass-panel chatbot-sidebar cockpit-copilot">
            <div className="chat-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a855f7' }}>
                <Sparkles size={16} />
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  Stanley Copilot {usingLmStudio ? '(LM Studio)' : '(Gemini)'}
                </span>
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

            {/* Mode toggle: Build a brand-new flow, or Edit the selected one */}
            <div className="chat-mode-toggle" style={{ display: 'flex', gap: '4px', padding: '8px 12px 0' }}>
              <button
                className={`mode-toggle-btn ${chatMode === 'edit' ? 'active' : ''}`}
                onClick={() => setChatMode('edit')}
                style={{
                  flex: 1, fontSize: '0.7rem', padding: '5px 8px', borderRadius: '6px', cursor: 'pointer',
                  border: '1px solid ' + (chatMode === 'edit' ? '#a855f7' : 'var(--border-strong)'),
                  background: chatMode === 'edit' ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
                  color: chatMode === 'edit' ? '#a855f7' : 'var(--text-tertiary)',
                  fontWeight: chatMode === 'edit' ? 600 : 400,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                }}
              >
                💬 Edit Flow
              </button>
              <button
                className={`mode-toggle-btn ${chatMode === 'build' ? 'active' : ''}`}
                onClick={() => setChatMode('build')}
                style={{
                  flex: 1, fontSize: '0.7rem', padding: '5px 8px', borderRadius: '6px', cursor: 'pointer',
                  border: '1px solid ' + (chatMode === 'build' ? '#3b82f6' : 'var(--border-strong)'),
                  background: chatMode === 'build' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                  color: chatMode === 'build' ? '#3b82f6' : 'var(--text-tertiary)',
                  fontWeight: chatMode === 'build' ? 600 : 400,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                }}
              >
                <Sparkles size={11} /> Build New Flow
              </button>
            </div>

            <div className="chat-suggestions">
              {chatMode === 'build' ? (
                <>
                  <button
                    className="suggestion-chip"
                    onClick={() => handleBuildFlow('Search Google for the latest AI news and scrape the results')}
                  >
                    🔍 Google Search Flow
                  </button>
                  <button
                    className="suggestion-chip"
                    onClick={() => handleBuildFlow('Go to amazon.com, search for "iPhone 15 case", wait 3 seconds, then scrape the results')}
                  >
                    🛒 Scrape Amazon Prices
                  </button>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>

            <div className="chat-input-container">
              <input
                type="text"
                className="chat-input"
                placeholder={chatMode === 'build'
                  ? 'Describe the automation you want to build…'
                  : 'Ask Stanley to edit your flow…'}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCopilotSend();
                  }
                }}
                disabled={chatLoading || generatingFlow}
              />
              <button
                className="btn btn-primary"
                style={{
                  padding: '4px 10px', fontSize: '0.8rem',
                  background: chatMode === 'build' ? '#3b82f6' : '#a855f7',
                  borderColor: chatMode === 'build' ? '#3b82f6' : '#a855f7',
                  display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap'
                }}
                onClick={() => handleCopilotSend()}
                disabled={chatLoading || generatingFlow}
              >
                {generatingFlow
                  ? (<><Loader className="spinner" size={12} /> Building…</>)
                  : chatMode === 'build'
                    ? (<><Sparkles size={12} /> Build</>)
                    : 'Send'}
              </button>
            </div>
          </aside>
        )}
      </div>

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
              <button
                className="btn btn-primary"
                onClick={handleRunWorkflow}
                disabled={!isHeadlessConfigured()}
                title={isHeadlessConfigured()
                  ? 'Run this workflow headless in the cloud'
                  : 'Cloud runner not configured (VITE_RUNNER_URL is unset)'}
              >
                <Play size={14} style={{ display: 'inline', marginRight: '4px' }}/> Run Headless (Cloud)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Triggers (schedule + webhook) modal */}
      {showTriggers && selectedWorkflow && (
        <TriggersPanel workflow={{ id: selectedWorkflow.id, name: selectedWorkflow.name }} onClose={() => setShowTriggers(false)} />
      )}
      {showPlatform && selectedWorkflow && <WorkflowPlatformModal workflow={selectedWorkflow} onClose={() => setShowPlatform(false)} />}

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
              {activeRun.logs && activeRun.logs.map((log, index) => {
                if (log.startsWith('[Result]')) {
                  return (
                    <div key={index} className="log-line" style={{ 
                      marginTop: '1rem', 
                      padding: '1rem', 
                      background: 'rgba(59, 130, 246, 0.1)', 
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      borderRadius: '8px',
                      color: 'var(--text-light)',
                      fontWeight: 500
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: '#60a5fa', fontWeight: 600 }}>
                        <Sparkles size={16} /> AI Output Result
                      </div>
                      {log.replace('[Result] ', '')}
                    </div>
                  );
                }
                return (
                  <div key={index} className="log-line">
                    {log}
                  </div>
                );
              })}
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
