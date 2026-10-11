import { createHash, randomUUID } from 'node:crypto'
import { addAuditEvent, addAuditRecord } from '../audit/audit-store.js'
import { executeAuthorizedTransfer, getSimulatedBalance, getSimulatedSessionDebit } from '../banking/simulated-bank.js'
import { getBankingPolicy } from '../banking/policy-config.js'
import { analyzeRequest } from '../ai/analyzer.js'
import { validateAnalysisOutput } from '../ai/validate-analysis.js'
import { detectRequestIntent, detectThreats, findConflictingTransferDetails } from '../security/detect-threats.js'
import { enforcePolicy } from '../security/enforce-policy.js'
import { normalizeRequest } from '../security/normalize-input.js'
import { issueTransactionAuthorization } from '../security/transaction-authorization.js'
import { validateRequestBody } from '../security/validate-request.js'
import { beginIdempotentRequest, completeIdempotentRequest } from './idempotency-store.js'

async function safeAnalyze(analyzer, input) {
  try {
    const response = await analyzer(input)
    if (!response || !['disabled', 'complete', 'failed'].includes(response.status)) return { status: 'invalid', providerStatus: 'unavailable', message: 'AI adapter returned an unsupported status.' }
    if (response.status === 'disabled') return { status: 'disabled', provider: response.provider ?? 'disabled', providerStatus: 'disabled', message: 'AI analysis is disabled.' }
    if (response.status === 'failed') {
      const providerStatus = ['timeout', 'rate_limited'].includes(response.providerStatus) ? response.providerStatus : 'unavailable'
      const message = providerStatus === 'timeout' ? 'AI provider timed out; deterministic controls remain active.'
        : providerStatus === 'rate_limited' ? 'AI provider rate limit was reached; deterministic controls remain active.'
          : 'AI provider is unavailable; deterministic controls remain active.'
      return { status: 'failed', provider: response.provider ?? 'unknown', providerStatus, message }
    }
    const validated = validateAnalysisOutput(response.output, input)
    if (validated.valid) {
      const explanation = validated.value.findings.length
        ? `Possible ${validated.value.findings.map((finding) => `${finding.category} indicator in “${finding.evidence}”`).join('; ')}. This model interpretation is advisory.`
        : 'The model supplied no quoted threat evidence. This is advisory and does not establish that the request is safe.'
      return { status: 'valid', provider: response.provider ?? 'mock', providerStatus: response.providerStatus ?? 'available', value: { ...validated.value, rationale: explanation }, message: 'AI output passed strict schema validation; displayed explanation is rebuilt from exact evidence references.' }
    }
    return { status: 'invalid', provider: response.provider ?? 'mock', providerStatus: response.providerStatus ?? 'available', message: validated.error }
  } catch {
    return { status: 'invalid', provider: 'unknown', providerStatus: 'unavailable', message: 'AI adapter failed unexpectedly; transfer authorization is held for review.' }
  }
}

function addAudit(verdict) {
  addAuditRecord({
    id: verdict.auditId,
    requestId: verdict.requestId,
    timestamp: verdict.timestamp,
    decision: verdict.decision,
    outcome: verdict.outcome,
    reasonCode: verdict.reasonCode,
    riskLevel: verdict.riskLevel,
    threatCategory: verdict.threatCategory,
    rationale: verdict.rationale,
    checks: verdict.checks,
    transactionRequested: verdict.transactionRequested,
    transactionExecuted: verdict.simulatedTransaction.executed,
    executionStatus: verdict.executionStatus,
  })
}

function buildVerdict({ decision, outcome, reasonCode, riskLevel, threatCategory, threatFindings = [], rationale, checks, execution, executionStatus, aiAnalysis, policyDecision, requestId }) {
  const auditId = randomUUID()
  const timestamp = new Date().toISOString()
  return {
    decision, outcome, reasonCode, riskLevel, threatCategory, threatFindings, deterministicFindings: threatFindings,
    aiAnalysis, policyDecision: policyDecision ?? { decision, outcome, reasonCode, rationale },
    rationale, checks,
    transactionRequested: execution.requested,
    simulatedTransaction: execution,
    executionStatus,
    auditId,
    requestId,
    timestamp,
  }
}

