import { getDemoAccountById } from '../banking/accounts.js'
import { hasSupportedAmountPrecision } from '../banking/money.js'
import { BANKING_POLICY } from '../banking/policy-config.js'

export const TRANSFER_LIMIT_INR = BANKING_POLICY.maxTransferAmount

// This function decides eligibility only; it never issues authorization or mutates accounts.
export function enforcePolicy({ intent, transaction, threatScan, validation, conflictingDetails, balance, sessionDebit = 0, analysis, policy = BANKING_POLICY, requestId }) {
  // Retained in the policy call context for correlated diagnostics; it never affects authorization.
  void requestId
  if (threatScan.detected) return result('BLOCKED', 'BLOCKED', 'THREAT_DETECTED', 'HIGH', 'Threat indicators make this request ineligible for financial actions.', 'The request contains instruction-like content that conflicts with security boundaries.')
  if (!validation.valid) return result('REVIEW', 'INVALID_REQUEST', 'INVALID_REQUEST', 'HIGH', 'Request fields did not pass deterministic validation.', 'Malformed or incomplete input is not eligible for a transfer.')
  if (conflictingDetails.conflicting) return result('REVIEW', 'REVIEW_REQUIRED', 'CONFLICTING_DETAILS', 'HIGH', 'Transfer details disagree; no action was authorized.', 'The request contains conflicting amount or recipient details.')

  if (intent === 'BALANCE_INQUIRY' && !transaction) {
    return result('APPROVED', 'APPROVED', 'BALANCE_INQUIRY', 'LOW', 'A read-only simulated balance inquiry is allowed.')
  }

  if (intent === 'TRANSACTION_HISTORY') return result('REVIEW', 'REVIEW_REQUIRED', 'UNSUPPORTED_OPERATION', 'LOW', 'Transaction history is not available in this simulation.')
  if (intent !== 'TRANSFER') {
    const outcome = transaction ? 'INVALID_REQUEST' : 'REVIEW_REQUIRED'
    return result('REVIEW', outcome, transaction ? 'INTENT_MISMATCH' : 'AMBIGUOUS_INTENT', 'MEDIUM', 'A transfer requires explicit, unambiguous transfer intent.')
  }
  if (!transaction) return result('REVIEW', 'REVIEW_REQUIRED', 'MISSING_TRANSACTION_DETAILS', 'MEDIUM', 'Transfer details are incomplete; no operation was authorized.')

  if (analysis?.status === 'invalid') {
    return result('REVIEW', 'REVIEW_REQUIRED', 'ANALYSIS_INVALID', 'HIGH', 'AI output did not pass strict validation; no transfer was authorized.')
  }
  if (analysis?.status === 'valid'
    && (analysis.value.riskLevel === 'HIGH' || analysis.value.threatCategory !== 'NONE' || analysis.value.findings.length > 0 || analysis.value.recommendedAction !== 'ALLOW')) {
    return result('REVIEW', 'REVIEW_REQUIRED', 'AI_REQUIRES_REVIEW', analysis.value.riskLevel, 'AI analysis raised a review signal; its recommendation cannot authorize or override deterministic policy.')
  }

  const source = getDemoAccountById(transaction.sourceAccountId)
  const destination = getDemoAccountById(transaction.destinationAccountId)
  if (!source || source.role !== 'source' || !source.active) return result('REVIEW', 'INVALID_REQUEST', 'SOURCE_ACCOUNT_INVALID', 'HIGH', 'The source account is not available in the simulation.')
  if (!destination || !destination.active) return result('REVIEW', 'INVALID_REQUEST', 'DESTINATION_ACCOUNT_INVALID', 'HIGH', 'The destination account is not available in the simulation.')
  if (source.id === destination.id) return result('BLOCKED', 'BLOCKED', 'SELF_TRANSFER_PROHIBITED', 'MEDIUM', 'Transfers to the source account are prohibited by this simulation policy.')
  if (destination.riskStatus !== 'CLEAR') return result('REVIEW', 'REVIEW_REQUIRED', 'RECIPIENT_REQUIRES_REVIEW', 'HIGH', 'The selected simulated recipient requires manual review.')
  if (transaction.currency !== policy.supportedCurrency) return result('BLOCKED', 'BLOCKED', 'UNSUPPORTED_CURRENCY', 'HIGH', `Only ${policy.supportedCurrency} transfers are supported by this simulation.`)
  if (!hasSupportedAmountPrecision(transaction.amount, policy.decimalPlaces)) {
    return result('REVIEW', 'INVALID_REQUEST', 'AMOUNT_INVALID', 'HIGH', 'Amount must be positive, finite, and use supported decimal precision.')
  }
  if (transaction.amount > policy.maxTransferAmount) return result('BLOCKED', 'BLOCKED', 'TRANSFER_LIMIT_EXCEEDED', 'HIGH', 'Transfer exceeds the configured per-transaction simulation limit.')
  if (sessionDebit + transaction.amount > policy.maxSessionDebit) return result('BLOCKED', 'BLOCKED', 'SESSION_LIMIT_EXCEEDED', 'HIGH', 'Transfer would exceed the configured simulated account debit limit.')
  if (transaction.amount > balance) return result('BLOCKED', 'BLOCKED', 'INSUFFICIENT_BALANCE', 'HIGH', 'The simulated source account has insufficient available balance.')

  return result('APPROVED', 'APPROVED', 'TRANSFER_POLICY_APPROVED', 'LOW', 'Transfer details pass deterministic simulated banking policy checks.')
}

function result(decision, outcome, reasonCode, riskLevel, rationale) {
  const status = decision === 'APPROVED' ? 'approved' : decision === 'BLOCKED' ? 'denied' : 'review'
  return {
    decision,
    outcome,
    reasonCode,
    riskLevel,
    rationale,
    checks: [{ id: 'policy_evaluation', label: 'Policy evaluation', status, reasonCode, detail: rationale }],
  }
}
