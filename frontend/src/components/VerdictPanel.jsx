import { Icon, StatusBadge } from './Primitives.jsx'

function humanize(value) { return typeof value === 'string' ? value.replaceAll('_', ' ') : 'Unknown' }
function decisionTone(result) {
  if (result?.decision === 'APPROVED') return 'green'
  if (result?.decision === 'BLOCKED') return 'red'
  if (result?.outcome === 'INVALID_REQUEST') return 'neutral'
  if (result?.decision === 'REVIEW') return 'amber'
  return 'neutral'
}
function outcomeLabel(result) {
  if (result.outcome === 'REVIEW_REQUIRED') return 'REVIEW REQUIRED'
  if (result.outcome === 'INVALID_REQUEST') return 'INVALID REQUEST'
  return humanize(result.outcome || result.decision).toUpperCase()
}

export function VerdictPanel({ result, error, onReplay, canReplay, CopyId }) {
  const tone = decisionTone(result)
  const replay = result?.replayed === true
  const execution = replay ? result?.currentRequestExecution?.executed === true : result?.simulatedTransaction?.executed === true && result?.executionStatus === 'EXECUTED'
  return <section className="surface-card verdict-card" aria-labelledby="verdictTitle" aria-live="polite">
    <div className="card-heading"><div><p className="eyebrow">SERVER RESPONSE / FINAL OUTCOME</p><h2 id="verdictTitle">Security verdict</h2></div>{result && <StatusBadge tone={tone} dot>{outcomeLabel(result)}</StatusBadge>}</div>
    {error ? <div className="result-empty result-error" role="alert"><span className="result-icon"><Icon name="alert"/></span><strong>Backend result unavailable</strong><p>{error}</p><small>No transaction outcome is assumed.</small></div> : !result ? <div className="result-empty"><span className="result-icon"><Icon name="shield"/></span><strong>Awaiting request</strong><p>The backend decision and execution result will appear here.</p></div> : <div className="verdict-body">
      <div className={`verdict-banner verdict-${tone}`}><span className="verdict-symbol"><Icon name={tone === 'green' ? 'check' : tone === 'red' ? 'alert' : tone === 'amber' ? 'clock' : 'list'} size={19}/></span><div><strong>{outcomeLabel(result)}</strong><p>{result.rationale || 'The backend returned a decision without a rationale.'}</p></div></div>
      {result.replayed && <div className="replay-callout"><Icon name="refresh" size={15}/><span>Idempotent replay of the original request. This attempt did not execute another transfer.</span></div>}
      {Array.isArray(result.threatFindings) && result.threatFindings.length > 0 && <div className="finding-summary"><div className="finding-header"><Icon name="alert" size={15}/><strong>Deterministic threat findings</strong><span>{result.threatFindings.length}</span></div><div className="finding-categories">{[...new Set(result.threatFindings.map((finding) => finding.category).filter(Boolean))].map((category) => <StatusBadge key={category} tone="red">{humanize(category)}</StatusBadge>)}</div><p>Matched rule types are shown without echoing submitted text.</p></div>}
      <div className="verdict-facts">
        <div className="verdict-fact"><span>Policy decision</span><strong>{humanize(result.policyDecision?.decision ?? result.decision)}</strong><small>{humanize(result.policyDecision?.reasonCode ?? result.reasonCode)}</small></div>
        <div className="verdict-fact"><span>AI analysis</span><strong>{humanize(result.aiAnalysis?.providerStatus ?? result.aiAnalysis?.status ?? 'Unavailable')}</strong><small>{result.aiAnalysis?.provider ? `Provider: ${result.aiAnalysis.provider}` : 'No provider information returned'}</small></div>
        <div className="verdict-fact"><span>Transaction status</span><strong>{replay ? 'Replay · no new execution' : execution ? 'Executed' : result.executionStatus === 'READ_ONLY' ? 'Read only' : result.executionStatus === 'FAILED' ? 'Failed · no success recorded' : result.simulatedTransaction?.requested ? 'Not executed' : 'Not requested'}</strong><small>{execution ? result.simulatedTransaction?.transactionId ?? 'Simulated transfer recorded' : replay ? 'Original result retained; current state unchanged' : 'Execution status from backend response'}</small></div>
      </div>
      {result.aiAnalysis && <div className="ai-summary"><div className="subsection-heading"><span className="ai-indicator"><Icon name="pulse" size={14}/></span><strong>Optional AI interpretation</strong><StatusBadge tone={result.aiAnalysis.status === 'valid' ? 'cyan' : result.aiAnalysis.status === 'failed' ? 'amber' : 'neutral'}>{humanize(result.aiAnalysis.status ?? result.aiAnalysis.providerStatus)}</StatusBadge></div><p>{result.aiAnalysis.message || (result.aiAnalysis.output ? `${humanize(result.aiAnalysis.output.threatCategory)} · ${humanize(result.aiAnalysis.output.recommendedAction)} recommendation` : 'AI details are not available.')}</p>{result.aiAnalysis.output && <small>Finding categories: {result.aiAnalysis.output.findings?.length ? [...new Set(result.aiAnalysis.output.findings.map((item) => humanize(item.category)))].join(', ') : 'None reported'}. AI output is advisory.</small>}</div>}
      {execution && <div className="execution-confirmed"><span className="execution-check"><Icon name="check" size={15}/></span><div><strong>Simulated transfer confirmed</strong><p>₹{result.simulatedTransaction.amount} {result.simulatedTransaction.currency} · {result.simulatedTransaction.recipient} · balance after ₹{result.simulatedTransaction.balanceAfter}</p></div></div>}
      {result.executionStatus === 'READ_ONLY' && <div className="execution-readonly"><span><Icon name="grid" size={15}/></span><div><strong>Read-only balance inquiry</strong><p>Simulated balance ₹{result.simulatedTransaction?.balance ?? 'Unavailable'} {result.simulatedTransaction?.currency ?? ''}</p></div></div>}
      {result.requestId && <div className="correlation-row"><div><span>REQUEST CORRELATION ID</span><code>{result.requestId}</code></div><CopyId value={result.requestId}/></div>}
      <details className="verdict-details"><summary>Decision details <Icon name="chevron" size={14}/></summary><div className="detail-list"><div><span>Final decision</span><strong>{humanize(result.decision)}</strong></div><div><span>Outcome</span><strong>{humanize(result.outcome)}</strong></div><div><span>Reason code</span><strong>{result.reasonCode || 'Unavailable'}</strong></div><div><span>Audit record ID</span><code>{result.auditId || 'Unavailable'}</code></div></div></details>
      {canReplay && (replay || execution) && <button className="button button-outline replay-button" onClick={onReplay}><Icon name="refresh" size={15}/> Retry with same idempotency key</button>}
    </div>}
  </section>
}
