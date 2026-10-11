const INVISIBLE_OR_DIRECTIONAL = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/gu

export function normalizeUntrustedText(value) {
  const source = typeof value === 'string' ? value : ''
  const unicodeNormalized = source.normalize('NFKC')
  const stripped = unicodeNormalized.replace(INVISIBLE_OR_DIRECTIONAL, '')
  const normalized = stripped.replace(/[\t\r\n\f\v ]+/gu, ' ').trim()
  return {
    text: normalized,
    changed: normalized !== source,
    removedInvisible: stripped !== unicodeNormalized,
  }
}

export function normalizeRequest(value, transaction) {
  const request = normalizeUntrustedText(value)
  const memo = normalizeUntrustedText(transaction?.memo ?? '')
  const recipient = normalizeUntrustedText(transaction?.recipient ?? '')
  return {
    request: request.text,
    memo: memo.text,
    recipient: recipient.text,
    changed: request.changed || memo.changed || recipient.changed,
    removedInvisible: request.removedInvisible || memo.removedInvisible || recipient.removedInvisible,
    requestRemovedInvisible: request.removedInvisible,
    memoRemovedInvisible: memo.removedInvisible,
    recipientRemovedInvisible: recipient.removedInvisible,
  }
}

