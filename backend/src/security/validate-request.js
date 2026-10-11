import { getDemoAccountById, resolveDemoAccount } from '../banking/accounts.js'
import { hasSupportedAmountPrecision } from '../banking/money.js'
import { BANKING_POLICY } from '../banking/policy-config.js'

const ALLOWED_BODY_KEYS = new Set(['request', 'transaction'])
const ALLOWED_TRANSACTION_KEYS = new Set(['amount', 'currency', 'recipient', 'memo', 'sourceAccountId', 'destinationAccountId'])
const DECIMAL_AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/

export function validateRequestBody(body, policy = BANKING_POLICY) {
  const issues = []
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, issues: ['Body must be a JSON object.'], value: null }
  }

  for (const key of Object.keys(body)) if (!ALLOWED_BODY_KEYS.has(key)) issues.push(`Unexpected field: ${key}.`)
  if (typeof body.request !== 'string') issues.push('Request must be a string.')
  else if (body.request.trim().length < 3) issues.push('Request must contain at least 3 characters.')
  else if (body.request.length > 2000) issues.push('Request must be 2000 characters or fewer.')

  let transaction = null
  if (body.transaction !== undefined) {
    if (!body.transaction || typeof body.transaction !== 'object' || Array.isArray(body.transaction)) {
      issues.push('Transaction details must be an object.')
    } else {
      for (const key of Object.keys(body.transaction)) if (!ALLOWED_TRANSACTION_KEYS.has(key)) issues.push(`Unexpected transaction field: ${key}.`)
      const { amount, currency, recipient, memo = '' } = body.transaction
      const amountText = typeof amount === 'number' && Number.isFinite(amount) ? String(amount) : amount
      const parsedAmount = typeof amountText === 'string' && DECIMAL_AMOUNT.test(amountText) ? Number(amountText) : Number.NaN
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > 1_000_000) {
        issues.push('Transaction amount must be a positive decimal no greater than 1,000,000.')
      } else if (!hasSupportedAmountPrecision(parsedAmount, policy.decimalPlaces)) {
        issues.push(`Transaction amount must use no more than ${policy.decimalPlaces} decimal places.`)
      }
      if (typeof currency !== 'string' || !/^[A-Za-z]{3}$/.test(currency.trim())) issues.push('Currency must be a three-letter code.')
      if (typeof recipient !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N} ._@'-]{1,63}$/u.test(recipient.trim())) {
        issues.push('Recipient must be a valid name or account alias.')
      }
      if (typeof memo !== 'string' || memo.length > 280) issues.push('Memo must be a string of 280 characters or fewer.')

      const destination = resolveDemoAccount(recipient)
      if (typeof recipient === 'string' && !destination) issues.push('Destination account is not present in the simulated account registry.')
      const sourceAccountId = body.transaction.sourceAccountId ?? policy.sourceAccountId
      const source = getDemoAccountById(sourceAccountId)
      if (!source || source.role !== 'source' || !source.active) issues.push('Source account is not a valid active simulated source account.')
      if (destination && destination.role !== 'source' && destination.role !== 'destination') issues.push('Destination account is invalid.')
      if (body.transaction.destinationAccountId !== undefined
        && (!destination || body.transaction.destinationAccountId !== destination.id)) {
        issues.push('Destination account identifier does not match the selected recipient.')
      }

      transaction = {
        amount: parsedAmount,
        currency: typeof currency === 'string' ? currency.trim().toUpperCase() : '',
        recipient: destination?.name ?? (typeof recipient === 'string' ? recipient.trim() : ''),
        sourceAccountId,
        destinationAccountId: body.transaction.destinationAccountId ?? destination?.id ?? '',
        memo: typeof memo === 'string' ? memo : '',
      }
    }
  }

  return { valid: issues.length === 0, issues, value: { request: typeof body.request === 'string' ? body.request : '', transaction } }
}
