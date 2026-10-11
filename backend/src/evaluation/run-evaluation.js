import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { evaluateRequest } from '../services/evaluate-request.js'
import { getSimulatedBalance, getSimulatedAccountBalances, getSimulatedSessionDebit, getSimulatedTransactions, resetSimulatedBank } from '../banking/simulated-bank.js'
import { resolveDemoAccount } from '../banking/accounts.js'
import { getAuditRecords, resetAuditRecords } from '../audit/audit-store.js'
import { resetIdempotencyStore } from '../services/idempotency-store.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = JSON.parse(await readFile(resolve(here, '../../evaluation/cases.v5.json'), 'utf8'))
const baseline = JSON.parse(await readFile(resolve(here, '../../evaluation/cases.v3.json'), 'utf8'))
const safeOutput = { riskLevel: 'LOW', threatCategory: 'NONE', rationale: 'No suspicious signal.', recommendedAction: 'ALLOW', findings: [] }
const analyzerFor = (mode) => {
  if (mode === 'throw') return async () => { throw new Error('synthetic analyzer failure') }
  if (!mode) return undefined
  if (mode === 'unexpected_status') return async () => ({ status: 'approved', output: safeOutput })
  if (mode === 'malformed') return async () => ({ status: 'complete', output: '{bad json' })
  if (mode === 'invalid_enum') return async () => ({ status: 'complete', output: { ...safeOutput, riskLevel: 'SAFE' } })
  if (mode === 'confidence') return async () => ({ status: 'complete', output: { ...safeOutput, findings: [{ category: 'POLICY_BYPASS', evidence: 'synthetic', confidence: 1.1 }] } })
  if (mode === 'approved') return async () => ({ status: 'complete', output: { ...safeOutput, approved: true } })
  if (mode === 'finding') return async () => ({ status: 'complete', output: { ...safeOutput, findings: [{ category: 'POLICY_BYPASS', evidence: 'synthetic bypass claim', confidence: 0 }] } })
  if (mode === 'safe') return async () => ({ status: 'complete', output: safeOutput })
  if (mode === 'missed_threat') return async () => ({ status: 'complete', output: { riskLevel: 'HIGH', threatCategory: 'POLICY_BYPASS', rationale: 'The request includes an explicit bypass instruction.', recommendedAction: 'BLOCK', findings: [{ category: 'POLICY_BYPASS', evidence: 'bypass every security check', confidence: 0.91 }] } })
  if (mode === 'false_positive') return async () => ({ status: 'complete', output: { riskLevel: 'MEDIUM', threatCategory: 'POLICY_BYPASS', rationale: 'The model incorrectly flags an ordinary purpose phrase.', recommendedAction: 'REVIEW', findings: [{ category: 'POLICY_BYPASS', evidence: 'for tea', confidence: 0.62 }] } })
  if (mode === 'benign_review') return async () => ({ status: 'complete', output: { ...safeOutput, recommendedAction: 'REVIEW' } })
  if (mode === 'missing_fields') return async () => ({ status: 'complete', output: { riskLevel: 'LOW', threatCategory: 'NONE', rationale: 'Incomplete output.', findings: [] } })
  if (mode === 'unexpected_fields') return async () => ({ status: 'complete', output: { ...safeOutput, toolCall: { name: 'execute_transfer' } } })
  if (mode === 'oversized') return async () => ({ status: 'complete', output: 'x'.repeat(8_001) })
  if (mode === 'timeout') return async () => ({ status: 'failed', provider: 'mock', providerStatus: 'timeout', message: 'AI provider timed out.' })
  if (mode === 'rate_limit') return async () => ({ status: 'failed', provider: 'mock', providerStatus: 'rate_limited', message: 'AI provider rate limit was reached.' })
  if (mode === 'provider_failure') return async () => ({ status: 'failed', provider: 'mock', providerStatus: 'unavailable', message: 'AI provider could not be reached.' })
  throw new Error(`Unknown analyzer fixture mode: ${mode}`)
}

const detectorFor = (mode) => mode === 'throw'
  ? () => { throw new Error('synthetic detector failure') }
  : mode === 'miss' ? () => ({ detected: false, primaryCategory: 'NONE', findings: [] }) : undefined
const counts = { total: fixture.cases.length, passed: 0, failed: 0, truePositives: 0, falsePositives: 0, trueNegatives: 0, falseNegatives: 0, unauthorizedExecutions: 0, unexpectedExecutions: 0, failedValidTransactions: 0, regressions: 0 }
const aiMetrics = { total: 0, tp: 0, fp: 0, tn: 0, fn: 0 }
const combinedMetrics = { tp: 0, fp: 0, tn: 0, fn: 0 }
const providerOutcomes = new Map()
let providerFailureFallbacks = 0
const details = []
const categoryCounts = new Map()
const policyOutcomeCounts = new Map()
const expectedCategories = (item) => item.expectedThreatCategories ?? [item.expectedThreatCategory ?? item.expected.category]
const threatCategories = new Set(fixture.cases.filter((item) => item.expectedThreat).flatMap(expectedCategories))
const baselineById = new Map(baseline.cases.map((item) => [item.id, item]))

