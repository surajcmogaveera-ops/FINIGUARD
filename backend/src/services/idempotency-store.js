const MAX_KEYS = 500
const entries = new Map()

function clone(value) {
  return structuredClone(value)
}

export function beginIdempotentRequest(key, fingerprint) {
  if (key === undefined || key === null || key === '') return { type: 'unkeyed' }
  if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(key)) return { type: 'invalid' }

  const existing = entries.get(key)
  if (existing) {
    if (existing.fingerprint !== fingerprint) return { type: 'conflict' }
    return existing.response
      ? { type: 'duplicate', response: clone(existing.response) }
      : { type: 'pending', response: existing.promise.then(clone) }
  }

  if (entries.size >= MAX_KEYS) return { type: 'full' }

  let resolve
  const promise = new Promise((done) => { resolve = done })
  entries.set(key, { fingerprint, promise, resolve, response: null })
  return { type: 'owner', key }
}

export function completeIdempotentRequest(reservation, response) {
  if (reservation?.type !== 'owner') return
  const entry = entries.get(reservation.key)
  if (!entry) return
  entry.response = clone(response)
  entry.resolve(clone(entry.response))
}

export function resetIdempotencyStore() {
  for (const entry of entries.values()) if (!entry.response) entry.resolve(null)
  entries.clear()
}
