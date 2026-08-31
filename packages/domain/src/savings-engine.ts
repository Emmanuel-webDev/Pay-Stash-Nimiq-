// Implements the three Cycle II savings rules from BUILD_UPDATED.md §10.
// All arithmetic is integer bigint Luna — no floats.

export type SavingsRule =
  | { type: 'percentage'; basisPoints: number } // e.g. 500 = 5%
  | { type: 'fixed'; amountLuna: bigint }
  | { type: 'round_up'; intervalLuna: bigint }

/**
 * Calculates the savings obligation for one eligible outgoing payment.
 * Returns 0n when the rule produces no obligation (e.g. round-up on a spend
 * that's already an exact multiple of the interval).
 */
export function calculateObligationLuna(rule: SavingsRule, spendLuna: bigint): bigint {
  if (spendLuna < 0n) {
    throw new Error('spendLuna cannot be negative')
  }

  switch (rule.type) {
    case 'percentage': {
      if (rule.basisPoints < 0 || rule.basisPoints > 10_000) {
        throw new Error('basisPoints must be between 0 and 10000')
      }
      // Integer division truncates toward zero — matches BUILD_UPDATED.md
      // §10.A's `spendLuna * BigInt(basisPoints) / 10_000n` exactly.
      return (spendLuna * BigInt(rule.basisPoints)) / 10_000n
    }
    case 'fixed': {
      if (rule.amountLuna < 0n) {
        throw new Error('amountLuna cannot be negative')
      }
      return rule.amountLuna
    }
    case 'round_up': {
      if (rule.intervalLuna <= 0n) {
        throw new Error('intervalLuna must be positive')
      }
      const remainder = spendLuna % rule.intervalLuna
      // Already an exact multiple of the interval — nothing to round up.
      return remainder === 0n ? 0n : rule.intervalLuna - remainder
    }
  }
}
