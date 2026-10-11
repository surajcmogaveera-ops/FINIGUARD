const RULES = [
  {
    id: 'instruction.override', category: 'INSTRUCTION_OVERRIDE',
    pattern: /\b(?:ignore|disregard|forget|override|replace|do not follow)\b.{0,120}\b(?:all\s+)?(?:previous|prior|system|security|safety|banking)?\s*(?:instructions?|rules?|polic(?:y|ies)|guardrails?|prompt)\b/i,
    detail: 'Instruction text attempts to replace or disregard trusted guidance.',
  },
  {
    id: 'jailbreak.roleplay', category: 'ROLEPLAY_JAILBREAK',
    pattern: /\b(?:pretend|act|roleplay|role-play|behave)\s+(?:that\s+)?(?:you\s+are|as|like)\b.{0,100}\b(?:unrestricted|admin(?:istrator)?|root|developer|no[ -]rules|without restrictions|another model)\b/i,
    detail: 'Text requests an unrestricted or privileged assistant role.',
  },
  {
    id: 'exfil.protected_data', category: 'DATA_EXFILTRATION',
    pattern: /\b(?:reveal|print|show|send|leak|exfiltrate|return|disclose|repeat|dump)\b.{0,120}\b(?:hidden\s+)?(?:system prompt|developer prompt|instructions?|credentials?|passwords?|secret keys?|private customer data|other customers?|account numbers?|api keys?)\b/i,
    detail: 'Text requests protected instructions, credentials, or customer information.',
  },
  {
    id: 'policy.control_evasion', category: 'POLICY_BYPASS',
    pattern: /\b(?:bypass|skip|disable|evade|avoid|circumvent|turn off)\b.{0,100}\b(?:limit|authentication|verification|approval|transaction cap|security check|policy|authorization|fraud check)\b/i,
    detail: 'Text asks to evade a banking or authorization control.',
  },
  {
    id: 'embedded.instruction', category: 'INSTRUCTION_OVERRIDE',
    pattern: /\b(?:instruction|command|memo)\b.{0,100}\b(?:ignore|override|transfer|send money|reveal|bypass)\b/i,
    detail: 'Text embeds an instruction that conflicts with the request context.',
  },
  {
    id: 'encoded.instruction', category: 'INSTRUCTION_OVERRIDE',
    pattern: /\b(?:decode|base64|rot13|translate)\b.{0,100}\b(?:then|and)\b.{0,60}\b(?:ignore|override|bypass|transfer|reveal)\b/i,
    detail: 'Text asks to decode or transform content into an instruction.',
  },
]

// Common Cyrillic/Greek lookalikes are mapped only in the analysis view. The
// submitted transaction remains unchanged and a confusable alone is not a hit.
const CONFUSABLES = new Map(Object.entries({
  'а': 'a', 'с': 'c', 'е': 'e', 'і': 'i', 'ј': 'j', 'к': 'k', 'м': 'm', 'о': 'o', 'р': 'p', 'ѕ': 's', 'х': 'x', 'у': 'y',
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Χ': 'X',
  'ο': 'o', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'ρ': 'p', 'τ': 't', 'χ': 'x',
}))

const skeleton = (text) => [...text].map((character) => CONFUSABLES.get(character) ?? character).join('')

function scanField(text, field, removedInvisible, findings) {
  if (!text) return
  const normalized = text.normalize('NFKC').replace(/[\t\r\n\f\v ]+/gu, ' ').trim()
  const canonical = skeleton(normalized)
  for (const rule of RULES) {
    const rawMatch = rule.pattern.test(normalized)
    const canonicalMatch = rule.pattern.test(canonical)
    if (!rawMatch && !canonicalMatch) continue
    const category = field === 'memo' ? 'MEMO_INJECTION' : rule.category
    findings.push({
      detectorId: rule.id,
      category,
      field,
      severity: 'HIGH',
      evidence: rule.id,
      detail: field === 'memo' ? 'Payment memo contains instruction-like content and is treated as untrusted data.' : rule.detail,
    })
    if (canonicalMatch && !rawMatch) findings.push({
      detectorId: 'obfuscation.unicode_confusable',
      category: field === 'memo' ? 'MEMO_INJECTION' : 'OBFUSCATION',
      field,
      severity: 'HIGH',
      evidence: 'obfuscation.unicode_confusable',
      detail: 'An instruction pattern matched after Unicode lookalike analysis.',
    })
    if (removedInvisible) findings.push({
      detectorId: 'obfuscation.invisible_format',
      category: field === 'memo' ? 'MEMO_INJECTION' : 'OBFUSCATION',
      field,
      severity: 'HIGH',
      evidence: 'obfuscation.invisible_format',
      detail: 'Instruction-like text also contained invisible or directional formatting.',
    })
  }
}

export function detectThreats(normalized) {
  if (!normalized || typeof normalized !== 'object') throw new TypeError('Normalized input is required.')
  const findings = []
  scanField(normalized.request, 'request', normalized.requestRemovedInvisible ?? normalized.removedInvisible, findings)
  scanField(normalized.memo, 'memo', normalized.memoRemovedInvisible ?? normalized.removedInvisible, findings)
  scanField(normalized.recipient, 'recipient', normalized.recipientRemovedInvisible ?? normalized.removedInvisible, findings)

  const uniqueFindings = findings.filter((finding, index, all) =>
    all.findIndex((other) => other.detectorId === finding.detectorId && other.field === finding.field) === index)
  return {
    detected: uniqueFindings.length > 0,
    primaryCategory: uniqueFindings[0]?.category ?? 'NONE',
    findings: uniqueFindings,
  }
}

export function detectRequestIntent(text) {
  const normalized = text.toLowerCase()
  if (/^(?:please\s+)?(?:what(?:'s| is)\s+)?(?:my\s+)?(?:account\s+)?balance(?:\s+(?:please|inquiry))?[?.!]*$/i.test(normalized)) return 'BALANCE_INQUIRY'
  if (/^(?:(?:please|kindly)\s+)?(?:can you|could you|i want to|i would like to|i'd like to)\s+(?:transfer|send|pay)\b/i.test(text)
    || /^(?:(?:please|kindly)\s+)?(?:transfer|send|pay)\b/i.test(text)) return 'TRANSFER'
  if (/\b(?:transaction history|recent transactions|statement)\b/i.test(text)) return 'TRANSACTION_HISTORY'
  return 'OTHER'
}

export function findConflictingTransferDetails(text, transaction) {
  const values = [...text.matchAll(/(?:₹|\bINR\s*)([\d,]+(?:\.\d{1,2})?)/gi)].map((match) => Number(match[1].replaceAll(',', '')))
  const amountConflict = values.length > 1 && values.some((value) => value !== values[0])
  const structuredAmountConflict = Boolean(transaction && values.length > 0 && values.some((value) => value !== transaction.amount))
  const recipientMatches = [...text.matchAll(/\bto\s+([\p{L}\p{N}][\p{L}\p{N} .'@-]{1,63}?)(?=\s+(?:for|with|as|because)\b|[,.;!?]|$)/giu)]
  const normalizeRecipient = (value) => value?.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en')
  const recipients = recipientMatches.map((match) => normalizeRecipient(match[1]))
  const recipientConflict = Boolean(transaction && recipients.length > 0
    && (recipients.some((recipient) => recipient !== normalizeRecipient(transaction.recipient))
      || new Set(recipients).size > 1))
  return { conflicting: amountConflict || structuredAmountConflict || recipientConflict, amountConflict: amountConflict || structuredAmountConflict, recipientConflict }
}
