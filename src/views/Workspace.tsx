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
import { decideHeadlessRun, runHeadless } from '../lib/stanleyRunner';
import { PlanView } from '../components/PlanView';
import type { PlanStep } from '../components/PlanView';
import { LiveViewPanel } from '../components/LiveViewPanel';
import { PausePrompt } from '../components/PausePrompt';
import { ConversationPlanCard } from '../components/ConversationPlanCard';
import { applyConversationProposal, isConversationPlannerConfigured, planConversation } from '../lib/conversationClient';
import type { ConversationPlanResult } from '../lib/conversationClient';
import { setDoc } from '../lib/firestore';

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
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [conversationPlan, setConversationPlan] = useState<ConversationPlanResult | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({});
  const [isApplyingPlan, setIsApplyingPlan] = useState(false);
  const [appliedProposalId, setAppliedProposalId] = useState<string | null>(null);

  // Pause & Ask state
  const [pauseRequest, setPauseRequest] = useState<{ question: string; options: string[] } | null>(null);

  const setCompiledPlan = (workflow: CompiledWorkflow) => {
    setCompiledWf(workflow);
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
        return { id: node.id, type: node.type, label: node.label, description: desc, tier: getExecutionTier(node.type), status: 'pending' };
      });
    setPlanSteps(steps);
  };

  const compileWithLegacyPlanner = async () => {
    const workflow = await compileWorkflow(prompt);
    await setDoc('workflows', workflow.id, { ...workflow, createdAt: new Date().toISOString(), revision: 0 } as unknown as Record<string, unknown>);
    setCompiledPlan(workflow);
    toast.success('AI Graph compilation complete! Plan generated.');
  };

  const handleCompile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) return;

    setIsCompiling(true);
    setLogs([]);
    setPauseRequest(null);
    try {
      if (isConversationPlannerConfigured()) {
        try {
          const proposed = await planConversation({ message: prompt, conversationId, answers: clarificationAnswers });
          setConversationPlan(proposed);
          setConversationId(proposed.conversationId);
          if (proposed.plan.questions.length > 0) return;
          if (proposed.plan.commands.length > 0) return;
          if (['inspect', 'explain'].includes(proposed.plan.intent)) return;
        } catch (planningError) {
          console.warn('Conversation planning was unavailable; continuing with the existing compiler.', planningError);
        }
      }
      await compileWithLegacyPlanner();
    } catch (err: any) {
      console.error(err);
      toast.error(`Compilation failed: ${err.message}`);
    } finally {
      setIsCompiling(false);
    }
  };

  const handleClarificationContinue = async () => {
    if (!conversationPlan || !isConversationPlannerConfigured()) return;
    setIsCompiling(true);
    try {
      const proposed = await planConversation({ message: prompt, conversationId: conversationPlan.conversationId, answers: clarificationAnswers });
      setConversationPlan(proposed);
      setConversationId(proposed.conversationId);
      if (proposed.plan.questions.length === 0 && proposed.plan.commands.length === 0 && !['inspect', 'explain'].includes(proposed.plan.intent)) await compileWithLegacyPlanner();
    } catch (error: any) {
      toast.error(error.message || 'Stanley could not update the plan.');
    } finally {
      setIsCompiling(false);
    }
  };

  const handleApproveConversationPlan = async () => {
    const proposal = conversationPlan?.proposal;
    if (!proposal?.canApply) return;
    setIsApplyingPlan(true);
    try {
      const applied = await applyConversationProposal(proposal.id, proposal.fingerprint);
      setCompiledPlan(applied.workflow as CompiledWorkflow);
      setAppliedProposalId(proposal.id);
      toast.success(applied.replayed ? 'This approved plan was already saved.' : applied.created ? 'Approved workflow created.' : 'Approved workflow changes saved.');
    } catch (error: any) {
      toast.error(error.message || 'Stanley could not save the approved plan.');
    } finally {
      setIsApplyingPlan(false);
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
      // Vault values are resolved only by the server and never loaded into this page.
      const runPromise = runHeadless(compiledWf as any, {});

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
      setActiveRunId(result.runId || null);
      clearInterval(logSimulator);
      setActiveStepId(null);

      // Process and parse logs
      const finalLogs = (result.logs && result.logs.length) 
        ? result.logs 
        : [result.success ? '[System] Completed successfully.' : '[System] Execution failed.'];

      setLogs(finalLogs);

      if (result.paused && (result.status === 'pending_approval' || result.wait?.type === 'approval')) {
        setPauseRequest({
          question: result.status === 'pending_approval' ? 'This automation is waiting for your approval.' : 'This automation reached a durable checkpoint.',
          options: ['Approve and continue', 'Reject run']
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
      } else if (result.paused) {
        toast.info(`Automation is waiting for ${result.wait?.type || 'an external event'}.`);
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

  const handlePauseSubmit = async (choice: string) => {
    if (!activeRunId) return;
    setPauseRequest(null);
    setIsRunning(true);
    try {
      const result = await decideHeadlessRun(activeRunId, choice.startsWith('Approve') ? 'approve' : 'reject');
      setLogs(result.logs || []);
      if (result.paused && (result.status === 'pending_approval' || result.wait?.type === 'approval')) setPauseRequest({ question: 'This automation is waiting at another approval checkpoint.', options: ['Approve and continue', 'Reject run'] });
      else if (result.paused) toast.info(`Automation is waiting for ${result.wait?.type || 'an external event'}.`);
      else if (result.success) toast.success('Automation run completed successfully!');
      else toast.info('Automation was rejected.');
    } catch (error: any) {
      toast.error(error.message || 'Could not submit the decision.');
    } finally { setIsRunning(false); }
  };

  const handleReset = () => {
    setCompiledWf(null);
    setPlanSteps([]);
    setPrompt('');
    setPauseRequest(null);
    setLogs([]);
    setIsInspectorOpen(false);
    setConversationPlan(null);
    setConversationId(undefined);
    setClarificationAnswers({});
    setIsApplyingPlan(false);
    setAppliedProposalId(null);
    setActiveRunId(null);
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
    <div className="view-container flex-1 flex flex-col overflow-y-auto p-4 sm:p-6 font-sans" style={{ background: 'transparent', color: 'var(--text-primary)' }}>
      {/* Workspace Wrapper */}
      <div className="flex-1 max-w-3xl mx-auto w-full flex flex-col justify-center py-3 sm:py-6">
        {!compiledWf ? (
          /* Empty State: Conversational Onboarding */
          <div className="flex flex-col items-center text-center max-w-2xl mx-auto animate-fade-in">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#6C47FF]/8 border border-[#6C47FF]/15 flex items-center justify-center text-[#6C47FF] mb-4 sm:mb-6 shadow-sm">
              <Sparkles size={24} className="animate-pulse" />
            </div>
            
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-850">
              What do you want Stanley to automate today?
            </h2>
            <p className="text-xs text-slate-500 mt-2 max-w-md leading-relaxed">
              Describe your automation goal in plain English. Stanley will compile it into an execution plan and run it.
            </p>

            <form onSubmit={handleCompile} className="w-full mt-6 sm:mt-8 relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Go to techcrunch.com, scrape the top 5 articles, and send them to my Slack channel"
                rows={3}
                className="w-full min-h-32 bg-white border border-[#D1D7E4] focus:border-[#6C47FF] rounded-2xl p-4 pb-16 text-sm placeholder-slate-400 focus:outline-none shadow-sm transition-all resize-none text-slate-800 leading-relaxed"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleCompile();
                  }
                }}
              />
              
              <div className="absolute right-3 bottom-3 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isCompiling || !prompt.trim()}
                  className="min-h-10 px-4 py-2 rounded-xl text-white text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
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

            {conversationPlan && (
              <ConversationPlanCard
                result={conversationPlan}
                answers={clarificationAnswers}
                onAnswer={(questionId, answer) => setClarificationAnswers((current) => ({ ...current, [questionId]: answer }))}
                onContinue={handleClarificationContinue}
                continuing={isCompiling}
                onApprove={handleApproveConversationPlan}
                applying={isApplyingPlan}
                applied={appliedProposalId === conversationPlan.proposal?.id}
              />
            )}

            {/* Suggestions */}
            <div className="mt-6 sm:mt-8 flex flex-col items-center gap-3 w-full">
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
                    className="min-h-10 px-3 py-2 rounded-xl bg-white border border-[#D1D7E4] hover:border-[#6C47FF]/35 hover:bg-[#6C47FF]/6 text-xs text-slate-650 hover:text-[#5535E0] transition-all shadow-sm cursor-pointer"
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
            {conversationPlan && conversationPlan.plan.questions.length === 0 && (
              <ConversationPlanCard
                result={conversationPlan}
                answers={clarificationAnswers}
                onAnswer={(questionId, answer) => setClarificationAnswers((current) => ({ ...current, [questionId]: answer }))}
                onContinue={handleClarificationContinue}
                continuing={isCompiling}
                onApprove={handleApproveConversationPlan}
                applying={isApplyingPlan}
                applied={appliedProposalId === conversationPlan.proposal?.id}
              />
            )}
            {/* Header Control Panel */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/60">
              <div>
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Active Plan</span>
                <h2 className="text-xl font-bold tracking-tight text-slate-800 mt-0.5">
                  {compiledWf.name}
                </h2>
              </div>
              
              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 max-w-full">
                <button
                  onClick={() => setIsInspectorOpen(!isInspectorOpen)}
                  className="min-h-10 shrink-0 px-3.5 py-2 rounded-xl bg-white border border-slate-200/80 hover:border-slate-300 text-xs font-semibold text-slate-600 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Terminal size={13} />
                  <span>{isInspectorOpen ? 'Hide Terminal' : 'Show Terminal'}</span>
                </button>
                
                <button
                  onClick={() => navigate(`/dashboard/canvas?id=${encodeURIComponent(compiledWf.id)}`)}
                  className="min-h-10 shrink-0 px-3.5 py-2 rounded-xl bg-white border border-slate-200/80 hover:border-slate-300 text-xs font-semibold text-slate-600 transition-colors cursor-pointer flex items-center gap-1.5"
                  title="Tweak this workflow in the advanced canvas"
                >
                  <Sliders size={13} />
                  <span>Edit in Canvas</span>
                </button>
                
                <button
                  onClick={handleReset}
                  className="min-w-10 min-h-10 shrink-0 p-2 rounded-xl bg-white border border-slate-200/80 hover:border-red-200 hover:text-red-600 transition-all cursor-pointer"
                  title="Clear plan and start over"
                >
                  <Trash2 size={14} />
                </button>

                <button
                  onClick={handleRun}
                  disabled={isRunning}
                  className="min-h-10 shrink-0 px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 text-white text-xs font-bold shadow-md shadow-indigo-600/10 flex items-center gap-1.5 transition-all cursor-pointer"
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
            <div className="bg-white rounded-2xl border border-slate-200/60 p-3 sm:p-5 shadow-sm">
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
