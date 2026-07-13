import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { 
  Globe, Globe2, Type, Plus, Database, Sparkles, Code, Play, CheckCircle,
  Send, Clipboard, FileText, Clock, Target, Eye, UserCheck,
  Repeat, Wand2, Mail, MessageSquare, Activity,
  Webhook, CalendarClock, GitBranch, Blocks, BrainCircuit
} from 'lucide-react';

const iconMap = {
  trigger: <Globe className="w-5 h-5 text-emerald-400" />,
  type: <Type className="w-5 h-5 text-blue-400" />,
  click: <Plus className="w-5 h-5 text-indigo-400" />,
  scrape: <Database className="w-5 h-5 text-amber-400" />,
  ai_prompt: <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />,
  js_code: <Code className="w-5 h-5 text-rose-400" />,
  mission: <Play className="w-5 h-5 text-sky-400" />,
  http_send: <Send className="w-5 h-5 text-indigo-400 animate-pulse" />,
  clipboard: <Clipboard className="w-5 h-5 text-teal-400" />,
  save_file: <FileText className="w-5 h-5 text-orange-400" />,
  wait: <Clock className="w-5 h-5 text-slate-400" />,
  agent: <Target className="w-5 h-5 text-fuchsia-400 animate-pulse" />,
  vision: <Eye className="w-5 h-5 text-cyan-400" />,
  approval: <UserCheck className="w-5 h-5 text-amber-400" />,
  http_request: <Globe2 className="w-5 h-5 text-teal-400" />,
  loop: <Repeat className="w-5 h-5 text-violet-400" />,
  transform: <Wand2 className="w-5 h-5 text-orange-400" />,
  send_email: <Mail className="w-5 h-5 text-sky-400" />,
  send_slack: <MessageSquare className="w-5 h-5 text-green-400" />,
  monitor: <Activity className="w-5 h-5 text-rose-400" />,
  webhook_trigger: <Webhook className="w-5 h-5 text-fuchsia-400" />,
  schedule_trigger: <CalendarClock className="w-5 h-5 text-amber-400" />,
  router: <GitBranch className="w-5 h-5 text-slate-400" />,
  integration: <Blocks className="w-5 h-5 text-emerald-400" />,
  ai_agent: <BrainCircuit className="w-5 h-5 text-indigo-400" />
};

