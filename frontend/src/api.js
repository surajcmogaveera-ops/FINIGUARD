const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim()
const API_BASE = (configuredApiBase || '/api/v1').replace(/\/+$/, '')
const REQUEST_TIMEOUT_MS = 10_000

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function fetchJson(path, { signal, ...options } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...options, signal: controller.signal })
    let data
    try { data = await response.json() } catch { throw new ApiError('The service returned an unreadable response.', response.status) }
    if (!response.ok && !(typeof data?.decision === 'string')) {
      throw new ApiError(response.status >= 500 ? 'The service could not complete this request.' : 'The request was rejected by the service.', response.status)
    }
    return { data, status: response.status, headers: response.headers }
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (controller.signal.aborted) throw new ApiError('The request timed out or was cancelled.')
    throw new ApiError('Could not reach the FINIGUARD API.')
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

export function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }
export function isVerdict(value) {
  const transaction = value?.simulatedTransaction
  const ai = value?.aiAnalysis
  const validOptionalString = (record, key) => record[key] === undefined || typeof record[key] === 'string'
  return isRecord(value)
    && typeof value.decision === 'string'
    && typeof value.outcome === 'string'
    && typeof value.reasonCode === 'string'
    && typeof value.riskLevel === 'string'
    && typeof value.rationale === 'string'
    && isRecord(transaction)
    && typeof transaction.executed === 'boolean'
    && ['transactionId', 'currency', 'recipient'].every((key) => validOptionalString(transaction, key))
    && ['amount', 'balanceAfter', 'balance'].every((key) => transaction[key] === undefined || typeof transaction[key] === 'number' && Number.isFinite(transaction[key]))
    && Array.isArray(value.checks)
    && value.checks.every((check) => isRecord(check) && typeof check.id === 'string' && typeof check.status === 'string' && typeof check.label === 'string' && typeof check.detail === 'string')
    && (value.requestId === undefined || typeof value.requestId === 'string')
    && (value.threatFindings === undefined || Array.isArray(value.threatFindings) && value.threatFindings.every((finding) => isRecord(finding) && typeof finding.category === 'string'))
    && (value.policyDecision === undefined || isRecord(value.policyDecision) && typeof value.policyDecision.decision === 'string' && typeof value.policyDecision.reasonCode === 'string')
    && (ai === undefined || isRecord(ai) && typeof ai.status === 'string' && validOptionalString(ai, 'providerStatus') && validOptionalString(ai, 'provider') && validOptionalString(ai, 'message') && (ai.output === null || ai.output === undefined || isRecord(ai.output) && typeof ai.output.threatCategory === 'string' && typeof ai.output.recommendedAction === 'string' && Array.isArray(ai.output.findings) && ai.output.findings.every((finding) => isRecord(finding) && typeof finding.category === 'string')))
}
export function isEventPage(value) {
  return isRecord(value) && Array.isArray(value.items) && value.items.every(isAuditEvent) && isRecord(value.pagination) && Number.isFinite(value.pagination.total) && Number.isFinite(value.pagination.limit) && Number.isFinite(value.pagination.offset) && typeof value.pagination.hasMore === 'boolean'
}
export function isAuditEvent(value) {
  return isRecord(value)
    && typeof value.eventId === 'string'
    && typeof value.requestId === 'string'
    && typeof value.eventType === 'string'
    && typeof value.timestamp === 'string'
    && Number.isFinite(Date.parse(value.timestamp))
    && Number.isInteger(value.sequence)
    && Array.isArray(value.threatCategories) && value.threatCategories.every((item) => typeof item === 'string')
    && Array.isArray(value.aiFindingCategories) && value.aiFindingCategories.every((item) => typeof item === 'string')
    && ['stage', 'decision', 'outcome', 'reasonCode', 'aiStatus', 'executionStatus', 'transactionReference', 'errorCategory', 'originalRequestId'].every((key) => value[key] === undefined || typeof value[key] === 'string')
    && typeof value.stateChanged === 'boolean'
}
export function encodeQuery(values) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) if (value !== '' && value !== undefined && value !== null) query.set(key, String(value))
  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}
