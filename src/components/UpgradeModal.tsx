import { X, Zap, Infinity as InfinityIcon, Calendar, Shield, ChevronRight } from 'lucide-react';

const STRIPE_LINK = 'https://buy.stripe.com/fZueVe9S38SV8fF38K3cc01';

const perks = [
  { icon: <InfinityIcon size={16} className="text-indigo-400" />, text: 'Unlimited automation runs' },
  { icon: <Calendar size={16} className="text-indigo-400" />, text: 'Scheduled & recurring automations' },
  { icon: <Zap size={16} className="text-indigo-400" />, text: 'AI-powered workflow generation' },
  { icon: <Shield size={16} className="text-indigo-400" />, text: 'Priority support & early features' },
];

interface UpgradeModalProps {
  runsUsed: number;
  onClose: () => void;
}

export function UpgradeModal({ runsUsed, onClose }: UpgradeModalProps) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-slate-700/60 shadow-2xl overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #0f172a 0%, #070b13 100%)' }}
      >
        {/* Glow accent */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 rounded-full blur-3xl opacity-20" style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-slate-700/60 transition-all z-10"
        >
          <X size={14} />
        </button>

        <div className="relative p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
              <Zap size={20} className="text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">Upgrade to Stanley Pro</h2>
              <p className="text-xs text-slate-400">Unlock unlimited automation power</p>
            </div>
          </div>

          {/* Usage badge */}
          <div className="mt-5 mb-6 flex items-center gap-2.5 p-3.5 rounded-xl bg-amber-500/8 border border-amber-500/20">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
              <span className="text-amber-400 font-bold text-sm">{runsUsed}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-300">You've used all 10 free runs</p>
              <p className="text-xs text-slate-400 mt-0.5">Subscribe to keep your automations running</p>
            </div>
          </div>

          {/* Perks list */}
          <ul className="space-y-2.5 mb-7">
            {perks.map((p, i) => (
              <li key={i} className="flex items-center gap-3 text-sm text-slate-300">
                <div className="w-6 h-6 rounded-md bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                  {p.icon}
                </div>
                {p.text}
              </li>
            ))}
          </ul>

          {/* CTA */}
          <a
            href={STRIPE_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 px-6 rounded-xl font-semibold text-sm text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          >
            Subscribe Now — $29/mo
            <ChevronRight size={16} />
          </a>

          <p className="text-center text-[11px] text-slate-500 mt-3">
            Cancel anytime · Instant activation
          </p>
        </div>
      </div>
    </div>
  );
}