function BoutiqueNode({ data, selected }: any) {
  const type = data.type || 'click';
  const icon = iconMap[type as keyof typeof iconMap] || <Plus className="w-5 h-5 text-indigo-500" />;
  
  // Theme colors based on node type
  const colorThemeMap: Record<string, string> = {
    trigger: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]',
    navigate: 'border-blue-500/30 bg-blue-500/10 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.15)]',
    type: 'border-blue-500/30 bg-blue-500/10 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.15)]',
    click: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.15)]',
    scrape: 'border-amber-500/30 bg-amber-500/10 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]',
    ai_prompt: 'border-purple-500/30 bg-purple-500/10 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.15)]',
    js_code: 'border-rose-500/30 bg-rose-500/10 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.15)]',
    mission: 'border-sky-500/30 bg-sky-500/10 text-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.15)]',
    wait: 'border-slate-500/30 bg-slate-500/10 text-slate-400 shadow-[0_0_15px_rgba(100,116,139,0.15)]',
    agent: 'border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-400 shadow-[0_0_15px_rgba(217,70,239,0.15)]',
    vision: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]',
    approval: 'border-amber-500/40 bg-amber-500/10 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]',
    http_request: 'border-teal-500/30 bg-teal-500/10 text-teal-400 shadow-[0_0_15px_rgba(20,184,166,0.15)]',
    loop: 'border-violet-500/40 bg-violet-500/10 text-violet-400 shadow-[0_0_15px_rgba(139,92,246,0.15)]',
    transform: 'border-orange-500/30 bg-orange-500/10 text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.15)]',
    send_email: 'border-sky-500/30 bg-sky-500/10 text-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.15)]',
    send_slack: 'border-green-500/30 bg-green-500/10 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.15)]',
    monitor: 'border-rose-500/40 bg-rose-500/10 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.15)]',
    webhook_trigger: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-400 shadow-[0_0_15px_rgba(217,70,239,0.15)]',
    schedule_trigger: 'border-amber-500/40 bg-amber-500/10 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]',
    router: 'border-slate-500/40 bg-slate-500/10 text-slate-400 shadow-[0_0_15px_rgba(100,116,139,0.15)]',
    integration: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]',
    ai_agent: 'border-indigo-500/50 bg-indigo-500/10 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.25)]'
  };
  const themeClass = colorThemeMap[type] || 'border-slate-500/30 bg-slate-500/10 text-slate-400';

  return (
    <div 
      className={`group relative rounded-2xl bg-white border transition-all duration-200 ${
        selected 
          ? 'border-[#6C47FF] shadow-[0_0_0_3px_rgba(108,71,255,0.18)]' 
          : 'border-[#D1D7E4] shadow-sm hover:border-[#B0BACC] hover:shadow-md'
      }`}
      style={{
        width: '280px',
      }}
    >


      {/* Top / Bottom flow handles (Primary) */}
      <Handle type="target" id="top"    position={Position.Top}    className="!bg-white !w-3 !h-3 !border !border-[#D1D7E4] transition-all hover:!border-[#6C47FF] hover:!shadow-[0_0_8px_rgba(108,71,255,0.35)] hover:scale-110" />
      <Handle type="source" id="bottom" position={Position.Bottom} className="!bg-white !w-3 !h-3 !border !border-[#D1D7E4] transition-all hover:!border-[#6C47FF] hover:!shadow-[0_0_8px_rgba(108,71,255,0.35)] hover:scale-110" />
      
      {/* Left / Right context handles (Secondary) */}
      <Handle type="target" id="left"  position={Position.Left}  className="!bg-violet-100 !w-2.5 !h-2.5 !border !border-violet-300 transition-all hover:!bg-[#6C47FF] hover:!border-[#6C47FF] hover:scale-110" />
      <Handle type="source" id="right" position={Position.Right} className="!bg-violet-100 !w-2.5 !h-2.5 !border !border-violet-300 transition-all hover:!bg-[#6C47FF] hover:!border-[#6C47FF] hover:scale-110" />

      {/* Delete button (visible on hover) */}
      {type !== 'trigger' && (
        <button
          onClick={(e) => { e.stopPropagation(); data.onDelete?.(data.id); }}
          className="absolute -top-2 -right-2 w-6 h-6 bg-rose-50 text-rose-600 border border-rose-200 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-rose-500 hover:text-white transition-all z-10 cursor-pointer"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        </button>
      )}

      {/* Content wrapper */}
      <div className="p-3.5 flex items-center gap-3">
        {/* Colorful Icon Circle */}
        <div className={`w-11 h-11 flex-shrink-0 rounded-2xl flex items-center justify-center border ${themeClass} transition-all duration-300 group-hover:scale-110`}>
          {icon}
        </div>

        {/* Text information */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
              {type.replace(/_/g, ' ')}
            </span>
            {data.status && (
              <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                data.status === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' :
                data.status === 'running' ? 'bg-indigo-50 text-indigo-700 border-indigo-200/50 animate-pulse' :
                'bg-rose-50 text-rose-700 border-rose-200/50'
              }`}>
                {data.status === 'success' && <CheckCircle size={10} />}
                {data.status}
              </span>
            )}
          </div>
          
          <h4 className="text-[13px] font-semibold text-slate-800 truncate mt-0.5 tracking-tight">
            {data.label || 'Configure Step'}
          </h4>
          
          {data.value && (
            <p className="text-[10px] text-slate-600 truncate mt-1.5 bg-[#F5F2EC]/60 px-2 py-1 rounded-lg border border-[#EAE6DF]/60 font-mono">
              {data.value}
            </p>
          )}
        </div>
        
        {/* Run/Test Node Action */}
        <button 
          className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-indigo-600 transition-all flex-shrink-0 bg-slate-50 hover:bg-indigo-50 rounded-xl border border-transparent hover:border-indigo-100 cursor-pointer"
          title="Test this node"
          onClick={(e) => { e.stopPropagation(); /* TODO hook up individual test run */ }}
        >
          <Play size={12} className="ml-0.5" />
        </button>
      </div>
    </div>
  );
}

export default memo(BoutiqueNode);
