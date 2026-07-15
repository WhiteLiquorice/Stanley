import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Bell, Bot, Brain, Check, Database, FileText, Globe2, LayoutTemplate, RefreshCw, Rocket, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { setDoc } from '../lib/firestore';
import { approveTemplate, listDynamicTemplates, publishTemplate, recordTemplateUse, updateTemplate, type WorkflowTemplate } from '../lib/templateClient';

type NodeSpec = { type: string; label: string; value?: string; data?: Record<string, unknown> };

function builtIn(templateId: string, name: string, description: string, category: string, steps: NodeSpec[]): WorkflowTemplate {
  const mission = { id: 'mission', type: 'mission', label: 'Mission', data: { prompt: description }, position: { x: 40, y: 40 } };
  const nodes = steps.map((step, index) => ({ id: `n${index + 1}`, type: step.type, label: step.label, data: { ...(step.data || {}), ...(step.value ? { value: step.value } : {}) }, position: { x: 320, y: 40 + index * 140 } }));
  const edges: Array<Record<string, unknown>> = [{ source: 'mission', target: 'n1', kind: 'context' }];
  for (let index = 0; index < nodes.length - 1; index++) edges.push({ source: nodes[index].id, target: nodes[index + 1].id });
  return { templateId, version: 'v1', name, description, category, state: 'published', visibility: 'public', requiredVaultRefs: [], workflow: { nodes: [mission, ...nodes], edges }, provenance: { type: 'builtin' }, health: { successCount: 0, failureCount: 0, verifiedSuccessRate: 0, usageCount: 0, compatibility: 'current', driftCount: 0 } };
}

const BUILT_INS: WorkflowTemplate[] = [
  builtIn('tpl-google-search', 'Google Search Scraper', 'Search Google and extract the resulting links and summaries.', 'Scraping', [{ type: 'trigger', label: 'Open Google', data: { url: 'https://google.com' } }, { type: 'type', label: 'Enter search query', value: 'search query' }, { type: 'click', label: 'Submit search', value: 'search button' }, { type: 'wait', label: 'Wait for results', data: { ms: 2000 } }, { type: 'scrape', label: 'Extract results', value: 'results' }]),
  builtIn('tpl-price-monitor', 'Price Monitor', 'Monitor a product page and alert when its price changes.', 'Monitoring', [{ type: 'trigger', label: 'Open product page', data: { url: 'https://example.com' } }, { type: 'scrape', label: 'Extract price', value: 'price element' }, { type: 'monitor', label: 'Monitor price change', value: 'price change' }]),
  builtIn('tpl-linkedin-scraper', 'LinkedIn Profile Scraper', 'Search LinkedIn and extract structured profile results.', 'Scraping', [{ type: 'trigger', label: 'Open LinkedIn search', data: { url: 'https://linkedin.com/search' } }, { type: 'type', label: 'Enter search query', value: 'search query' }, { type: 'click', label: 'Submit search', value: 'search' }, { type: 'wait', label: 'Wait for results', data: { ms: 3000 } }, { type: 'scrape', label: 'Extract profiles', value: 'results' }]),
  builtIn('tpl-slack-bot', 'Slack Notification Bot', 'Extract data from a page and send it to Slack after approval.', 'Notification', [{ type: 'trigger', label: 'Open target', data: { url: 'https://example.com' } }, { type: 'scrape', label: 'Extract data', value: 'data' }, { type: 'approval', label: 'Approve notification' }, { type: 'send_slack', label: 'Send to Slack', value: 'webhook' }]),
  builtIn('tpl-email-page-change', 'Email on Page Change', 'Monitor a page and send an email when its content changes.', 'Monitoring', [{ type: 'trigger', label: 'Open target', data: { url: 'https://example.com' } }, { type: 'monitor', label: 'Monitor content', value: 'page content' }, { type: 'approval', label: 'Approve email' }, { type: 'send_email', label: 'Send notification', value: 'notification' }]),
  builtIn('tpl-api-fetcher', 'API Data Fetcher', 'Fetch data from a REST API and transform the response.', 'API', [{ type: 'trigger', label: 'Start API workflow', data: { url: 'https://jsonplaceholder.typicode.com' } }, { type: 'http_request', label: 'Fetch users', data: { method: 'GET', url: 'https://jsonplaceholder.typicode.com/users' } }, { type: 'transform', label: 'Extract names', value: 'extract names' }]),
  builtIn('tpl-multi-page', 'Multi-Page Scraper', 'Navigate pagination and collect structured results from multiple pages.', 'Scraping', [{ type: 'trigger', label: 'Open first page', data: { url: 'https://example.com' } }, { type: 'scrape', label: 'Extract current page' }, { type: 'paginate', label: 'Advance pagination' }, { type: 'scrape', label: 'Collect results' }]),
  builtIn('tpl-wikipedia-summarizer', 'Wikipedia Summarizer', 'Extract a Wikipedia article and produce a concise AI summary.', 'AI', [{ type: 'trigger', label: 'Open article', data: { url: 'https://wikipedia.org' } }, { type: 'scrape', label: 'Extract article', value: 'article text' }, { type: 'ai_prompt', label: 'Summarize article', value: 'summarize' }]),
  builtIn('tpl-agent-research', 'Agent Research Assistant', 'Give an Agent a research objective, bounded tools, and an explicit step budget.', 'AI', [{ type: 'trigger', label: 'Start research', data: { url: 'https://google.com' } }, { type: 'agent', label: 'Research objective', data: { goal: 'Research the requested subject and return cited findings.', maxSteps: 8 } }]),
  builtIn('tpl-hackernews-digest', 'Hacker News Digest', 'Collect top stories, create a concise digest, and send it to Slack after approval.', 'Notification', [{ type: 'trigger', label: 'Open Hacker News', data: { url: 'https://news.ycombinator.com' } }, { type: 'scrape', label: 'Extract top stories' }, { type: 'transform', label: 'Select first five' }, { type: 'approval', label: 'Approve digest' }, { type: 'send_slack', label: 'Send digest' }]),
  builtIn('tpl-form-autofill', 'Approved Form Auto-Fill', 'Fill a web form and require approval immediately before submission.', 'Automation', [{ type: 'trigger', label: 'Open form', data: { url: 'https://example.com/form' } }, { type: 'type', label: 'Fill first field' }, { type: 'type', label: 'Fill second field' }, { type: 'approval', label: 'Approve submission' }, { type: 'click', label: 'Submit form' }]),
];

