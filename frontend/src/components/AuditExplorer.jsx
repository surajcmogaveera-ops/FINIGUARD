import { useEffect, useRef, useState } from 'react'
import { encodeQuery, fetchJson, isAuditEvent, isEventPage, isRecord } from '../api.js'
import { CopyButton, EmptyState, ErrorState, Icon, SectionHeading, StatusBadge } from './Primitives.jsx'

const PAGE_SIZE = 25
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const eventTypes = ['THREAT_SCAN_COMPLETED', 'AI_ANALYSIS_COMPLETED', 'POLICY_DECIDED', 'TRANSACTION_EXECUTED', 'TRANSACTION_NOT_EXECUTED', 'TRANSACTION_FAILED', 'REQUEST_COMPLETED', 'REQUEST_REJECTED', 'REQUEST_FAILED', 'IDEMPOTENT_REPLAY']
const categories = ['INSTRUCTION_OVERRIDE', 'ROLEPLAY_JAILBREAK', 'MEMO_INJECTION', 'OBFUSCATION', 'DATA_EXFILTRATION', 'POLICY_BYPASS', 'AMBIGUOUS_INTENT', 'DETECTION_ERROR']

function tone(event) {
  if (event.eventType === 'TRANSACTION_EXECUTED' && event.stateChanged || event.decision === 'APPROVED') return 'green'
  if (event.decision === 'BLOCKED' || event.eventType === 'TRANSACTION_FAILED') return 'red'
  if (event.decision === 'REVIEW' || event.eventType === 'TRANSACTION_NOT_EXECUTED') return 'amber'
  return 'neutral'
}
function label(value) { return value ? value.replaceAll('_', ' ') : 'Unavailable' }
function toIso(value) { return value ? new Date(value).toISOString() : '' }

function EventDetail({ event, onClose }) {
  if (!event) return null
  return <section className="surface-card event-detail" aria-labelledby="eventDetailTitle">
    <div className="card-heading"><div><p className="eyebrow">SANITIZED RECORD</p><h2 id="eventDetailTitle">Event detail</h2></div><button className="icon-button" onClick={onClose} aria-label="Close event details">×</button></div>
    <div className="event-detail-top"><StatusBadge tone={tone(event)} dot>{label(event.eventType)}</StatusBadge><time>{new Date(event.timestamp).toLocaleString()}</time></div>
    <dl className="detail-grid">
      <div><dt>Event ID</dt><dd><code>{event.eventId}</code></dd></div>
      <div><dt>Request ID</dt><dd className="copyable-id"><code>{event.requestId}</code><CopyButton value={event.requestId}/></dd></div>
      <div><dt>Schema / sequence</dt><dd>v{event.schemaVersion ?? '—'} · {event.sequence ?? '—'}</dd></div>
      <div><dt>Stage</dt><dd>{label(event.stage)}</dd></div>
      <div><dt>Decision / outcome</dt><dd>{label(event.decision)} · {label(event.outcome)}</dd></div>
      <div><dt>Reason code</dt><dd>{event.reasonCode ?? 'Unavailable'}</dd></div>
      <div><dt>Threat categories</dt><dd>{event.threatCategories?.length ? event.threatCategories.map(label).join(', ') : 'None recorded'}</dd></div>
      <div><dt>AI status / findings</dt><dd>{label(event.aiStatus)} · {event.aiFindingCategories?.length ? event.aiFindingCategories.map(label).join(', ') : 'No finding categories'}</dd></div>
      <div><dt>Execution status</dt><dd>{label(event.executionStatus)}</dd></div>
      <div><dt>Transaction reference</dt><dd><code>{event.transactionReference ?? 'None'}</code></dd></div>
      <div><dt>State changed</dt><dd>{event.stateChanged ? 'Yes' : 'No'}</dd></div>
      <div><dt>Error category</dt><dd>{event.errorCategory ?? 'None'}</dd></div>
      {event.originalRequestId && <div><dt>Original request</dt><dd><code>{event.originalRequestId}</code></dd></div>}
    </dl>
    <p className="privacy-footnote"><Icon name="shield" size={14}/> Raw request text, provider credentials, prompts, and authorization capabilities are not shown.</p>
  </section>
}

