const RISK_LEVELS = new Set(['LOW', 'MEDIUM', 'HIGH'])
const CATEGORIES = new Set([
  'NONE', 'INSTRUCTION_OVERRIDE', 'ROLEPLAY_JAILBREAK', 'MEMO_INJECTION',
  'OBFUSCATION', 'DATA_EXFILTRATION', 'POLICY_BYPASS', 'AMBIGUOUS_INTENT',
])
const ACTIONS = new Set(['ALLOW', 'BLOCK', 'REVIEW'])
const ROOT_KEYS = new Set(['riskLevel', 'threatCategory', 'rationale', 'recommendedAction', 'findings'])
const FINDING_KEYS = new Set(['category', 'evidence', 'confidence'])

function hasOnlyKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => keys.has(key))
    && [...keys].every((key) => Object.hasOwn(value, key))
}

export function validateAnalysisOutput(input, { request = '', memo = '', recipient = '' } = {}) {
  let value = input
  if (typeof input === 'string') {
    if (input.length > 8_000) return { valid: false, error: 'AI output exceeds the configured size limit.' }
    try { value = JSON.parse(input) } catch { return { valid: false, error: 'AI output is not valid JSON.' } }
  }
  try {
    if (JSON.stringify(value).length > 8_000) return { valid: false, error: 'AI output exceeds the configured size limit.' }
  } catch {
    return { valid: false, error: 'AI output is not serializable JSON.' }
  }
  if (!hasOnlyKeys(value, ROOT_KEYS)) return { valid: false, error: 'AI output has missing or unknown fields.' }
  if (!RISK_LEVELS.has(value.riskLevel) || !CATEGORIES.has(value.threatCategory) || !ACTIONS.has(value.recommendedAction)
    || typeof value.rationale !== 'string' || value.rationale.length < 1 || value.rationale.length > 500
    || !Array.isArray(value.findings) || value.findings.length > 20) {
    return { valid: false, error: 'AI output fields do not match the required schema.' }
  }
  for (const finding of value.findings) {
    if (!hasOnlyKeys(finding, FINDING_KEYS) || !CATEGORIES.has(finding.category)
      || typeof finding.evidence !== 'string' || finding.evidence.length < 1 || finding.evidence.length > 300
      || typeof finding.confidence !== 'number' || !Number.isFinite(finding.confidence)
      || finding.confidence < 0 || finding.confidence > 1) {
      return { valid: false, error: 'AI finding does not match the required schema.' }
    }
    const evidenceFields = [request, memo, recipient].filter((field) => typeof field === 'string')
    if (!evidenceFields.some((field) => field.includes(finding.evidence))) {
      return { valid: false, error: 'AI finding evidence must exactly match supplied request data.' }
    }
  }
  if (value.threatCategory !== 'NONE' && value.findings.length === 0) return { valid: false, error: 'A threat category requires at least one evidence reference.' }
  return { valid: true, value }
}