function finish(verdict, httpStatus, reservation) {
  addAudit(verdict)
  let sequence = 0
  const shared = {
    requestId: verdict.requestId,
    threatCategories: verdict.threatFindings.map((finding) => finding.category),
    aiStatus: verdict.aiAnalysis?.status,
    aiFindingCategories: verdict.aiAnalysis?.output?.findings?.map((finding) => finding.category) ?? [],
  }
  addAuditEvent({ ...shared, sequence: ++sequence, eventType: 'THREAT_SCAN_COMPLETED', stage: 'THREAT_DETECTION', errorCategory: verdict.reasonCode === 'DETECTOR_FAILURE' ? 'DETECTOR_FAILURE' : undefined })
  addAuditEvent({ ...shared, sequence: ++sequence, eventType: 'AI_ANALYSIS_COMPLETED', stage: 'AI_ANALYSIS', errorCategory: ['failed', 'invalid'].includes(verdict.aiAnalysis?.status) ? verdict.aiAnalysis.status === 'failed' ? 'AI_PROVIDER_FAILURE' : 'AI_OUTPUT_INVALID' : undefined })
  addAuditEvent({ ...shared, sequence: ++sequence, eventType: 'POLICY_DECIDED', stage: 'POLICY', decision: verdict.policyDecision.decision, outcome: verdict.policyDecision.outcome, reasonCode: verdict.policyDecision.reasonCode })
  addAuditEvent({ ...shared, sequence: ++sequence, eventType: verdict.executionStatus === 'EXECUTED' ? 'TRANSACTION_EXECUTED' : verdict.executionStatus === 'FAILED' ? 'TRANSACTION_FAILED' : 'TRANSACTION_NOT_EXECUTED', stage: 'SIMULATED_EXECUTION', executionStatus: verdict.executionStatus, transactionReference: verdict.simulatedTransaction.transactionId, stateChanged: verdict.simulatedTransaction.executed === true, errorCategory: verdict.executionStatus === 'FAILED' ? verdict.reasonCode : undefined })
  const completed = addAuditEvent({
    ...shared, sequence: ++sequence, eventType: 'REQUEST_COMPLETED', stage: 'FINAL_DECISION',
    decision: verdict.decision, outcome: verdict.outcome, reasonCode: verdict.reasonCode,
    executionStatus: verdict.executionStatus,
    transactionReference: verdict.simulatedTransaction.transactionId,
    stateChanged: verdict.simulatedTransaction.executed === true,
    errorCategory: verdict.executionStatus === 'FAILED' ? verdict.reasonCode : undefined,
  })
  verdict.auditEventId = completed.eventId
  const result = { httpStatus, verdict }
  completeIdempotentRequest(reservation, result)
  return result
}

function policyFailure({ decision = 'REVIEW', outcome = 'REVIEW_REQUIRED', reasonCode, rationale, checks = [] }) {
  return { decision, outcome, reasonCode, riskLevel: 'HIGH', rationale, checks: [{ id: 'policy_evaluation', label: 'Policy evaluation', status: decision === 'BLOCKED' ? 'denied' : 'review', reasonCode, detail: rationale }, ...checks] }
}

