import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Sparkles, 
  Play, 
  RefreshCw, 
  Trash2, 
  Sliders, 
  ChevronRight, 
  Terminal
} from 'lucide-react';
import { toast } from 'sonner';
import { compileWorkflow, getExecutionTier } from '../lib/stanleyCloud';
import type { CompiledWorkflow } from '../lib/stanleyCloud';
import { runHeadless } from '../lib/stanleyRunner';
import { listDocs } from '../lib/firestore';
import { PlanView } from '../components/PlanView';
import type { PlanStep } from '../components/PlanView';
import { LiveViewPanel } from '../components/LiveViewPanel';
import { PausePrompt } from '../components/PausePrompt';

export function Workspace() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [compiledWf, setCompiledWf] = useState<CompiledWorkflow | null>(null);
  const [planSteps, setPlanSteps] = useState<PlanStep[]>([]);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [secrets, setSecrets] = useState<Record<string, string>>({});

  // Pause & Ask state
  const [pauseRequest, setPauseRequest] = useState<{ question: string; options: string[] } | null>(null);

  // Load vault secrets on mount
  useEffect(() => {
    listDocs('vault')
      .then(vaultItems => {
        const mappedSecrets: Record<string, string> = {};
        vaultItems.forEach((curr: any) => {
          if (curr.id) mappedSecrets[curr.id] = curr.value;
          if (curr.name) mappedSecrets[curr.name] = curr.value;
          mappedSecrets[curr.name.toLowerCase().replace(/\s+/g, '')] = curr.value;
        });
        setSecrets(mappedSecrets);
      })
      .catch(err => {
        console.error('Failed to load vault items:', err);
      });
  }, []);

  const handleCompile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) return;

    setIsCompiling(true);
    setLogs([]);
    setPauseRequest(null);
    try {
      const workflow = await compileWorkflow(prompt);
      setCompiledWf(workflow);
      
      // Convert workflow nodes to readable PlanSteps
      const steps: PlanStep[] = workflow.nodes
        .filter(n => n.type !== 'mission' && n.type !== 'parameter')
        .map(node => {
          let desc = '';
          if (node.data.url) desc = `Navigate to ${node.data.url}`;
          else if (node.data.description) desc = node.data.description;
          else if (node.data.selector) desc = `Target: ${node.data.selector}`;
          else if (node.data.ms) desc = `Wait for ${parseInt(node.data.ms) / 1000} seconds`;
          else if (node.data.goal) desc = node.data.goal;
          else if (node.data.integrationName) desc = `Call API ${node.data.integrationName}`;

          return {
            id: node.id,
            type: node.type,
            label: node.label,
            description: desc,
            tier: getExecutionTier(node.type),
            status: 'pending'
          };
        });

      setPlanSteps(steps);
      toast.success('AI Graph compilation complete! Plan generated.');
    } catch (err: any) {
      console.error(err);
      toast.error(`Compilation failed: ${err.message}`);
    } finally {
      setIsCompiling(false);
    }
  };

  const handleRun = async () => {
    if (!compiledWf) return;
    setIsRunning(true);
    setIsInspectorOpen(true);
    setLogs(['[System] Initializing execution engine...', '[System] Launching browser instance...']);
    setScreenshotUrl(null);
    setPauseRequest(null);

    // Set all steps to pending initially
    setPlanSteps(prev => prev.map(s => ({ ...s, status: 'pending' })));

    try {
      // Simulate step progress matching logs asynchronously
      let currentStepIndex = 0;
      if (planSteps.length > 0) {
        setActiveStepId(planSteps[0].id);
        setPlanSteps(prev => prev.map((s, idx) => idx === 0 ? { ...s, status: 'running' } : s));
      }

      // Call execution runner (Cloud Run headless API)
      // We pass the compiled workflow graph directly
      const runPromise = runHeadless(compiledWf as any, secrets);

      // We simulate step highlights while waiting for response
      const logSimulator = setInterval(() => {
        setLogs(prev => {
          const nextLogs = [...prev];
          if (nextLogs.length < 8) {
            nextLogs.push(`[Browser] Action in progress...`);
          }
          return nextLogs;
        });

        if (currentStepIndex < planSteps.length - 1) {
          currentStepIndex++;
          const nextStep = planSteps[currentStepIndex];
          setActiveStepId(nextStep.id);
          setPlanSteps(prev => prev.map((s, idx) => {
            if (idx < currentStepIndex) return { ...s, status: 'success' };
            if (idx === currentStepIndex) return { ...s, status: 'running' };
            return s;
          }));
        }
      }, 3000);

      const result = await runPromise;
      clearInterval(logSimulator);
      setActiveStepId(null);

      // Process and parse logs
      const finalLogs = (result.logs && result.logs.length) 
        ? result.logs 
        : [result.success ? '[System] Completed successfully.' : '[System] Execution failed.'];

      setLogs(finalLogs);

      // Check if a human block occurred
      const blockedIndex = finalLogs.findIndex(l => l.includes('pausing 10s for manual resolution') || l.includes('CAPTCHA'));
      if (blockedIndex !== -1) {
        setPauseRequest({
          question: "I reached a checkpoint. Is there a CAPTCHA or additional authorization needed?",
          options: ["I resolved it, continue", "Skip this step", "Abort Run"]
        });
      }

      // Map node statuses based on final logs
      setPlanSteps(prev => {
        return prev.map(step => {
          const stepLog = finalLogs.find(l => l.includes(`[${step.label}]`) || l.includes(step.id));
          const stepFailed = finalLogs.find(l => l.includes(`[${step.label}]`) && (l.includes('failed') || l.includes('Error')));
          
          if (stepFailed) {
            return { ...step, status: 'failed' };
          } else if (stepLog) {
            return { ...step, status: 'success' };
          }
          
          // Fallback based on run status
          return result.success ? { ...step, status: 'success' } : { ...step, status: 'pending' };
        });
      });

      if (result.success) {
        toast.success('Automation run completed successfully!');
      } else {
        toast.error(result.error || 'Automation run failed.');
      }

    } catch (err: any) {
      console.error(err);
      setLogs(prev => [...prev, `[System Error] ${err.message}`]);
      toast.error(`Run failed: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handlePauseSubmit = (choice: string) => {
    toast.info(`Submitted action: ${choice}`);
    setPauseRequest(null);
    setLogs(prev => [...prev, `[System] User selected option: "${choice}". Resuming...`]);
    // Simulate resumption
    setTimeout(() => {
      setLogs(prev => [...prev, `[System] Automation completed after user resolution.`]);
      setPlanSteps(prev => prev.map(s => s.status === 'pending' ? { ...s, status: 'success' } : s));
    }, 1500);
  };

  const handleReset = () => {
    setCompiledWf(null);
    setPlanSteps([]);
    setPrompt('');
    setPauseRequest(null);
    setLogs([]);
    setIsInspectorOpen(false);
  };

  // Listen to reset event from layout header
  useEffect(() => {
    const handleResetEvent = () => {
      handleReset();
    };
    window.addEventListener('reset-workspace', handleResetEvent);
    return () => window.removeEventListener('reset-workspace', handleResetEvent);
  }, []);

  return (
    <div className="view-container flex-1 flex flex-col p-6 font-sans" style={{ background: 'transparent', color: 'var(--text-primary)' }}>
      {/* Workspace Wrapper */}
      <div className="flex-1 max-w-3xl mx-auto w-full flex flex-col justify-center py-6">
        {!compiledWf ? (
          /* Empty State: Conversational Onboarding */
          <div className="flex flex-col items-center text-center max-w-2xl mx-auto animate-fade-in">
            <div className="w-14 h-14 rounded-2xl bg-[#6C47FF]/8 border border-[#6C47FF]/15 flex items-center justify-center text-[#6C47FF] mb-6 shadow-sm">
              <Sparkles size={24} className="animate-pulse" />
            </div>
            
            <h2 className="text-2xl font-bold tracking-tight text-slate-850">
              What do you want Stanley to automate today?
            </h2>
            <p className="text-xs text-slate-500 mt-2 max-w-md leading-relaxed">
              Describe your automation goal in plain English. Stanley will compile it into an execution plan and run it.
            </p>

            <form onSubmit={handleCompile} className="w-full mt-8 relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Go to techcrunch.com, scrape the top 5 articles, and send them to my Slack channel"
                rows={3}
                className="w-full bg-white border border-[#D1D7E4] focus:border-[#6C47FF] rounded-2xl p-4.5 text-sm placeholder-slate-400 focus:outline-none shadow-sm transition-all resize-none text-slate-800 leading-relaxed"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleCompile();
                  }
                }}
              />
              
              <div className="absolute right-3.5 bottom-3.5 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isCompiling || !prompt.trim()}
                  className="px-4 py-2 rounded-xl text-white text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
                  style={{
                    background: isCompiling || !prompt.trim() ? 'var(--bg-surface-elevated)' : 'var(--accent)',
                    color: isCompiling || !prompt.trim() ? 'var(--text-tertiary)' : 'white'
                  }}
                >
                  {isCompiling ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" />
                      Compiling...
                    </>
                  ) : (
                    <>
                      <span>Compile Plan</span>
                      <ChevronRight size={13} />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Suggestions */}
            <div className="mt-8 flex flex-col items-center gap-3 w-full">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Suggestions</span>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                {[
                  "Scrape articles from TechCrunch and slack them",
                  "Go to Google Maps, search bakeries in Paris, extract names",
                  "Wait 5 seconds, then take a screenshot of HN"
                ].map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => { setPrompt(s); }}
                    className="px-3 py-1.5 rounded-lg bg-white border border-[#D1D7E4] hover:border-[#6C47FF]/35 hover:bg-[#6C47FF]/6 text-xs text-slate-650 hover:text-[#5535E0] transition-all shadow-sm cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Active State: The Plan Checklist */
          <div className="flex flex-col gap-6 w-full animate-fade-in">
            {/* Header Control Panel */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200/60">
              <div>
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Active Plan</span>
                <h2 className="text-xl font-bold tracking-tight text-slate-800 mt-0.5">
                  {compiledWf.name}
                </h2>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsInspectorOpen(!isInspectorOpen)}
                  className="px-3.5 py-2 rounded-xl bg-white border border-slate-200/80 hover:border-slate-300 text-xs font-semibold text-slate-600 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Terminal size={13} />
                  <span>{isInspectorOpen ? 'Hide Terminal' : 'Show Terminal'}</span>
                </button>
                
                <button
                  onClick={() => navigate('/dashboard/editor', { state: { workflow: compiledWf } })}
                  className="px-3.5 py-2 rounded-xl bg-white border border-slate-200/80 hover:border-slate-300 text-xs font-semibold text-slate-600 transition-colors cursor-pointer flex items-center gap-1.5"
                  title="Tweak this workflow in the advanced canvas"
                >
                  <Sliders size={13} />
                  <span>Edit in Canvas</span>
                </button>
                
                <button
                  onClick={handleReset}
                  className="p-2 rounded-xl bg-white border border-slate-200/80 hover:border-red-200 hover:text-red-600 transition-all cursor-pointer"
                  title="Clear plan and start over"
                >
                  <Trash2 size={14} />
                </button>

                <button
                  onClick={handleRun}
                  disabled={isRunning}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 text-white text-xs font-bold shadow-md shadow-indigo-600/10 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  {isRunning ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play size={13} fill="currentColor" />
                      <span>Start Execution</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Pause Request prompt */}
            {pauseRequest && (
              <PausePrompt
                question={pauseRequest.question}
                options={pauseRequest.options}
                onSubmit={handlePauseSubmit}
              />
            )}

            {/* Plan checklist view */}
            <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-sm">
              <PlanView steps={planSteps} activeStepId={activeStepId} />
            </div>
          </div>
        )}
      </div>

      {/* Floating Terminal Drawer */}
      <LiveViewPanel
        isOpen={isInspectorOpen}
        onClose={() => setIsInspectorOpen(false)}
        logs={logs}
        screenshotUrl={screenshotUrl}
      />
    </div>
  );
}
