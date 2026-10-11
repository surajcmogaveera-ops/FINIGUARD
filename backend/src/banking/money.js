export function hasSupportedAmountPrecision(amount, decimalPlaces) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return false
  const representation = String(amount)
  if (!/^\d+(?:\.\d+)?$/.test(representation)) return false
  const fractionalDigits = representation.split('.')[1]?.length ?? 0
  return fractionalDigits <= decimalPlaces && Number.isSafeInteger(Math.round(amount * (10 ** decimalPlaces)))
}