function RequestTimeline({ timeline, loading, error, onClose }) {
  if (!timeline && !loading && !error) return null
  return <section className="surface-card timeline-card" aria-labelledby="requestTimelineTitle">
    <div className="card-heading"><div><p className="eyebrow">REQUEST INVESTIGATION</p><h2 id="requestTimelineTitle">Request timeline</h2></div><button className="icon-button" onClick={onClose} aria-label="Close request timeline">×</button></div>
    {loading ? <div className="loading-row"><span className="small-spinner"/>Retrieving timeline…</div> : error ? <ErrorState message={error}/> : timeline && <>
      <div className="timeline-summary"><code>{timeline.requestId}</code><div><CopyButton value={timeline.requestId}/><StatusBadge tone={timeline.complete ? 'green' : 'amber'}>{timeline.complete ? 'Complete' : 'Incomplete'}</StatusBadge></div></div>
      {!timeline.complete && <div className="retention-warning"><Icon name="alert" size={14}/> The retained event history does not contain the full request timeline.</div>}
      {timeline.items.length ? <ol className="trace-list audit-timeline">{timeline.items.map((event) => <li className="trace-step" key={event.eventId}><span className={`trace-node trace-${tone(event)}`}><Icon name={event.eventType === 'TRANSACTION_EXECUTED' ? 'check' : event.eventType === 'TRANSACTION_FAILED' ? 'alert' : 'list'} size={13}/></span><div className="trace-content"><strong>{label(event.eventType)}</strong><p>{event.reasonCode ?? event.executionStatus ?? event.stage ?? 'Recorded event'}</p><time>{new Date(event.timestamp).toLocaleString()}</time></div><StatusBadge tone={tone(event)}>{event.decision ?? event.executionStatus ?? 'RECORDED'}</StatusBadge></li>)}</ol> : <EmptyState title="No retained events" detail="No audit events match this request ID in the current retention window."/>}
    </>}
  </section>
}