const categoryIcons: Record<string, React.ReactNode> = { Scraping: <Database size={12}/>, Monitoring: <Bell size={12}/>, Notification: <Bell size={12}/>, API: <Globe2 size={12}/>, AI: <Brain size={12}/>, Automation: <Bot size={12}/> };

export function Templates() {
  const navigate = useNavigate();
  const [dynamic, setDynamic] = useState<WorkflowTemplate[]>([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState('');

  const load = useCallback(async () => { try { setCatalogError(''); setDynamic(await listDynamicTemplates()); } catch (error) { setCatalogError(error instanceof Error ? error.message : 'Dynamic catalog is unavailable.'); } }, []);
  useEffect(() => { void load(); }, [load]);
  const templates = useMemo(() => [...dynamic, ...BUILT_INS], [dynamic]);
  const categories = useMemo(() => ['All', ...Array.from(new Set(templates.map((item) => item.category)))], [templates]);
  const filtered = activeCategory === 'All' ? templates : templates.filter((template) => template.category === activeCategory);

  const lifecycle = async (template: WorkflowTemplate, action: 'approve' | 'publish') => {
    setLoadingId(`${template.templateId}:${action}`);
    try { action === 'approve' ? await approveTemplate(template) : await publishTemplate(template); toast.success(action === 'approve' ? 'Template approved' : 'Template published'); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Template action failed.'); }
    finally { setLoadingId(null); }
  };
  const setVisibility = async (template: WorkflowTemplate, visibility: WorkflowTemplate['visibility']) => { setLoadingId(`${template.templateId}:visibility`); try { await updateTemplate(template, { visibility }); await load(); } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not update visibility.'); } finally { setLoadingId(null); } };

  const useTemplate = async (template: WorkflowTemplate) => {
    if (template.state !== 'published') return toast.error('Approve and publish this template before using it.');
    setLoadingId(`${template.templateId}:use`);
    try {
      if (template.provenance.type !== 'builtin') await recordTemplateUse(template);
      const newId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 11);
      await setDoc('workflows', newId, { id: newId, name: template.name, description: template.description, nodes: structuredClone(template.workflow.nodes), edges: structuredClone(template.workflow.edges), inputSchema: template.workflow.inputSchema || {}, outputSchema: template.workflow.outputSchema || {}, template: { id: template.templateId, version: template.version, fingerprint: template.fingerprint || null }, createdAt: new Date().toISOString() });
      navigate(`/dashboard/canvas?id=${newId}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not create workflow from template.'); }
    finally { setLoadingId(null); }
  };

  return <div className="flex h-full flex-col overflow-y-auto bg-[#FDFBF7] p-6 font-sans text-[#1C1A17]">
    <div className="mb-6 flex items-start justify-between gap-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50"><LayoutTemplate size={20} className="text-indigo-600"/></div><div><h2 className="text-xl font-bold text-slate-800">Workflow Templates</h2><p className="mt-0.5 text-xs text-slate-500">Built-ins plus governed templates learned from verified connectors and skills.</p></div></div><button onClick={() => void load()} className="rounded-xl border bg-white p-2 text-slate-600"><RefreshCw size={15}/></button></div>
    {catalogError && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">Built-in templates remain available. Dynamic catalog: {catalogError}</div>}
    <div className="mb-6 flex flex-wrap items-center gap-2">{categories.map((category) => <button key={category} onClick={() => setActiveCategory(category)} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold ${activeCategory === category ? 'border-indigo-200 bg-indigo-600/10 text-indigo-700' : 'border-slate-200 bg-white text-slate-500'}`}>{category}</button>)}</div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((template) => {
      const runs = Number(template.health.successCount || 0) + Number(template.health.failureCount || 0);
      return <article key={`${template.templateId}:${template.version}`} className="group flex flex-col gap-4 rounded-2xl border border-[#EAE6DF] bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-800 group-hover:text-indigo-600">{template.name}</h3><div className="mt-1 flex flex-wrap gap-1.5"><Badge>{template.provenance.type}</Badge><Badge>{template.visibility}</Badge><Badge tone={template.state === 'published' ? 'green' : 'amber'}>{template.state}</Badge></div></div><span className="flex items-center gap-1 rounded-full border bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">{categoryIcons[template.category]}{template.category}</span></div>
        <p className="flex-1 text-xs leading-relaxed text-slate-500">{template.description}</p>
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center text-[10px]"><Metric label="Steps" value={template.workflow.nodes.filter((node) => node.type !== 'mission').length}/><Metric label="Verified" value={runs ? `${Math.round(template.health.verifiedSuccessRate * 100)}%` : 'New'}/><Metric label="Uses" value={template.health.usageCount || 0}/></div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#EAE6DF] pt-3"><div className="flex items-center gap-3 text-[10px] font-bold text-slate-400"><span className="flex items-center gap-1"><FileText size={11}/>{template.version}</span>{template.requiredVaultRefs.length > 0 && <span className="flex items-center gap-1"><ShieldCheck size={11}/>{template.requiredVaultRefs.length} credentials</span>}{template.state === 'draft' && template.provenance.type !== 'builtin' && <select aria-label="Template visibility" value={template.visibility} disabled={loadingId === `${template.templateId}:visibility`} onChange={(event) => void setVisibility(template, event.target.value as WorkflowTemplate['visibility'])} className="rounded border bg-white px-1 py-0.5 text-[9px] text-slate-600"><option value="tenant">Private</option><option value="public">Public catalog</option></select>}</div><div className="flex gap-2">{template.state === 'draft' && <SmallButton icon={<Check size={12}/>} label="Approve" busy={loadingId === `${template.templateId}:approve`} onClick={() => void lifecycle(template, 'approve')}/>} {template.state === 'approved' && <SmallButton icon={<Rocket size={12}/>} label="Publish" busy={loadingId === `${template.templateId}:publish`} onClick={() => void lifecycle(template, 'publish')}/>} {template.state === 'published' && <SmallButton icon={loadingId === `${template.templateId}:use` ? <Sparkles size={12} className="animate-spin"/> : <ArrowRight size={12}/>} label="Use" busy={loadingId === `${template.templateId}:use`} onClick={() => void useTemplate(template)} primary/>}</div></div>
      </article>;
    })}</div>
    {!filtered.length && <div className="flex flex-1 flex-col items-center justify-center py-16 text-slate-400"><LayoutTemplate size={48}/><h3 className="mt-4 font-bold">No templates in this category</h3></div>}
  </div>;
}

function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'green' | 'amber' }) { const styles = tone === 'green' ? 'bg-emerald-50 text-emerald-700' : tone === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'; return <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${styles}`}>{children}</span>; }
function Metric({ label, value }: { label: string; value: React.ReactNode }) { return <div><div className="font-bold text-slate-700">{value}</div><div className="mt-0.5 text-slate-400">{label}</div></div>; }
function SmallButton({ icon, label, onClick, busy, primary = false }: { icon: React.ReactNode; label: string; onClick: () => void; busy: boolean; primary?: boolean }) { return <button onClick={onClick} disabled={busy} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold disabled:opacity-50 ${primary ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>{icon}{label}</button>; }
