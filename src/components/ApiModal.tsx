import { useState } from 'react';
import { X, Copy, Check, Terminal, ExternalLink } from 'lucide-react';

interface Props {
  workflow: {
    id: string;
    name: string;
    nodes: any[];
    edges: any[];
  };
  onClose: () => void;
}

export function ApiModal({ workflow, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'curl' | 'js' | 'python'>('curl');
  const [copied, setCopied] = useState(false);

  const runnerUrl = (import.meta.env.VITE_RUNNER_URL as string | undefined)?.replace(/\/$/, '') || window.location.origin;

  const endpoint = `${runnerUrl}/v1/workflows/${encodeURIComponent(workflow.id)}/invoke`;
  const payloadString = JSON.stringify({ input: {} }, null, 2);

  const snippets = {
    curl: `curl -X POST "${endpoint}" \\
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${payloadString}'`,

    js: `const RUNNER_URL = "${runnerUrl}";
const ID_TOKEN = "YOUR_FIREBASE_ID_TOKEN";

async function triggerStanleyAutomation() {
  try {
    const response = await fetch(\`\${RUNNER_URL}/v1/workflows/${encodeURIComponent(workflow.id)}/invoke\`, {
      method: 'POST',
      headers: {
        'Authorization': \`Bearer \${ID_TOKEN}\`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(${payloadString})
    });
    
    const result = await response.json();
    console.log("Execution Success:", result.success);
    console.log("Runner logs:", result.logs);
  } catch (error) {
    console.error("Failed to run automation:", error);
  }
}

triggerStanleyAutomation();`,

    python: `import requests
import json

runner_url = "${endpoint}"
headers = {
    "Authorization": "Bearer YOUR_FIREBASE_ID_TOKEN",
    "Content-Type": "application/json"
}

payload = {"input": {}}

try:
    response = requests.post(runner_url, headers=headers, data=json.dumps(payload))
    result = response.json()
    print("Execution Success:", result.get("success"))
    print("Runner logs:", "\\n".join(result.get("logs", [])))
except Exception as e:
    print("Failed to run automation:", e)`
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(snippets[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center font-sans"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-slate-700/60 shadow-2xl overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #0f172a 0%, #070b13 100%)' }}
      >
        {/* Glow accent */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 rounded-full blur-3xl opacity-20" style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-slate-700/60 transition-all z-10"
        >
          <X size={14} />
        </button>

        <div className="relative p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20">
              <Terminal size={18} className="text-violet-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">API Integration Endpoints</h2>
              <p className="text-xs text-slate-400 mt-0.5">Trigger "{workflow.name}" programmatically from external apps</p>
            </div>
          </div>

          {/* Alert Note */}
          <div className="mb-4 flex items-start gap-2.5 p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/15">
            <ExternalLink size={14} className="text-indigo-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-slate-300 leading-normal">
              <strong>Production endpoint:</strong> Publish a tested production release first, then replace <code className="text-violet-400 px-1 bg-slate-900 rounded">YOUR_FIREBASE_ID_TOKEN</code> with a valid Firebase auth token. This endpoint accepts only declared workflow input—not workflow source or secrets.
            </p>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-800 mb-3 gap-1">
            {(['curl', 'js', 'python'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setCopied(false); }}
                className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all capitalize ${
                  activeTab === tab
                    ? 'border-violet-500 text-violet-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab === 'js' ? 'JavaScript' : tab === 'curl' ? 'cURL' : 'Python'}
              </button>
            ))}
          </div>

          {/* Snippet Block */}
          <div className="relative rounded-lg bg-[#05080e] border border-slate-800/80 p-4 max-h-[300px] overflow-y-auto pr-1">
            <button
              onClick={handleCopy}
              className="absolute top-3 right-3 p-1.5 rounded bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors border border-slate-700/50"
              title="Copy to Clipboard"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            </button>
            <pre className="font-mono text-[10.5px] leading-relaxed text-slate-200 whitespace-pre-wrap break-all">
              <code>{snippets[activeTab]}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
