const DEFAULT_POLICY = Object.freeze({
  sourceAccountId: 'sim-checking-001',
  supportedCurrency: 'INR',
  decimalPlaces: 2,
  maxTransferAmount: 10_000,
  maxSessionDebit: 20_000,
  authorizationTtlMs: 30_000,
})

function positiveMoney(value, fallback, name) {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0 || Math.round(parsed * 100) !== parsed * 100) {
    throw new Error(`${name} must be a positive INR amount with at most two decimal places.`)
  }
  return parsed
}

export function getBankingPolicy(overrides = {}) {
  const precision = process.env.BANKISM_DECIMAL_PLACES === undefined ? DEFAULT_POLICY.decimalPlaces : Number(process.env.BANKISM_DECIMAL_PLACES)
  const environment = {
    maxTransferAmount: positiveMoney(process.env.BANKISM_MAX_TRANSFER_INR, DEFAULT_POLICY.maxTransferAmount, 'BANKISM_MAX_TRANSFER_INR'),
    maxSessionDebit: positiveMoney(process.env.BANKISM_MAX_SESSION_DEBIT_INR, DEFAULT_POLICY.maxSessionDebit, 'BANKISM_MAX_SESSION_DEBIT_INR'),
    supportedCurrency: process.env.BANKISM_SUPPORTED_CURRENCY ?? DEFAULT_POLICY.supportedCurrency,
    decimalPlaces: precision,
  }
  const policy = { ...DEFAULT_POLICY, ...environment, ...overrides }
  if (!Number.isInteger(policy.decimalPlaces) || policy.decimalPlaces < 0 || policy.decimalPlaces > 2
    || policy.allowSelfTransfer !== undefined
    || typeof policy.supportedCurrency !== 'string' || !/^[A-Z]{3}$/.test(policy.supportedCurrency)
    || !Number.isFinite(policy.maxTransferAmount) || policy.maxTransferAmount <= 0
    || !Number.isFinite(policy.maxSessionDebit) || policy.maxSessionDebit <= 0
    || !Number.isFinite(policy.authorizationTtlMs) || policy.authorizationTtlMs <= 0) {
    throw new Error('Simulated banking policy configuration is invalid.')
  }
  return Object.freeze(policy)
}

export const BANKING_POLICY = getBankingPolicy()
