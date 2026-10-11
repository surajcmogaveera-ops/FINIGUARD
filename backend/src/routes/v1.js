import { Router } from 'express'
import { AUDIT_SCHEMA_VERSION, MAX_AUDIT_EVENTS, getAuditEvents, getAuditRecords } from '../audit/audit-store.js'
import { evaluateRequest } from '../services/evaluate-request.js'
import { getAIProviderStatus } from '../ai/analyzer.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DECISIONS = new Set(['APPROVED', 'BLOCKED', 'REVIEW'])
const OUTCOMES = new Set(['APPROVED', 'BLOCKED', 'REVIEW_REQUIRED', 'INVALID_REQUEST'])
const EVENT_TYPES = new Set(['THREAT_SCAN_COMPLETED', 'AI_ANALYSIS_COMPLETED', 'POLICY_DECIDED', 'TRANSACTION_EXECUTED', 'TRANSACTION_NOT_EXECUTED', 'TRANSACTION_FAILED', 'REQUEST_COMPLETED', 'REQUEST_REJECTED', 'REQUEST_FAILED', 'IDEMPOTENT_REPLAY'])
const CATEGORIES = new Set(['NONE', 'INSTRUCTION_OVERRIDE', 'ROLEPLAY_JAILBREAK', 'MEMO_INJECTION', 'OBFUSCATION', 'DATA_EXFILTRATION', 'POLICY_BYPASS', 'AMBIGUOUS_INTENT', 'DETECTION_ERROR'])
function invalid(response) { response.status(400).json({ error: 'Invalid audit query.', code: 'INVALID_AUDIT_QUERY' }); return null }
function integer(value, fallback, max) {
  if (value === undefined) return fallback
  if (!/^\d{1,7}$/.test(value)) return null
  const parsed = Number(value)
  return parsed <= max ? parsed : null
}
function filterEvents(request, response) {
  const q = request.query
  const allowed = new Set(['requestId', 'decision', 'outcome', 'eventType', 'threatCategory', 'from', 'to', 'limit', 'offset'])
  if (Object.keys(q).some((key) => !allowed.has(key))) return invalid(response)
  if (q.requestId !== undefined && !uuid.test(q.requestId)) return invalid(response)
  if (q.decision !== undefined && !DECISIONS.has(q.decision)) return invalid(response)
  if (q.outcome !== undefined && !OUTCOMES.has(q.outcome)) return invalid(response)
  if (q.eventType !== undefined && !EVENT_TYPES.has(q.eventType)) return invalid(response)
  if (q.threatCategory !== undefined && !CATEGORIES.has(q.threatCategory)) return invalid(response)
  for (const key of ['from', 'to']) if (q[key] !== undefined && (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(q[key]) || Number.isNaN(Date.parse(q[key])))) return invalid(response)
  if (q.from && q.to && Date.parse(q.from) > Date.parse(q.to)) return invalid(response)
  const limit = integer(q.limit, 25, 100), offset = integer(q.offset, 0, 100000)
  if (limit === null || limit < 1 || offset === null) return invalid(response)
  let items = getAuditEvents()
  if (q.requestId) items = items.filter((x) => x.requestId === q.requestId || x.originalRequestId === q.requestId)
  if (q.decision) items = items.filter((x) => x.decision === q.decision)
  if (q.outcome) items = items.filter((x) => x.outcome === q.outcome)
  if (q.eventType) items = items.filter((x) => x.eventType === q.eventType)
  if (q.threatCategory) items = items.filter((x) => x.threatCategories.includes(q.threatCategory))
  if (q.from) items = items.filter((x) => Date.parse(x.timestamp) >= Date.parse(q.from))
  if (q.to) items = items.filter((x) => Date.parse(x.timestamp) <= Date.parse(q.to))
  return { items: items.slice(offset, offset + limit), total: items.length, limit, offset }
}

export function createV1Router() {
  const router = Router()
  router.get('/health', (request, response) => response.json({ status: 'ok', service: 'bankism-api', version: 'v1', ai: getAIProviderStatus() }))
  router.post('/evaluate', async (request, response, next) => {
    try {
      const result = await evaluateRequest(request.body, { idempotencyKey: request.get('Idempotency-Key'), requestId: request.requestId })
      response.status(result.httpStatus).json(result.verdict)
    } catch (error) { next(error) }
  })
  router.get('/audit', (request, response) => response.json({ storage: 'in-memory', records: getAuditRecords() }))
  router.get('/audit/events', (request, response) => {
    const result = filterEvents(request, response)
    if (!result) return
    response.json({ schemaVersion: AUDIT_SCHEMA_VERSION, storage: 'in-memory', items: result.items, pagination: { total: result.total, limit: result.limit, offset: result.offset, hasMore: result.offset + result.items.length < result.total } })
  })
  router.get('/audit/events/:eventId', (request, response) => {
    if (!uuid.test(request.params.eventId)) return invalid(response)
    const event = getAuditEvents().find((item) => item.eventId === request.params.eventId)
    return event ? response.json({ schemaVersion: AUDIT_SCHEMA_VERSION, event }) : response.status(404).json({ error: 'Audit event not found.', code: 'AUDIT_EVENT_NOT_FOUND' })
  })
  router.get('/audit/requests/:requestId', (request, response) => {
    if (!uuid.test(request.params.requestId)) return invalid(response)
    const timeline = getAuditEvents().filter((event) => event.requestId === request.params.requestId || event.originalRequestId === request.params.requestId).sort((a, b) => a.sequence - b.sequence)
    const complete = timeline.some((x) => x.requestId === request.params.requestId && x.sequence === 1) && timeline.some((x) => x.requestId === request.params.requestId && x.eventType === 'REQUEST_COMPLETED')
    response.json({ schemaVersion: AUDIT_SCHEMA_VERSION, requestId: request.params.requestId, items: timeline, complete, truncated: !complete })
  })
  router.get('/observability', (request, response) => {
    if (Object.keys(request.query).length) return invalid(response)
    const events = getAuditEvents()
    const decisions = events.filter((e) => e.eventType === 'REQUEST_COMPLETED' || e.eventType === 'REQUEST_REJECTED' || e.eventType === 'REQUEST_FAILED')
    const count = (predicate) => events.filter(predicate).length
      const replayCount = count((e) => e.eventType === 'IDEMPOTENT_REPLAY')
      response.json({ scope: 'retained in-memory backend events', reset: 'Backend restart or event retention limit', retention: { maxEvents: MAX_AUDIT_EVENTS, retainedEvents: events.length }, ai: getAIProviderStatus(), counts: { requests: decisions.length + replayCount, decisions: decisions.length, approved: decisions.filter((e) => e.decision === 'APPROVED').length, blocked: decisions.filter((e) => e.decision === 'BLOCKED').length, review: decisions.filter((e) => e.decision === 'REVIEW').length, successfulTransactions: count((e) => e.eventType === 'TRANSACTION_EXECUTED' && e.stateChanged), failedTransactions: count((e) => e.eventType === 'TRANSACTION_FAILED'), detectorFailures: count((e) => e.eventType === 'THREAT_SCAN_COMPLETED' && e.errorCategory === 'DETECTOR_FAILURE'), providerFailures: count((e) => e.eventType === 'AI_ANALYSIS_COMPLETED' && e.aiStatus === 'FAILED'), idempotentReplays: replayCount }, recentErrorCategories: [...new Set(events.filter((e) => e.errorCategory).map((e) => e.errorCategory))].slice(0, 10), evaluation: { available: false, reason: 'Evaluation results are produced by a separate command and are not live service data.' } })
  })
  return router
}
