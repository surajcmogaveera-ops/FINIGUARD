import { useId } from 'react'
import { Icon, StatusBadge } from './Primitives.jsx'

function decisionTone(decision) {
  if (decision === 'APPROVED') return 'approved'
  if (decision === 'BLOCKED') return 'blocked'
  if (decision === 'REVIEW') return 'review'
  return 'neutral'
}

function decisionLabel(decision) {
  if (decision === 'APPROVED') return 'Approved'
  if (decision === 'BLOCKED') return 'Blocked'
  if (decision === 'REVIEW') return 'Review required'
  return 'Awaiting request'
}

export function SecurityScene({ health, result, busy = false, error = '', compact = false }) {
  const id = useId().replaceAll(':', '')
  const tone = error ? 'error' : decisionTone(result?.decision)
  const aiStatus = health?.ai?.status
  const accessibleSceneState = busy ? 'Backend is processing a submitted request.' : error ? `Request failed: ${error}` : result ? `Backend decision: ${decisionLabel(result.decision)}.` : 'Security visualization standing by. No request is being processed.'
  return <div className={`security-scene tone-${tone} ${busy ? 'is-processing' : ''} ${compact ? 'security-scene-compact' : ''}`} role="img" aria-label={`FINIGUARD security core. ${accessibleSceneState}`}>
    <div className="scene-floor-grid" aria-hidden="true" />
    <div className="scene-light-field" aria-hidden="true" />
    <svg className="scene-svg" viewBox="0 0 600 420" preserveAspectRatio={compact ? 'xMidYMid slice' : 'xMidYMid meet'} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-core`} cx="50%" cy="42%" r="65%"><stop offset="0" stopColor="var(--scene-core)" stopOpacity=".34"/><stop offset=".56" stopColor="var(--scene-core)" stopOpacity=".08"/><stop offset="1" stopColor="var(--scene-core)" stopOpacity="0"/></radialGradient>
        <linearGradient id={`${id}-line`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="var(--scene-core)" stopOpacity=".04"/><stop offset=".5" stopColor="var(--scene-core)" stopOpacity=".9"/><stop offset="1" stopColor="var(--scene-core)" stopOpacity=".08"/></linearGradient>
        <filter id={`${id}-glow`} x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <circle className="scene-core-aura" cx="300" cy="210" r="177" fill={`url(#${id}-core)`}/>
      <g className="scene-network">
        <path style={{ stroke: `url(#${id}-line)` }} d="M80 128 160 162 211 118 255 154M345 123 401 155 474 114 527 148M84 286 159 253 216 298 251 264M347 268 397 236 469 284 523 251"/>
        <path className="scene-network-flow" d="M80 128 160 162 211 118 255 154M345 123 401 155 474 114 527 148M84 286 159 253 216 298 251 264M347 268 397 236 469 284 523 251"/>
        <path className="scene-network-flow scene-network-flow-late" d="M80 128 160 162 211 118 255 154M345 123 401 155 474 114 527 148M84 286 159 253 216 298 251 264M347 268 397 236 469 284 523 251"/>
        <circle cx="80" cy="128" r="2.5"/><circle cx="160" cy="162" r="2"/><circle cx="211" cy="118" r="2.5"/><circle cx="474" cy="114" r="2.5"/><circle cx="527" cy="148" r="2"/><circle cx="84" cy="286" r="2"/><circle cx="216" cy="298" r="2.5"/><circle cx="469" cy="284" r="2"/><circle cx="523" cy="251" r="2.5"/>
      </g>
      <g className="scene-orbit orbit-one"><ellipse cx="300" cy="210" rx="191" ry="68"/><circle cx="300" cy="142" r="4"/><circle cx="109" cy="210" r="2.5"/></g>
      <g className="scene-orbit orbit-two"><ellipse cx="300" cy="210" rx="153" ry="108"/><circle cx="453" cy="210" r="3"/><circle cx="300" cy="102" r="2"/></g>
      <g className="scene-orbit orbit-three"><ellipse cx="300" cy="210" rx="114" ry="158"/><circle cx="300" cy="368" r="3.5"/></g>
      <g className="scene-radar"><path className="scene-radar-wedge" fill={`url(#${id}-core)`} d="M300 210 300 38 A172 172 0 0 1 422 89Z"/><path className="scene-radar-beam" d="M300 210 300 38"/></g>
      <g className="scene-particles">
        <circle className="particle particle-a" cx="300" cy="56" r="2.5"/><circle className="particle particle-b" cx="466" cy="210" r="2"/><circle className="particle particle-c" cx="300" cy="370" r="2"/><circle className="particle particle-d" cx="134" cy="210" r="2.5"/><circle className="particle particle-e" cx="421" cy="96" r="1.7"/><circle className="particle particle-f" cx="179" cy="329" r="1.6"/><circle className="particle particle-g" cx="449" cy="314" r="2"/>
      </g>
      <g className="particle-travel particle-travel-one"><circle cx="300" cy="52" r="4"/><circle cx="300" cy="52" r="8" className="travel-halo"/></g>
      <g className="particle-travel particle-travel-two"><circle cx="300" cy="84" r="2.8"/><circle cx="300" cy="84" r="6" className="travel-halo"/></g>
      <circle className="scene-core-halo" cx="300" cy="210" r="68"/>
      <g className="scene-shield" filter={`url(#${id}-glow)`}>
        <g className="scene-shield-core">
          <path className="shield-outline" d="M300 145 345 163v39c0 34-19 57-45 72-26-15-45-38-45-72v-39z"/>
          <path className="shield-inner" d="M300 158 334 172v30c0 25-13 43-34 56-21-13-34-31-34-56v-30z"/>
          <path className="shield-check" d="m282 207 12 12 25-27"/>
        </g>
      </g>
      <circle className="scene-node node-left" cx="300" cy="38" r="3"/><circle className="scene-node node-right" cx="472" cy="210" r="2.5"/><circle className="scene-node node-bottom" cx="300" cy="382" r="3"/>
    </svg>
    <div className="scene-coordinate coordinate-top">SECURE CORE <span>01 / 04</span></div>
    <div className="scene-coordinate coordinate-bottom"><span>POLICY ENGINE</span><i/> <span>SIMULATION ONLY</span></div>
    <div className="scene-processing-label" aria-live="polite"><span className="scene-processing-dot"/>{busy ? 'REQUEST IN PIPELINE' : error ? 'REQUEST ERROR · NO OUTCOME' : result ? `DECISION · ${decisionLabel(result.decision).toUpperCase()}` : 'STANDBY · NO REQUEST'}</div>
  </div>
}

export function SecuritySceneStatus({ health, result, onInspect }) {
  const connected = health?.status === 'ok'
  const decision = result?.decision
  const tone = decisionTone(decision)
  return <div className="security-hero-copy">
    <p className="eyebrow">AI SECURITY FIREWALL FOR FINANCIAL TRANSACTIONS</p>
    <h1>FINIGUARD</h1>
    <p className="hero-tagline">Intelligence analyzed. Every action verified.</p>
    <p className="hero-description">Untrusted requests analyzed against deterministic policy before a simulated action can execute.</p>
    <div className="hero-status-row">
      <StatusBadge tone={connected ? 'green' : health ? 'amber' : 'neutral'} dot>{connected ? 'API operational' : health ? 'API degraded' : 'API unavailable'}</StatusBadge>
      <StatusBadge tone={aiStatusTone(health)}>{health?.ai?.status ? `AI ${health.ai.status}` : 'AI status unavailable'}</StatusBadge>
      {decision && <StatusBadge tone={tone === 'approved' ? 'green' : tone === 'blocked' ? 'red' : tone === 'review' ? 'amber' : 'neutral'}>{decisionLabel(decision)}</StatusBadge>}
    </div>
    <div className="hero-action-row">
      <button className="button button-primary hero-inspect-button" onClick={onInspect}><Icon name="scan" size={16}/> Inspect a request <Icon name="arrow" size={15}/></button>
      <span className="hero-authority"><Icon name="shield" size={14}/> Server policy is the execution authority</span>
    </div>
  </div>
}

function aiStatusTone(health) {
  if (health?.ai?.status === 'enabled') return 'cyan'
  if (health?.ai?.status === 'disabled') return 'neutral'
  return health?.ai ? 'amber' : 'neutral'
}
