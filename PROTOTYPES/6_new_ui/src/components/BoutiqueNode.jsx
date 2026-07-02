import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { 
  Globe, Type, Plus, Database, Sparkles, Code, Play, CheckCircle, AlertCircle
} from 'lucide-react';

const iconMap = {
  trigger: <Globe className="w-5 h-5 text-emerald-400" />,
  type: <Type className="w-5 h-5 text-blue-400" />,
  click: <Plus className="w-5 h-5 text-indigo-400" />,
  scrape: <Database className="w-5 h-5 text-amber-400" />,
  ai_prompt: <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />,
  js_code: <Code className="w-5 h-5 text-rose-400" />,
  mission: <Play className="w-5 h-5 text-sky-400" />
};

const borderGradientMap = {
  trigger: 'from-emerald-500/50 to-teal-500/50',
  type: 'from-blue-500/50 to-indigo-500/50',
  click: 'from-indigo-500/50 to-violet-500/50',
  scrape: 'from-amber-500/50 to-orange-500/50',
  ai_prompt: 'from-purple-500/50 to-fuchsia-500/50',
  js_code: 'from-rose-500/50 to-pink-500/50',
  mission: 'from-sky-500/50 to-cyan-500/50'
};

const bgGlowMap = {
  trigger: 'rgba(16, 185, 129, 0.05)',
  type: 'rgba(59, 130, 246, 0.05)',
  click: 'rgba(99, 102, 241, 0.05)',
  scrape: 'rgba(245, 158, 11, 0.05)',
  ai_prompt: 'rgba(168, 85, 247, 0.05)',
  js_code: 'rgba(244, 63, 94, 0.05)',
  mission: 'rgba(14, 165, 233, 0.05)'
};

function BoutiqueNode({ data, selected }) {
  const type = data.type || 'click';
  const icon = iconMap[type] || <Plus className="w-5 h-5 text-indigo-400" />;
  const gradient = borderGradientMap[type] || 'from-indigo-500/50 to-violet-500/50';
  const bgGlow = bgGlowMap[type] || 'rgba(99, 102, 241, 0.05)';

  return (
    <div 
      className={`relative p-[1px] rounded-2xl bg-gradient-to-r ${gradient} transition-all duration-300 ${
        selected ? 'shadow-[0_0_20px_rgba(99,102,241,0.3)] scale-[1.03]' : 'shadow-lg hover:shadow-[0_0_15px_rgba(255,255,255,0.05)]'
      }`}
      style={{
        width: '260px',
        background: `linear-gradient(135deg, ${bgGlow}, rgba(15, 23, 42, 0.95))`
      }}
    >
      <div className="absolute inset-0 bg-slate-950/40 rounded-2xl backdrop-blur-md -z-10" />

      {/* Handles */}
      {type !== 'trigger' && (
        <Handle
          type="target"
          position={Position.Left}
          className="!bg-indigo-500 !w-2.5 !h-2.5 !border-2 !border-slate-900"
        />
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-indigo-500 !w-2.5 !h-2.5 !border-2 !border-slate-900"
      />

      {/* Content wrapper */}
      <div className="p-4 flex items-center gap-3.5">
        {/* Glowing Icon Wrapper */}
        <div className={`p-2.5 rounded-xl bg-slate-900/80 border border-slate-700/50 flex items-center justify-center shadow-inner relative group`}>
          <div className="absolute inset-0 bg-current opacity-0 group-hover:opacity-10 transition-opacity rounded-xl" />
          {icon}
        </div>

        {/* Text information */}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center mb-0.5">
            <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              {type.replace('_', ' ')}
            </span>
            {data.status && (
              <span className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                data.status === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
                data.status === 'running' ? 'bg-indigo-500/10 text-indigo-400 animate-pulse' :
                'bg-rose-500/10 text-rose-400'
              }`}>
                {data.status === 'success' && <CheckCircle size={10} />}
                {data.status}
              </span>
            )}
          </div>
          
          <h4 className="text-sm font-semibold text-slate-100 truncate">
            {data.label || 'Configure Step'}
          </h4>
          
          {data.value && (
            <p className="text-[11px] text-slate-400 truncate mt-1 bg-slate-900/50 px-2 py-1 rounded border border-slate-800/80 font-mono">
              {data.value}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(BoutiqueNode);
