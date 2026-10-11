import { randomUUID } from 'node:crypto'
import { DEMO_ACCOUNTS, getDemoAccountById } from './accounts.js'
import { BANKING_POLICY } from './policy-config.js'
import { hasSupportedAmountPrecision } from './money.js'
import { consumeTransactionAuthorization } from '../security/transaction-authorization.js'

const MAX_TRANSACTIONS = 100
let balances
let transactions
let sessionDebit

function resetState() {
  balances = new Map(DEMO_ACCOUNTS.map((account) => [account.id, account.role === 'source' ? 25_000 : 0]))
  transactions = []
  sessionDebit = 0
}
resetState()

export function getSimulatedBalance(accountId = BANKING_POLICY.sourceAccountId) {
  return balances.get(accountId) ?? 0
}

export function getSimulatedAccountBalances() {
  return Object.fromEntries(balances)
}

export function getSimulatedSessionDebit() {
  return sessionDebit
}

export function executeAuthorizedTransfer(validatedTransaction, authorization, {
  policy = BANKING_POLICY,
  context,
  requestId,
  now = Date.now(),
  hooks = {},
} = {}) {
  if (!consumeTransactionAuthorization(authorization, { transaction: validatedTransaction, context, now })) {
    throw Object.assign(new Error('Transfer operation requires an unused, current authorization bound to these details.'), { code: 'AUTHORIZATION_INVALID' })
  }
  validateTransferAtExecution(validatedTransaction, policy)

  const sourceBalance = balances.get(validatedTransaction.sourceAccountId)
  const destinationBalance = balances.get(validatedTransaction.destinationAccountId)
  const sourceAfter = Number((sourceBalance - validatedTransaction.amount).toFixed(policy.decimalPlaces))
  const destinationAfter = Number((destinationBalance + validatedTransaction.amount).toFixed(policy.decimalPlaces))
  const nextSessionDebit = Number((sessionDebit + validatedTransaction.amount).toFixed(policy.decimalPlaces))
  const priorSessionDebit = sessionDebit
  const transaction = {
    id: `SIM-${randomUUID()}`,
    amount: validatedTransaction.amount,
    currency: policy.supportedCurrency,
    sourceAccountId: validatedTransaction.sourceAccountId,
    destinationAccountId: validatedTransaction.destinationAccountId,
    recipient: validatedTransaction.recipient,
    requestId,
    createdAt: new Date(now).toISOString(),
    balanceAfter: sourceAfter,
  }
  const priorLedger = [...transactions]
  let ledgerInserted = false
  try {
    hooks.beforeLedgerWrite?.(transaction)
    transactions.unshift(transaction)
    ledgerInserted = true
    hooks.afterLedgerWrite?.(transaction)
    balances.set(validatedTransaction.sourceAccountId, sourceAfter)
    balances.set(validatedTransaction.destinationAccountId, destinationAfter)
    sessionDebit = nextSessionDebit
    if (transactions.length > MAX_TRANSACTIONS) transactions.length = MAX_TRANSACTIONS
    return { ...transaction }
  } catch (error) {
    // Restore all affected state if an in-process write hook or ledger step fails.
    balances.set(validatedTransaction.sourceAccountId, sourceBalance)
    balances.set(validatedTransaction.destinationAccountId, destinationBalance)
    sessionDebit = priorSessionDebit
    transactions.splice(0, transactions.length, ...priorLedger)
    throw error
  }
}

function validateTransferAtExecution(transaction, policy) {
  if (!transaction || typeof transaction !== 'object') throw new Error('Validated transaction details are required.')
  const source = getDemoAccountById(transaction.sourceAccountId)
  const destination = getDemoAccountById(transaction.destinationAccountId)
  if (!source?.active || source.role !== 'source' || source.id !== policy.sourceAccountId) throw new Error('Invalid simulated source account.')
  if (!destination?.active || (destination.role !== 'destination' && destination.role !== 'source')) throw new Error('Invalid simulated destination account.')
  if (transaction.recipient !== destination.name) throw new Error('Recipient does not match the authorized destination account.')
  if (source.id === destination.id) throw new Error('Self-transfers are prohibited by simulated policy.')
  if (transaction.currency !== policy.supportedCurrency) throw new Error('Unsupported simulated transfer currency.')
  if (!hasSupportedAmountPrecision(transaction.amount, policy.decimalPlaces)) throw new Error('Invalid simulated transfer amount or precision.')
  if (transaction.amount > policy.maxTransferAmount) throw new Error('Transfer exceeds the simulated per-transaction limit.')
  if (sessionDebit + transaction.amount > policy.maxSessionDebit) throw new Error('Transfer exceeds the simulated account debit limit.')
  if (transaction.amount > getSimulatedBalance(source.id)) throw new Error('Insufficient simulated account balance.')
}

export function resetSimulatedBank() {
  resetState()
}

export function getSimulatedTransactions() {
  return transactions.map((transaction) => ({ ...transaction }))
}
