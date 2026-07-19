import React, { useState } from 'react';
import { 
  Check, 
  X, 
  Cpu, 
  Globe, 
  Database, 
  Eye, 
  EyeOff, 
  RotateCcw,
  Sparkles
} from 'lucide-react';
import './AdStaging.css';

// Interfaces for our programmatic ad copy structure
interface Ad1Data {
  hook: string;
  subText: string;
}

interface Ad2Data {
  painTitle: string;
  painSub: string;
  painPoints: string[];
  reliefTitle: string;
  reliefSub: string;
  reliefPoints: string[];
}

interface Ad3Data {
  hook: string;
  subText: string;
}

interface Ad4Data {
  hook: string;
  subText: string;
}

interface AdCopyData {
  ad1: Ad1Data;
  ad2: Ad2Data;
  ad3: Ad3Data;
  ad4: Ad4Data;
}

const DEFAULT_COPY: AdCopyData = {
  ad1: {
    hook: "Amplify the power of your team with AI",
    subText: "Put AI to work across all your tools with Stanley. Automate smarter, work faster, and focus on strategy."
  },
  ad2: {
    painTitle: "Prompt-Only Automation",
    painSub: "Powerful until the model guesses wrong.",
    painPoints: [
      "Opaque plans that are hard to inspect",
      "Unbounded agents that can drift from the task",
      "One execution mode for every kind of work"
    ],
    reliefTitle: "Constrained Automation",
    reliefSub: "Use AI inside a workflow you can inspect and control.",
    reliefPoints: [
      "Mission, parameter, branch, and approval guardrails",
      "Browser, native API, connector, and bounded Agent nodes",
      "Scoped credentials resolved only during execution"
    ]
  },
  ad3: {
    hook: "Keep your automation flowing with Stanley",
    subText: "Orchestrate browser and API workflows with visible steps and reviewable recovery. No code required."
  },
  ad4: {
    hook: "Drowning in browser tasks? Automate them with Stanley.",
    subText: "Say goodbye to busywork. Put your repetitive workflows on autopilot."
  }
};

