import { EmptyState, Icon, MetricCard, StatusBadge } from './Primitives.jsx'
import { SecurityScene, SecuritySceneStatus } from './SecurityScene.jsx'

function decisionTone(event) {
  if (event.eventType === 'TRANSACTION_EXECUTED' || event.decision === 'APPROVED') return 'green'
  if (event.decision === 'BLOCKED' || event.eventType === 'TRANSACTION_FAILED') return 'red'
  if (event.decision === 'REVIEW' || event.eventType === 'TRANSACTION_NOT_EXECUTED') return 'amber'
  return 'neutral'
}

function displayEvent(event) {
  return event.eventType?.replaceAll('_', ' ') ?? 'SECURITY EVENT'
}

function ActivityList({ events, loading, error, onOpenAudit }) {
  if (loading) return <div className="skeleton-stack" aria-label="Loading recent security activity"><span/><span/><span/><span/></div>
  if (error) return <p className="subtle-error">Recent activity is unavailable while the audit service cannot be reached.</p>
  if (!events?.length) return <EmptyState title="No security activity yet" detail="Events appear here after the backend evaluates requests." action={<button className="inline-link" onClick={() => onOpenAudit('inspector')}>Inspect a request <Icon name="arrow" size={14}/></button>}/>
  return <div className="activity-list">{events.slice(0, 8).map((event) => <button key={event.eventId} className="activity-row" onClick={() => onOpenAudit('audit', event)}>
    <span className={`activity-mark tone-${decisionTone(event)}`}><Icon name={event.eventType === 'TRANSACTION_EXECUTED' ? 'check' : event.decision === 'BLOCKED' ? 'alert' : 'list'} size={15}/></span>
    <span className="activity-copy"><strong>{displayEvent(event)}</strong><small>{event.reasonCode ?? event.stage ?? 'Recorded event'} · {event.requestId?.slice(0, 8) ?? 'No ID'}</small></span>
    <span className="activity-meta"><StatusBadge tone={decisionTone(event)}>{event.decision ?? event.executionStatus ?? 'RECORDED'}</StatusBadge><time>{event.timestamp ? new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</time></span>
  </button>)}</div>
}

export default function Overview({ health, observability, events, dashboardLoading, errors, result, onRefresh, onNavigate, onOpenEvent }) {
  const counts = observability?.counts
  const available = Boolean(observability)
  const value = (key) => available && Number.isFinite(counts?.[key]) ? counts[key].toLocaleString() : 'Unavailable'
  const threatRows = Object.entries(events.flatMap((event) => event.threatCategories ?? []).filter((category) => category !== 'NONE').reduce((totals, category) => ({ ...totals, [category]: (totals[category] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 4)
  const threatScale = Math.max(0, ...threatRows.map(([, total]) => total))
  return <div className="page-stack">
    <section className="security-hero" aria-labelledby="heroTitle">
      <SecurityScene health={health} result={result}/>
      <div className="security-hero-content"><SecuritySceneStatus health={health} result={result} onInspect={() => onNavigate('inspector')}/>
        <button className="hero-refresh" onClick={onRefresh} disabled={dashboardLoading} aria-label={dashboardLoading ? 'Refreshing live service data' : 'Refresh live service data'}><Icon name="refresh" size={14}/>{dashboardLoading ? 'Refreshing live data' : 'Refresh live data'}</button>
      </div>
    </section>
    <div className="overview-section-heading"><div><p className="eyebrow">SECURITY OPERATIONS / LIVE OVERVIEW</p><h2>Gateway activity</h2></div><span className="overview-scope"><Icon name="clock" size={13}/> Process-local data</span></div>
    {errors?.summary && <div className="banner banner-amber"><Icon name="alert" size={17}/><span>{errors.summary}</span></div>}
    <div className="metric-grid">
      <MetricCard label="Requests observed" value={value('requests')} note="Retained event scope · process resets on restart" icon="list"/>
      <MetricCard label="Approved decisions" value={value('approved')} note="Decision count from retained events" icon="shield" tone="green"/>
      <MetricCard label="Threats blocked" value={value('blocked')} note="Blocked by deterministic policy" icon="alert" tone="red"/>
      <MetricCard label="Transactions executed" value={value('successfulTransactions')} note="Successful simulated ledger writes" icon="check" tone="green"/>
    </div>
    <div className="overview-grid">
      <section className="surface-card activity-card">
        <div className="card-heading"><div><p className="eyebrow">AUDIT STREAM</p><h2>Recent security activity</h2></div><button className="text-button" onClick={() => onNavigate('audit')}>Explore events <Icon name="arrow" size={14}/></button></div>
        <ActivityList events={events} loading={dashboardLoading && !events.length} error={errors?.events} onOpenAudit={onOpenEvent}/>
      </section>
      <div className="overview-side">
        <section className="surface-card service-card">
          <div className="card-heading"><div><p className="eyebrow">SERVICE STATUS</p><h2>Gateway health</h2></div><span className={`service-light ${health?.status === 'ok' ? 'is-up' : ''}`}/></div>
          {health ? <>
            <div className="service-line"><span>API status</span><StatusBadge tone={health.status === 'ok' ? 'green' : 'amber'} dot>{health.status === 'ok' ? 'Operational' : health.status}</StatusBadge></div>
            <div className="service-line"><span>AI analysis</span><StatusBadge tone={health.ai?.status === 'enabled' ? 'cyan' : health.ai?.status === 'disabled' ? 'neutral' : 'amber'}>{health.ai?.status ?? 'Unavailable'}</StatusBadge></div>
            <p className="service-note">{health.ai?.status === 'disabled' ? 'Deterministic checks remain active. AI analysis is disabled.' : health.ai?.status === 'unavailable' ? 'Provider is not configured. Deterministic-only analysis remains available.' : health.ai?.status === 'enabled' ? 'Provider is configured. AI findings remain advisory.' : 'AI service status is unavailable.'}</p>
          </> : <p className="service-note">Backend health data is unavailable. No service status is assumed.</p>}
        </section>
        <section className="surface-card threat-card">
          <div className="card-heading"><div><p className="eyebrow">DETECTION SIGNALS</p><h2>Recent categories</h2></div><span className="signal-count">{threatRows.length}</span></div>
          {threatRows.length ? <div className="threat-signal-chart" aria-label="Threat category counts from retained event records">{threatRows.map(([category, total]) => <div className="threat-signal-row" key={category}><span>{category.replaceAll('_', ' ')}</span><div><i style={{ width: `${(total / threatScale) * 100}%` }}/></div><strong>{total}</strong></div>)}</div> : <p className="service-note">{events.length ? 'No threat categories in the currently retained activity.' : 'Threat categories will appear when matching events are recorded.'}</p>}
          <div className="threat-foot"><span>Failed transactions</span><strong>{value('failedTransactions')}</strong></div>
        </section>
        <button className="inspect-cta" onClick={() => onNavigate('inspector')}><span className="cta-icon"><Icon name="scan"/></span><span><strong>Inspect a request</strong><small>Run untrusted input through the real security pipeline</small></span><Icon name="chevron" size={17}/></button>
      </div>
    </div>
    <p className="scope-note"><Icon name="clock" size={14}/> Metrics describe retained in-memory backend events only. They reset when the backend restarts and are not lifetime totals.</p>
  </div>
}
