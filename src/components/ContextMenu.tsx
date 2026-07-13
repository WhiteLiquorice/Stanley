import { useEffect, useRef } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';

export interface ContextMenuState {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  x: number;
  y: number;
}

interface Props {
  menu: ContextMenuState;
  onDuplicate: (nodeId: string) => void;
  onAddAfter: (nodeId: string, nodeType: string) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

export function ContextMenu({ menu, onDuplicate, onAddAfter, onDelete, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on click-outside or Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const item = (icon: React.ReactNode, label: string, action: () => void, danger = false) => (
    <button
      onClick={() => { action(); onClose(); }}
      className={`flex items-center gap-2.5 w-full px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
        danger
          ? 'text-rose-400 hover:bg-rose-500/10'
          : 'text-slate-300 hover:bg-slate-700/60 hover:text-white'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 9999 }}
      className="bg-[#0f172a] border border-slate-700/60 rounded-xl shadow-2xl shadow-black/50 p-1.5 min-w-[180px] animate-fade-in"
    >
      <div className="px-3 py-1.5 border-b border-slate-800/60 mb-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">
          {menu.nodeLabel || menu.nodeType}
        </p>
      </div>
      {item(<Copy size={13} />, 'Duplicate', () => onDuplicate(menu.nodeId))}
      {item(<Plus size={13} />, 'Add Step After', () => onAddAfter(menu.nodeId, menu.nodeType))}
      <div className="my-1 border-t border-slate-800/60" />
      {item(<Trash2 size={13} />, 'Delete Node', () => onDelete(menu.nodeId), true)}
    </div>
  );
}