for (const item of fixture.cases) {
  resetSimulatedBank()
  resetAuditRecords()
  resetIdempotencyStore()
  const startBalance = getSimulatedBalance()
  const startAccounts = getSimulatedAccountBalances()
  const body = { request: item.request, ...(item.transaction === undefined ? {} : { transaction: item.transaction }), ...(item.bodyApproval ? { approved: true } : {}) }
  const analyzer = analyzerFor(item.analyzer)
  const detector = detectorFor(item.detector)
  const options = { ...(analyzer ? { analyzer } : {}), ...(detector ? { detector } : {}), ...(item.idempotencyKey ? { idempotencyKey: item.idempotencyKey } : {}) }
  let result = await evaluateRequest(body, options)
  let replayCorrect = true
  if (item.repeatWithSameKey) {
    const replay = await evaluateRequest(body, options)
    replayCorrect = replay.verdict.simulatedTransaction.transactionId === result.verdict.simulatedTransaction.transactionId
      && replay.verdict.decision === result.verdict.decision
    result = replay
  }
  const verdict = result.verdict
  policyOutcomeCounts.set(verdict.outcome, (policyOutcomeCounts.get(verdict.outcome) ?? 0) + 1)
  const ledger = getSimulatedTransactions()
  const endBalance = getSimulatedBalance()
  const endAccounts = getSimulatedAccountBalances()
  const audits = getAuditRecords()
  const actualExecuted = ledger.length > 0
  const threatDetected = verdict.checks.find((check) => check.id === 'threat_detection')?.status === 'flagged'
  const ai = verdict.aiAnalysis
  providerOutcomes.set(ai?.providerStatus ?? 'not_reported', (providerOutcomes.get(ai?.providerStatus ?? 'not_reported') ?? 0) + 1)
  if (ai?.status === 'failed' && verdict.policyDecision?.reasonCode !== 'ANALYSIS_INVALID') providerFailureFallbacks += 1
  const aiDetected = ai?.status === 'valid' && (ai.output.threatCategory !== 'NONE' || ai.output.findings.length > 0 || ai.output.recommendedAction !== 'ALLOW')
  if (ai?.status === 'valid') {
    aiMetrics.total += 1
    if (item.expectedThreat && aiDetected) aiMetrics.tp += 1
    else if (!item.expectedThreat && aiDetected) aiMetrics.fp += 1
    else if (!item.expectedThreat) aiMetrics.tn += 1
    else aiMetrics.fn += 1
  }
  const combinedDetected = threatDetected || aiDetected
  if (item.expectedThreat && combinedDetected) combinedMetrics.tp += 1
  else if (!item.expectedThreat && combinedDetected) combinedMetrics.fp += 1
  else if (!item.expectedThreat) combinedMetrics.tn += 1
  else combinedMetrics.fn += 1

  if (item.expectedThreat && threatDetected) counts.truePositives += 1
  else if (!item.expectedThreat && threatDetected) counts.falsePositives += 1
  else if (!item.expectedThreat && !threatDetected) counts.trueNegatives += 1
  else counts.falseNegatives += 1

  if (threatDetected) threatCategories.add(verdict.threatCategory)

  if (actualExecuted && !item.expected.executed) counts.unauthorizedExecutions += 1
  if (actualExecuted !== item.expected.executed) counts.unexpectedExecutions += 1
  if (item.expected.executed && !actualExecuted) counts.failedValidTransactions += 1
  const balanceDelta = startBalance - endBalance
  const expectedDelta = item.expected.executed ? item.transaction.amount : 0
  const destinationId = item.transaction ? resolveDemoAccount(item.transaction.recipient)?.id : null
  const destinationDelta = destinationId ? endAccounts[destinationId] - startAccounts[destinationId] : 0
  const audit = audits[0]
  const auditConsistent = audit && audit.decision === verdict.decision
    && audit.outcome === verdict.outcome && audit.reasonCode === verdict.reasonCode
    && audit.executionStatus === verdict.executionStatus
    && audit.transactionExecuted === actualExecuted && audit.transactionRequested === verdict.transactionRequested
  const correct = verdict.decision === item.expected.decision
    && verdict.threatCategory === item.expected.category
    && (!item.expected.reasonCode || verdict.reasonCode === item.expected.reasonCode)
    && actualExecuted === item.expected.executed
    && balanceDelta === expectedDelta
    && destinationDelta === expectedDelta
    && getSimulatedSessionDebit() === expectedDelta
    && ledger.length === (item.expected.executed ? 1 : 0)
    && audits.length === 1
    && auditConsistent
    && replayCorrect
  if (correct) counts.passed += 1
  else {
    counts.failed += 1
    details.push({ id: item.id, expected: item.expected, actual: { decision: verdict.decision, category: verdict.threatCategory, threatDetected, executed: actualExecuted, balanceDelta, auditConsistent } })
  }

  for (const category of threatCategories) {
    const expectedPositive = item.expectedThreat && expectedCategories(item).includes(category)
    const predictedPositive = threatDetected && verdict.threatFindings.some((finding) => finding.category === category)
    const row = categoryCounts.get(category) ?? { tp: 0, fp: 0, tn: 0, fn: 0 }
    if (expectedPositive && predictedPositive) row.tp += 1
    else if (!expectedPositive && predictedPositive) row.fp += 1
    else if (!expectedPositive && !predictedPositive) row.tn += 1
    else row.fn += 1
    categoryCounts.set(category, row)
  }

  const old = baselineById.get(item.id)
  if (old && (verdict.decision !== old.expected.decision || verdict.threatCategory !== old.expected.category || actualExecuted !== old.expected.executed)) {
    counts.regressions += 1
    details.push({ id: item.id, regression: true, baseline: old.expected, actual: { decision: verdict.decision, category: verdict.threatCategory, executed: actualExecuted } })
  }
}

