import { useState, useEffect, useMemo } from 'react';
import { Database, Calendar, Clock, Loader, RefreshCw, Terminal, Sparkles, FileText, ExternalLink } from 'lucide-react';

import { listDocs } from '../lib/firestore';

// Helper component to render scraped data cleanly instead of a raw JSON dump
function DataPreview({ data }: { data: any }) {
  if (data === null || data === undefined) {
    return <span className="text-slate-500 italic">No data</span>;
  }

  // 1. Array of Objects (e.g., scraped list)
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
    const headers = Object.keys(data[0]);
    return (
      <div className="overflow-x-auto border border-[#EAE6DF] rounded-xl bg-[#F5F2EC]/30 max-h-[450px] shadow-inner">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#EAE6DF] bg-[#FDFBF7] sticky top-0 backdrop-blur-md">
              {headers.map(h => (
                <th key={h} className="p-3 font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAE6DF]/65">
            {data.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                {headers.map(h => {
                  const val = row[h];
                  return (
                    <td key={h} className="p-3 text-slate-750 max-w-[280px] truncate">
                      {renderValue(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // 2. Simple Array of primitives
  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-slate-500 italic">Empty list</span>;
    return (
      <div className="flex flex-wrap gap-1.5 p-1">
        {data.map((item, idx) => (
          <span key={idx} className="px-2 py-1 rounded bg-[#F5F2EC] text-slate-700 font-mono text-[10px] border border-[#EAE6DF]">
            {renderValue(item)}
          </span>
        ))}
      </div>
    );
  }

  // 3. Object (Key-Value pairs)
  if (typeof data === 'object') {
    const entries = Object.entries(data);
    if (entries.length === 0) return <span className="text-slate-500 italic">Empty object</span>;
    return (
      <div className="grid grid-cols-[140px_1fr] gap-y-3 gap-x-4 p-4 rounded-xl border border-[#EAE6DF] bg-[#F5F2EC]/30 text-xs shadow-inner">
        {entries.map(([k, v]) => (
          <div key={k} className="contents group">
            <div className="font-bold text-slate-500 uppercase tracking-wider text-[10px] py-1 border-b border-[#EAE6DF]/60 group-last:border-none self-start">
              {k}
            </div>
            <div className="text-slate-750 py-1 border-b border-[#EAE6DF]/60 group-last:border-none font-mono">
              {renderValue(v)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // 4. Primitive values
  return <div className="p-3 rounded-lg bg-slate-950/30 text-slate-300 text-xs font-mono">{renderValue(data)}</div>;
}

function renderValue(val: any): React.ReactNode {
  if (val === null || val === undefined) return <span className="text-slate-500 italic">null</span>;
  if (typeof val === 'boolean') {
    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${val ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-400'}`}>
        {val ? 'TRUE' : 'FALSE'}
      </span>
    );
  }
  const str = String(val);
  if (str.startsWith('http://') || str.startsWith('https://')) {
    return (
      <a 
        href={str} 
        target="_blank" 
        rel="noopener noreferrer" 
        className="text-violet-400 hover:text-violet-300 hover:underline inline-flex items-center gap-1 max-w-full"
      >
        <span className="truncate">{str}</span>
        <ExternalLink size={10} className="shrink-0" />
      </a>
    );
  }
  return <span>{str}</span>;
}

interface Run {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  trigger: string;
  duration: string;
  timestamp: string;
  logs?: string[];
  scraped?: Record<string, any>;
}

// ── Run Heatmap ────────────────────────────────────────────────────────────────

function RunHeatmap({ runs }: { runs: Run[] }) {
  const { grid, total } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayMs = 86400000;
    const totalDays = 84; // 12 weeks

    const startDate = new Date(today.getTime() - (totalDays - 1) * dayMs);
    // Adjust start to Monday
    const startDay = startDate.getDay();
    const mondayOffset = startDay === 0 ? -6 : 1 - startDay;
    startDate.setDate(startDate.getDate() + mondayOffset);

    const countMap: Record<string, { count: number; success: number; failed: number }> = {};
    let total = 0;

    for (const run of runs) {
      const d = new Date(run.timestamp);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().split('T')[0];
      if (!countMap[key]) countMap[key] = { count: 0, success: 0, failed: 0 };
      countMap[key].count++;
      if (run.status === 'Success') countMap[key].success++;
      else countMap[key].failed++;
      total++;
    }

    const weeks = 12;
    const grid: { date: Date; count: number; success: number; failed: number }[][] = [];

    for (let w = 0; w < weeks; w++) {
      const week: { date: Date; count: number; success: number; failed: number }[] = [];
      for (let d = 0; d < 7; d++) {
        const cellDate = new Date(startDate.getTime() + (w * 7 + d) * dayMs);
        const key = cellDate.toISOString().split('T')[0];
        const entry = countMap[key] || { count: 0, success: 0, failed: 0 };
        week.push({ date: cellDate, ...entry });
      }
      grid.push(week);
    }

    return { grid, total };
  }, [runs]);

  const getCellColor = (count: number) => {
    if (count === 0) return 'bg-slate-800/40';
    if (count === 1) return 'bg-violet-900/60';
    if (count === 2) return 'bg-violet-700/70';
    return 'bg-violet-500/80';
  };

  const dayLabels = ['M', '', 'W', '', 'F', '', ''];

  return (
    <div className="bg-[#090d16]/40 border border-slate-800/40 rounded-2xl p-4 backdrop-blur-md shadow-md mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Activity</h3>
        <span className="text-[10px] font-bold text-slate-500">{total} total runs</span>
      </div>
      <div className="flex gap-1">
        <div className="flex flex-col gap-1 mr-1 pt-0">
          {dayLabels.map((label, i) => (
            <div key={i} className="h-[14px] flex items-center justify-end">
              <span className="text-[9px] text-slate-500 font-mono leading-none">{label}</span>
            </div>
          ))}
        </div>
        {grid.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((cell, di) => {
              const dateStr = cell.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const tooltip = `${dateStr} — ${cell.count} run${cell.count !== 1 ? 's' : ''}${cell.count > 0 ? ` (${cell.success} ✅, ${cell.failed} ❌)` : ''}`;
              return (
                <div
                  key={di}
                  title={tooltip}
                  className={`w-[14px] h-[14px] rounded-[3px] ${getCellColor(cell.count)} transition-colors cursor-default`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── AI Failure Explainer ───────────────────────────────────────────────────────

interface AiExplanation {
  explanation: string;
  suggestion: string;
}

function FailureExplainer({ run }: { run: Run }) {
  const [explaining, setExplaining] = useState(false);
  const [result, setResult] = useState<AiExplanation | null>(null);

  const explain = async () => {
    try {
      setExplaining(true);
      const res = await fetch('/api/ai/explain-failure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logs: run.logs?.slice(-30),
          workflow: run.workflowName,
        }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error('Failed to explain failure:', err);
      setResult({ explanation: 'Could not analyze this failure.', suggestion: 'Please check the logs manually or try again later.' });
    } finally {
      setExplaining(false);
    }
  };

  return (
    <div className="mt-4">
      {!result && (
        <button
          onClick={explain}
          disabled={explaining}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-all disabled:opacity-50"
        >
          {explaining ? (
            <>
              <Loader size={14} className="animate-spin" /> Analyzing failure...
            </>
          ) : (
            <>
              <Sparkles size={14} /> Explain this failure
            </>
          )}
        </button>
      )}
      {result && (
        <div className="mt-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
          <div className="flex items-center gap-2 mb-2 text-amber-400">
            <Sparkles size={14} />
            <span className="text-xs font-bold uppercase tracking-wider">AI Analysis</span>
          </div>
          <p className="text-sm font-bold text-slate-200 mb-1">{result.explanation}</p>
          <p className="text-xs text-slate-400 leading-relaxed">{result.suggestion}</p>
        </div>
      )}
    </div>
  );
}

// ── Main Results View ──────────────────────────────────────────────────────────

export function Results() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [activeTab, setActiveTab] = useState<'logs' | 'artifacts'>('logs');

  useEffect(() => {
    fetchRuns();
  }, []);

  const fetchRuns = async () => {
    try {
      setLoading(true);
      const docs = await listDocs('runs');
      const allRuns = (docs as unknown as Run[]);
      allRuns.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setRuns(allRuns);
      if (allRuns.length > 0) {
        setSelectedRun(allRuns[0]);
      }
    } catch (err) {
      console.error('Failed to load runs:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#FDFBF7] text-[#1C1A17] p-6">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Execution History & Results</h2>
          <p className="text-xs text-slate-500 mt-1">View complete execution logs, scraped data, and AI outputs generated by your workflows.</p>
        </div>
        <button 
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:text-slate-800 hover:border-slate-300 transition-colors cursor-pointer" 
          onClick={fetchRuns} 
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex justify-center items-center text-slate-500">
          <Loader className="animate-spin w-5 h-5 mr-2" /> Loading execution results...
        </div>
      ) : runs.length === 0 ? (
        <div className="flex-1 flex flex-col justify-center items-center">
          <Database size={48} className="text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-500">No runs found</h3>
          <p className="text-sm text-slate-400 mt-2">Run workflows to see their history and extracted data here.</p>
        </div>
      ) : (
        <>
          <RunHeatmap runs={runs} />
          <div className="flex gap-6 flex-1 min-h-0">
          
            {/* Left panel: List of all runs */}
            <div className="w-1/3 bg-white border border-[#EAE6DF] rounded-2xl p-4 flex flex-col gap-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-[#EAE6DF] pb-2">
                Execution History ({runs.length})
              </h3>
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                {runs.map((run) => {
                  const isSelected = selectedRun?.id === run.id;
                  const hasScraped = run.scraped && Object.keys(run.scraped).length > 0;
                  return (
                    <div
                      key={run.id}
                      onClick={() => setSelectedRun(run)}
                      className={`p-4 rounded-xl cursor-pointer transition-all border ${
                        isSelected 
                          ? 'bg-indigo-600/10 border-indigo-200 shadow-sm font-semibold' 
                          : 'bg-white border-slate-200/60 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className={`text-sm font-bold flex items-center gap-2 ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>
                          {run.workflowName}
                          {hasScraped && <Database size={12} className="text-indigo-500" />}
                        </h4>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                          run.status === 'Success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50' : 'bg-rose-50 text-rose-700 border border-rose-200/50'
                        }`}>
                          {run.status}
                        </span>
                      </div>
                      <div className="flex gap-4 text-[10px] text-slate-500 font-mono">
                        <span className="flex items-center gap-1.5"><Calendar size={10} /> {run.timestamp}</span>
                        <span className="flex items-center gap-1.5"><Clock size={10} /> {run.duration}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right panel: Details (Logs & Artifacts) */}
            <div className="flex-1 bg-white border border-[#EAE6DF] rounded-2xl p-6 flex flex-col gap-6 shadow-sm min-h-0">
              {selectedRun ? (
                <>
                  {/* Header */}
                  <div className="pb-4 border-b border-[#EAE6DF]">
                    <h2 className="text-xl font-bold text-slate-800 mb-2">{selectedRun.workflowName}</h2>
                    <p className="text-xs text-slate-500 font-mono">
                      Run ID: {selectedRun.id} • Trigger: {selectedRun.trigger} • Executed: {selectedRun.timestamp}
                    </p>
                  </div>

                  {/* Tabs */}
                  <div className="flex gap-4 border-b border-[#EAE6DF] pb-2">
                    <button 
                      onClick={() => setActiveTab('logs')}
                      className={`flex items-center gap-2 px-2 py-1 text-sm font-semibold transition-colors cursor-pointer ${
                        activeTab === 'logs' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      <Terminal size={14} /> Execution Logs
                    </button>
                    <button 
                      onClick={() => setActiveTab('artifacts')}
                      className={`flex items-center gap-2 px-2 py-1 text-sm font-semibold transition-colors cursor-pointer ${
                        activeTab === 'artifacts' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      <FileText size={14} /> Artifacts & Data
                    </button>
                  </div>

                  {/* Tab Content */}
                  <div className="flex-1 overflow-y-auto pr-2">
                    {activeTab === 'logs' && (
                      <>
                        <div className="bg-[#1C1A17] rounded-xl p-4 font-mono text-xs overflow-y-auto h-full border border-slate-800/20">
                          {selectedRun.logs && selectedRun.logs.length > 0 ? selectedRun.logs.map((log, index) => {
                            if (log.startsWith('[Result]')) {
                              return (
                                <div key={index} className="my-4 p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-xl text-indigo-200">
                                  <div className="flex items-center gap-2 mb-2 text-indigo-400 font-bold">
                                    <Sparkles size={14} /> AI Output Result
                                  </div>
                                  {log.replace('[Result] ', '')}
                                </div>
                              );
                            }
                            return (
                              <div key={index} className="py-0.5 text-emerald-400/90 whitespace-pre-wrap">
                                {log}
                              </div>
                            );
                          }) : (
                            <div className="text-slate-500 italic">No logs available for this run.</div>
                          )}
                        </div>
                        {selectedRun.status === 'Failed' && (
                          <FailureExplainer run={selectedRun} />
                        )}
                      </>
                    )}

                    {activeTab === 'artifacts' && (
                      <div className="flex flex-col gap-6">
                        {selectedRun.scraped && Object.keys(selectedRun.scraped).length > 0 ? (
                          Object.entries(selectedRun.scraped).map(([nodeId, value]) => {
                            return (
                              <div key={nodeId} className="bg-white rounded-2xl border border-[#EAE6DF] overflow-hidden shadow-sm">
                                <div className="bg-[#FDFBF7] px-4 py-2.5 text-xs font-bold text-slate-600 border-b border-[#EAE6DF] flex justify-between items-center">
                                  <span>Extracted Data (Step: {nodeId})</span>
                                  <span className="text-[10px] text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full font-bold">Node Output</span>
                                </div>
                                <div className="p-4">
                                  <DataPreview data={value} />
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="flex justify-center items-center text-slate-400 p-8 border border-dashed border-[#EAE6DF] rounded-2xl text-sm bg-[#F5F2EC]/20 shadow-inner">
                            No structured artifacts or scraped data were generated during this run.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex justify-center items-center text-slate-500">
                  Select a run from the history to view its details.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

