import React, { useState, useCallback } from 'react';
import { 
  ReactFlow, 
  Controls, 
  Background, 
  useNodesState, 
  useEdgesState, 
  addEdge 
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import BoutiqueNode from './components/BoutiqueNode';
import { 
  Sparkles, Play, Save, ChevronRight, Terminal, 
  Database, Shield, BookOpen, Settings, LayoutGrid, HelpCircle, 
  AlertCircle, ArrowRight, Plus, Bell, CheckCircle, TrendingUp, Activity
} from 'lucide-react';

const nodeTypes = {
  boutique: BoutiqueNode
};

const initialNodes = [
  {
    id: 'mission-1',
    type: 'boutique',
    position: { x: 30, y: 150 },
    data: { 
      type: 'mission', 
      label: 'Sync Semester Grades', 
      value: 'Move grades from OldSchool to District Portal.',
      status: 'success' 
    }
  },
  {
    id: 'trigger-1',
    type: 'boutique',
    position: { x: 320, y: 150 },
    data: { 
      type: 'trigger', 
      label: 'OldSchool API Trigger', 
      value: 'GET /teacher/2834/grades',
      status: 'success'
    }
  },
  {
    id: 'ai-1',
    type: 'boutique',
    position: { x: 610, y: 150 },
    data: { 
      type: 'ai_prompt', 
      label: 'Map Fields (Gemini)', 
      value: 'Validate & map student_id -> pupilId',
      status: 'success'
    }
  },
  {
    id: 'api-1',
    type: 'boutique',
    position: { x: 900, y: 150 },
    data: { 
      type: 'js_code', 
      label: 'Inject to District', 
      value: 'POST /api/grades/sync',
      status: 'success'
    }
  }
];

const initialEdges = [
  { 
    id: 'e1-2', 
    source: 'trigger-1', 
    target: 'ai-1', 
    animated: true,
    style: { stroke: '#818cf8', strokeWidth: 2 }
  },
  { 
    id: 'e2-3', 
    source: 'ai-1', 
    target: 'api-1', 
    animated: true,
    style: { stroke: '#818cf8', strokeWidth: 2 }
  }
];

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [activeWorkflow, setActiveWorkflow] = useState('wf-1');
  const [sidebarTab, setSidebarTab] = useState('cockpit');
  const [isRunning, setIsRunning] = useState(false);
  const [copilotPrompt, setCopilotPrompt] = useState('Sync student grades from OldSchool dashboard to the District Portal');
  
  const [chatMessages, setChatMessages] = useState([
    { sender: 'ai', text: "Hi! I'm your automation copilot. Tell me what you want to automate, or ask me to add/edit steps in your flow!" }
  ]);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#818cf8', strokeWidth: 2 } }, eds)),
    [setEdges]
  );

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!copilotPrompt.trim()) return;

    const userMessage = copilotPrompt;
    setChatMessages(prev => [...prev, { sender: 'user', text: userMessage }]);
    setCopilotPrompt('');

    // Simulate AI compiling and responding
    setTimeout(() => {
      setChatMessages(prev => [...prev, { 
        sender: 'ai', 
        text: `I've analyzed your prompt: "${userMessage}". Generating the direct API synthesis graph with an active Mission Context. Click "Run" to test the pipeline.` 
      }]);
      
      // Update nodes dynamically to match the user prompt
      setNodes([
        {
          id: 'mission-1',
          type: 'boutique',
          position: { x: 30, y: 150 },
          data: { 
            type: 'mission', 
            label: 'AI Mission Context', 
            value: userMessage,
            status: 'success' 
          }
        },
        {
          id: 'trigger-1',
          type: 'boutique',
          position: { x: 320, y: 150 },
          data: { 
            type: 'trigger', 
            label: 'Dynamic API Source', 
            value: 'GET /extracted-data',
            status: null 
          }
        },
        {
          id: 'ai-1',
          type: 'boutique',
          position: { x: 610, y: 150 },
          data: { 
            type: 'ai_prompt', 
            label: 'LLM Map & Extract', 
            value: 'Structured output schema enforcement',
            status: null
          }
        },
        {
          id: 'api-1',
          type: 'boutique',
          position: { x: 900, y: 150 },
          data: { 
            type: 'js_code', 
            label: 'Webhook Injector', 
            value: 'POST /sync-target',
            status: null
          }
        }
      ]);
    }, 1200);
  };

  const handleRun = () => {
    if (isRunning) return;
    setIsRunning(true);
    
    setChatMessages(prev => [...prev, { sender: 'system', text: 'Starting API Synthesis execution...' }]);

    // Set all nodes to running status
    setNodes(nds => nds.map(n => ({
      ...n,
      data: { ...n.data, status: n.id === 'mission-1' ? 'success' : 'running' }
    })));

    const steps = [
      { delay: 800, text: '➜ [Source] GET https://api.oldschool.edu/v1/teacher/2834/grades - Success (200)', update: 'trigger-1' },
      { delay: 1800, text: '➜ [AI] Mapped student_id to pupilId successfully.', update: 'ai-1' },
      { delay: 2800, text: '➜ [Target] POSTed 2 grade records to district portal.', update: 'api-1' },
      { delay: 3500, text: '✔ Automation finished. 2 records processed.', finished: true }
    ];

    steps.forEach(step => {
      setTimeout(() => {
        setChatMessages(prev => [...prev, { sender: 'system', text: step.text }]);
        
        if (step.update) {
          setNodes(nds => nds.map(n => n.id === step.update ? { ...n, data: { ...n.data, status: 'success' } } : n));
        }
        
        if (step.finished) {
          setIsRunning(false);
        }
      }, step.delay);
    });
  };

  return (
    <div className="flex h-screen w-screen bg-[#070b13] text-[#f1f5f9] font-sans overflow-hidden select-none">
      
      {/* 1. Left Sidebar (FlowPilot Mockup Branding) */}
      <aside className="w-[240px] border-r border-slate-800/40 bg-[#090d16] flex flex-col justify-between p-4 shrink-0">
        <div className="flex flex-col gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <span className="font-bold text-white text-sm">F</span>
            </div>
            <span className="font-bold text-base tracking-tight text-white">FlowPilot</span>
          </div>

          {/* Navigation */}
          <nav className="flex flex-col gap-1.5">
            <button 
              onClick={() => setSidebarTab('cockpit')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                sidebarTab === 'cockpit' 
                  ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20 shadow-[0_0_15px_rgba(168,85,247,0.05)]' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <LayoutGrid size={16} />
              <span>Cockpit</span>
            </button>
            <button 
              onClick={() => setSidebarTab('results')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                sidebarTab === 'results' 
                  ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20 shadow-[0_0_15px_rgba(168,85,247,0.05)]' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <Database size={16} />
              <span>Results</span>
            </button>
            <button 
              onClick={() => setSidebarTab('vault')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                sidebarTab === 'vault' 
                  ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20 shadow-[0_0_15px_rgba(168,85,247,0.05)]' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <Shield size={16} />
              <span>Credential Vault</span>
            </button>
            <button 
              onClick={() => setSidebarTab('guide')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                sidebarTab === 'guide' 
                  ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20 shadow-[0_0_15px_rgba(168,85,247,0.05)]' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <BookOpen size={16} />
              <span>Guide</span>
            </button>
            <button 
              onClick={() => setSidebarTab('settings')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                sidebarTab === 'settings' 
                  ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20 shadow-[0_0_15px_rgba(168,85,247,0.05)]' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <Settings size={16} />
              <span>Settings</span>
            </button>
          </nav>
        </div>

        <div className="flex flex-col gap-4 border-t border-slate-800/40 pt-4">
          <button className="flex items-center gap-3 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200">
            <HelpCircle size={16} />
            <span>Manage Billing</span>
          </button>
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
              <span className="text-xs font-bold text-violet-400">TM</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-200">Teacher Mom</p>
              <p className="text-[10px] text-slate-500">teacher@school.edu</p>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. Main Center Section */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Header Bar */}
        <header className="h-16 border-b border-slate-800/40 px-6 flex items-center justify-between bg-[#090d16]/80 backdrop-blur-md shrink-0">
          <div className="relative w-96">
            <input 
              type="text" 
              placeholder="Search automations, logs, or credentials..." 
              className="w-full bg-[#0d1527] border border-slate-800/60 rounded-xl pl-4 pr-10 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500"
            />
          </div>

          <div className="flex items-center gap-4">
            <button className="relative p-2 text-slate-400 hover:text-slate-200 transition-colors">
              <Bell size={18} />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-violet-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
            </button>
            
            <button className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-xs font-bold text-white shadow-lg shadow-violet-500/20 border border-violet-500/30">
              <Plus size={14} /> New Automation
            </button>
          </div>
        </header>

        {/* Content Container (Split into Stats, Workflows, and Builder Canvas) */}
        <div className="flex-1 flex flex-col p-6 overflow-hidden min-h-0 bg-[#070b13]">
          
          {/* Header Title Section */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white">Automation Cockpit</h2>
            <p className="text-xs text-slate-400 mt-1">Build with AI, design the visual flow, and execute — all in one place.</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-6 mb-6">
            <div className="bg-[#090d16]/60 border border-slate-800/40 rounded-2xl p-4 flex justify-between items-start backdrop-blur-md shadow-md">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Automations</p>
                <p className="text-2xl font-bold text-white mt-1">1</p>
                <p className="text-[10px] text-violet-400 font-semibold mt-1">Ready to execute</p>
              </div>
              <div className="p-2.5 bg-violet-500/10 rounded-xl border border-violet-500/20">
                <Database className="w-5 h-5 text-violet-400" />
              </div>
            </div>
            <div className="bg-[#090d16]/60 border border-slate-800/40 rounded-2xl p-4 flex justify-between items-start backdrop-blur-md shadow-md">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Success Rate</p>
                <p className="text-2xl font-bold text-white mt-1">100%</p>
                <p className="text-[10px] text-emerald-400 font-semibold mt-1">Optimal health</p>
              </div>
              <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <div className="bg-[#090d16]/60 border border-slate-800/40 rounded-2xl p-4 flex justify-between items-start backdrop-blur-md shadow-md">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Executions</p>
                <p className="text-2xl font-bold text-white mt-1">14</p>
                <p className="text-[10px] text-indigo-400 font-semibold mt-1">Run history count</p>
              </div>
              <div className="p-2.5 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                <Activity className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
          </div>

          {/* Builder Layout Split */}
          <div className="flex-1 flex gap-6 min-h-0">
            
            {/* Left Column: Workflows Directory */}
            <div className="w-64 bg-[#090d16]/40 border border-slate-800/40 rounded-2xl p-4 flex flex-col gap-4 backdrop-blur-md shadow-md shrink-0">
              <div className="flex justify-between items-center pb-2 border-b border-slate-800/50">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Workflows Directory</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 font-bold">1</span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2">
                <div 
                  onClick={() => setActiveWorkflow('wf-1')}
                  className={`p-3.5 rounded-xl cursor-pointer transition-all border ${
                    activeWorkflow === 'wf-1'
                      ? 'bg-violet-600/15 border-violet-500/30'
                      : 'bg-slate-950/20 border-slate-800/40 hover:bg-slate-900/30'
                  }`}
                >
                  <h4 className="text-xs font-bold text-slate-200">Sync School Grades</h4>
                  <div className="flex items-center justify-between mt-2.5">
                    <span className="text-[9px] text-slate-500 flex items-center gap-1">
                      <Play size={10} /> 0 runs
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-semibold uppercase">Draft</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right/Center Column: React Flow Graph Canvas */}
            <div className="flex-1 bg-[#090d16]/30 border border-slate-800/40 rounded-2xl overflow-hidden relative shadow-md flex flex-col backdrop-blur-md">
              
              {/* Canvas Header */}
              <div className="px-5 py-4 border-b border-slate-800/50 flex justify-between items-center bg-[#090d16]/50">
                <div>
                  <h3 className="text-sm font-bold text-white">Sync School Grades</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5 font-medium">Headless direct API sync context flow.</p>
                </div>

                <div className="flex gap-2">
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-[10px] font-semibold text-slate-300 hover:text-slate-100 transition-colors">
                    <Save size={12} /> Configure
                  </button>
                  <button 
                    onClick={handleRun}
                    disabled={isRunning}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-[10px] font-bold text-white shadow-md shadow-violet-500/10 border border-violet-500/30"
                  >
                    <Play size={12} /> {isRunning ? 'Running...' : 'Run'}
                  </button>
                </div>
              </div>

              {/* React Flow Area */}
              <div className="flex-1 relative">
                {activeWorkflow ? (
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    nodeTypes={nodeTypes}
                    fitView
                  >
                    <Background color="#1e293b" gap={20} size={1} />
                    <Controls />
                  </ReactFlow>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500">
                    Select a workflow to start editing.
                  </div>
                )}
              </div>

              {/* Bottom Quick Tools Bar */}
              <div className="px-5 py-3 border-t border-slate-800/50 bg-[#090d16]/50 flex gap-4 text-[10px] font-bold text-slate-400 overflow-x-auto shrink-0">
                <button className="flex items-center gap-1 hover:text-violet-400"><Plus size={12} /> Edit Flow</button>
                <button className="flex items-center gap-1 hover:text-violet-400"><Sparkles size={12} /> Build New Flow</button>
                <button className="flex items-center gap-1 hover:text-violet-400"><Plus size={12} /> Add JS Wait</button>
                <button className="flex items-center gap-1 hover:text-violet-400"><Plus size={12} /> Scrape JS Script</button>
              </div>

            </div>

          </div>

        </div>

      </div>

      {/* 3. Right Sidebar (FlowPilot Copilot Interface) */}
      <aside className="w-80 border-l border-slate-800/40 bg-[#090d16] flex flex-col h-full shrink-0">
        <div className="p-4 border-b border-slate-800/40 flex justify-between items-center bg-[#070b13]/30">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Sparkles size={14} className="text-violet-400" /> Copilot <span className="bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded text-[8px] font-bold text-violet-400">AI</span>
          </h3>
          <span className="w-2 h-2 rounded-full bg-violet-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
        </div>

        {/* Chat Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#070b12] text-xs">
          {chatMessages.map((msg, i) => {
            if (msg.sender === 'system') {
              return (
                <div key={i} className="font-mono text-[10px] text-slate-400 py-1 border-l-2 border-violet-500/30 pl-3">
                  {msg.text}
                </div>
              );
            }
            const isAi = msg.sender === 'ai';
            return (
              <div key={i} className={`flex gap-3 ${isAi ? '' : 'justify-end'}`}>
                {isAi && (
                  <div className="w-6 h-6 rounded-lg bg-violet-600/15 border border-violet-500/20 flex items-center justify-center shrink-0">
                    <Sparkles size={12} className="text-violet-400" />
                  </div>
                )}
                <div className={`p-3 rounded-2xl max-w-[200px] leading-relaxed shadow-sm ${
                  isAi 
                    ? 'bg-slate-900 border border-slate-800/80 text-slate-200' 
                    : 'bg-violet-600 text-white rounded-tr-none'
                }`}>
                  {msg.text}
                </div>
              </div>
            );
          })}
        </div>

        {/* Input Form */}
        <div className="p-4 border-t border-slate-800/40 bg-[#070b12]">
          <form onSubmit={handleSendMessage} className="flex gap-2 items-end">
            <textarea 
              value={copilotPrompt}
              onChange={(e) => {
                setCopilotPrompt(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              placeholder="Ask to edit your flow..."
              className="flex-1 bg-[#0d1527] border border-slate-800/80 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 resize-none min-h-[36px] max-h-[150px] overflow-y-auto"
              rows={1}
            />
            <button type="submit" className="p-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center transition-colors shrink-0 shadow-md shadow-violet-500/10">
              <ArrowRight size={14} />
            </button>
          </form>
        </div>
      </aside>

    </div>
  );
}

export default App;
