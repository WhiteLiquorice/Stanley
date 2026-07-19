import { useCallback, useEffect, useState } from 'react';
import { Activity, BrainCircuit, Check, Clock3, Database, Gauge, Loader2, Plus, RefreshCw, ShieldCheck, Trash2, Wrench, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, post, remove } from './operationsClient';

type Tab = 'skills' | 'waits' | 'learning' | 'memory' | 'monitoring';
type Item = Record<string, any>;
const tabs: Array<[Tab, string, typeof Activity]> = [['skills', 'Skills', BrainCircuit], ['waits', 'Waits', Clock3], ['learning', 'Learning', Wrench], ['memory', 'Memory', Database], ['monitoring', 'Monitoring', Gauge]];

export function OperationsWorkbench() {
  const [tab, setTab] = useState<Tab>('skills');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [runId, setRunId] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'skills') setItems((await api<{ skills: Item[] }>('/v1/skills')).skills.map((item) => ({ ...item, itemKind: 'skill' })));
      if (tab === 'learning') {
        const [cases, proposals, rollouts] = await Promise.all([
          api<{ cases: Item[] }>('/v1/learning/cases'), api<{ proposals: Item[] }>('/v1/learning/proposals'), api<{ rollouts: Item[] }>('/v1/learning/rollouts'),
        ]);
        setItems([...cases.cases.map((item) => ({ ...item, itemKind: 'case' })), ...proposals.proposals.map((item) => ({ ...item, itemKind: 'proposal' })), ...rollouts.rollouts.map((item) => ({ ...item, itemKind: 'rollout' }))]);
      }
      if (tab === 'memory') setItems((await api<{ memories: Item[] }>('/v1/memories?all=true')).memories.map((item) => ({ ...item, itemKind: 'memory' })));
      if (tab === 'monitoring') {
        const [alerts, monitors] = await Promise.all([api<{ alerts: Item[] }>('/v1/monitoring/alerts'), api<{ monitors: Item[] }>('/v1/outcome-monitors')]);
        setItems([...monitors.monitors.map((item) => ({ ...item, itemKind: 'outcome_monitor' })), ...alerts.alerts.map((item) => ({ ...item, itemKind: 'alert' }))]);
      }
      if (tab === 'waits' && runId) setItems([{ ...(await api<{ orchestration: Item }>(`/v1/orchestrations/${encodeURIComponent(runId)}`)).orchestration, itemKind: 'wait' }]);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not load operations.'); setItems([]); }
    finally { setLoading(false); }
  }, [tab, runId]);

  useEffect(() => { if (tab !== 'waits') void load(); }, [load, tab]);
  const act = async (path: string, body: unknown = {}) => { try { await post(path, body); toast.success('Action completed'); await load(); } catch (error) { toast.error(error instanceof Error ? error.message : 'Action failed'); } };

  return <main className="h-full overflow-y-auto bg-[#F8F6F1] p-5 md:p-7"><div className="mx-auto max-w-[1450px] space-y-5">
    <header className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#6C47FF]">Autonomy control plane</p><h1 className="mt-2 text-2xl font-bold text-slate-900">Stanley operations</h1><p className="mt-1 text-sm text-slate-500">Review, test, approve, activate, and roll back every learned capability.</p></div><div className="flex gap-2">{['skills', 'memory', 'monitoring'].includes(tab) && <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#6C47FF] px-3 py-2 text-xs font-bold text-white"><Plus size={14}/>Create</button>}<button onClick={() => void load()} className="rounded-xl border bg-white p-2.5"><RefreshCw size={15} className={loading ? 'animate-spin' : ''}/></button></div></header>
    <nav className="flex flex-wrap gap-2">{tabs.map(([id, label, Icon]) => <button key={id} onClick={() => { setTab(id); setItems([]); }} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${tab === id ? 'border-[#6C47FF]/30 bg-[#6C47FF]/10 text-[#6C47FF]' : 'bg-white text-slate-600'}`}><Icon size={14}/>{label}</button>)}</nav>
    {tab === 'waits' && <section className="flex gap-2 rounded-2xl border bg-white p-4"><input value={runId} onChange={(event) => setRunId(event.target.value)} placeholder="Run ID" className="flex-1 rounded-xl border px-3 py-2 text-sm"/><button onClick={() => void load()} className="rounded-xl bg-[#6C47FF] px-4 text-xs font-bold text-white">Inspect wait</button></section>}
    <section className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white">{loading ? <div className="flex h-48 items-center justify-center"><Loader2 className="animate-spin"/></div> : !items.length ? <div className="p-12 text-center text-sm text-slate-500">Nothing to review.</div> : items.map((item) => <Card key={`${item.itemKind}:${item.id || item.skillId || item.runId}`} tab={tab} item={item} act={act} reload={load}/>)}</section>
    {showCreate && <CreateDialog tab={tab} close={() => setShowCreate(false)} created={async () => { setShowCreate(false); await load(); }}/>}
  </div></main>;
}

function Card({ tab, item, act, reload }: { tab: Tab; item: Item; act: (path: string, body?: unknown) => Promise<void>; reload: () => Promise<void> }) {
  const title = item.name || item.title || item.key || item.id || item.skillId;
  const state = item.state || item.severity || item.type;
  return <article className="border-b p-5 last:border-0"><div className="flex flex-col justify-between gap-3 md:flex-row"><div><div className="flex items-center gap-2"><h2 className="text-sm font-bold text-slate-900">{title}</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{item.itemKind} · {state}</span></div><p className="mt-1 max-w-3xl text-xs text-slate-500">{item.rationale || item.rollbackReason || item.summary || item.retrieval?.reason || item.workflowId || 'Structured Stanley artifact'}</p><div className="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-400">{item.version && <span>{item.version}</span>}{item.successCount !== undefined && <span>{item.successCount} success / {item.failureCount || 0} failed</span>}{item.confidence !== undefined && <span>{Math.round(item.confidence * 100)}% confidence</span>}{item.createdAt && <span>{new Date(item.createdAt).toLocaleString()}</span>}</div></div><div className="flex flex-wrap items-start gap-2">
    {tab === 'skills' && item.state === 'draft' && <Btn label="Test" icon={Activity} onClick={() => act(`/v1/skills/${item.skillId}/versions/${item.version}/test`)}/>} {tab === 'skills' && item.state === 'tested' && <Btn label="Approve" icon={ShieldCheck} onClick={() => act(`/v1/skills/${item.skillId}/versions/${item.version}/approve`)}/>} {tab === 'skills' && item.state === 'approved' && <Btn label="Activate" icon={Check} onClick={() => act(`/v1/skills/${item.skillId}/versions/${item.version}/activate`)}/>} {tab === 'skills' && item.state === 'active' && item.rollbackVersion && <Btn label={`Roll back to ${item.rollbackVersion}`} icon={RefreshCw} onClick={() => act(`/v1/skills/${item.skillId}/rollback/${item.rollbackVersion}`)}/>}
    {tab === 'learning' && item.itemKind === 'case' && !item.proposalId && <Btn label="Propose repair" icon={Wrench} onClick={() => act(`/v1/learning/cases/${item.id}/propose`)}/>} {tab === 'learning' && item.itemKind === 'proposal' && item.state === 'draft' && <Btn label="Regression test" icon={Activity} onClick={() => act(`/v1/learning/proposals/${item.id}/test`)}/>} {tab === 'learning' && item.itemKind === 'proposal' && item.state === 'tested' && <Btn label="Approve" icon={ShieldCheck} onClick={() => act(`/v1/learning/proposals/${item.id}/approve`)}/>} {tab === 'learning' && item.itemKind === 'proposal' && !['published', 'rejected', 'rolled_back'].includes(item.state) && <Btn label="Reject" icon={X} onClick={() => act(`/v1/learning/proposals/${item.id}/reject`, { reason: 'Rejected by operator' })}/>} {tab === 'learning' && item.itemKind === 'proposal' && item.state === 'approved' && <Btn label="Start shadow" icon={Activity} onClick={() => act(`/v1/learning/proposals/${item.id}/rollout`, { mode: 'shadow' })}/>} {tab === 'learning' && item.itemKind === 'rollout' && item.state === 'paused' && item.recommendation === 'ready_for_canary' && <Btn label="Advance to 10% canary" icon={Activity} onClick={() => act(`/v1/learning/rollouts/${item.id}/canary`, { percentage: 10 })}/>}
    {tab === 'memory' && item.state === 'pending_approval' && <Btn label="Approve" icon={ShieldCheck} onClick={() => act(`/v1/memories/${item.id}/approve`)}/>} {tab === 'memory' && <Btn label="Delete" icon={Trash2} onClick={async () => { if (!confirm('Delete this memory?')) return; await remove(`/v1/memories/${item.id}`); toast.success('Memory deleted'); await reload(); }}/>}
    {tab === 'monitoring' && item.itemKind === 'outcome_monitor' && item.state === 'pending_approval' && <Btn label="Approve" icon={ShieldCheck} onClick={() => act(`/v1/outcome-monitors/${item.id}/approve`)}/>} {tab === 'monitoring' && item.itemKind === 'outcome_monitor' && item.state === 'active' && <Btn label="Evaluate now" icon={Activity} onClick={() => act(`/v1/outcome-monitors/${item.id}/evaluate`)}/>}
  </div></div>{tab === 'waits' && Object.values(item.waits || {}).map((wait: any) => <WaitForm key={wait.id} runId={item.id} wait={wait} act={act}/>)}</article>;
}

function CreateDialog({ tab, close, created }: { tab: Tab; close: () => void; created: () => Promise<void> }) {
  const [fields, setFields] = useState<Record<string, string>>({ runId: '', name: '', operationName: '', workflowId: '', key: '', value: '', type: 'semantic', scope: 'workflow', sources: '[{"id":"source","type":"connector","connectorId":""}]', rules: '[{"id":"present","type":"presence","source":"source","path":""}]' });
  const submit = async () => { try {
    if (tab === 'skills') await post('/v1/skills/compile', { runId: fields.runId, name: fields.name || undefined, operationName: fields.operationName || undefined });
    if (tab === 'memory') await post('/v1/memories', { workflowId: fields.workflowId || undefined, key: fields.key, value: JSON.parse(fields.value || 'null'), type: fields.type, scope: fields.scope });
    if (tab === 'monitoring') await post('/v1/outcome-monitors', { workflowId: fields.workflowId, name: fields.name, sources: JSON.parse(fields.sources), rules: JSON.parse(fields.rules), intervalMinutes: 60 });
    toast.success('Created'); await created();
  } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not create item'); } };
  const input = (name: string, placeholder: string) => <input value={fields[name]} onChange={(event) => setFields({ ...fields, [name]: event.target.value })} placeholder={placeholder} className="rounded-xl border px-3 py-2 text-sm"/>;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><div className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-5 shadow-2xl"><div className="flex justify-between"><h2 className="font-bold">Create {tab === 'skills' ? 'skill from verified run' : tab === 'memory' ? 'memory' : 'outcome monitor'}</h2><button onClick={close}><X size={16}/></button></div>{tab === 'skills' && <>{input('runId', 'Verified run ID')}{input('name', 'Skill name (optional)')}{input('operationName', 'Operation name (optional)')}</>}{tab === 'memory' && <>{input('workflowId', 'Workflow ID')}{input('key', 'Memory key')}{input('value', 'JSON value')}<select value={fields.type} onChange={(event) => setFields({ ...fields, type: event.target.value })} className="rounded-xl border px-3 py-2"><option>semantic</option><option>episodic</option><option>procedural</option></select></>}{tab === 'monitoring' && <>{input('workflowId', 'Workflow ID')}{input('name', 'Monitor name')}<textarea value={fields.sources} onChange={(event) => setFields({ ...fields, sources: event.target.value })} className="h-24 rounded-xl border p-3 font-mono text-xs"/><textarea value={fields.rules} onChange={(event) => setFields({ ...fields, rules: event.target.value })} className="h-24 rounded-xl border p-3 font-mono text-xs"/></>}<div className="flex justify-end gap-2"><button onClick={close} className="rounded-xl border px-4 py-2 text-xs font-bold">Cancel</button><button onClick={submit} className="rounded-xl bg-[#6C47FF] px-4 py-2 text-xs font-bold text-white">Create</button></div></div></div>;
}

function WaitForm({ runId, wait, act }: { runId: string; wait: Item; act: (path: string, body?: unknown) => Promise<void> }) { const [token, setToken] = useState(''); const [payload, setPayload] = useState('{}'); return <div className="mt-4 grid gap-2 rounded-xl bg-amber-50 p-3 md:grid-cols-[1fr_1fr_auto]"><input value={token} onChange={(event) => setToken(event.target.value)} placeholder="Resume token" className="rounded-lg border px-3 py-2 text-xs"/><input value={payload} onChange={(event) => setPayload(event.target.value)} className="rounded-lg border px-3 py-2 font-mono text-xs"/><button onClick={() => act(`/v1/orchestrations/${runId}/events/${wait.correlationId}`, { token, eventId: crypto.randomUUID(), type: wait.type, payload: JSON.parse(payload) })} className="rounded-lg bg-amber-600 px-3 text-xs font-bold text-white">Signal</button></div>; }
function Btn({ label, icon: Icon, onClick }: { label: string; icon: typeof Check; onClick: () => void }) { return <button onClick={onClick} className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-bold"><Icon size={13}/>{label}</button>; }
