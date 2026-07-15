import { useEffect, useState } from 'react';
import { Beaker, Box, Braces, Copy, Loader2, Play, Rocket, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  createRelease,
  debugNode,
  getGeneratedClients,
  getPlatform,
  listReleases,
  promoteRelease,
  rollbackRelease,
  rotateMcpKey,
  runRegression,
  savePlatform,
  type PlatformConfig,
  type WorkflowRelease,
} from '../lib/workflowPlatformClient';

type Workflow = { id: string; name: string; nodes: Array<{ id: string; label: string; type: string }> };
const fallback: PlatformConfig = {
  contract: { inputSchema: { type: 'object', additionalProperties: true }, outputSchema: { type: 'object' } },
  modelPolicy: { profile: 'balanced', maxModelCalls: 12, maxContextChars: 30000, allowVision: true, fallbackEnabled: true },
  contextPolicy: { defaultVisibility: 'ephemeral', maxObservationChars: 6000, retainNodeOutputs: 8 },
  regressionCases: [], environments: {},
};

export function WorkflowPlatformModal({ workflow, onClose }: { workflow: Workflow; onClose: () => void }) {
  const [tab, setTab] = useState<'contract' | 'debug' | 'release' | 'access'>('contract');
  const [config, setConfig] = useState<PlatformConfig>(fallback);
  const [releases, setReleases] = useState<WorkflowRelease[]>([]);
  const [busy, setBusy] = useState('');
  const [nodeId, setNodeId] = useState(workflow.nodes.find((node) => !['mission', 'parameter'].includes(node.type))?.id || '');
  const [inputText, setInputText] = useState('{}');
  const [inputSchemaText, setInputSchemaText] = useState(JSON.stringify(fallback.contract.inputSchema, null, 2));
  const [outputSchemaText, setOutputSchemaText] = useState(JSON.stringify(fallback.contract.outputSchema, null, 2));
  const [regressionText, setRegressionText] = useState('[]');
  const [result, setResult] = useState('');
  const [clients, setClients] = useState<Record<string, string | object>>({});
  const [mcpKey, setMcpKey] = useState('');

  useEffect(() => {
    Promise.all([getPlatform(workflow.id), listReleases(workflow.id)])
      .then(([platform, versions]) => {
        setConfig(platform);
        setInputSchemaText(JSON.stringify(platform.contract.inputSchema, null, 2));
        setOutputSchemaText(JSON.stringify(platform.contract.outputSchema, null, 2));
        setRegressionText(JSON.stringify(platform.regressionCases, null, 2));
        setReleases(versions);
      })
      .catch((error) => toast.error(error.message));
  }, [workflow.id]);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    try { await action(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Action failed'); }
    finally { setBusy(''); }
  };
  const editedConfig = () => {
    const regressionCases = JSON.parse(regressionText || '[]');
    if (!Array.isArray(regressionCases)) throw new Error('Regression cases must be a JSON array.');
    return {
      ...config,
      contract: { ...config.contract, inputSchema: JSON.parse(inputSchemaText || '{}'), outputSchema: JSON.parse(outputSchemaText || '{}') },
      regressionCases,
    };
  };
  const refreshPlatform = async () => setConfig(await getPlatform(workflow.id));
  const save = () => run('save', async () => {
    const next = editedConfig(); await savePlatform(workflow.id, next); setConfig(next); toast.success('Workflow platform settings saved');
  });
  const create = () => run('release', async () => {
    const next = editedConfig(); await savePlatform(workflow.id, next); setConfig(next);
    const release = await createRelease(workflow.id); setReleases((current) => [release, ...current]);
    toast.success('Settings saved and immutable release created');
  });

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
    <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div><h2 className="font-bold text-slate-900">Test & release</h2><p className="text-xs text-slate-500">{workflow.name}</p></div>
        <button onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100"><X size={16} /></button>
      </header>
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 px-5 py-2">
        {([['contract', Braces, 'Contract'], ['debug', Beaker, 'Playground'], ['release', Rocket, 'Releases'], ['access', Box, 'API & MCP']] as const).map(([value, Icon, label]) =>
          <button key={value} onClick={() => setTab(value)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${tab === value ? 'bg-violet-50 text-violet-700' : 'text-slate-500 hover:bg-slate-50'}`}><Icon size={14} />{label}</button>)}
      </nav>
      <div className="flex-1 overflow-y-auto p-5">
        {tab === 'contract' && <div className="grid gap-5 lg:grid-cols-2">
          <label className="text-xs font-bold text-slate-600">Input JSON Schema<textarea value={inputSchemaText} onChange={(event) => setInputSchemaText(event.target.value)} spellCheck={false} className="mt-2 h-56 w-full rounded-xl border border-slate-200 p-3 font-mono text-xs" /></label>
          <label className="text-xs font-bold text-slate-600">Output JSON Schema<textarea value={outputSchemaText} onChange={(event) => setOutputSchemaText(event.target.value)} spellCheck={false} className="mt-2 h-56 w-full rounded-xl border border-slate-200 p-3 font-mono text-xs" /></label>
          <div className="grid gap-4 lg:col-span-2 md:grid-cols-4">
            <label className="text-xs font-bold text-slate-600">Model profile<select value={config.modelPolicy.profile} onChange={(event) => setConfig((current) => ({ ...current, modelPolicy: { ...current.modelPolicy, profile: event.target.value } }))} className="mt-2 w-full rounded-lg border p-2"><option>deterministic</option><option>fast</option><option>balanced</option><option>quality</option></select></label>
            <label className="text-xs font-bold text-slate-600">Max model calls<input type="number" min={0} max={50} value={config.modelPolicy.maxModelCalls} onChange={(event) => setConfig((current) => ({ ...current, modelPolicy: { ...current.modelPolicy, maxModelCalls: Number(event.target.value) } }))} className="mt-2 w-full rounded-lg border p-2" /></label>
            <label className="text-xs font-bold text-slate-600">Output node<select value={config.contract.outputNodeId || ''} onChange={(event) => setConfig((current) => ({ ...current, contract: { ...current.contract, outputNodeId: event.target.value || null } }))} className="mt-2 w-full rounded-lg border p-2"><option value="">All outputs</option>{workflow.nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-600">Observation budget<input type="number" min={500} value={config.contextPolicy.maxObservationChars} onChange={(event) => setConfig((current) => ({ ...current, contextPolicy: { ...current.contextPolicy, maxObservationChars: Number(event.target.value) } }))} className="mt-2 w-full rounded-lg border p-2" /></label>
          </div>
          <button onClick={save} disabled={!!busy} className="rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy === 'save' && <Loader2 className="mr-1 inline animate-spin" size={14} />}Save contract</button>
        </div>}

        {tab === 'debug' && <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-600">Stop after node<select value={nodeId} onChange={(event) => setNodeId(event.target.value)} className="mt-2 w-full rounded-lg border p-2">{workflow.nodes.filter((node) => !['mission', 'parameter'].includes(node.type)).map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-600">Fixture input<textarea value={inputText} onChange={(event) => setInputText(event.target.value)} spellCheck={false} className="mt-2 h-36 w-full rounded-lg border p-2 font-mono text-xs" /></label>
            <button disabled={!!busy || !nodeId} onClick={() => run('debug', async () => { const response = await debugNode(workflow.id, nodeId, JSON.parse(inputText || '{}')); setResult(JSON.stringify(response.debug, null, 2)); })} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy === 'debug' ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />}Run through node</button>
          </div>
          <pre className="min-h-80 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-emerald-300">{result || 'Execution logs and variables will appear here.'}</pre>
        </div>}

        {tab === 'release' && <div>
          <div className="mb-4 flex flex-wrap justify-between gap-4">
            <div className="min-w-[320px] flex-1"><h3 className="font-bold text-slate-800">Immutable releases</h3><p className="text-xs text-slate-500">Test each snapshot, then promote it through test, staging, and production.</p><label className="mt-3 block text-xs font-bold text-slate-600">Regression cases JSON<textarea value={regressionText} onChange={(event) => setRegressionText(event.target.value)} spellCheck={false} className="mt-1 h-32 w-full rounded-lg border p-2 font-mono text-xs" placeholder='[{"id":"happy-path","input":{},"expectedOutput":{}}]' /></label></div>
            <button onClick={create} disabled={!!busy} className="h-fit rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy === 'release' && <Loader2 className="mr-1 inline animate-spin" size={14} />}Create release</button>
          </div>
          <div className="space-y-3">{releases.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-xs text-slate-500">No releases yet. Save a regression fixture and create the first immutable snapshot.</p>}{releases.map((release) =>
            <div key={release.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><b className="text-sm text-slate-800">{release.id}</b><p className="text-[11px] text-slate-500">{release.fingerprint.slice(0, 20)} · {new Date(release.createdAt).toLocaleString()}</p><div className="mt-2 flex gap-1">{Object.entries(config.environments).filter(([, id]) => id === release.id).map(([environment]) => <span key={environment} className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">{environment}</span>)}</div></div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => run(`test:${release.id}`, async () => { const cases = JSON.parse(regressionText || '[]'); if (!Array.isArray(cases)) throw new Error('Regression cases must be a JSON array.'); const response = await runRegression(workflow.id, release.id, cases); setReleases(await listReleases(workflow.id)); toast[response.regression.passed ? 'success' : 'error'](`${response.regression.passedCount}/${response.regression.total} regression cases passed`); })} className="rounded-lg border px-3 py-1.5 text-xs font-bold">Test</button>
                  {['test', 'staging', 'production'].map((environment) => <button key={environment} disabled={!release.regression?.passed || !!busy} onClick={() => run(`promote:${release.id}`, async () => { await promoteRelease(workflow.id, release.id, environment); await refreshPlatform(); toast.success(`Promoted to ${environment}`); })} className="rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-35">{environment}</button>)}
                  <button disabled={!release.regression?.passed || !!busy} onClick={() => run(`rollback:${release.id}`, async () => { await rollbackRelease(workflow.id, release.id); await refreshPlatform(); toast.success('Production rolled back'); })} className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-bold text-amber-700 disabled:opacity-35"><RotateCcw size={12} className="inline" /> Rollback</button>
                </div>
              </div>
            </div>)}
          </div>
        </div>}

        {tab === 'access' && <div className="space-y-5">
          <div><h3 className="font-bold text-slate-800">Production API</h3><p className="mb-3 text-xs text-slate-500">Generated clients invoke only the promoted production release.</p><button onClick={() => run('clients', async () => setClients((await getGeneratedClients(workflow.id)).clients))} className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white">Generate API clients</button></div>
          {Object.entries(clients).map(([name, value]) => <div key={name}><div className="mb-1 flex justify-between"><b className="text-xs uppercase text-slate-500">{name}</b><button onClick={() => navigator.clipboard.writeText(typeof value === 'string' ? value : JSON.stringify(value, null, 2))}><Copy size={13} /></button></div><pre className="max-h-48 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-200">{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre></div>)}
          <div className="border-t pt-5"><h3 className="font-bold text-slate-800">MCP server</h3><p className="mb-3 text-xs text-slate-500">Production workflows become authenticated MCP tools.</p><button onClick={() => run('mcp', async () => setMcpKey(await rotateMcpKey()))} className="rounded-xl border border-violet-200 px-4 py-2 text-xs font-bold text-violet-700">Rotate MCP key</button>{mcpKey && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs"><b>Copy this key now; rotating invalidates the previous key.</b><code className="mt-2 block break-all">{mcpKey}</code></div>}</div>
        </div>}
      </div>
    </div>
  </div>;
}
