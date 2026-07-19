import { useEffect, useState } from 'react';
import { Clock, Webhook, Trash2, Plus, X, Copy, Power, Mail, Eye } from 'lucide-react';
import { listDocs, setDoc, deleteDoc } from '../lib/firestore';

/**
 * TriggersPanel — schedule a workflow to run on a cadence, expose a webhook,
 * monitor Gmail for matching emails, or watch a webpage for visual changes.
 */

const WEBHOOK_BASE = 'https://us-central1-bridgeway-db29e.cloudfunctions.net/stanleyWebhook';

interface Props {
  workflow: { id: string; name: string };
  onClose: () => void;
}

interface Schedule { id: string; workflowId: string; cron: string; timezone: string; enabled: boolean; nextRunMs: number; lastStatus?: string; preset?: string; }
interface Trigger { id: string; workflowId: string; enabled: boolean; secretHash: string; }
interface EmailTrigger { id: string; workflowId: string; query: string; checkIntervalMin: number; enabled: boolean; lastCheckMs?: number; lastStatus?: string; }
interface MonitorTrigger { id: string; workflowId: string; url: string; selector?: string; checkIntervalMin: number; enabled: boolean; lastCheckMs?: number; lastStatus?: string; }

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
// Standalone Gmail/page polling records do not have a production scheduler.
// Their reliable equivalent is a scheduled workflow containing Gmail or
// Monitor nodes, so the inert shortcut controls stay hidden.
const DIRECT_POLLING_TRIGGER_UI = false;

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function buildSchedule(preset: string, time: string, dow: number, customCron: string): { cron: string; nextRunMs: number } {
  const [hh, mm] = (time || '09:00').split(':').map(Number);
  const now = new Date();
  if (preset === 'hourly') {
    const d = new Date(now); d.setMinutes(0, 0, 0);
    if (d <= now) d.setHours(d.getHours() + 1);
    return { cron: '0 * * * *', nextRunMs: d.getTime() };
  }
  if (preset === 'daily') {
    const d = new Date(now); d.setHours(hh, mm, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return { cron: `${mm} ${hh} * * *`, nextRunMs: d.getTime() };
  }
  if (preset === 'weekly') {
    const d = new Date(now); d.setHours(hh, mm, 0, 0);
    while (d <= now || d.getDay() !== dow) d.setDate(d.getDate() + 1);
    return { cron: `${mm} ${hh} * * ${dow}`, nextRunMs: d.getTime() };
  }
  return { cron: customCron.trim() || '0 * * * *', nextRunMs: Date.now() + 60_000 };
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function TriggersPanel({ workflow, onClose }: Props) {
  const uid = localStorage.getItem('stanley_uid') || '';
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [emailTriggers, setEmailTriggers] = useState<EmailTrigger[]>([]);
  const [monitorTriggers, setMonitorTriggers] = useState<MonitorTrigger[]>([]);
  
  // Schedule inputs
  const [preset, setPreset] = useState('daily');
  const [time, setTime] = useState('09:00');
  const [dow, setDow] = useState(1);
  const [customCron, setCustomCron] = useState('0 9 * * 1-5');
  const [newToken, setNewToken] = useState<{ id: string; token: string } | null>(null);
  
  // Failure alert inputs
  const [notifyOnFailure, setNotifyOnFailure] = useState(false);
  const [notifyType, setNotifyType] = useState<'email' | 'webhook' | 'slack'>('email');
  const [notifyTarget, setNotifyTarget] = useState(localStorage.getItem('stanley_email') || '');

  // Email inputs
  const [emailQuery, setEmailQuery] = useState('subject:"Billing Alert"');
  const [emailInterval, setEmailInterval] = useState(15);

  // Monitor inputs
  const [monitorUrl, setMonitorUrl] = useState('https://news.ycombinator.com');
  const [monitorSelector, setMonitorSelector] = useState('span.titleline > a');
  const [monitorInterval, setMonitorInterval] = useState(30);

  const load = async () => {
    const [sch, trg, em, mn] = await Promise.all([
      listDocs('schedules').catch(() => []),
      listDocs('triggers').catch(() => []),
      listDocs('email_triggers').catch(() => []),
      listDocs('monitor_triggers').catch(() => []),
    ]);
    setSchedules((sch as unknown as Schedule[]).filter(s => s.workflowId === workflow.id));
    setTriggers((trg as unknown as Trigger[]).filter(t => t.workflowId === workflow.id));
    setEmailTriggers((em as unknown as EmailTrigger[]).filter(e => e.workflowId === workflow.id));
    setMonitorTriggers((mn as unknown as MonitorTrigger[]).filter(m => m.workflowId === workflow.id));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [workflow.id]);

  const addSchedule = async () => {
    const { cron, nextRunMs } = buildSchedule(preset, time, dow, customCron);
    const id = randomHex(5);
    const doc: Schedule & { notifyOnFailure?: { type: string; target: string } } = { 
      id, 
      workflowId: workflow.id, 
      cron, 
      timezone: TZ, 
      enabled: true, 
      nextRunMs, 
      preset,
      ...(notifyOnFailure && notifyTarget ? { notifyOnFailure: { type: notifyType, target: notifyTarget.trim() } } : {})
    };
    await setDoc('schedules', id, { ...doc, workflowName: workflow.name } as any);
    load();
  };

  const toggleSchedule = async (s: Schedule) => {
    await setDoc('schedules', s.id, { ...s, enabled: !s.enabled } as any);
    load();
  };
  const removeSchedule = async (id: string) => { await deleteDoc('schedules', id); load(); };

  const addWebhook = async () => {
    const id = randomHex(8);
    const token = randomHex(16);
    const secretHash = await sha256Hex(token);
    await setDoc('triggers', id, { id, workflowId: workflow.id, workflowName: workflow.name, enabled: true, secretHash, createdAt: Date.now() } as any);
    setNewToken({ id, token });
    load();
  };
  const toggleTrigger = async (t: Trigger) => { await setDoc('triggers', t.id, { ...t, enabled: !t.enabled } as any); load(); };
  const removeTrigger = async (id: string) => { await deleteDoc('triggers', id); if (newToken?.id === id) setNewToken(null); load(); };

  const addEmailTrigger = async () => {
    const id = randomHex(6);
    const doc: EmailTrigger = { id, workflowId: workflow.id, query: emailQuery, checkIntervalMin: emailInterval, enabled: true };
    await setDoc('email_triggers', id, { ...doc, workflowName: workflow.name } as any);
    load();
  };
  const toggleEmailTrigger = async (e: EmailTrigger) => { await setDoc('email_triggers', e.id, { ...e, enabled: !e.enabled } as any); load(); };
  const removeEmailTrigger = async (id: string) => { await deleteDoc('email_triggers', id); load(); };

  const addMonitorTrigger = async () => {
    const id = randomHex(6);
    const doc: MonitorTrigger = { id, workflowId: workflow.id, url: monitorUrl, selector: monitorSelector, checkIntervalMin: monitorInterval, enabled: true };
    await setDoc('monitor_triggers', id, { ...doc, workflowName: workflow.name } as any);
    load();
  };
  const toggleMonitorTrigger = async (m: MonitorTrigger) => { await setDoc('monitor_triggers', m.id, { ...m, enabled: !m.enabled } as any); load(); };
  const removeMonitorTrigger = async (id: string) => { await deleteDoc('monitor_triggers', id); load(); };

  const webhookUrl = (id: string) => `${WEBHOOK_BASE}?t=${id}&u=${uid}`;
  const describe = (s: Schedule) =>
    s.preset === 'hourly' ? 'Every hour'
    : s.preset === 'daily' ? `Daily at ${time}`
    : s.preset === 'weekly' ? `Weekly` : `cron: ${s.cron}`;

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel" style={{ maxWidth: '680px', width: '94%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 style={{ margin: 0 }}>Triggers — {workflow.name}</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', marginTop: 0 }}>
          Run this automation automatically — on a schedule, or when triggered by external events.
        </p>

        {/* Schedules */}
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.95rem', marginTop: '1.25rem', color: 'var(--accent-blue)' }}><Clock size={16} /> Time-based Schedules</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '0.5rem' }}>
          <div>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Cadence</label>
            <select className="form-input" style={{ padding: '4px 8px', fontSize: '0.8rem' }} value={preset} onChange={e => setPreset(e.target.value)}>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily at…</option>
              <option value="weekly">Weekly on…</option>
              <option value="custom">Custom cron</option>
            </select>
          </div>
          {(preset === 'daily' || preset === 'weekly') && (
            <div>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Time</label>
              <input type="time" className="form-input" style={{ padding: '4px 8px', fontSize: '0.8rem' }} value={time} onChange={e => setTime(e.target.value)} />
            </div>
          )}
          {preset === 'weekly' && (
            <div>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Day</label>
              <select className="form-input" style={{ padding: '4px 8px', fontSize: '0.8rem' }} value={dow} onChange={e => setDow(Number(e.target.value))}>
                {DOW.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
          )}
          {preset === 'custom' && (
            <div style={{ flex: 1, minWidth: '160px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Cron (min hr dom mon dow)</label>
              <input className="form-input" style={{ padding: '4px 8px', fontSize: '0.8rem', fontFamily: 'monospace' }} value={customCron} onChange={e => setCustomCron(e.target.value)} placeholder="0 9 * * 1-5" />
            </div>
          )}
          <button className="btn btn-primary btn-sm" onClick={addSchedule}><Plus size={14} /> Add</button>
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>Times are in your timezone ({TZ}).</div>
        
        {/* Failure Alerts Form Options */}
        {DIRECT_POLLING_TRIGGER_UI && <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '10px 12px', marginBottom: '1.25rem', marginTop: '0.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', userSelect: 'none', color: '#f1f5f9' }}>
            <input 
              type="checkbox" 
              checked={notifyOnFailure} 
              onChange={e => setNotifyOnFailure(e.target.checked)} 
              style={{ margin: 0, cursor: 'pointer' }}
            />
            <span>Notify me on failure</span>
          </label>
          
          {notifyOnFailure && (
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginTop: '8px', paddingLeft: '22px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>Alert Channel</label>
                <select className="form-input text-xs" style={{ padding: '4px 8px', fontSize: '0.8rem' }} value={notifyType} onChange={e => setNotifyType(e.target.value as any)}>
                  <option value="email">Email</option>
                  <option value="webhook">Webhook POST</option>
                  <option value="slack">Slack Webhook</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: '220px' }}>
                <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>
                  {notifyType === 'email' ? 'Email Address' : notifyType === 'slack' ? 'Slack Webhook URL' : 'POST URL'}
                </label>
                <input
                  type="text"
                  className="form-input text-xs w-full"
                  style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                  placeholder={notifyType === 'email' ? 'you@example.com' : 'https://hooks.slack.com/...'}
                  value={notifyTarget}
                  onChange={e => setNotifyTarget(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>}

        {schedules.length === 0 ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', paddingBottom: '0.5rem' }}>No active schedules.</div>
        ) : schedules.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.82rem' }}>
              <span style={{ opacity: s.enabled ? 1 : 0.45 }}>{describe(s)}</span>
              <span style={{ color: 'var(--text-tertiary)', fontSize: '0.7rem', marginLeft: '8px' }}>
                next {new Date(s.nextRunMs).toLocaleString()} {s.lastStatus ? `· last: ${s.lastStatus}` : ''}
              </span>
              {(s as any).notifyOnFailure && (
                <div style={{ fontSize: '0.72rem', color: '#a855f7', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
                  <span>🔔 Failure alert via {(s as any).notifyOnFailure.type} to</span>
                  <code style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{(s as any).notifyOnFailure.target}</code>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
              <button className="btn btn-secondary btn-sm" title={s.enabled ? 'Disable' : 'Enable'} onClick={() => toggleSchedule(s)} style={{ padding: '2px 6px', color: s.enabled ? 'var(--accent-green)' : 'var(--text-tertiary)' }}><Power size={12} /></button>
              <button className="btn btn-secondary btn-sm" title="Delete" onClick={() => removeSchedule(s.id)} style={{ padding: '2px 6px' }}><Trash2 size={12} /></button>
            </div>
          </div>
        ))}

        {/* Webhooks */}
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.95rem', marginTop: '1.5rem', color: 'var(--accent-blue)' }}><Webhook size={16} /> Instant Webhooks</h3>
        <button className="btn btn-primary btn-sm" onClick={addWebhook} style={{ marginBottom: '0.5rem' }}><Plus size={14} /> Create webhook</button>
        {newToken && (
          <div className="glass-panel" style={{ padding: '0.6rem', marginBottom: '0.5rem', border: '1px solid rgba(234,179,8,0.4)', fontSize: '0.75rem' }}>
            <div style={{ color: '#eab308', fontWeight: 600, marginBottom: '4px' }}>Copy this token now — it won't be shown again.</div>
            <div style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>Token: {newToken.token}</div>
            <div style={{ marginTop: '4px', color: 'var(--text-tertiary)' }}>Send it as header <code>X-Stanley-Token</code> on your POST.</div>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: '6px' }} onClick={() => navigator.clipboard?.writeText(newToken.token)}><Copy size={12} /> Copy token</button>
          </div>
        )}
        {triggers.length === 0 ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', paddingBottom: '0.5rem' }}>No webhooks configured.</div>
        ) : triggers.map(t => (
          <div key={t.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <code style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', wordBreak: 'break-all', opacity: t.enabled ? 1 : 0.45 }}>POST {webhookUrl(t.id)}</code>
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginLeft: '8px' }}>
                <button className="btn btn-secondary btn-sm" title="Copy URL" onClick={() => navigator.clipboard?.writeText(webhookUrl(t.id))} style={{ padding: '2px 6px' }}><Copy size={12} /></button>
                <button className="btn btn-secondary btn-sm" title={t.enabled ? 'Disable' : 'Enable'} onClick={() => toggleTrigger(t)} style={{ padding: '2px 6px', color: t.enabled ? 'var(--accent-green)' : 'var(--text-tertiary)' }}><Power size={12} /></button>
                <button className="btn btn-secondary btn-sm" title="Delete" onClick={() => removeTrigger(t.id)} style={{ padding: '2px 6px' }}><Trash2 size={12} /></button>
              </div>
            </div>
          </div>
        ))}

        <div style={{ marginTop: '1.5rem', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '12px', color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
          For Gmail polling or page-change monitoring, add the Gmail/Monitor actions to the workflow and schedule the workflow above. This uses Stanley's durable scheduler instead of maintaining a second trigger system.
        </div>

        {DIRECT_POLLING_TRIGGER_UI && <>
        {/* Gmail Triggers */}
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.95rem', marginTop: '1.5rem', color: 'var(--accent-blue)' }}><Mail size={16} /> Active Gmail / Email Triggers</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '0.5rem' }}>
          <div style={{ flex: 1.5, minWidth: '180px' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Gmail Query Filter</label>
            <input className="form-input" style={{ padding: '4px 8px', fontSize: '0.8rem' }} value={emailQuery} onChange={e => setEmailQuery(e.target.value)} placeholder='subject:"Billing Alert"' />
          </div>
          <div>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Interval (min)</label>
            <select className="form-input" style={{ padding: '4px 8px', fontSize: '0.8rem' }} value={emailInterval} onChange={e => setEmailInterval(Number(e.target.value))}>
              <option value={5}>Every 5m</option>
              <option value={15}>Every 15m</option>
              <option value={60}>Hourly</option>
            </select>
          </div>
          <button className="btn btn-primary btn-sm" onClick={addEmailTrigger}><Plus size={14} /> Add</button>
        </div>
        {emailTriggers.length === 0 ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', paddingBottom: '0.5rem' }}>No Gmail triggers configured.</div>
        ) : emailTriggers.map(e => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.82rem' }}>
              <span style={{ opacity: e.enabled ? 1 : 0.45 }}>Query: <code style={{ color: '#a855f7' }}>{e.query}</code> (checked every {e.checkIntervalMin}m)</span>
              {e.lastCheckMs && <span style={{ color: 'var(--text-tertiary)', fontSize: '0.7rem', marginLeft: '8px' }}>checked {new Date(e.lastCheckMs).toLocaleTimeString()} · status: {e.lastStatus || 'Success'}</span>}
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button className="btn btn-secondary btn-sm" title={e.enabled ? 'Disable' : 'Enable'} onClick={() => toggleEmailTrigger(e)} style={{ padding: '2px 6px', color: e.enabled ? 'var(--accent-green)' : 'var(--text-tertiary)' }}><Power size={12} /></button>
              <button className="btn btn-secondary btn-sm" title="Delete" onClick={() => removeEmailTrigger(e.id)} style={{ padding: '2px 6px' }}><Trash2 size={12} /></button>
            </div>
          </div>
        ))}

        {/* Web Monitors */}
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.95rem', marginTop: '1.5rem', color: 'var(--accent-blue)' }}><Eye size={16} /> Active Page Monitor Triggers</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '0.5rem' }}>
          <div style={{ flex: 1.5, minWidth: '180px' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Watch URL</label>
            <input className="form-input" style={{ padding: '4px 8px', fontSize: '0.8rem' }} value={monitorUrl} onChange={e => setMonitorUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div style={{ flex: 1, minWidth: '120px' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Selector (optional)</label>
            <input className="form-input" style={{ padding: '4px 8px', fontSize: '0.8rem' }} value={monitorSelector} onChange={e => setMonitorSelector(e.target.value)} placeholder="CSS Selector" />
          </div>
          <div>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Interval (min)</label>
            <select className="form-input" style={{ padding: '4px 8px', fontSize: '0.8rem' }} value={monitorInterval} onChange={e => setMonitorInterval(Number(e.target.value))}>
              <option value={15}>Every 15m</option>
              <option value={30}>Every 30m</option>
              <option value={60}>Hourly</option>
              <option value={1440}>Daily</option>
            </select>
          </div>
          <button className="btn btn-primary btn-sm" onClick={addMonitorTrigger}><Plus size={14} /> Add</button>
        </div>
        {monitorTriggers.length === 0 ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', paddingBottom: '0.5rem' }}>No page monitor triggers configured.</div>
        ) : monitorTriggers.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.82rem' }}>
              <span style={{ opacity: m.enabled ? 1 : 0.45 }}>URL: <code style={{ color: '#3b82f6' }}>{m.url}</code> {m.selector ? `(watched element: "${m.selector}")` : ''} checked every {m.checkIntervalMin}m</span>
              {m.lastCheckMs && <span style={{ color: 'var(--text-tertiary)', fontSize: '0.7rem', marginLeft: '8px' }}>checked {new Date(m.lastCheckMs).toLocaleTimeString()}</span>}
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button className="btn btn-secondary btn-sm" title={m.enabled ? 'Disable' : 'Enable'} onClick={() => toggleMonitorTrigger(m)} style={{ padding: '2px 6px', color: m.enabled ? 'var(--accent-green)' : 'var(--text-tertiary)' }}><Power size={12} /></button>
              <button className="btn btn-secondary btn-sm" title="Delete" onClick={() => removeMonitorTrigger(m.id)} style={{ padding: '2px 6px' }}><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
        </>}
      </div>
    </div>
  );
}
