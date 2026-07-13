import { memo, useState, useCallback } from 'react';
import { NodeResizer } from '@xyflow/react';

interface StickyNoteData {
  text?: string;
  onUpdate?: (id: string, text: string) => void;
  onDelete?: (id: string) => void;
  id: string;
}

function StickyNote({ data, selected }: { data: StickyNoteData; selected?: boolean }) {
  const [text, setText] = useState(data.text || '');

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    data.onUpdate?.(data.id, val);
  }, [data]);

  return (
    <div className="sticky-note-node group" style={{ minWidth: 180, minHeight: 80 }}>
      <NodeResizer
        isVisible={selected}
        minWidth={140}
        minHeight={60}
        lineStyle={{ border: '1px solid rgba(250,204,21,0.4)' }}
        handleStyle={{ background: 'rgba(250,204,21,0.5)', width: 8, height: 8, borderRadius: 2 }}
      />

      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); data.onDelete?.(data.id); }}
        className="absolute -top-2 -right-2 w-5 h-5 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-yellow-500 hover:text-white transition-all z-10 text-xs"
      >
        ✕
      </button>

      <div className="sticky-note-node-label">Note</div>
      <textarea
        value={text}
        onChange={handleChange}
        placeholder="Add a note..."
        className="sticky-note-node w-full"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      />
    </div>
  );
}

export default memo(StickyNote);
