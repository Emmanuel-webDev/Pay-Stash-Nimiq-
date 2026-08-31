// Domain-wide money handling. Every ledger value (goal targets, obligations,
// sweeps) is an integer Luna bigint — never a float, never a JS `number` —
// per BUILD_UPDATED.md §12 "Financial integrity" and §8 domain model.
//
// `number` only re-enters at the Mini App SDK call boundary (apps/web),
// where sendBasicTransaction expects `value: number`; see toSdkValue().

export const LUNA_PER_NIM = 100_000n

/**
 * Parses a decimal NIM string (e.g. "47.3", "0.00001") into integer Luna
 * without floating-point arithmetic. Throws on more precision than Luna
 * supports (5 decimal places) or on a non-numeric string.
 */
export function nimStringToLuna(nim: string): bigint {
  const trimmed = nim.trim()
  const match = /^(\d+)(?:\.(\d+))?$/.exec(trimmed)
  if (!match) {
    throw new Error(`Invalid NIM amount: "${nim}"`)
  }

  const [, wholePart, fractionPart = ''] = match
  if (fractionPart.length > 5) {
    throw new Error(`NIM amount has more precision than Luna supports: "${nim}"`)
  }

  const paddedFraction = fractionPart.padEnd(5, '0')
  return BigInt(wholePart) * LUNA_PER_NIM + BigInt(paddedFraction)
}

/** Formats integer Luna as a decimal NIM string, trimming trailing zeros. */
export function lunaToNimString(luna: bigint): string {
  if (luna < 0n) {
    throw new Error('Luna amount cannot be negative')
  }
  const whole = luna / LUNA_PER_NIM
  const fraction = (luna % LUNA_PER_NIM).toString().padStart(5, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

/**
 * Converts an internal Luna bigint to the `number` the Mini App SDK expects
 * at the point of an actual sendBasicTransaction call. Throws rather than
 * silently truncating if the value exceeds Number.MAX_SAFE_INTEGER.
 */
export function toSdkValue(luna: bigint): number {
  if (luna < 0n) {
    throw new Error('Luna amount cannot be negative')
  }
  if (luna > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Luna amount exceeds Number.MAX_SAFE_INTEGER — cannot pass to SDK safely')
  }
  return Number(luna)
}
