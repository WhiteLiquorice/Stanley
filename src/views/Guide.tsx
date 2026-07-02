import {
  Globe, Plus, Type, Database, Clock, ExternalLink, RefreshCw, X,
  GitFork, ArrowRight, Bookmark, Sparkles, Code, Circle, Target, Tag, Shield,
  KeyRound, Play, Workflow
} from 'lucide-react';
import type { ReactNode } from 'react';
import './Views.css';

interface NodeDoc {
  icon: ReactNode;
  name: string;
  what: string;
  fields?: string;
}

const NODES: NodeDoc[] = [
  { icon: <Target size={16} />, name: 'Mission (super node)', what: 'The overall goal of the automation. Stanley feeds it to the AI on every step so it understands the intent, not just the mechanics — which makes ambiguous steps far more reliable. It is not part of the flow; just having one on the canvas is enough (you don\'t have to connect it).', fields: 'Goal text' },
  { icon: <Tag size={16} />, name: 'Parameter (sub node)', what: 'Supplies specific values to the single step it is wired to (via a purple context link). Use "value" to set exactly what gets typed/used — e.g. which account to log in with — so the AI never has to guess. Swap the parameter to switch between, say, a personal and a business login.', fields: 'Any key/value; value, account, etc.' },
  { icon: <Globe size={16} />, name: 'Trigger', what: 'The starting point of a run and its initial URL. A run needs a starting URL somewhere — here, or on a Navigate / Open Tab node placed before it.', fields: 'Target URL' },
  { icon: <Globe size={16} />, name: 'Navigate', what: 'Go to a URL in the current tab.', fields: 'Target URL' },
  { icon: <Plus size={16} />, name: 'Click', what: 'Click an element. Describe it in plain language (preferred) and/or give a CSS selector. Stanley tries the selector, then semantic matching, then AI vision.', fields: 'Description, CSS selector (optional)' },
  { icon: <Type size={16} />, name: 'Type', what: 'Type text into a field. Reference a secret with vault:Name, or a login with vault:Name.username / vault:Name.password.', fields: 'Description, value, CSS selector (optional)' },
  { icon: <Database size={16} />, name: 'Scrape', what: 'Extract visible text from the page (optionally scoped to a selector). The result is available to later steps and AI prompts as {{lastScrape}}.', fields: 'CSS selector (optional)' },
  { icon: <ExternalLink size={16} />, name: 'Open Tab', what: 'Open a new tab and make it the working tab. Put this before the trigger to run in a fresh tab instead of taking over your current one.', fields: 'URL (optional), label' },
  { icon: <RefreshCw size={16} />, name: 'Switch Tab', what: 'Switch which open tab is active.', fields: 'Tab id / label / index' },
  { icon: <X size={16} />, name: 'Close Tab', what: 'Close an open tab.', fields: 'Tab id / label / index' },
  { icon: <GitFork size={16} />, name: 'If / Branch', what: 'A decision point. It evaluates a condition and exposes True/False so its outgoing edges can route the flow down different paths. (This is about choosing an OUTPUT path — not merging inputs.)', fields: 'Condition' },
  { icon: <ArrowRight size={16} />, name: 'Goto', what: 'Jump to a labeled step — useful for loops and retries.', fields: 'Label' },
  { icon: <Bookmark size={16} />, name: 'Label', what: 'A named anchor that a Goto can jump to.', fields: 'Label name' },
  { icon: <Clock size={16} />, name: 'Wait', what: 'Pause for a set number of milliseconds, e.g. to let a page settle.', fields: 'Duration (ms)' },
  { icon: <Sparkles size={16} />, name: 'AI Prompt', what: 'Run an AI step mid-flow — e.g. classify or summarize what was just scraped. Its answer is available to later steps and conditions as {{lastAiResult}} / {{lastScrape}}.', fields: 'Prompt, system instruction (optional)' },
  { icon: <Code size={16} />, name: 'JS Script', what: 'Run custom JavaScript with access to the page agent, scraped data, and secrets — for advanced cases.', fields: 'Code' },
  { icon: <Circle size={16} />, name: 'Record Steps', what: 'Demonstrate a task in a real browser and turn your actions into nodes (desktop recorder).', fields: 'Start URL' },
];

