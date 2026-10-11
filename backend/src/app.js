import express from 'express'
import { randomUUID } from 'node:crypto'
import { addAuditEvent, addAuditRecord } from './audit/audit-store.js'
import { createV1Router } from './routes/v1.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.use((request, response, next) => {
    // Always mint at the trusted boundary; a caller cannot choose or impersonate a correlation ID.
    request.requestId = randomUUID()
    response.set('X-Request-Id', request.requestId)
    next()
  })
  app.use(express.json({ limit: '16kb', strict: true }))
  app.use('/api/v1', createV1Router())

  app.use((request, response) => {
    response.status(404).json({ error: 'Route not found.' })
  })

  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error)

    const tooLarge = error?.type === 'entity.too.large'
    const malformedJson = error instanceof SyntaxError && error.status === 400 && 'body' in error
    if (tooLarge || malformedJson) {
      const auditId = randomUUID()
      const requestId = request.requestId
      const timestamp = new Date().toISOString()
      const rationale = tooLarge ? 'Request exceeded the 16 KB API limit.' : 'Request body must contain valid JSON.'
      const checks = [
        { id: 'input_validation', label: 'Input validation', status: 'failed', detail: 'The request body could not be safely evaluated.' },
        { id: 'threat_detection', label: 'Threat detection', status: 'not_run', detail: 'Threat scanning did not run because input validation failed.' },
        { id: 'policy_evaluation', label: 'Policy evaluation', status: 'not_run', detail: 'Policy evaluation did not run.' },
        { id: 'transaction_authorization', label: 'Transaction authorization', status: 'denied', detail: 'No financial action was authorized.' },
        { id: 'simulated_execution', label: 'Simulated operation', status: 'denied', detail: 'No simulated operation was executed.' },
      ]
      addAuditRecord({ id: auditId, requestId, timestamp, decision: 'REVIEW', outcome: 'INVALID_REQUEST', reasonCode: malformedJson ? 'MALFORMED_JSON' : 'BODY_TOO_LARGE', riskLevel: 'HIGH', threatCategory: 'AMBIGUOUS_INTENT', rationale, checks, transactionRequested: false, transactionExecuted: false, executionStatus: 'NOT_EXECUTED' })
      addAuditEvent({ requestId, eventType: 'REQUEST_REJECTED', stage: 'INPUT_VALIDATION', decision: 'REVIEW', outcome: 'INVALID_REQUEST', reasonCode: malformedJson ? 'MALFORMED_JSON' : 'BODY_TOO_LARGE', executionStatus: 'NOT_EXECUTED', errorCategory: malformedJson ? 'MALFORMED_JSON' : 'BODY_TOO_LARGE' })
      return response.status(tooLarge ? 413 : 400).json({
        decision: 'REVIEW',
        outcome: 'INVALID_REQUEST',
        reasonCode: malformedJson ? 'MALFORMED_JSON' : 'BODY_TOO_LARGE',
        riskLevel: 'HIGH',
        threatCategory: 'AMBIGUOUS_INTENT',
        rationale,
        checks,
        simulatedTransaction: { requested: false, executed: false },
        executionStatus: 'NOT_EXECUTED',
        auditId,
        requestId,
        timestamp,
      })
    }

    const auditId = randomUUID()
    const requestId = request.requestId
    const timestamp = new Date().toISOString()
    const rationale = 'The request could not be safely evaluated because of an internal error. No financial action was authorized.'
    const checks = [
      { id: 'input_validation', label: 'Input validation', status: 'not_run', detail: 'Evaluation stopped before validation completed.' },
      { id: 'threat_detection', label: 'Threat detection', status: 'not_run', detail: 'Threat scanning did not run to completion.' },
      { id: 'ai_analysis', label: 'AI analysis', status: 'not_run', detail: 'AI analysis did not run to completion.' },
      { id: 'policy_evaluation', label: 'Policy evaluation', status: 'not_run', detail: 'Policy evaluation did not run to completion.' },
      { id: 'transaction_authorization', label: 'Transaction authorization', status: 'denied', detail: 'No financial action was authorized.' },
      { id: 'simulated_execution', label: 'Simulated operation', status: 'denied', detail: 'No simulated operation was executed.' },
    ]
    addAuditRecord({
      id: auditId,
      requestId,
      timestamp,
      decision: 'REVIEW',
      outcome: 'REVIEW_REQUIRED',
      reasonCode: 'INTERNAL_ERROR',
      riskLevel: 'HIGH',
      threatCategory: 'AMBIGUOUS_INTENT',
      rationale,
      checks,
      transactionRequested: false,
      transactionExecuted: false,
      executionStatus: 'FAILED',
    })
    addAuditEvent({ requestId, eventType: 'REQUEST_FAILED', stage: 'PROCESSING', decision: 'REVIEW', outcome: 'REVIEW_REQUIRED', reasonCode: 'INTERNAL_ERROR', executionStatus: 'FAILED', errorCategory: 'INTERNAL_ERROR' })
    return response.status(500).json({
      decision: 'REVIEW',
      outcome: 'REVIEW_REQUIRED',
      reasonCode: 'INTERNAL_ERROR',
      riskLevel: 'HIGH',
      threatCategory: 'AMBIGUOUS_INTENT',
      rationale,
      checks,
      transactionRequested: false,
      simulatedTransaction: { requested: false, executed: false },
      executionStatus: 'FAILED',
      auditId,
      requestId,
      timestamp,
    })
  })

  return app
}

