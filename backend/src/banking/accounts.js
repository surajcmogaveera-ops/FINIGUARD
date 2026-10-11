export const DEMO_ACCOUNTS = Object.freeze([
  Object.freeze({ id: 'sim-checking-001', name: 'Demo User', role: 'source', active: true, riskStatus: 'CLEAR' }),
  Object.freeze({ id: 'sim-beneficiary-ananya', name: 'Ananya', role: 'destination', active: true, riskStatus: 'CLEAR' }),
  Object.freeze({ id: 'sim-beneficiary-ravi', name: 'Ravi', role: 'destination', active: true, riskStatus: 'CLEAR' }),
  Object.freeze({ id: 'sim-beneficiary-review', name: 'Review Hold', role: 'destination', active: true, riskStatus: 'REVIEW' }),
])

const ACCOUNT_BY_ID = new Map(DEMO_ACCOUNTS.map((account) => [account.id, account]))
const ACCOUNT_BY_NAME = new Map(DEMO_ACCOUNTS.map((account) => [account.name.toLocaleLowerCase('en'), account]))

export function getDemoAccountById(id) {
  return ACCOUNT_BY_ID.get(id) ?? null
}

export function resolveDemoAccount(name) {
  return typeof name === 'string' ? ACCOUNT_BY_NAME.get(name.trim().normalize('NFKC').toLocaleLowerCase('en')) ?? null : null
}