export function Guide() {
  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h1>Guide &amp; Documentation</h1>
          <p>What each node does, and how Stanley is meant to be used.</p>
        </div>
      </div>

      {/* What Stanley is */}
      <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}><Workflow size={18} /> What Stanley is</h3>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Stanley is a <strong>neuro-symbolic</strong> browser automation tool. You draw a workflow as a graph of
          nodes — the <em>symbolic</em> skeleton that says what to do and in what order. At run time an AI fills in
          the gaps: when a step can't be matched by a CSS selector or by the element's name, Stanley looks at the
          page and figures out where to act. The graph keeps the AI constrained and predictable; the AI keeps the
          graph from breaking every time a page changes.
        </p>
      </div>

      {/* How a run works */}
      <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}><Play size={18} /> Running an automation</h3>
        <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '1.2rem' }}>
          <li><strong>Headless (cloud):</strong> runs on Stanley's servers in a fresh browser. Nothing happens in your own browser, and you can keep working. This is the recommended path.</li>
          <li><strong>In-browser:</strong> runs in your Chrome via the extension, in a tab you can watch.</li>
          <li>Each click/type escalates through three tiers: <strong>CSS selector → element name → AI vision</strong>. Cheap, exact matches are tried first; the AI is only used when needed.</li>
        </ul>
      </div>

      {/* Connections */}
      <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}><GitFork size={18} /> Connecting nodes</h3>
        <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '1.2rem' }}>
          <li>Every node has <strong>four connection points</strong> (top, bottom, left, right). Drag from one node's point to another's to connect them.</li>
          <li><strong>Flow links</strong> (grey points, top/bottom) define execution order.</li>
          <li><strong>Context links</strong> (purple points, left/right) attach a Parameter or Mission to a step — these don't run as steps, they just inform it.</li>
          <li><strong>Multiple links can converge on one node</strong>, and a node can fan out to several. To branch based on a result, use an <strong>If / Branch</strong> node and set a Routing Condition on each outgoing link.</li>
          <li>To remove a link, click it and press <strong>Delete</strong> (or use the Disconnect button in the panel).</li>
        </ul>
      </div>

      {/* Node reference */}
      <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>Node reference</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {NODES.map((n) => (
            <div key={n.name} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.85rem' }}>
              <div style={{ color: 'var(--accent-blue)', marginTop: '2px', flexShrink: 0 }}>{n.icon}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{n.name}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.83rem', lineHeight: 1.5 }}>{n.what}</div>
                {n.fields && <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginTop: '2px', fontFamily: 'monospace' }}>Fields: {n.fields}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Secrets */}
      <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}><KeyRound size={18} /> Secrets &amp; logins</h3>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Store credentials in the <strong>Credential Vault</strong> and reference them in a workflow instead of
          typing them in plain text. A normal secret is referenced as <code>vault:Name</code>. A
          <strong> Login Credentials</strong> secret holds a username and password together — reference them as
          <code> vault:Name.username</code> and <code>vault:Name.password</code>. Pair this with a Parameter node
          to choose <em>which</em> account a login step should use.
        </p>
      </div>

      {/* Acceptable use */}
      <div className="glass-panel" style={{ padding: '1.25rem', border: '1px solid rgba(234, 179, 8, 0.4)' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}><Shield size={18} /> Intended &amp; acceptable use</h3>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '0.5rem' }}>
          Stanley is built to automate <strong>your own</strong> repetitive browser tasks on sites and accounts
          you are authorized to use — filling forms, gathering your own data, routine logins, and similar chores.
        </p>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '0.5rem' }}>Do not use Stanley to:</p>
        <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '1.2rem' }}>
          <li>Access accounts or systems you don't own or aren't permitted to use, or test/guess others' credentials.</li>
          <li>Evade security controls, bot-detection, or rate limits, or defeat CAPTCHAs on systems you don't control.</li>
          <li>Scrape or interact with a site in violation of its Terms of Service or applicable law.</li>
          <li>Send spam, post abuse, manipulate engagement, or commit fraud.</li>
          <li>Harvest personal data without a lawful basis and consent.</li>
        </ul>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', lineHeight: 1.6, marginTop: '0.5rem' }}>
          You are responsible for how you use your automations and for complying with the terms of the sites you
          automate. Misuse may result in suspension of access.
        </p>
      </div>
    </div>
  );
}
