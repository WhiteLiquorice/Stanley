import { useEffect } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import { Search, Play, Eye, FileText, Settings, KeyRound, Database, RefreshCw, PlusCircle, Bookmark } from 'lucide-react';
import './CommandPalette.css';

interface Props {
  open: boolean;
  onClose: () => void;
  workflows: Array<{ id: string; name: string }>;
  onSelectWorkflow: (id: string) => void;
  onCanvasAction: (action: string, param?: string) => void;
}

export function CommandPalette({ open, onClose, workflows, onSelectWorkflow, onCanvasAction }: Props) {
  const navigate = useNavigate();

  // Handle global escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!open) return null;

  const handleNavigate = (path: string) => {
    navigate(path);
    onClose();
  };

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette-container glass-panel" onClick={e => e.stopPropagation()}>
        <Command label="Command Menu" className="command-menu">
          <div className="command-search-wrapper">
            <Search className="command-search-icon" size={16} />
            <Command.Input placeholder="Search workflows, pages, or visual actions..." className="command-input" autoFocus />
            <span className="command-esc-badge">ESC</span>
          </div>

          <Command.List className="command-list">
            <Command.Empty className="command-empty">No results found.</Command.Empty>

            <Command.Group heading="Visual Canvas Actions" className="command-group">
              <Command.Item
                onSelect={() => { onCanvasAction('layout'); onClose(); }}
                className="command-item"
              >
                <RefreshCw size={14} className="mr-2" />
                <span>Auto-arrange Canvas Layout (Dagre)</span>
              </Command.Item>
              <Command.Item
                onSelect={() => { onCanvasAction('addNode', 'navigate'); onClose(); }}
                className="command-item"
              >
                <PlusCircle size={14} className="mr-2" />
                <span>Add Node: Navigate Step</span>
              </Command.Item>
              <Command.Item
                onSelect={() => { onCanvasAction('addNode', 'scrape'); onClose(); }}
                className="command-item"
              >
                <PlusCircle size={14} className="mr-2" />
                <span>Add Node: Scrape Step</span>
              </Command.Item>
              <Command.Item
                onSelect={() => { onCanvasAction('addNode', 'ai_prompt'); onClose(); }}
                className="command-item"
              >
                <PlusCircle size={14} className="mr-2" />
                <span>Add Node: AI Prompt Analysis</span>
              </Command.Item>
              <Command.Item
                onSelect={() => { onCanvasAction('addNode', 'sticky'); onClose(); }}
                className="command-item"
              >
                <Bookmark size={14} className="mr-2" />
                <span>Add Canvas Sticky Note</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Saved Automations" className="command-group">
              {workflows.map(w => (
                <Command.Item
                  key={w.id}
                  onSelect={() => { onSelectWorkflow(w.id); onClose(); }}
                  className="command-item"
                >
                  <Play size={14} className="mr-2 text-violet-400" />
                  <span>Open &amp; Load: {w.name}</span>
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="Navigation" className="command-group">
              <Command.Item onSelect={() => handleNavigate('/dashboard')} className="command-item">
                <Database size={14} className="mr-2" />
                <span>Go to Cockpit Dashboard</span>
              </Command.Item>
              <Command.Item onSelect={() => handleNavigate('/dashboard/results')} className="command-item">
                <Eye size={14} className="mr-2" />
                <span>Go to Run Results View</span>
              </Command.Item>
              <Command.Item onSelect={() => handleNavigate('/dashboard/vault')} className="command-item">
                <KeyRound size={14} className="mr-2" />
                <span>Go to Credential Vault</span>
              </Command.Item>
              <Command.Item onSelect={() => handleNavigate('/dashboard/guide')} className="command-item">
                <FileText size={14} className="mr-2" />
                <span>Go to Documentation Guide</span>
              </Command.Item>
              <Command.Item onSelect={() => handleNavigate('/dashboard/settings')} className="command-item">
                <Settings size={14} className="mr-2" />
                <span>Go to Account Billing Settings</span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
