import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import type { ConversationPlanResult } from '../lib/conversationClient';

export function ConversationPlanCard({
  result,
  answers,
  onAnswer,
  onContinue,
  continuing,
  onApprove,
  applying = false,
  applied = false,
}: {
  result: ConversationPlanResult;
  answers: Record<string, string>;
  onAnswer: (questionId: string, answer: string) => void;
  onContinue: () => void;
  continuing: boolean;
  onApprove?: () => void;
  applying?: boolean;
  applied?: boolean;
}) {
  const questions = result.plan.questions;
  const canContinue = questions.every((question) => !question.required || Boolean(answers[question.id]?.trim()));
  const capabilities = result.plan.commands.flatMap((command) => Array.isArray(command.capabilityPlan) ? command.capabilityPlan as Array<{ kind: string; id: string; version?: string }> : []);

  return (
    <section className="mt-5 w-full rounded-2xl border border-violet-200/70 bg-white p-4 text-left shadow-sm sm:p-5" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Sparkles size={17} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">Stanley's proposed plan</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">{result.plan.intent}</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">{result.plan.summary || 'Review the proposal before Stanley changes or runs anything.'}</p>
        </div>
      </div>

      {questions.length > 0 ? (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-700"><HelpCircle size={15} /> Stanley needs more information instead of guessing.</div>
          {questions.map((question) => (
            <div key={question.id}>
              <label htmlFor={`clarification-${question.id}`} className="mb-1.5 block text-xs font-semibold text-slate-700">{question.prompt}</label>
              {question.options.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {question.options.map((option) => (
                    <button key={option} type="button" onClick={() => onAnswer(question.id, option)} className="min-h-10 rounded-xl border px-3 py-2 text-xs font-semibold transition" style={{ borderColor: answers[question.id] === option ? 'var(--accent)' : 'var(--border-strong)', color: answers[question.id] === option ? 'var(--accent)' : 'var(--text-secondary)', background: answers[question.id] === option ? 'var(--accent-light)' : 'white' }}>{option}</button>
                  ))}
                </div>
              ) : (
                <input id={`clarification-${question.id}`} value={answers[question.id] || ''} onChange={(event) => onAnswer(question.id, event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none focus:border-violet-500 focus:bg-white" placeholder="Your answer" />
              )}
            </div>
          ))}
          <button type="button" onClick={onContinue} disabled={!canContinue || continuing} className="min-h-11 w-full rounded-xl bg-violet-600 px-4 text-xs font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
            {continuing ? 'Updating plan…' : 'Continue planning'}
          </button>
        </div>
      ) : (
        <div className="mt-4 border-t border-slate-100 pt-4">
          {capabilities.length > 0 && <div className="mb-3 rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2.5"><p className="text-[9px] font-bold uppercase tracking-wider text-violet-500">Automatic capability selection</p><div className="mt-1.5 flex flex-wrap gap-1.5">{capabilities.map((capability) => <span key={`${capability.kind}:${capability.id}:${capability.version || ''}`} className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 shadow-sm">{capability.kind.replace('_', ' ')} · {capability.id}{capability.version ? ` ${capability.version}` : ''}</span>)}</div></div>}
          <div className="space-y-2">
            {result.diff.map((entry) => (
              <div key={`${entry.index}-${entry.type}`} className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
                {entry.requiresApproval ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" /> : <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" />}
                <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-700">{entry.description}</p><p className="mt-0.5 text-[9px] uppercase tracking-wider text-slate-400">{entry.type}</p></div>
                {entry.requiresApproval && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">Approval</span>}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-[10px] font-semibold text-emerald-700"><ShieldCheck size={14} /> {applied ? 'These exact reviewed changes were saved. Nothing was executed.' : 'This proposal has not been saved or executed.'}</div>
          {!applied && result.proposal?.canApply && result.proposalStored && onApprove && (
            <button type="button" onClick={onApprove} disabled={applying} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-xs font-bold text-white transition hover:bg-violet-700 disabled:cursor-wait disabled:bg-violet-300">
              {applying ? <><Loader2 size={14} className="animate-spin" /> Saving approved changes…</> : <><ShieldCheck size={14} /> Approve and save this exact plan</>}
            </button>
          )}
          {!applied && result.proposal?.canApply && !result.proposalStored && (
            <p className="mt-3 text-center text-[10px] font-semibold text-amber-700">Saving is unavailable until the proposal store is configured.</p>
          )}
        </div>
      )}
    </section>
  );
}