export function AdStaging() {
  const [copy, setCopy] = useState<AdCopyData>(DEFAULT_COPY);
  const [jsonText, setJsonText] = useState<string>(JSON.stringify(DEFAULT_COPY, null, 2));
  const [showControls, setShowControls] = useState<boolean>(true);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      setCopy(parsed);
      setJsonError(null);
    } catch (err: any) {
      setJsonError(err.message);
    }
  };

  const handleReset = () => {
    setCopy(DEFAULT_COPY);
    setJsonText(JSON.stringify(DEFAULT_COPY, null, 2));
    setJsonError(null);
  };

  return (
    <div className="ad-page">
      {/* ── CONTROL PANEL ── */}
      {showControls && (
        <div className="editor-toolbar" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ backgroundColor: '#2563eb', padding: '8px', borderRadius: '8px', color: 'white' }}>
                <Cpu size={20} />
              </div>
              <div>
                <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, color: 'white' }}>Stanley Ad Factory</h1>
                <p style={{ fontSize: '12px', color: '#a3a3a3', margin: 0 }}>Preview and screenshot B2B ads (1080x1080px)</p>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button 
                onClick={handleReset}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#262626',
                  color: '#d4d4d4',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <RotateCcw size={14} />
                Reset Defaults
              </button>
              
              <button 
                onClick={() => setShowControls(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <EyeOff size={14} />
                Hide Controls
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#a3a3a3' }}>Ad Copy JSON</span>
                {jsonError ? (
                  <span style={{ fontSize: '12px', color: '#f87171' }}>Invalid JSON: {jsonError}</span>
                ) : (
                  <span style={{ fontSize: '12px', color: '#4ade80' }}>✓ Copy valid</span>
                )}
              </div>
              <textarea 
                value={jsonText}
                onChange={handleJsonChange}
                rows={5}
                style={{
                  width: '100%',
                  backgroundColor: '#171717',
                  border: '1px solid #262626',
                  borderRadius: '6px',
                  padding: '12px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: '#e5e5e5',
                  outline: 'none'
                }}
              />
            </div>
            <div style={{
              backgroundColor: 'rgba(23,23,23,0.5)',
              border: '1px solid #262626',
              borderRadius: '6px',
              padding: '16px',
              fontSize: '12px',
              color: '#a3a3a3',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: '8px'
            }}>
              <p style={{ margin: 0, fontWeight: 'bold', color: '#e5e5e5' }}>Playwright Tip:</p>
              <p style={{ margin: 0 }}>Target elements by ID for clean 1080x1080px captures:</p>
              <ul style={{ margin: 0, paddingLeft: '16px', fontFamily: 'monospace', fontSize: '10px' }}>
                <li>#ad-1</li>
                <li>#ad-2</li>
                <li>#ad-3</li>
                <li>#ad-4</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── FLOAT SHOW BUTTON ── */}
      {!showControls && (
        <button 
          onClick={() => setShowControls(true)}
          style={{
            position: 'fixed',
            top: '16px',
            right: '16px',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            padding: '12px 20px',
            borderRadius: '50px',
            cursor: 'pointer',
            fontWeight: 'bold',
            zIndex: 100,
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px'
          }}
        >
          <Eye size={18} />
          Show Editor Controls
        </button>
      )}

      {/* ── AD VIEW COLUMN ── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '64px', padding: '48px 0' }}>
        
        {/* ── AD 1: COCKPIT FLOW MOCKUP ── */}
        <div id="ad-1" className="ad-box bg-olive">
          <div className="ad-content">
            <h1 className="ad-title-large">{copy.ad1.hook}</h1>

            {/* Mock Flow Editor Graphic */}
            <div className="flow-canvas-mockup">
              <div className="flow-canvas-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ backgroundColor: '#2563eb', color: 'white', width: '24px', height: '24px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px' }}>S</div>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1f2937' }}>Stanley Cockpit</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></div>
                  <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase' }}>Live Flow</span>
                </div>
              </div>

              <div className="flow-canvas-grid">
                {/* Node 1 */}
                <div className="flow-node-card">
                  <div className="node-icon-wrapper" style={{ backgroundColor: '#fef3c7', color: '#d97706' }}>
                    <Globe size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: '9px', color: '#9ca3af', fontWeight: 'bold', textTransform: 'uppercase' }}>1. Web Trigger</div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#1f2937' }}>New Form Submission</div>
                  </div>
                </div>

                <div className="flow-connector-line"></div>

                {/* Node 2 - AI Processor */}
                <div className="flow-node-card flow-node-card-active" style={{ width: '340px', flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div className="node-icon-wrapper" style={{ backgroundColor: '#dbeafe', color: '#2563eb' }}>
                        <Sparkles size={20} />
                      </div>
                      <div>
                        <div style={{ fontSize: '9px', color: '#3b82f6', fontWeight: 'bold', textTransform: 'uppercase' }}>2. AI Instruction</div>
                        <div style={{ fontSize: '12px', fontWeight: 'extrabold', color: '#1f2937' }}>Analyze lead for ICP</div>
                      </div>
                    </div>
                    <span style={{ backgroundColor: '#dbeafe', color: '#1e40af', fontSize: '9px', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>Active</span>
                  </div>
                  <div style={{ fontSize: '9px', backgroundColor: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '4px', padding: '8px', color: '#4b5563', fontFamily: 'monospace', margin: 0 }}>
                    "Extract startup sector, funding, and determine suitability..."
                  </div>
                </div>

                <div className="flow-connector-line"></div>

                {/* Node 3 */}
                <div className="flow-node-card">
                  <div className="node-icon-wrapper" style={{ backgroundColor: '#d1fae5', color: '#059669' }}>
                    <Database size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: '9px', color: '#9ca3af', fontWeight: 'bold', textTransform: 'uppercase' }}>3. Sync Data</div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#1f2937' }}>Save to CRM & Database</div>
                  </div>
                </div>

                {/* Cursor Overlay */}
                <div style={{ position: 'absolute', bottom: '60px', right: '80px', zIndex: 30 }}>
                  <svg viewBox="0 0 24 24" style={{ width: '32px', height: '32px', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.15))' }}>
                    <path d="M4 4l11.73 11.73-4.5 1.27 3.5 6.5-2.5 1.3-3.5-6.5-3.5 3.2L4 4z" fill="white" stroke="black" strokeWidth="2" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Footer banner without hyperlink button */}
          <div className="ad-footer-banner">
            <div className="ad-footer-logo-group">
              <div className="ad-footer-logo-square">S</div>
              <span className="ad-footer-logo-text">stanley</span>
            </div>
            <span className="ad-footer-tagline">Self-Hosted Browser Automation</span>
          </div>
        </div>

        {/* ── AD 2: SPLIT SCREEN COMPARISON ── */}
        <div id="ad-2" className="ad-box">
          <div className="split-screen-grid">
            {/* Left Pain */}
            <div className="split-col split-col-left">
              <div>
                <div className="split-badge split-badge-red">The Old Way</div>
                <h2 className="split-header" style={{ color: '#f87171' }}>{copy.ad2.painTitle}</h2>
                <p className="split-sub">{copy.ad2.painSub}</p>

                <ul className="split-list">
                  {copy.ad2.painPoints.map((pt, idx) => (
                    <li key={idx} className="split-list-item" style={{ color: '#cbd5e1' }}>
                      <X size={22} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace', lineHeight: 1.4 }}>
                Cloud builders charge you per step execution.
              </div>
            </div>

            {/* Right Relief */}
            <div className="split-col split-col-right">
              <div>
                <div className="split-badge split-badge-blue">The Stanley Way</div>
                <h2 className="split-header" style={{ color: '#60a5fa' }}>{copy.ad2.reliefTitle}</h2>
                <p className="split-sub">{copy.ad2.reliefSub}</p>

                <ul className="split-list">
                  {copy.ad2.reliefPoints.map((pt, idx) => (
                    <li key={idx} className="split-list-item" style={{ color: 'white', fontWeight: '600' }}>
                      <Check size={22} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '2px' }} />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div style={{ fontSize: '12px', color: '#60a5fa', fontFamily: 'monospace', lineHeight: 1.4, fontWeight: 'bold' }}>
                Run infinite local flows for zero cost.
              </div>
            </div>
          </div>

          {/* Footer banner without hyperlink button */}
          <div className="ad-footer-banner">
            <div className="ad-footer-logo-group">
              <div className="ad-footer-logo-square">S</div>
              <span className="ad-footer-logo-text">stanley</span>
            </div>
            <span className="ad-footer-tagline">Unlimited Native Executions</span>
          </div>
        </div>

        {/* ── AD 3: THE FLOWING PIPELINE GRID ── */}
        <div id="ad-3" className="ad-box bg-olive">
          <div className="ad-content">
            <h1 className="ad-title-large">{copy.ad3.hook}</h1>

            <div className="pipeline-visual-wrapper">
              <svg viewBox="0 0 700 400" style={{ width: '100%', height: '100%', filter: 'drop-shadow(0 20px 30px rgba(0,0,0,0.3))' }}>
                <defs>
                  <radialGradient id="orangeGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#FF4F00" stopOpacity="0.8" />
                    <stop offset="60%" stopColor="#FF4F00" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#233326" stopOpacity="0" />
                  </radialGradient>
                  
                  <radialGradient id="orangeGlowSmall" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#FF4F00" stopOpacity="0.9" />
                    <stop offset="50%" stopColor="#FF4F00" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#233326" stopOpacity="0" />
                  </radialGradient>

                  <radialGradient id="blueGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.8" />
                    <stop offset="60%" stopColor="#3B82F6" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#233326" stopOpacity="0" />
                  </radialGradient>

                  <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FF4F00" />
                    <stop offset="100%" stopColor="#3B82F6" />
                  </linearGradient>
                </defs>

                {/* Background grid */}
                <g stroke="white" strokeWidth="1.5" strokeOpacity="0.15">
                  <rect x="220" y="80" width="380" height="240" fill="none" strokeWidth="2.5" strokeOpacity="0.25" />
                  <line x1="283.3" y1="80" x2="283.3" y2="320" />
                  <line x1="346.6" y1="80" x2="346.6" y2="320" />
                  <line x1="410" y1="80" x2="410" y2="320" />
                  <line x1="473.3" y1="80" x2="473.3" y2="320" />
                  <line x1="536.6" y1="80" x2="536.6" y2="320" />
                  
                  <line x1="220" y1="140" x2="600" y2="140" />
                  <line x1="220" y1="200" x2="600" y2="200" />
                  <line x1="220" y1="260" x2="600" y2="260" />
                </g>

                {/* Orange Circle */}
                <circle cx="346.6" cy="200" r="85" fill="url(#orangeGlow)" />
                <circle cx="346.6" cy="200" r="45" fill="#FF4F00" />

                {/* Smaller glowing square */}
                <rect x="500" y="225" width="55" height="50" fill="url(#orangeGlowSmall)" />
                <rect x="508" y="233" width="38" height="34" rx="6" fill="#FF4F00" />

                {/* Glowing Blue Circle */}
                <circle cx="473.3" cy="140" r="40" fill="url(#blueGlow)" />
                <circle cx="473.3" cy="140" r="16" fill="#3B82F6" />

                {/* Swirly Line */}
                <path 
                  d="M 346.6 200 C 380 90, 480 80, 473.3 140 C 460 220, 520 250, 527 250" 
                  fill="none" 
                  stroke="url(#lineGrad)" 
                  strokeWidth="4" 
                  strokeLinecap="round"
                />

                {/* Stars */}
                <polygon points="560,110 564,122 576,122 566,130 570,142 560,134 550,142 554,130 544,122 556,122" fill="#FF4F00" />
                <polygon points="255,110 257,115 263,115 258,118 260,123 255,120 250,123 252,118 247,115 253,115" fill="#FF4F00" />

                {/* Stick figure */}
                <g stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="140" cy="235" r="9" fill="white" stroke="none" />
                  <line x1="140" y1="244" x2="148" y2="268" />
                  <polyline points="148,268 138,298 126,298" />
                  <polyline points="148,268 160,285 155,298" />
                  <polyline points="143,248 166,242 186,248" />
                  <polyline points="143,253 168,252 186,252" />
                </g>

                {/* Pushed Block */}
                <rect x="186" y="220" width="34" height="78" fill="white" stroke="none" rx="2" />
                
                {/* Arrow */}
                <path d="M 160 280 L 190 280" stroke="#FF4F00" strokeWidth="2.5" />
                <polygon points="190,277 195,280 190,283" fill="#FF4F00" />

                {/* Mouse Cursor */}
                <g transform="translate(365, 110)">
                  <polygon points="0,0 20,12 12,14 18,26 14,28 8,16 0,20" fill="white" stroke="black" strokeWidth="1.5" />
                </g>
              </svg>
            </div>
          </div>

          {/* Footer banner without hyperlink button */}
          <div className="ad-footer-banner">
            <div className="ad-footer-logo-group">
              <div className="ad-footer-logo-square">S</div>
              <span className="ad-footer-logo-text">stanley</span>
            </div>
            <span className="ad-footer-tagline">Automate Smarter, Work Faster</span>
          </div>
        </div>

        {/* ── AD 4: DROWNING IN MANUAL TASKS ── */}
        <div id="ad-4" className="ad-box glass-chart-bg">
          {/* Backlights */}
          <div className="glow-backlight-orange"></div>
          <div className="glow-backlight-blue"></div>

          <div className="ad-content">
            <h1 className="ad-title-large">{copy.ad4.hook}</h1>

            <div className="pipeline-visual-wrapper">
              <svg viewBox="0 0 700 420" style={{ width: '100%', height: '100%', filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.4))' }}>
                <defs>
                  <linearGradient id="glassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="white" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="white" stopOpacity="0.02" />
                  </linearGradient>

                  <linearGradient id="glassBorder" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="white" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="white" stopOpacity="0.0" />
                  </linearGradient>

                  <radialGradient id="orangeColumnGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#FF4F00" stopOpacity="0.8" />
                    <stop offset="70%" stopColor="#FF4F00" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#111A13" stopOpacity="0" />
                  </radialGradient>

                  <radialGradient id="blueColumnGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.8" />
                    <stop offset="70%" stopColor="#3B82F6" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#111A13" stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* Column 1 */}
                <g>
                  <circle cx="210" cy="275" r="45" fill="url(#orangeColumnGlow)" />
                  <polygon points="210,265 212,271 218,271 213,275 215,281 210,277 205,281 207,275 202,271 208,271" fill="#FF4F00" />
                  <rect x="150" y="220" width="120" height="110" fill="url(#glassGrad)" stroke="url(#glassBorder)" strokeWidth="1.5" rx="8" />
                </g>

                {/* Column 2 */}
                <g>
                  <circle cx="350" cy="230" r="60" fill="url(#orangeColumnGlow)" />
                  <polygon points="350,210 354,222 366,222 356,230 360,242 350,234 340,242 344,230 334,222 346,222" fill="#FF4F00" />
                  <rect x="290" y="160" width="120" height="170" fill="url(#glassGrad)" stroke="url(#glassBorder)" strokeWidth="1.5" rx="8" />
                </g>

                {/* Column 3 */}
                <g>
                  <circle cx="490" cy="180" r="65" fill="url(#blueColumnGlow)" />
                  <polygon points="490,170 492,176 498,176 493,180 495,186 490,182 485,186 487,180 482,176 488,176" fill="#3B82F6" />
                  <rect x="430" y="100" width="120" height="230" fill="url(#glassGrad)" stroke="url(#glassBorder)" strokeWidth="1.5" rx="8" />
                </g>

                {/* Arrow */}
                <path d="M 100 320 Q 230 290 570 120" fill="none" stroke="#FF4F00" strokeOpacity="0.15" strokeWidth="10" strokeLinecap="round" />
                <path d="M 100 320 Q 230 290 570 120" fill="none" stroke="#FF4F00" strokeWidth="4" strokeLinecap="round" />
                <path d="M 545 110 L 575 117 L 565 145" fill="none" stroke="#FF4F00" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          {/* Footer banner without hyperlink button */}
          <div className="ad-footer-banner">
            <div className="ad-footer-logo-group">
              <div className="ad-footer-logo-square">S</div>
              <span className="ad-footer-logo-text">stanley</span>
            </div>
            <span className="ad-footer-tagline">Stop Manual Busywork</span>
          </div>
        </div>

      </div>
    </div>
  );
}