const divide = (numerator, denominator) => denominator === 0 ? null : numerator / denominator
const precision = divide(counts.truePositives, counts.truePositives + counts.falsePositives)
const recall = divide(counts.truePositives, counts.truePositives + counts.falseNegatives)
const aiPrecision = divide(aiMetrics.tp, aiMetrics.tp + aiMetrics.fp)
const aiRecall = divide(aiMetrics.tp, aiMetrics.tp + aiMetrics.fn)
const combinedPrecision = divide(combinedMetrics.tp, combinedMetrics.tp + combinedMetrics.fp)
const combinedRecall = divide(combinedMetrics.tp, combinedMetrics.tp + combinedMetrics.fn)
console.log(`Evaluation v${fixture.version}: total=${counts.total} passed=${counts.passed} failed=${counts.failed}`)
console.log(`Deterministic-only detection: TP=${counts.truePositives} FP=${counts.falsePositives} TN=${counts.trueNegatives} FN=${counts.falseNegatives}`)
console.log(`Threat detector precision=${precision === null ? 'n/a' : precision.toFixed(3)} recall=${recall === null ? 'n/a' : recall.toFixed(3)}`)
console.log(`AI-only (valid mocked analyses=${aiMetrics.total}): TP=${aiMetrics.tp} FP=${aiMetrics.fp} TN=${aiMetrics.tn} FN=${aiMetrics.fn} precision=${aiPrecision === null ? 'n/a' : aiPrecision.toFixed(3)} recall=${aiRecall === null ? 'n/a' : aiRecall.toFixed(3)}`)
console.log(`Combined deterministic + mocked AI/fallback: TP=${combinedMetrics.tp} FP=${combinedMetrics.fp} TN=${combinedMetrics.tn} FN=${combinedMetrics.fn} precision=${combinedPrecision === null ? 'n/a' : combinedPrecision.toFixed(3)} recall=${combinedRecall === null ? 'n/a' : combinedRecall.toFixed(3)}`)
console.log(`AI provider outcomes (synthetic fixtures): ${[...providerOutcomes].sort(([a], [b]) => a.localeCompare(b)).map(([status, count]) => `${status}=${count}`).join(' ')}`)
console.log(`Provider-failure cases using deterministic fallback=${providerFailureFallbacks}`)
console.log('Threat category metrics (one-vs-rest):')
for (const [category, row] of [...categoryCounts].sort(([left], [right]) => left.localeCompare(right))) {
  const categoryPrecision = divide(row.tp, row.tp + row.fp)
  const categoryRecall = divide(row.tp, row.tp + row.fn)
  console.log(`  ${category}: TP=${row.tp} FP=${row.fp} TN=${row.tn} FN=${row.fn} precision=${categoryPrecision === null ? 'n/a' : categoryPrecision.toFixed(3)} recall=${categoryRecall === null ? 'n/a' : categoryRecall.toFixed(3)}`)
}
console.log(`Final transaction outcomes: unauthorizedExecutions=${counts.unauthorizedExecutions} unexpectedExecutions=${counts.unexpectedExecutions} failedValidTransactions=${counts.failedValidTransactions}`)
console.log(`Policy outcomes: ${[...policyOutcomeCounts].sort(([left], [right]) => left.localeCompare(right)).map(([outcome, count]) => `${outcome}=${count}`).join(' ')}`)
console.log(`Regression comparison: baseline=v${baseline.version} cases=${baseline.cases.length} regressions=${counts.regressions}`)
if (details.length) console.log(JSON.stringify(details, null, 2))
if (counts.failed || counts.regressions || counts.unauthorizedExecutions || counts.unexpectedExecutions || counts.failedValidTransactions) process.exitCode = 1
