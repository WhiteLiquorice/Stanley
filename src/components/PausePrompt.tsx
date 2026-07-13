import { AlertCircle, ArrowRight } from 'lucide-react';

interface PausePromptProps {
  question: string;
  options: string[];
  onSubmit: (choice: string) => void;
}

export function PausePrompt({ question, options, onSubmit }: PausePromptProps) {
  return (
    <div className="w-full bg-indigo-50/60 border border-indigo-200/80 rounded-2xl p-5 flex flex-col gap-4 shadow-sm animate-fade-in my-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600 flex-shrink-0">
          <AlertCircle size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-slate-800 tracking-tight">Stanley Needs Your Input</h4>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            I hit a step that requires confirmation. Please choose how I should proceed:
          </p>
          <div className="mt-3 bg-white/80 border border-indigo-100/80 rounded-xl p-3.5 text-xs text-slate-700 font-medium leading-relaxed shadow-inner">
            "{question}"
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 justify-end mt-2 flex-wrap">
        {options.map((option, idx) => (
          <button
            key={idx}
            onClick={() => onSubmit(option)}
            className="flex items-center gap-1.5 px-4.5 py-2 rounded-xl bg-white border border-indigo-200/60 hover:border-indigo-400 text-xs font-semibold text-indigo-700 hover:bg-indigo-50/50 shadow-sm transition-all duration-150 cursor-pointer"
          >
            <span>{option}</span>
            <ArrowRight size={12} />
          </button>
        ))}
      </div>
    </div>
  );
}
