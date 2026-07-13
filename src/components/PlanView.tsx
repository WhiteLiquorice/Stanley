import { Check, Loader2, AlertCircle, Cpu, Globe, Terminal } from 'lucide-react';

export interface PlanStep {
  id: string;
  type: string;
  label: string;
  description: string;
  tier: 'local' | 'browser' | 'agent';
  status: 'pending' | 'running' | 'success' | 'failed';
}

interface PlanViewProps {
  steps: PlanStep[];
  activeStepId: string | null;
}

export function PlanView({ steps, activeStepId }: PlanViewProps) {
  const getTierIcon = (tier: 'local' | 'browser' | 'agent') => {
    switch (tier) {
      case 'local':
        return <Terminal size={12} className="text-amber-600" />;
      case 'browser':
        return <Globe size={12} className="text-blue-600" />;
      case 'agent':
        return <Cpu size={12} className="text-purple-600" />;
    }
  };

  const getTierBadgeClass = (tier: 'local' | 'browser' | 'agent') => {
    switch (tier) {
      case 'local':
        return 'bg-amber-50 text-amber-700 border-amber-200/60';
      case 'browser':
        return 'bg-blue-50 text-blue-700 border-blue-200/60';
      case 'agent':
        return 'bg-purple-50 text-purple-700 border-purple-200/60';
    }
  };

  return (
    <div className="w-full flex flex-col gap-3 py-2">
      <h3 className="text-sm font-semibold text-slate-800 tracking-tight mb-1">Proposed Execution Plan</h3>
      <div className="flex flex-col gap-2.5">
        {steps.map((step, idx) => {
          const isActive = step.id === activeStepId || step.status === 'running';
          
          return (
            <div 
              key={step.id}
              className={`flex items-start gap-4 p-3.5 rounded-xl border transition-all duration-200 ${
                isActive 
                  ? 'bg-indigo-50/40 border-indigo-200 shadow-sm scale-[1.01]' 
                  : step.status === 'success'
                  ? 'bg-slate-50/55 border-slate-200/50 opacity-80'
                  : 'bg-white border-slate-200/60 shadow-sm'
              }`}
            >
              {/* Status Indicator */}
              <div className="flex-shrink-0 mt-0.5">
                {step.status === 'success' ? (
                  <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 border border-emerald-200">
                    <Check size={12} strokeWidth={3} />
                  </div>
                ) : step.status === 'running' ? (
                  <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 border border-indigo-200">
                    <Loader2 size={12} className="animate-spin" />
                  </div>
                ) : step.status === 'failed' ? (
                  <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-red-600 border border-red-200">
                    <AlertCircle size={12} />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200">
                    <span className="text-[10px] font-bold">{idx + 1}</span>
                  </div>
                )}
              </div>

              {/* Step Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className={`text-[13px] font-semibold tracking-tight ${
                    step.status === 'success' ? 'text-slate-500 line-through' : 'text-slate-800'
                  }`}>
                    {step.label}
                  </h4>
                  
                  {/* Tier Badge */}
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getTierBadgeClass(step.tier)}`}>
                    {getTierIcon(step.tier)}
                    {step.tier.toUpperCase()}
                  </span>
                </div>
                
                {step.description && (
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {step.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
