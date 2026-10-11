import { Icon, MetricCard, SectionHeading, StatusBadge } from './Primitives.jsx'

function countValue(data, key) { return Number.isFinite(data?.counts?.[key]) ? data.counts[key].toLocaleString() : 'Unavailable' }
export default function Operations({ health, observability, onRefresh, refreshing, errors }) {
  const healthTone = !health ? 'neutral' : health.status === 'ok' ? 'green' : 'amber'
  const ai = health?.ai
  const aiTone = !ai ? 'neutral' : ai.status === 'enabled' ? 'green' : ai.status === 'disabled' ? 'neutral' : 'amber'
  const decisionMix = [
    { key: 'approved', label: 'Approved', tone: 'green' },
    { key: 'blocked', label: 'Blocked', tone: 'red' },
    { key: 'review', label: 'Review', tone: 'amber' },
  ].map((item) => ({ ...item, value: observability?.counts?.[item.key] }))
  const decisionScale = Math.max(0, ...decisionMix.map((item) => Number.isFinite(item.value) ? item.value : 0))
  return <div className="page-stack">
    <SectionHeading eyebrow="SERVICE TELEMETRY / PROCESS SCOPE" title="Operations" description="Operational facts read from the backend's health and retained-event observability APIs." action={<button className="button button-quiet" onClick={onRefresh} disabled={refreshing}><Icon name="refresh" size={16}/>{refreshing ? 'Refreshing' : 'Refresh status'}</button>}/>
    <div className="operations-status-grid">
      <section className="surface-card operation-status"><div className="card-heading"><div><p className="eyebrow">HTTP API</p><h2>Gateway health</h2></div><StatusBadge tone={healthTone} dot>{health?.status === 'ok' ? 'Operational' : health?.status ?? 'Unavailable'}</StatusBadge></div><div className="operation-detail"><span>Service</span><strong>{health?.service ?? 'Unavailable'}</strong></div><div className="operation-detail"><span>API version</span><strong>{health?.version ?? 'Unavailable'}</strong></div>{errors?.health && <p className="subtle-error">Health check failed. The backend is not assumed to be healthy.</p>}</section>
      <section className="surface-card operation-status"><div className="card-heading"><div><p className="eyebrow">OPTIONAL ANALYSIS</p><h2>AI provider</h2></div><StatusBadge tone={aiTone} dot>{ai?.status ?? 'Unavailable'}</StatusBadge></div><div className="operation-detail"><span>Provider</span><strong>{ai?.provider ?? 'Unavailable'}</strong></div><div className="operation-detail"><span>Configured</span><strong>{typeof ai?.configured === 'boolean' ? ai.configured ? 'Yes' : 'No' : 'Unavailable'}</strong></div><p className="service-note">Provider status reflects configuration and health response only. Deterministic analysis remains active when AI is disabled or unavailable.</p></section>
    </div>
    <section className="metric-section"><div className="card-heading"><div><p className="eyebrow">RETAINED EVENT COUNTS</p><h2>Request and execution metrics</h2></div><StatusBadge tone={observability ? 'cyan' : 'neutral'}>{observability ? 'Live response' : 'Unavailable'}</StatusBadge></div>
      <section className="decision-distribution" aria-label="Decision outcomes from retained backend records"><div className="distribution-heading"><span>Decision distribution</span><small>{Number.isFinite(observability?.counts?.decisions) ? `${observability.counts.decisions} retained decisions` : 'Live response unavailable'}</small></div><div className="distribution-bars">{decisionMix.map((item) => <div className={`distribution-row distribution-${item.tone}`} key={item.key}><span>{item.label}</span><div className="distribution-track"><i style={{ width: `${decisionScale > 0 && Number.isFinite(item.value) ? (item.value / decisionScale) * 100 : 0}%` }}/></div><strong>{Number.isFinite(item.value) ? item.value.toLocaleString() : '—'}</strong></div>)}</div></section>
      <div className="metric-grid operations-metrics">
        <MetricCard label="Requests" value={countValue(observability, 'requests')} note="Current retained process scope" icon="list"/>
        <MetricCard label="Decisions" value={countValue(observability, 'decisions')} note="Final request records only" icon="shield"/>
        <MetricCard label="Review required" value={countValue(observability, 'review')} note="Held for manual attention" icon="clock" tone="amber"/>
        <MetricCard label="Transactions failed" value={countValue(observability, 'failedTransactions')} note="Failed execution event records" icon="alert" tone="red"/>
        <MetricCard label="Detector failures" value={countValue(observability, 'detectorFailures')} note="Recorded detection failures" icon="scan" tone="amber"/>
        <MetricCard label="Provider failures" value={countValue(observability, 'providerFailures')} note="Recorded AI analysis failures" icon="pulse" tone="amber"/>
      </div>
    </section>
    <div className="operations-bottom-grid">
      <section className="surface-card"><div className="card-heading"><div><p className="eyebrow">RETENTION</p><h2>Process-local storage</h2></div><Icon name="clock"/></div><div className="retention-stat"><strong>{observability?.retention?.retainedEvents ?? 'Unavailable'}</strong><span>events retained</span><small>Maximum {observability?.retention?.maxEvents ?? 'Unavailable'}</small></div><p className="service-note">{observability?.scope ?? 'Scope unavailable'}. {observability?.reset ?? 'Reset behavior unavailable'}. These values are not historical or lifetime statistics.</p></section>
      <section className="surface-card"><div className="card-heading"><div><p className="eyebrow">SANITIZED ERRORS</p><h2>Recent error categories</h2></div><StatusBadge tone="neutral">Bounded</StatusBadge></div>{observability?.recentErrorCategories?.length ? <div className="error-category-list">{observability.recentErrorCategories.map((category) => <span key={category}><Icon name="alert" size={14}/>{category}</span>)}</div> : <p className="service-note">{observability ? 'No retained error categories.' : 'Error categories unavailable while observability is offline.'}</p>}</section>
    </div>
    <p className="scope-note"><Icon name="shield" size={14}/> No API credentials, system prompts, raw exception text, or transaction authorization capabilities are exposed by this view.</p>
  </div>
}
