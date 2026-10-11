import { useState } from 'react'

const iconPaths = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  scan: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M7 12h10M12 7v10"/></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></>,
  pulse: <><path d="M3 12h4l3-8 4 16 3-8h4"/></>,
  chart: <><path d="M4 19V5M4 19h16"/><path d="m7 15 4-4 3 2 5-6"/></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a7 7 0 0 1 11.6-2L20 12M4 12l2.9 5a7 7 0 0 0 11.6-2"/></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
  arrow: <><path d="M7 17 17 7M7 7h10v10"/></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  alert: <><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></>,
}

export function Icon({ name, size = 18 }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name] ?? iconPaths.grid}</svg>
}

export function StatusBadge({ tone = 'neutral', children, dot = false }) {
  return <span className={`status-badge tone-${tone}`}>{dot && <i />}<span>{children}</span></span>
}

export function SectionHeading({ eyebrow, title, description, action }) {
  return <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="section-description">{description}</p>}</div>{action}</div>
}

export function MetricCard({ label, value, note, icon, tone = 'cyan' }) {
  return <article className={`metric-card metric-${tone}`}><div className="metric-top"><span className="metric-icon"><Icon name={icon}/></span><span className="metric-label">{label}</span></div><strong className="metric-value"><span key={value}>{value}</span></strong><span className="metric-note">{note}</span></article>
}

export function EmptyState({ title, detail, action }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name="list" size={20}/></span><strong>{title}</strong><p>{detail}</p>{action}</div>
}

export function CopyButton({ value, label = 'Copy ID' }) {
  const [message, setMessage] = useState('')
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setMessage('Copied')
      window.setTimeout(() => setMessage(''), 1600)
    } catch {
      setMessage('Copy unavailable')
      window.setTimeout(() => setMessage(''), 2000)
    }
  }
  return <button className="copy-button" onClick={copy} aria-label={message || label} title={message || label}><Icon name={message === 'Copied' ? 'check' : 'copy'} size={15}/><span>{message || label}</span></button>
}

export function ErrorState({ message, onRetry }) {
  return <div className="inline-error" role="alert"><Icon name="alert"/><span>{message}</span>{onRetry && <button className="text-button" onClick={onRetry}>Retry</button>}</div>
}

