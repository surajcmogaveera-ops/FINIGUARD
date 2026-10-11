import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchJson, isAuditEvent, isEventPage, isRecord, isVerdict } from './api.js'
import { Icon, StatusBadge } from './components/Primitives.jsx'
import { Sidebar } from './components/Sidebar.jsx'
import Overview from './components/Overview.jsx'
import Inspector from './components/Inspector.jsx'
import AuditExplorer from './components/AuditExplorer.jsx'
import Operations from './components/Operations.jsx'
import Evaluation from './components/Evaluation.jsx'

const viewTitles = { overview: 'Security overview', inspector: 'Request inspector', audit: 'Audit explorer', operations: 'Operations', evaluation: 'Evaluation' }

export default function App() {
  const [view, setView] = useState('overview')
  const [health, setHealth] = useState(null)
  const [observability, setObservability] = useState(null)
  const [recentEvents, setRecentEvents] = useState([])
  const [dashboardLoading, setDashboardLoading] = useState(true)
  const [dashboardErrors, setDashboardErrors] = useState({})
  const [result, setResult] = useState(null)
  const [resultError, setResultError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resultEvents, setResultEvents] = useState([])
  const [timelineState, setTimelineState] = useState({ loading: false, error: '', complete: false, truncated: false })
  const [auditHandoff, setAuditHandoff] = useState({ event: null, requestId: '' })
  const analysisSequence = useRef(0)
  const analysisController = useRef(null)
  const timelineSequence = useRef(0)
  const refreshSequence = useRef(0)

  const refreshData = useCallback(async () => {
    const sequence = ++refreshSequence.current
    setDashboardLoading(true)
    const results = await Promise.allSettled([
      fetchJson('/health'),
      fetchJson('/observability'),
      fetchJson('/audit/events?limit=8'),
    ])
    if (sequence !== refreshSequence.current) return
    const nextErrors = {}
    const healthResult = results[0]
    if (healthResult.status === 'fulfilled' && isRecord(healthResult.value.data) && typeof healthResult.value.data.status === 'string') setHealth(healthResult.value.data)
    else { setHealth(null); nextErrors.health = true }
    const observabilityResult = results[1]
    if (observabilityResult.status === 'fulfilled' && isRecord(observabilityResult.value.data) && isRecord(observabilityResult.value.data.counts)) setObservability(observabilityResult.value.data)
    else { setObservability(null); nextErrors.observability = true }
    const eventResult = results[2]
    if (eventResult.status === 'fulfilled' && isEventPage(eventResult.value.data)) setRecentEvents(eventResult.value.data.items)
    else { setRecentEvents([]); nextErrors.events = true }
    if (nextErrors.health && nextErrors.observability) nextErrors.summary = 'Backend status and operational metrics are currently unavailable.'
    setDashboardErrors(nextErrors)
    setDashboardLoading(false)
  }, [])

  useEffect(() => { void refreshData() }, [refreshData])
  useEffect(() => () => analysisController.current?.abort(), [])

  const loadTimeline = useCallback(async (requestId) => {
    if (!requestId) return
    const sequence = ++timelineSequence.current
    setTimelineState({ loading: true, error: '', complete: false, truncated: false })
    try {
      const { data } = await fetchJson(`/audit/requests/${encodeURIComponent(requestId)}`)
      if (sequence !== timelineSequence.current) return
      if (!isRecord(data) || !Array.isArray(data.items) || !data.items.every(isAuditEvent) || typeof data.complete !== 'boolean') throw new Error('Audit timeline response could not be verified.')
      setResultEvents(data.items)
      setTimelineState({ loading: false, error: '', complete: data.complete, truncated: data.truncated === true })
    } catch {
      if (sequence === timelineSequence.current) {
        setResultEvents([])
        setTimelineState({ loading: false, error: 'The verdict was received, but its audit timeline is unavailable.', complete: false, truncated: false })
      }
    }
  }, [])

  const analyze = useCallback(async (payload, idempotencyKey) => {
    analysisController.current?.abort()
    const controller = new AbortController()
    analysisController.current = controller
    const sequence = ++analysisSequence.current
    setView('inspector')
    setBusy(true)
    setResult(null)
    setResultError('')
    setResultEvents([])
    setTimelineState({ loading: true, error: '', complete: false, truncated: false })
    try {
      const { data } = await fetchJson('/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      if (sequence !== analysisSequence.current) return
      if (!isVerdict(data)) throw new Error('The API returned a response that does not match the verdict contract.')
      setResult(data)
      setTimelineState({ loading: true, error: '', complete: false, truncated: false })
      void loadTimeline(data.requestId)
      void refreshData()
    } catch (error) {
      if (sequence !== analysisSequence.current || controller.signal.aborted) return
      setResultError(error.message || 'The backend could not evaluate this request.')
      setTimelineState({ loading: false, error: '', complete: false, truncated: false })
    } finally {
      if (sequence === analysisSequence.current) setBusy(false)
    }
  }, [loadTimeline, refreshData])

  function openEventAudit(nextView, event) {
    setAuditHandoff({ event: event ?? null, requestId: event?.requestId ?? '' })
    setView(nextView)
  }
  const healthConnected = Boolean(health)
  return <div className="app-frame">
    <a className="skip-link" href="#mainContent">Skip to content</a>
    <Sidebar active={view} onNavigate={(next) => { setView(next); if (next !== 'audit') setAuditHandoff({ event: null, requestId: '' }) }} health={health} connected={healthConnected}/>
    <main className="main-area" id="mainContent">
      <header className="topbar"><div className="mobile-brand"><span className="brand-mark"><Icon name="shield" size={18}/></span><span className="mobile-brand-copy"><strong>FINIGUARD</strong><small>Intelligence analyzed. Every action verified.</small></span></div><div className="breadcrumb"><span>Workspace</span><Icon name="chevron" size={13}/><strong>{viewTitles[view]}</strong></div><div className="topbar-actions"><StatusBadge tone={health?.status === 'ok' ? 'green' : health ? 'amber' : 'neutral'} dot>{health?.status === 'ok' ? 'API online' : health ? 'API degraded' : 'API unavailable'}</StatusBadge><button className="topbar-refresh" onClick={refreshData} disabled={dashboardLoading} aria-label="Refresh backend status"><Icon name="refresh" size={15}/></button></div></header>
      <div className="page-content">
        <div className="page-view" hidden={view !== 'overview'}><Overview health={health} observability={observability} events={recentEvents} dashboardLoading={dashboardLoading} errors={dashboardErrors} result={result} onRefresh={refreshData} onNavigate={setView} onOpenEvent={openEventAudit}/></div>
        <div className="page-view" hidden={view !== 'inspector'}><Inspector health={health} result={result} resultError={resultError} resultEvents={resultEvents} timelineState={timelineState} busy={busy} onAnalyze={analyze} onRefreshTimeline={() => loadTimeline(result?.requestId)}/></div>
        <div className="page-view" hidden={view !== 'audit'}><AuditExplorer active={view === 'audit'} initialEvent={auditHandoff.event} initialRequestId={auditHandoff.requestId}/></div>
        <div className="page-view" hidden={view !== 'operations'}><Operations health={health} observability={observability} onRefresh={refreshData} refreshing={dashboardLoading} errors={dashboardErrors}/></div>
        <div className="page-view" hidden={view !== 'evaluation'}><Evaluation evaluation={observability?.evaluation}/></div>
      </div>
      <footer className="app-footer"><span>FINIGUARD <i/> AI SECURITY FIREWALL</span><span>Synthetic environment · No real banking connections</span></footer>
    </main>
  </div>
}
