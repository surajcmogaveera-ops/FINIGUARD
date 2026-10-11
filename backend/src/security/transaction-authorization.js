const issuedAuthorizations = new WeakMap()

function transactionBinding(transaction) {
  if (!transaction || typeof transaction !== 'object') return ''
  return JSON.stringify({
    amount: transaction.amount,
    currency: transaction.currency,
    sourceAccountId: transaction.sourceAccountId,
    destinationAccountId: transaction.destinationAccountId,
    recipient: transaction.recipient,
    memo: transaction.memo,
  })
}

function contextBinding(context) {
  if (!context || typeof context !== 'object') return ''
  return JSON.stringify({ request: context.request, idempotencyKey: context.idempotencyKey ?? '', requestId: context.requestId ?? '' })
}

export function issueTransactionAuthorization({ transaction, context, now = Date.now(), ttlMs = 30_000 } = {}) {
  const authorization = Object.freeze(Object.create(null))
  issuedAuthorizations.set(authorization, {
    transaction: transactionBinding(transaction),
    context: contextBinding(context),
    expiresAt: now + ttlMs,
  })
  return authorization
}

export function consumeTransactionAuthorization(value, { transaction, context, now = Date.now() } = {}) {
  if (!value || typeof value !== 'object') return false
  const grant = issuedAuthorizations.get(value)
  if (!grant) return false
  // Consume even when expired or altered so a failed attempt can never be retried.
  issuedAuthorizations.delete(value)
  return grant.expiresAt > now
    && grant.transaction === transactionBinding(transaction)
    && grant.context === contextBinding(context)
}
