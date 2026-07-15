import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileCheck2,
  Inbox,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getLatestCheckpoint,
  getBrowserTakeover,
  claimBrowserTakeover,
  heartbeatBrowserTakeover,
  sendBrowserTakeoverCommand,
  getRunReceipts,
  listTrustExceptions,
  resolveTrustException,
  retryTrustException,
  type ProofReceipt,
  type RunCheckpoint,
  type TrustException,
  type BrowserTakeover,
} from '../trust-engine/web-client/trustClient';

type Filter = 'open' | 'all';

function friendlyKind(kind: string): string {
  return kind
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function relativeTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Unknown time';
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function EvidenceSummary({ value }: { value: unknown }) {
  if (!value || typeof value !== 'object') {
    return <span className="text-xs text-slate-500">No additional evidence was captured.</span>;
  }
  const entries = Object.entries(value as Record<string, unknown>).slice(0, 12);
  if (!entries.length) return <span className="text-xs text-slate-500">No additional evidence was captured.</span>;
  return (
    <dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
      {entries.map(([key, item]) => (
        <div key={key} className="contents">
          <dt className="font-semibold text-slate-500 truncate">{friendlyKind(key)}</dt>
          <dd className="text-slate-700 break-words">
            {typeof item === 'object' ? JSON.stringify(item) : String(item ?? 'Not recorded')}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ReceiptTimeline({ receipts }: { receipts: ProofReceipt[] }) {
  if (!receipts.length) return <p className="text-xs text-slate-500">No proof receipts have been written yet.</p>;
  return (
    <ol className="space-y-3">
      {receipts.map((receipt) => (
        <li key={receipt.id} className="flex gap-3">
          <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
            ['failed', 'unverified'].includes(receipt.outcome) ? 'bg-rose-500' :
              receipt.outcome === 'simulated' ? 'bg-amber-400' : 'bg-emerald-500'
          }`} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-xs font-semibold text-slate-700">{friendlyKind(receipt.kind)}</p>
              <time className="shrink-0 text-[10px] text-slate-400">{relativeTime(receipt.occurredAt)}</time>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {friendlyKind(receipt.outcome)} · {receipt.mode === 'shadow' ? 'Shadow run' : 'Live run'}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ExceptionWorkbench() {
  const [filter, setFilter] = useState<Filter>('open');
  const [exceptions, setExceptions] = useState<TrustException[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<ProofReceipt[]>([]);
  const [checkpoint, setCheckpoint] = useState<RunCheckpoint | null>(null);
  const [takeover, setTakeover] = useState<BrowserTakeover | null>(null);
  const [takeoverToken, setTakeoverToken] = useState('');
  const [takeoverValues, setTakeoverValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState('');

  const selected = useMemo(
    () => exceptions.find((item) => item.id === selectedId) || null,
    [exceptions, selectedId],
  );

  const loadExceptions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await listTrustExceptions(filter);
      setExceptions(next);
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id || null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Stanley could not load the exception queue.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void loadExceptions(); }, [loadExceptions]);

  useEffect(() => {
    if (!selected) {
      setReceipts([]);
      setCheckpoint(null);
      setTakeover(null);
      setTakeoverToken('');
      return;
    }
    let active = true;
    setDetailLoading(true);
    Promise.allSettled([getRunReceipts(selected.runId), getLatestCheckpoint(selected.runId), getBrowserTakeover(selected.runId)])
      .then(([receiptResult, checkpointResult, takeoverResult]) => {
        if (!active) return;
        setReceipts(receiptResult.status === 'fulfilled' ? receiptResult.value : []);
        setCheckpoint(checkpointResult.status === 'fulfilled' ? checkpointResult.value : null);
        setTakeover(takeoverResult.status === 'fulfilled' ? takeoverResult.value : null);
        setTakeoverToken('');
      })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selected]);

  useEffect(() => {
    if (!selected || !takeoverToken) return;
    const timer = window.setInterval(() => { void heartbeatBrowserTakeover(selected.runId, takeoverToken).catch(() => setTakeoverToken('')); }, 45_000);
    return () => window.clearInterval(timer);
  }, [selected, takeoverToken]);

  const claimTakeover = async () => {
    if (!selected) return;
    setAction('takeover');
    try {
      const claim = await claimBrowserTakeover(selected.runId); setTakeoverToken(claim.token);
      setTakeover((current) => current ? { ...current, state: 'claimed', leaseExpiresAt: claim.leaseExpiresAt } : current);
      toast.success('Secure browser control claimed');
    } catch (requestError) { toast.error(requestError instanceof Error ? requestError.message : 'Takeover could not be claimed.'); }
    finally { setAction(null); }
  };

  const takeoverCommand = async (type: 'click_ref' | 'type_ref' | 'resume' | 'abort', ref?: string) => {
    if (!selected || !takeoverToken) return;
    setAction(`takeover:${type}:${ref || ''}`);
    try {
      await sendBrowserTakeoverCommand(selected.runId, takeoverToken, { type, ref, value: ref ? takeoverValues[ref] || '' : undefined });
      if (type === 'resume' || type === 'abort') { setTakeover((current) => current ? { ...current, state: type === 'resume' ? 'resumed' : 'aborted' } : current); setTakeoverToken(''); }
      toast.success(type === 'resume' ? 'Run resumed' : type === 'abort' ? 'Run aborted' : 'Browser command queued');
    } catch (requestError) { toast.error(requestError instanceof Error ? requestError.message : 'Browser command failed.'); }
    finally { setAction(null); }
  };

  const resolveSelected = async (state: 'resolved' | 'dismissed') => {
    if (!selected) return;
    setAction(state);
    try {
      await resolveTrustException(selected.id, {
        state,
        action: state === 'resolved' ? 'reviewed_and_resolved' : 'dismissed',
        note: note.trim(),
      });
      toast.success(state === 'resolved' ? 'Exception resolved' : 'Exception dismissed');
      setNote('');
      await loadExceptions();
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'The exception could not be updated.');
    } finally {
      setAction(null);
    }
  };

  const retrySelected = async () => {
    if (!selected || !window.confirm('Retry this workflow from its latest safe checkpoint?')) return;
    setAction('retry');
    try {
      const result = await retryTrustException(selected.id);
      toast.success(`Retry queued as run ${result.runId}`);
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'The retry could not be queued.');
    } finally {
      setAction(null);
    }
  };

  const openCount = exceptions.filter((item) => item.state === 'open').length;
  const warningCount = exceptions.filter((item) => item.severity === 'warning').length;

  return (
    <main className="h-full overflow-y-auto bg-[#F8F6F1] p-5 md:p-7">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-5">
        <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#6C47FF]">
              <ShieldCheck size={15} /> Trust Center
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Exception workbench</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Review the small number of runs Stanley could not safely finish on its own.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadExceptions()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-[#6C47FF]/35 hover:text-[#6C47FF] disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </header>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { label: 'Needs attention', value: openCount, icon: Inbox, tone: 'text-rose-600 bg-rose-50' },
            { label: 'Warnings', value: warningCount, icon: AlertTriangle, tone: 'text-amber-600 bg-amber-50' },
            { label: 'Safe checkpoint', value: checkpoint ? `Step ${checkpoint.sequence}` : '—', icon: FileCheck2, tone: 'text-emerald-600 bg-emerald-50' },
          ].map(({ label, value, icon: Icon, tone }) => (
            <article key={label} className="flex items-center gap-3 rounded-2xl border border-[#EAE6DF] bg-white p-4 shadow-sm">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon size={18} /></div>
              <div><p className="text-xl font-bold text-slate-900">{value}</p><p className="text-[11px] font-semibold text-slate-500">{label}</p></div>
            </article>
          ))}
        </section>

        <section className="grid min-h-[620px] grid-cols-1 overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white shadow-sm lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="border-b border-[#EAE6DF] bg-[#FDFBF7] lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between border-b border-[#EAE6DF] p-3">
              <div className="flex rounded-lg bg-slate-100 p-1">
                {(['open', 'all'] as Filter[]).map((value) => (
                  <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-md px-3 py-1.5 text-[11px] font-bold capitalize ${filter === value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
                    {value}
                  </button>
                ))}
              </div>
              <span className="text-[10px] font-semibold text-slate-400">{exceptions.length} items</span>
            </div>

            {loading ? (
              <div className="flex h-48 items-center justify-center text-slate-400"><Loader2 className="animate-spin" size={20} /></div>
            ) : error ? (
              <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">{error}</div>
            ) : !exceptions.length ? (
              <div className="flex h-64 flex-col items-center justify-center p-6 text-center">
                <CheckCircle2 size={34} className="mb-3 text-emerald-500" />
                <p className="text-sm font-bold text-slate-700">Nothing needs attention</p>
                <p className="mt-1 text-xs text-slate-500">Stanley will place uncertain or failed work here.</p>
              </div>
            ) : (
              <div className="max-h-[670px] overflow-y-auto p-2">
                {exceptions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`mb-1 flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${selectedId === item.id ? 'border-[#6C47FF]/25 bg-[#6C47FF]/7' : 'border-transparent hover:bg-slate-100/80'}`}
                  >
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.severity === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}`}>
                      {item.severity === 'warning' ? <AlertTriangle size={15} /> : <XCircle size={15} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-xs font-bold text-slate-800">{item.title}</p>
                        <ChevronRight size={14} className="mt-0.5 shrink-0 text-slate-300" />
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{item.summary}</p>
                      <p className="mt-2 text-[10px] font-medium text-slate-400">{friendlyKind(item.kind)} · {relativeTime(item.createdAt)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </aside>

          {!selected ? (
            <div className="flex items-center justify-center p-8 text-sm text-slate-400">Select an exception to review its evidence.</div>
          ) : (
            <div className="flex min-w-0 flex-col">
              <div className="border-b border-[#EAE6DF] p-5 md:p-6">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${selected.severity === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
                      {friendlyKind(selected.kind)}
                    </span>
                    <h2 className="mt-3 text-lg font-bold text-slate-900">{selected.title}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{selected.summary}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Clock3 size={13} /> {relativeTime(selected.createdAt)}</div>
                </div>
              </div>

              <div className="grid flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="space-y-6 p-5 md:p-6">
                  <section>
                    <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">What Stanley observed</h3>
                    <div className="rounded-xl border border-[#EAE6DF] bg-[#FDFBF7] p-4"><EvidenceSummary value={selected.evidence} /></div>
                  </section>

                  {takeover && ['awaiting_operator', 'claimed'].includes(takeover.state) && (
                    <section className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div><h3 className="text-xs font-bold uppercase tracking-wider text-violet-700">Interactive browser takeover</h3><p className="mt-1 text-xs text-slate-600">{takeover.reason}</p></div>
                        {!takeoverToken && <button type="button" onClick={() => void claimTakeover()} disabled={Boolean(action)} className="rounded-lg bg-[#6C47FF] px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Claim control</button>}
                      </div>
                      {takeoverToken && (
                        <div className="mt-4 space-y-3">
                          <p className="text-[11px] text-slate-500">Only the semantic controls below are available; Stanley never exposes arbitrary scripts or selectors.</p>
                          <div className="max-h-56 space-y-2 overflow-y-auto">
                            {(takeover.snapshot?.elements || []).filter((element) => !element.disabled).map((element) => (
                              <div key={element.ref} className="flex items-center gap-2 rounded-lg border border-violet-100 bg-white p-2">
                                <span className="min-w-0 flex-1 truncate text-xs text-slate-700"><b className="text-slate-500">{element.role}</b> {element.name || 'Unnamed control'}</span>
                                {element.editable && <input value={takeoverValues[element.ref] || ''} onChange={(event) => setTakeoverValues((current) => ({ ...current, [element.ref]: event.target.value }))} placeholder="Value" className="w-32 rounded-md border border-slate-200 px-2 py-1 text-xs" />}
                                <button type="button" onClick={() => void takeoverCommand(element.editable ? 'type_ref' : 'click_ref', element.ref)} disabled={Boolean(action)} className="rounded-md border border-violet-200 px-2.5 py-1 text-[11px] font-bold text-violet-700 disabled:opacity-40">{element.editable ? 'Type' : 'Click'}</button>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2 border-t border-violet-100 pt-3">
                            <button type="button" onClick={() => void takeoverCommand('resume')} disabled={Boolean(action)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Resume run</button>
                            <button type="button" onClick={() => void takeoverCommand('abort')} disabled={Boolean(action)} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-40">Abort safely</button>
                          </div>
                        </div>
                      )}
                    </section>
                  )}

                  <section>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Safe recovery point</h3>
                      {detailLoading && <Loader2 size={13} className="animate-spin text-slate-400" />}
                    </div>
                    <div className="rounded-xl border border-[#EAE6DF] bg-white p-4">
                      {checkpoint ? (
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><FileCheck2 size={17} /></div>
                          <div>
                            <p className="text-xs font-bold text-slate-700">Checkpoint {checkpoint.sequence}</p>
                            <p className="mt-0.5 text-[11px] text-slate-500">{checkpoint.resumable ? 'Ready for a safe retry' : 'Recorded for evidence only'}</p>
                          </div>
                        </div>
                      ) : <p className="text-xs text-slate-500">No resumable checkpoint is available for this run.</p>}
                    </div>
                  </section>

                  <section>
                    <label htmlFor="resolution-note" className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Resolution note</label>
                    <textarea
                      id="resolution-note"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="What did you confirm or correct?"
                      className="min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-[#6C47FF]/50 focus:ring-2 focus:ring-[#6C47FF]/10"
                    />
                  </section>

                  <div className="flex flex-wrap gap-2 border-t border-[#EAE6DF] pt-5">
                    <button type="button" onClick={() => void retrySelected()} disabled={Boolean(action) || !checkpoint?.resumable} className="inline-flex items-center gap-2 rounded-xl bg-[#6C47FF] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#5A38E5] disabled:cursor-not-allowed disabled:opacity-40">
                      {action === 'retry' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Retry safely
                    </button>
                    <button type="button" onClick={() => void resolveSelected('resolved')} disabled={Boolean(action)} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40">
                      {action === 'resolved' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Mark resolved
                    </button>
                    <button type="button" onClick={() => void resolveSelected('dismissed')} disabled={Boolean(action)} className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-500 transition hover:bg-slate-100 disabled:opacity-40">
                      Dismiss
                    </button>
                  </div>
                </div>

                <aside className="border-t border-[#EAE6DF] bg-[#FDFBF7] p-5 xl:border-l xl:border-t-0">
                  <div className="mb-4 flex items-center gap-2"><ShieldCheck size={15} className="text-[#6C47FF]" /><h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Proof trail</h3></div>
                  <ReceiptTimeline receipts={receipts} />
                </aside>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