export default function AuditExplorer({ active = true, initialEvent, initialRequestId }) {
  const [filters, setFilters] = useState({ decision: '', eventType: '', threatCategory: '', from: '', to: '' })
  const [query, setQuery] = useState(filters)
  const [requestIdInput, setRequestIdInput] = useState(initialRequestId ?? '')
  const [page, setPage] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(initialEvent ?? null)
  const [detailState, setDetailState] = useState({ loading: false, error: '' })
  const [timeline, setTimeline] = useState(null)
  const [timelineState, setTimelineState] = useState({ loading: false, error: '' })
  const [requestError, setRequestError] = useState('')
  const requestSequence = useRef(0)
  const detailSequence = useRef(0)

  useEffect(() => {
    if (!initialEvent) return
    void selectEvent(initialEvent)
    setQuery((current) => ({ ...current, requestId: initialEvent.requestId }))
    setFilters((current) => ({ ...current, requestId: initialEvent.requestId }))
    setRequestIdInput(initialEvent.requestId)
    void lookupTimeline(initialEvent.requestId)
    // Initial event handoff is intentionally performed once per event ID.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEvent?.eventId])

  useEffect(() => {
    if (!active) return undefined
    const controller = new AbortController()
    const sequence = ++requestSequence.current
    setLoading(true)
    setError('')
    const params = { ...query, limit: PAGE_SIZE, offset: page * PAGE_SIZE }
    if (query.from) params.from = toIso(query.from)
    if (query.to) params.to = toIso(query.to)
    fetchJson(`/audit/events${encodeQuery(params)}`, { signal: controller.signal })
      .then(({ data: response }) => {
        if (sequence !== requestSequence.current) return
        if (!isEventPage(response) || !Number.isFinite(response.pagination.total) || !Number.isFinite(response.pagination.limit)) throw new Error('The audit service returned an unexpected response format.')
        setData(response)
      })
      .catch((caught) => { if (!controller.signal.aborted && sequence === requestSequence.current) setError(caught.message || 'Audit events are unavailable.') })
      .finally(() => { if (!controller.signal.aborted && sequence === requestSequence.current) setLoading(false) })
    return () => controller.abort()
  }, [query, page, active])

  async function selectEvent(event) {
    setSelected(null)
    const sequence = ++detailSequence.current
    setDetailState({ loading: true, error: '' })
    try {
      const { data: response } = await fetchJson(`/audit/events/${encodeURIComponent(event.eventId)}`)
      if (sequence !== detailSequence.current) return
      if (!isRecord(response) || !isAuditEvent(response.event)) throw new Error('The event service returned an unexpected response format.')
      setSelected(response.event)
      setDetailState({ loading: false, error: '' })
    } catch (caught) {
      if (sequence === detailSequence.current) setDetailState({ loading: false, error: caught.message || 'Event details are unavailable.' })
    }
  }

  async function lookupTimeline(id = requestIdInput.trim()) {
    setRequestError('')
    if (!UUID.test(id)) { setRequestError('Enter a complete request ID in UUID format.'); return }
    setRequestIdInput(id)
    setTimeline(null)
    setTimelineState({ loading: true, error: '' })
    try {
      const { data: response } = await fetchJson(`/audit/requests/${encodeURIComponent(id)}`)
      if (!isRecord(response) || !Array.isArray(response.items) || !response.items.every(isAuditEvent) || typeof response.complete !== 'boolean') throw new Error('The timeline service returned an unexpected response format.')
      setTimeline(response)
      setTimelineState({ loading: false, error: '' })
      setQuery((current) => ({ ...current, requestId: id }))
      setFilters((current) => ({ ...current, requestId: id }))
      setPage(0)
    } catch (caught) { setTimelineState({ loading: false, error: caught.message || 'Request timeline is unavailable.' }) }
  }

  function applyFilters(event) {
    event.preventDefault()
    setPage(0)
    setQuery({ ...filters })
  }
  const pagination = data?.pagination
  return <div className="page-stack">
    <SectionHeading eyebrow="SECURITY RECORDS / INVESTIGATION" title="Audit explorer" description="Search the bounded, sanitized event store and inspect real request histories." action={<StatusBadge tone="neutral">PROCESS-LOCAL RETENTION</StatusBadge>}/>
    <section className="surface-card filter-card"><div className="card-heading"><div><p className="eyebrow">SERVER-VALIDATED QUERY</p><h2>Filter events</h2></div><span className="step-index">01</span></div>
      <form className="audit-filters" onSubmit={applyFilters}>
        <label className="filter-control filter-request"><span>Request ID lookup</span><div className="request-lookup"><input value={requestIdInput} onChange={(event) => setRequestIdInput(event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" aria-label="Request ID to look up"/><button className="button button-primary" type="button" onClick={() => lookupTimeline()}><Icon name="scan" size={15}/> Find request</button></div></label>
        <label className="filter-control"><span>Decision</span><select value={filters.decision} onChange={(event) => setFilters({ ...filters, decision: event.target.value })}><option value="">All decisions</option><option value="APPROVED">Approved</option><option value="BLOCKED">Blocked</option><option value="REVIEW">Review</option></select></label>
        <label className="filter-control"><span>Event type</span><select value={filters.eventType} onChange={(event) => setFilters({ ...filters, eventType: event.target.value })}><option value="">All event types</option>{eventTypes.map((type) => <option key={type} value={type}>{label(type)}</option>)}</select></label>
        <label className="filter-control"><span>Threat category</span><select value={filters.threatCategory} onChange={(event) => setFilters({ ...filters, threatCategory: event.target.value })}><option value="">All categories</option>{categories.map((category) => <option key={category} value={category}>{label(category)}</option>)}</select></label>
        <label className="filter-control"><span>From (local time)</span><input type="datetime-local" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })}/></label>
        <label className="filter-control"><span>To (local time)</span><input type="datetime-local" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })}/></label>
        <div className="filter-submit"><button className="button button-outline" type="button" onClick={() => { const clean = { decision: '', eventType: '', threatCategory: '', from: '', to: '' }; setFilters(clean); setQuery(clean); setRequestIdInput(''); setTimeline(null); setPage(0) }}>Clear filters</button><button className="button button-primary" type="submit"><Icon name="list" size={15}/> Apply filters</button></div>
      </form>
      {requestError && <div className="inline-error" role="alert"><Icon name="alert" size={15}/>{requestError}</div>}
    </section>

    {(timeline || timelineState.loading || timelineState.error) && <RequestTimeline timeline={timeline} loading={timelineState.loading} error={timelineState.error} onClose={() => { setTimeline(null); setTimelineState({ loading: false, error: '' }) }}/>}
    <div className="audit-layout">
      <section className="surface-card audit-list-card"><div className="card-heading"><div><p className="eyebrow">EVENTS</p><h2>Security event stream</h2></div><span className="event-total">{pagination ? `${pagination.total} matching` : '—'}</span></div>
        {error ? <ErrorState message={error}/> : loading ? <div className="skeleton-stack" aria-label="Loading filtered audit events"><span/><span/><span/></div> : data?.items?.length ? <div className="event-table-wrap"><table className="event-table"><thead><tr><th>Event</th><th>Decision</th><th>Stage / reason</th><th>Time</th><th></th></tr></thead><tbody>{data.items.map((event) => <tr key={event.eventId} className={selected?.eventId === event.eventId ? 'row-selected' : ''}><td><button className="event-open" onClick={() => selectEvent(event)}><strong>{label(event.eventType)}</strong><small>{event.requestId.slice(0, 8)}…</small></button></td><td><StatusBadge tone={tone(event)}>{event.decision ?? event.executionStatus ?? 'RECORDED'}</StatusBadge></td><td><span>{event.reasonCode ?? label(event.stage)}</span>{event.threatCategories?.length > 0 && <small className="table-subline">{event.threatCategories.map(label).join(', ')}</small>}</td><td><time>{new Date(event.timestamp).toLocaleString()}</time></td><td><button className="icon-button" aria-label={`Inspect ${event.eventType} event`} onClick={() => selectEvent(event)}><Icon name="chevron" size={15}/></button></td></tr>)}</tbody></table></div> : <EmptyState title="No matching events" detail="Events will appear after requests are evaluated. Audit records are held in bounded process memory."/>}
        <div className="pagination"><span>{pagination ? `Page ${page + 1} · showing ${data.items.length} of ${pagination.total}` : 'Pagination unavailable'}</span><div><button className="button button-outline" disabled={page === 0 || loading} onClick={() => setPage(Math.max(0, page - 1))}>Previous</button><button className="button button-outline" disabled={!pagination?.hasMore || loading} onClick={() => setPage(page + 1)}>Next</button></div></div>
      </section>
      <div className="detail-column"><EventDetail event={selected} onClose={() => { setSelected(null); detailSequence.current += 1; setDetailState({ loading: false, error: '' }) }}/>{detailState.loading && <p className="loading-row"><span className="small-spinner"/>Retrieving sanitized event detail…</p>}{detailState.error && <ErrorState message={detailState.error}/>} {!selected && !detailState.loading && <EmptyState title="Select an event" detail="Choose a row to inspect its allowlisted security and transaction fields."/>}</div>
    </div>
  </div>
}
