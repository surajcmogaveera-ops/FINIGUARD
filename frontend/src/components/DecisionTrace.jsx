import { Icon, StatusBadge } from './Primitives.jsx'

const toneByStatus = {
  passed: 'green', clear: 'green', authorized: 'green',
  flagged: 'red', failed: 'red', denied: 'red',
  review: 'amber', not_run: 'neutral', not_requested: 'neutral',
}
const iconByTone = { green: 'check', red: 'alert', amber: 'clock', neutral: 'clock', cyan: 'list' }

function statusLabel(status) {
  return status === 'not_run' ? 'Not run' : status === 'not_requested' ? 'Not requested' : status.replaceAll('_', ' ')
}

function toneFor(status) { return toneByStatus[status] ?? 'cyan' }

function TraceEvent({ event }) {
  const status = event.eventType === 'TRANSACTION_EXECUTED' && event.stateChanged ? 'executed' : event.decision === 'BLOCKED' ? 'blocked' : event.decision === 'REVIEW' ? 'review' : event.eventType.replaceAll('_', ' ').toLowerCase()
  const tone = event.eventType === 'TRANSACTION_EXECUTED' && event.stateChanged ? 'green' : event.decision === 'BLOCKED' ? 'red' : event.decision === 'REVIEW' || event.eventType === 'TRANSACTION_NOT_EXECUTED' ? 'amber' : 'cyan'
  return <li className="trace-step trace-event" key={event.eventId}>
    <span className={`trace-node trace-${tone}`}><Icon name={iconByTone[tone] ?? 'list'} size={13}/></span>
    <div className="trace-content"><strong>{event.stage?.replaceAll('_', ' ') ?? event.eventType.replaceAll('_', ' ')}</strong><p>{[event.reasonCode, event.aiStatus && `AI ${event.aiStatus.toLowerCase()}`, event.executionStatus && `Execution ${event.executionStatus.toLowerCase()}`, event.transactionReference && `Ref ${event.transactionReference}`].filter(Boolean).join(' · ') || event.eventType?.replaceAll('_', ' ')}</p><time>{event.timestamp ? new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Timestamp unavailable'}</time></div>
    <StatusBadge tone={tone}>{status}</StatusBadge>
  </li>
}

export function DecisionTrace({ result, events, state, onRefresh }) {
  const checks = Array.isArray(result?.checks) ? result.checks : []
  const hasEvidence = checks.length > 0 || events?.length > 0
  return <section className="surface-card trace-card" aria-labelledby="traceTitle">
    <div className="card-heading"><div><p className="eyebrow">CORRELATED SECURITY PIPELINE</p><h2 id="traceTitle">Decision trace</h2></div>{result?.requestId && <button className="icon-button" onClick={onRefresh} title="Refresh request timeline" aria-label="Refresh request timeline" disabled={state?.loading}><Icon name="refresh" size={15}/></button>}</div>
    {!result ? <div className="trace-empty"><Icon name="list" size={18}/><p>Run a request to view the stages returned by the backend.</p></div> : <>
      {checks.length > 0 && <ol className="trace-list check-trace">
        {checks.map((check) => {
          const tone = toneFor(check.status)
          return <li className="trace-step" key={check.id}>
            <span className={`trace-node trace-${tone}`}><Icon name={iconByTone[tone] ?? 'list'} size={13}/></span>
            <div className="trace-content"><strong>{check.label}</strong><p>{check.detail || 'No stage detail returned.'}</p></div>
            <StatusBadge tone={tone}>{statusLabel(check.status)}</StatusBadge>
          </li>
        })}
      </ol>}
      {state?.loading && <div className="loading-row trace-loading"><span className="small-spinner"/>Correlating retained audit events…</div>}
      {state?.error && <p className="subtle-error">The verdict is available; its audit timeline could not be retrieved.</p>}
      {!hasEvidence && !state?.loading && <div className="trace-empty"><Icon name="alert" size={18}/><p>No stage evidence was returned. No stages are inferred.</p></div>}
      {events?.length > 0 && <ol className="trace-list audit-trace" aria-label="Correlated audit events">{events.map((event) => <TraceEvent event={event} key={event.eventId}/>)}</ol>}
      {state?.truncated && <div className="retention-warning"><Icon name="alert" size={14}/> The backend reports an incomplete timeline; earlier audit events may be outside the retention window.</div>}
      {state?.complete && <p className="trace-footnote"><Icon name="shield" size={13}/> Stages and events shown here came from the backend response and correlated audit record.</p>}
      {result.replayed && <div className="retention-warning"><Icon name="refresh" size={14}/> This request is linked to an earlier transaction. The replay created no new execution.</div>}
    </>}
  </section>
}