export async function evaluateRequest(body, {
  analyzer = analyzeRequest,
  detector = detectThreats,
  idempotencyKey,
  policy: policyOverrides,
  executionHooks,
  now = Date.now(),
  requestId = randomUUID(),
} = {}) {
  const policyConfig = getBankingPolicy(policyOverrides)
  const validation = validateRequestBody(body, policyConfig)
  const normalized = normalizeRequest(validation.value?.request ?? '', validation.value?.transaction)
  let threatScan
  try {
    threatScan = detector(normalized)
    if (!threatScan || typeof threatScan.detected !== 'boolean' || !Array.isArray(threatScan.findings)) throw new TypeError('Threat detector returned an invalid result.')
  } catch {
    threatScan = { detected: true, primaryCategory: 'DETECTION_ERROR', findings: [] }
  }
  const intent = detectRequestIntent(normalized.request)
  const transaction = validation.value?.transaction ?? null
  const conflictingDetails = findConflictingTransferDetails(normalized.request, transaction)
  let reservation

  if (intent === 'TRANSFER' && validation.valid && transaction && idempotencyKey !== undefined) {
    const logicalRequest = JSON.stringify({ request: normalized.request.toLocaleLowerCase('en'), transaction })
    const fingerprint = createHash('sha256').update(logicalRequest).digest('hex')
    reservation = beginIdempotentRequest(idempotencyKey, fingerprint)
    if (reservation.type === 'duplicate' || reservation.type === 'pending') {
      const original = reservation.type === 'pending' ? await reservation.response : reservation.response
      const replayEvent = addAuditEvent({ requestId, eventType: 'IDEMPOTENT_REPLAY', stage: 'IDEMPOTENCY', decision: original?.verdict?.decision, outcome: original?.verdict?.outcome, reasonCode: 'IDEMPOTENT_REPLAY', executionStatus: 'REPLAYED', transactionReference: original?.verdict?.simulatedTransaction?.transactionId, stateChanged: false, originalRequestId: original?.verdict?.requestId })
      return { ...original, verdict: { ...original.verdict, requestId, replayed: true, originalRequestId: original?.verdict?.requestId, replayEventId: replayEvent.eventId, currentRequestExecution: { executed: false, status: 'IDEMPOTENT_REPLAY' } } }
    }
    if (reservation.type !== 'owner') {
      const reasons = {
        invalid: ['INVALID_REQUEST', 'Idempotency key must use 1–128 safe ASCII characters.'],
        conflict: ['IDEMPOTENCY_KEY_CONFLICT', 'This idempotency key was already used for different request details.'],
        full: ['IDEMPOTENCY_STORE_FULL', 'The simulated idempotency store is full; retry after a backend restart.'],
      }
      const [reasonCode, rationale] = reasons[reservation.type]
      const policy = policyFailure({ outcome: reservation.type === 'invalid' ? 'INVALID_REQUEST' : 'REVIEW_REQUIRED', reasonCode, rationale })
      const checks = [...policy.checks, { id: 'transaction_authorization', label: 'Transaction authorization', status: 'denied', detail: 'No transfer operation was authorized.' }, { id: 'simulated_execution', label: 'Simulated operation', status: 'denied', detail: 'No simulated transfer was executed.' }]
      const verdict = buildVerdict({ ...policy, threatCategory: threatScan.primaryCategory, threatFindings: threatScan.findings, checks, execution: { requested: true, executed: false }, executionStatus: 'NOT_EXECUTED', requestId })
      const status = reservation.type === 'invalid' ? 400 : reservation.type === 'conflict' ? 409 : 503
      return finish(verdict, status, undefined)
    }
  }

  const analysisInput = { request: normalized.request, memo: normalized.memo, recipient: normalized.recipient, requestId }
  const analysis = validation.valid
    ? await safeAnalyze(analyzer, analysisInput)
    : { status: 'skipped', provider: 'not_called', providerStatus: 'skipped', message: 'AI analysis was skipped because request validation failed.' }
  if (analysis.status === 'valid') {
    const aiDetected = analysis.value.threatCategory !== 'NONE' || analysis.value.findings.length > 0
    const deterministicCategories = new Set(threatScan.findings.map((finding) => finding.category))
    const aiCategories = new Set([
      ...(analysis.value.threatCategory === 'NONE' ? [] : [analysis.value.threatCategory]),
      ...analysis.value.findings.map((finding) => finding.category),
    ])
    const categoryMismatch = threatScan.detected && aiDetected
      && ![...deterministicCategories].some((category) => aiCategories.has(category))
    analysis.disagreement = threatScan.detected !== aiDetected
      || categoryMismatch
      || (analysis.value.recommendedAction === 'ALLOW' && (threatScan.detected || aiDetected))
      || (analysis.value.recommendedAction !== 'ALLOW' && !threatScan.detected && !aiDetected)
  } else {
    analysis.disagreement = false
  }
  const policy = threatScan.primaryCategory === 'DETECTION_ERROR'
    ? policyFailure({ reasonCode: 'DETECTOR_FAILURE', rationale: 'Threat analysis did not complete safely; no financial action was authorized.' })
    : enforcePolicy({
      intent,
      transaction,
      threatScan,
      validation,
      conflictingDetails,
      balance: getSimulatedBalance(policyConfig.sourceAccountId),
      sessionDebit: getSimulatedSessionDebit(),
      analysis,
      policy: policyConfig,
      requestId,
    })

  const requested = intent === 'TRANSFER' || Boolean(transaction)
  let execution = { requested, executed: false }
  let executionStatus = requested ? 'NOT_EXECUTED' : 'NOT_REQUESTED'
  let decision = policy.decision
  let outcome = policy.outcome
  let reasonCode = policy.reasonCode
  let riskLevel = policy.riskLevel
  let rationale = policy.rationale

  if (policy.decision === 'APPROVED' && intent === 'TRANSFER' && transaction) {
    const context = { request: normalized.request, idempotencyKey: idempotencyKey ?? '', requestId }
    const capability = issueTransactionAuthorization({ transaction, context, now, ttlMs: policyConfig.authorizationTtlMs })
    try {
      const operation = executeAuthorizedTransfer(transaction, capability, { policy: policyConfig, context, requestId, now, hooks: executionHooks })
      execution = {
        requested: true,
        executed: true,
        transactionId: operation.id,
        amount: operation.amount,
        currency: operation.currency,
        recipient: operation.recipient,
        sourceAccountId: operation.sourceAccountId,
        destinationAccountId: operation.destinationAccountId,
        balanceAfter: operation.balanceAfter,
      }
      executionStatus = 'EXECUTED'
    } catch {
      decision = 'REVIEW'
      outcome = 'REVIEW_REQUIRED'
      reasonCode = 'TRANSFER_EXECUTION_FAILED'
      riskLevel = 'HIGH'
      rationale = 'The simulated operation could not be safely completed; no successful transfer was recorded.'
      executionStatus = 'FAILED'
    }
  } else if (intent === 'BALANCE_INQUIRY' && decision === 'APPROVED') {
    execution = { requested: false, executed: false, balance: getSimulatedBalance(policyConfig.sourceAccountId), currency: policyConfig.supportedCurrency }
    executionStatus = 'READ_ONLY'
  }

  const checks = [
    { id: 'input_validation', label: 'Input validation', status: validation.valid ? 'passed' : 'failed', reasonCode: validation.valid ? 'INPUT_VALID' : 'INVALID_REQUEST', detail: validation.valid ? 'Request shape and field limits are valid.' : validation.issues.join(' ') },
    { id: 'normalization', label: 'Safe normalization', status: 'passed', reasonCode: 'NORMALIZED', detail: normalized.changed ? 'Unicode was normalized and invisible formatting was removed before scanning.' : 'Text was normalized for Unicode and whitespace before scanning.' },
    { id: 'threat_detection', label: 'Threat detection', status: threatScan.primaryCategory === 'DETECTION_ERROR' ? 'failed' : threatScan.detected ? 'flagged' : 'clear', reasonCode: threatScan.primaryCategory === 'DETECTION_ERROR' ? 'DETECTOR_FAILURE' : threatScan.detected ? 'THREAT_DETECTED' : 'NO_THREAT_MATCH', detail: threatScan.primaryCategory === 'DETECTION_ERROR' ? 'Threat analysis failed; policy held the request for review.' : threatScan.detected ? `${threatScan.findings.length} deterministic threat indicator(s) found.` : 'No configured deterministic threat patterns matched.' },
    { id: 'ai_analysis', label: 'AI analysis', status: analysis.status, reasonCode: `ANALYSIS_${analysis.status.toUpperCase()}`, detail: analysis.message },
    ...policy.checks,
    { id: 'transaction_authorization', label: 'Transaction authorization', status: executionStatus === 'EXECUTED' ? 'authorized' : requested ? 'denied' : 'not_requested', reasonCode: executionStatus === 'EXECUTED' ? 'AUTHORIZATION_CONSUMED' : 'NOT_AUTHORIZED', detail: executionStatus === 'EXECUTED' ? 'Single-use server authorization was validated and consumed.' : requested ? 'No transfer operation was authorized.' : 'No financial action was requested.' },
    { id: 'simulated_execution', label: 'Simulated operation', status: executionStatus === 'EXECUTED' ? 'passed' : requested ? executionStatus === 'FAILED' ? 'failed' : 'denied' : 'not_requested', reasonCode, detail: executionStatus === 'EXECUTED' ? 'Server recorded the authorized transfer in simulated in-memory state.' : requested ? 'No simulated transfer was executed.' : 'No simulated transfer was requested.' },
  ]
  const aiAnalysis = {
    status: analysis.status,
    provider: analysis.provider ?? 'disabled',
    providerStatus: analysis.providerStatus ?? (analysis.status === 'valid' ? 'available' : analysis.status),
    message: analysis.message,
    disagreement: analysis.disagreement,
    output: analysis.status === 'valid' ? analysis.value : null,
    confidenceMeaning: analysis.status === 'valid' && analysis.value.findings.length > 0
      ? 'Uncalibrated model score; not a probability or authorization signal.' : undefined,
  }
  const verdict = buildVerdict({ decision, outcome, reasonCode, riskLevel, threatCategory: threatScan.primaryCategory === 'NONE' && decision === 'REVIEW' ? 'AMBIGUOUS_INTENT' : threatScan.primaryCategory, threatFindings: threatScan.findings, rationale, checks, execution, executionStatus, aiAnalysis, policyDecision: { decision: policy.decision, outcome: policy.outcome, reasonCode: policy.reasonCode, rationale: policy.rationale }, requestId })
  return finish(verdict, validation.valid ? 200 : 422, reservation)
}
