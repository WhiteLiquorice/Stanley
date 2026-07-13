import { X, Terminal, Image, Code } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface LiveViewPanelProps {
  isOpen: boolean;
  onClose: () => void;
  logs: string[];
  screenshotUrl?: string | null;
}

export function LiveViewPanel({ isOpen, onClose, logs, screenshotUrl }: LiveViewPanelProps) {
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-[#F5F2EC] border-l border-slate-200/80 shadow-2xl flex flex-col z-[100] animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200/80 bg-white">
        <div className="flex items-center gap-2 text-slate-800">
          <Terminal size={16} className="text-indigo-600" />
          <span className="text-sm font-semibold tracking-tight">Execution Inspector</span>
        </div>
        <button 
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Tabs / Content */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Screenshot / DOM Mirror Box */}
        {screenshotUrl ? (
          <div className="flex flex-col gap-2 bg-white p-3 rounded-xl border border-slate-200/60 shadow-sm">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-1">
              <Image size={13} />
              <span>Current Page View</span>
            </div>
            <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-slate-200/50 bg-slate-50 flex items-center justify-center">
              <img 
                src={screenshotUrl} 
                alt="Stanley Browser Mirror" 
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 bg-white p-3 rounded-xl border border-slate-200/60 border-dashed text-slate-400 text-xs">
            <GlobeIcon className="w-8 h-8 text-slate-300 animate-pulse mb-2" />
            <span>Waiting for browser viewport mirror...</span>
          </div>
        )}

        {/* Shadow Log Console */}
        <div className="flex-1 flex flex-col gap-2 bg-[#1C1A17] p-4 rounded-xl shadow-inner min-h-[250px] overflow-hidden">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-slate-500 border-b border-slate-800 pb-1.5 mb-1">
            <Code size={12} />
            <span>Shadow Execution Log</span>
          </div>
          
          <div className="flex-1 overflow-y-auto font-mono text-[11px] text-emerald-400/90 leading-relaxed space-y-1.5 pr-2">
            {logs.length === 0 ? (
              <div className="text-slate-500 italic">[System] Booting local orchestrator engine...</div>
            ) : (
              logs.map((log, idx) => {
                let colorClass = 'text-emerald-400/90';
                if (log.startsWith('[Error]') || log.startsWith('[API Error]')) colorClass = 'text-rose-400';
                if (log.startsWith('[Agent]')) colorClass = 'text-purple-400';
                if (log.startsWith('[API]')) colorClass = 'text-amber-400';
                
                return (
                  <div key={idx} className={colorClass}>
                    {log}
                  </div>
                );
              })
            )}
            <div ref={terminalEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

function GlobeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-.778.099-1.533.284-2.253"
      />
    </svg>
  );
}
