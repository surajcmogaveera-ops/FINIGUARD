import { randomUUID } from 'node:crypto'

export const AUDIT_SCHEMA_VERSION = 1
export const MAX_AUDIT_RECORDS = 100
export const MAX_AUDIT_EVENTS = 1000
const records = []
const events = []

function safeEnum(value, fallback = 'UNKNOWN') {
  if (typeof value !== 'string') return fallback
  const normalized = value.toUpperCase()
  return /^[A-Z0-9_]{1,48}$/.test(normalized) ? normalized : fallback
}

// Event fields are allowlisted and evidence is represented by stable categories, never raw user text.
export function addAuditEvent(input) {
  const event = {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    eventId: randomUUID(),
    requestId: input.requestId,
    sequence: Number.isInteger(input.sequence) && input.sequence > 0 ? input.sequence : 1,
    timestamp: input.timestamp ?? new Date().toISOString(),
    eventType: safeEnum(input.eventType),
    stage: safeEnum(input.stage),
    decision: input.decision ? safeEnum(input.decision) : undefined,
    outcome: input.outcome ? safeEnum(input.outcome) : undefined,
    reasonCode: input.reasonCode ? safeEnum(input.reasonCode) : undefined,
    threatCategories: Array.isArray(input.threatCategories) ? [...new Set(input.threatCategories.map((x) => safeEnum(x)).slice(0, 12))] : [],
    aiStatus: input.aiStatus ? safeEnum(input.aiStatus) : undefined,
    aiFindingCategories: Array.isArray(input.aiFindingCategories) ? [...new Set(input.aiFindingCategories.map((x) => safeEnum(x)).slice(0, 12))] : [],
    executionStatus: input.executionStatus ? safeEnum(input.executionStatus) : undefined,
    transactionReference: typeof input.transactionReference === 'string' && /^SIM-[0-9a-f-]{36}$/i.test(input.transactionReference) ? input.transactionReference : undefined,
    stateChanged: input.stateChanged === true,
    errorCategory: input.errorCategory ? safeEnum(input.errorCategory) : undefined,
    originalRequestId: typeof input.originalRequestId === 'string' && /^[0-9a-f-]{36}$/i.test(input.originalRequestId) ? input.originalRequestId : undefined,
  }
  events.unshift(Object.fromEntries(Object.entries(event).filter(([, value]) => value !== undefined)))
  if (events.length > MAX_AUDIT_EVENTS) events.length = MAX_AUDIT_EVENTS
  return { ...events[0], threatCategories: [...events[0].threatCategories], aiFindingCategories: [...events[0].aiFindingCategories] }
}

export function addAuditRecord(record) {
  const safeRecord = {
    id: record.id, requestId: record.requestId, timestamp: record.timestamp,
    decision: record.decision, outcome: record.outcome, reasonCode: record.reasonCode,
    riskLevel: record.riskLevel, threatCategory: record.threatCategory,
    rationale: record.rationale, checks: record.checks,
    transactionRequested: record.transactionRequested, transactionExecuted: record.transactionExecuted,
    executionStatus: record.executionStatus,
  }
  records.unshift(safeRecord)
  if (records.length > MAX_AUDIT_RECORDS) records.length = MAX_AUDIT_RECORDS
}

export function getAuditRecords() { return records.map((record) => ({ ...record })) }
export function getAuditEvents() { return events.map((event) => ({ ...event, threatCategories: [...event.threatCategories], aiFindingCategories: [...event.aiFindingCategories] })) }
export function resetAuditRecords() { records.length = 0; events.length = 0 }
