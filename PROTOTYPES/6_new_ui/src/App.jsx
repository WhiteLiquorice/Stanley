import React, { useState, useCallback, useMemo } from 'react';
import { 
  ReactFlow, 
  Controls, 
  Background, 
  useNodesState, 
  useEdgesState, 
  addEdge, 
  MarkerType 
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import BoutiqueNode from './components/BoutiqueNode';
import { 
  Sparkles, Play, Save, ChevronRight, Terminal, 
  Database, Shield, BookOpen, Settings, LayoutGrid, HelpCircle, AlertCircle, ArrowRight
} from 'lucide-react';

const nodeTypes = {
  boutique: BoutiqueNode
};

const initialNodes = [
  {
    id: 'mission-1',
    type: 'boutique',
    position: { x: 50, y: 150 },
    data: { 
      type: 'mission', 
      label: 'Sync Semester Grades', 
      value: 'Extract from OldSchool gradebook and inject to District Portal.',
      status: 'success' 
    }
  },
  {
    id: 'trigger-1',
    type: 'boutique',
    position: { x: 350, y: 150 },
    data: { 
      type: 'trigger', 
      label: 'Source Portal Trigger', 
      value: 'GET api.oldschool.edu/...',
      status: 'success'
    }
  },
  {
    id: 'ai-1',
    type: 'boutique',
    position: { x: 650, y: 150 },
    data: { 
      type: 'ai_prompt', 
      label: 'Map Fields & Validate', 
      value: 'Align student_id with pupilId schema',
      status: 'success'
    }
  },
  {
    id: 'api-1',
    type: 'boutique',
    position: { x: 950, y: 150 },
    data: { 
      type: 'js_code', 
      label: 'District API Injector', 
      value: 'POST district.newportal.gov/...',
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
    style: { stroke: '#6366f1', strokeWidth: 2 }
  },
  { 
    id: 'e2-3', 
    source: 'ai-1', 
    target: 'api-1', 
    animated: true,
    style: { stroke: '#6366f1', strokeWidth: 2 }
  }
];

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [logs, setLogs] = useState([
    '[Info] Loaded grade synchronizer workflow.',
    '[Info] Press "Run Engine" to begin direct API transfer.'
  ]);
  const [copilotPrompt, setCopilotPrompt] = useState('Sync student grades from OldSchool dashboard to the District Portal');
  const [isRunning, setIsRunning] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('workflows');

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } }, eds)),
    [setEdges]
  );

  // Simulate running the synthesized API direct transfer
  const handleRunFlow = () => {
    if (isRunning) return;
    setIsRunning(true);
    setLogs([]);
    
    // Set all nodes to running status
    setNodes(nds => nds.map(n => ({
      ...n,
      data: { ...n.data, status: n.id === 'mission-1' ? 'success' : 'running' }
    })));

    const logSteps = [
      { delay: 500, text: '[API] Initializing direct HTTP bridge...' },
      { delay: 1200, text: '[Source] Calling GET https://api.oldschool.edu/v1/teacher/2834/grades' },
      { delay: 1800, text: '[Source] Fetched 2 records: John Doe (92.5), Jane Smith (88.0)' },
      { delay: 2400, text: '[AI] Mapping data fields: full_name -> pupilId, current_score -> gradePercentage' },
      { delay: 3000, text: '[Result] Synthesized JSON payload: [{"pupilId":"STU-991","gradePercentage":92.5},{"pupilId":"STU-992","gradePercentage":88}]' },
      { delay: 3800, text: '[Target] POSTing record 1/2 (STU-991) to https://district.newportal.gov/api/grades/sync...' },
      { delay: 4200, text: '[Target] POSTing record 2/2 (STU-992) to https://district.newportal.gov/api/grades/sync...' },
      { delay: 4800, text: '[Info] Sync complete! 2 records transferred successfully in 4.8s. (0 browser windows opened)' }
    ];

    logSteps.forEach(step => {
      setTimeout(() => {
        setLogs(prev => [...prev, step.text]);
        
        // Dynamically update status tags as execution proceeds
        if (step.text.includes('[Source] Fetched')) {
          setNodes(nds => nds.map(n => n.id === 'trigger-1' ? { ...n, data: { ...n.data, status: 'success' } } : n));
        }
        if (step.text.includes('[Result]')) {
          setNodes(nds => nds.map(n => n.id === 'ai-1' ? { ...n, data: { ...n.data, status: 'success' } } : n));
        }
        if (step.text.includes('Sync complete')) {
          setNodes(nds => nds.map(n => n.id === 'api-1' ? { ...n, data: { ...n.data, status: 'success' } } : n));
          setIsRunning(false);
        }
      }, step.delay);
    });
  };

  // Compile new flow from prompt
  const handleCompileFlow = (e) => {
    e.preventDefault();
    setLogs([
      `[AI Copilot] Parsing requirement: "${copilotPrompt}"`,
      '[AI Copilot] Generating synthesized API node graph...'
    ]);

    // Randomize positions a bit to look fresh
    const yOffset = 150 + Math.random() * 50;

    const newNodes = [
      {
        id: 'mission-1',
        type: 'boutique',
        position: { x: 50, y: yOffset },
        data: { 
          type: 'mission', 
          label: 'AI Mission', 
          value: copilotPrompt,
          status: 'success' 
        }
      },
      {
        id: 'trigger-1',
        type: 'boutique',
        position: { x: 350, y: yOffset },
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
        position: { x: 650, y: yOffset },
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
        position: { x: 950, y: yOffset },
        data: { 
          type: 'js_code', 
          label: 'Webhook Injector', 
          value: 'POST /sync-target',
          status: null
        }
      }
    ];

    setNodes(newNodes);
    setEdges(initialEdges);
    setTimeout(() => {
      setLogs(prev => [...prev, '[AI Copilot] Graph generated successfully! Ready to run.']);
    }, 1000);
  };

  return (
    <div className="flex h-screen w-screen bg-[#090d16] text-[#f1f5f9] overflow-hidden select-none">
      
      {/* Sidebar Navigation */}
      <aside className="w-16 flex flex-col items-center py-6 justify-between border-r border-[#1e293b] bg-[#0b0f19]">
        <div className="flex flex-col items-center gap-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="font-bold text-lg text-white">S</span>
          </div>
          
          <nav className="flex flex-col gap-4 mt-6">
            <button 
              onClick={() => setSidebarTab('workflows')} 
              className={`p-3 rounded-xl transition-all duration-200 ${sidebarTab === 'workflows' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <LayoutGrid size={20} />
            </button>
            <button 
              onClick={() => setSidebarTab('history')} 
              className={`p-3 rounded-xl transition-all duration-200 ${sidebarTab === 'history' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Database size={20} />
            </button>
            <button 
              onClick={() => setSidebarTab('vault')} 
              className={`p-3 rounded-xl transition-all duration-200 ${sidebarTab === 'vault' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Shield size={20} />
            </button>
            <button 
              onClick={() => setSidebarTab('guide')} 
              className={`p-3 rounded-xl transition-all duration-200 ${sidebarTab === 'guide' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <BookOpen size={20} />
            </button>
          </nav>
        </div>

        <div className="flex flex-col gap-4">
          <button className="p-3 text-slate-500 hover:text-slate-300 transition-colors">
            <Settings size={20} />
          </button>
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center">
            <span className="text-xs font-bold text-slate-400">AM</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#090d16] relative">
        
        {/* Header */}
        <header className="h-16 border-b border-[#1e293b] px-6 flex items-center justify-between bg-[#0b0f19]/80 backdrop-blur-md z-10">
          <div>
            <h1 className="text-base font-bold flex items-center gap-2">
              Stanley Integration Engine 
              <span className="text-xs bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded text-indigo-400 font-semibold font-mono">v3.0.0-Boutique</span>
            </h1>
            <p className="text-[11px] text-slate-400">Automate cross-platform data syncing natively via headless API execution.</p>
          </div>

          <div className="flex items-center gap-3">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors">
              <Save size={14} /> Save Flow
            </button>
            <button 
              onClick={handleRunFlow}
              disabled={isRunning}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                isRunning 
                  ? 'bg-indigo-500/20 text-indigo-300 cursor-not-allowed border border-indigo-500/20' 
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
              }`}
            >
              <Play size={14} /> {isRunning ? 'Running Engine...' : 'Run Engine'}
            </button>
          </div>
        </header>

        {/* Canvas Builder */}
        <div className="flex-1 min-h-0 relative">
          
          {/* Floating AI Copilot Widget */}
          <div className="absolute top-4 left-4 z-10 w-[480px] p-[1px] rounded-xl bg-gradient-to-r from-indigo-500/30 to-purple-500/30 shadow-xl">
            <div className="p-4 bg-slate-950/90 rounded-xl backdrop-blur-md">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-400 mb-2">
                <Sparkles size={14} className="animate-pulse" />
                <span>AI BUILD COPILOT</span>
              </div>
              <form onSubmit={handleCompileFlow} className="flex gap-2 items-end">
                <textarea 
                  value={copilotPrompt}
                  onChange={(e) => {
                    setCopilotPrompt(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  placeholder="e.g. Sync grades from OldSchool to district portal..."
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none min-h-[36px] max-h-[150px] overflow-y-auto"
                  rows={1}
                />
                <button type="submit" className="p-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition-colors shrink-0">
                  <ArrowRight size={16} />
                </button>
              </form>
            </div>
          </div>

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
        </div>
      </main>

      {/* Right Console & Logs Panel */}
      <aside className="w-80 border-l border-[#1e293b] bg-[#0b0f19] flex flex-col h-full">
        <div className="p-4 border-b border-[#1e293b] flex justify-between items-center bg-[#090d16]/30">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Terminal size={14} /> Execution Console
          </h3>
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
        </div>

        <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] space-y-3 bg-[#070b12]">
          {logs.map((log, i) => {
            if (log.startsWith('[Result]')) {
              return (
                <div key={i} className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    <Sparkles size={12} className="text-indigo-400" />
                    <span>Transformed Grade Payload</span>
                  </div>
                  {log.replace('[Result] ', '')}
                </div>
              );
            }
            if (log.startsWith('[API]') || log.startsWith('[Source]') || log.startsWith('[Target]')) {
              return (
                <div key={i} className="text-slate-300 flex gap-2">
                  <span className="text-indigo-400 shrink-0">➜</span>
                  <span>{log}</span>
                </div>
              );
            }
            return (
              <div key={i} className="text-slate-500">
                {log}
              </div>
            );
          })}
        </div>
      </aside>

    </div>
  );
}

export default App;
