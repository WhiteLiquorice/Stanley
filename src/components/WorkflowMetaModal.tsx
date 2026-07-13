import { useState } from 'react';
import { X, Tag, Folder } from 'lucide-react';

interface Props {
  workflow: { id: string; name: string; tags?: string[]; folder?: string };
  onSave: (updates: { tags: string[]; folder: string }) => void;
  onClose: () => void;
}

export function WorkflowMetaModal({ workflow, onSave, onClose }: Props) {
  const [folder, setFolder] = useState(workflow.folder || '');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(workflow.tags || []);

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleSave = () => {
    onSave({
      tags,
      folder: folder.trim(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative bg-[#090d16] border border-slate-800/60 rounded-2xl shadow-2xl shadow-black/60 w-full max-w-md p-6">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors"
        >
          <X size={18} />
        </button>

        <h2 className="text-base font-bold text-white mb-4">Organize Automation</h2>
        <p className="text-xs text-slate-400 mb-6">
          Set a folder category and add searchable tag labels to <strong className="text-slate-200">"{workflow.name}"</strong>.
        </p>

        <div className="space-y-4 mb-6">
          {/* Folder input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Folder size={12} /> Folder Category
            </label>
            <input
              type="text"
              placeholder="e.g. Scrapers, Daily Reports"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              className="w-full bg-[#0d1527] border border-slate-800/60 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>

          {/* Tags input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Tag size={12} /> Tags
            </label>
            <form onSubmit={handleAddTag} className="flex gap-2">
              <input
                type="text"
                placeholder="Add tag and press Enter"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                className="flex-1 bg-[#0d1527] border border-slate-800/60 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
              />
              <button
                type="submit"
                className="btn btn-secondary px-3 py-2 text-xs"
              >
                Add
              </button>
            </form>

            {/* Tag List */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.75 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 text-[10px] font-medium"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="text-violet-400 hover:text-rose-400 transition-colors"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800/60">
          <button className="btn btn-secondary text-xs" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary text-xs"
            onClick={handleSave}
            style={{ background: 'linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)', border: 'none' }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
