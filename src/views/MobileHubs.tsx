import { Link } from 'react-router-dom';
import {
  BookOpen, BrainCircuit, ChevronRight, Database, KeyRound,
  LayoutTemplate, Plug, Settings, ShieldAlert, Sparkles, Workflow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface HubItem {
  title: string;
  description: string;
  path: string;
  icon: LucideIcon;
  accent: string;
}

function Hub({ eyebrow, title, description, items }: { eyebrow: string; title: string; description: string; items: HubItem[] }) {
  return (
    <div className="mobile-hub flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-4xl">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-600">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.path} to={item.path} className="group flex min-h-28 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: `${item.accent}14`, color: item.accent }}>
                  <Icon size={21} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-800">{item.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-violet-500" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function AutomationsHub() {
  return <Hub eyebrow="Automations" title="Build and manage" description="Start with Stanley, use a recipe, or open the advanced workflow tools. Every route continues to use the same execution engine." items={[
    { title: 'Ask Stanley', description: 'Describe an outcome and review the generated execution plan.', path: '/dashboard', icon: Sparkles, accent: '#7C3AED' },
    { title: 'Templates', description: 'Install and configure reusable automation recipes.', path: '/dashboard/templates', icon: LayoutTemplate, accent: '#2563EB' },
    { title: 'Saved workflows', description: 'Inspect, run, edit, and organize workflow graphs.', path: '/dashboard/canvas', icon: Workflow, accent: '#059669' },
    { title: 'Connectors', description: 'Generate, test, approve, publish, and monitor API connectors.', path: '/dashboard/connectors', icon: Plug, accent: '#EA580C' },
  ]} />;
}

export function AccountHub() {
  return <Hub eyebrow="You" title="Connections and control" description="Manage credentials, product health, documentation, subscription, and account settings from one mobile-friendly place." items={[
    { title: 'Credential Vault', description: 'Manage scoped secrets and connection credentials.', path: '/dashboard/vault', icon: KeyRound, accent: '#D97706' },
    { title: 'Operations', description: 'Inspect workflow, browser, trust, and service health.', path: '/dashboard/operations', icon: BrainCircuit, accent: '#7C3AED' },
    { title: 'Exception workbench', description: 'Review failed runs, evidence, and safe recovery options.', path: '/dashboard/exceptions', icon: ShieldAlert, accent: '#E11D48' },
    { title: 'Run history', description: 'Review execution results, logs, and generated artifacts.', path: '/dashboard/results', icon: Database, accent: '#0891B2' },
    { title: 'Guide', description: 'Learn Stanley capabilities, node behavior, and safety controls.', path: '/dashboard/guide', icon: BookOpen, accent: '#2563EB' },
    { title: 'Settings and billing', description: 'Manage subscription and account-level preferences.', path: '/dashboard/settings', icon: Settings, accent: '#475569' },
  ]} />;
}
