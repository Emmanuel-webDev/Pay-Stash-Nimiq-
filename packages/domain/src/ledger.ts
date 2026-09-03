import { classifyTransaction, type ObservedTx } from './classification.js'
import { calculateObligationLuna, type SavingsRule } from './savings-engine.js'

/**
 * How an obligation's underlying spend came to be known (added when Pay &
 * Stash became the primary loop — see BUILD_UPDATED.md's reconciliation
 * note and design.md §9):
 *
 * - 'pay_and_stash': the spend was a merchant payment made through Stash's
 *   own Pay & Stash flow, and its savings leg completed in the same flow.
 * - 'skipped_savings': same origin as above, but the user skipped or
 *   rejected the savings approval — the payment stands, the obligation
 *   goes to Catch-up.
 * - 'external_spend': the spend was never actively prompted by Stash at
 *   all — discovered later from chain history (the original passive loop).
 */
export type ObligationSource = 'pay_and_stash' | 'external_spend' | 'skipped_savings'

export type CalculatedObligation = {
  txHash: string
  spendLuna: bigint
  calculatedLuna: bigint
  source: ObligationSource
}

export type BuildObligationsParams = {
  transactions: readonly ObservedTx[]
  rule: SavingsRule
  spendingAddress: string
  stashDestinationAddress: string
  /**
   * How the caller came to know about these transactions — a Pay & Stash
   * submission (one known payment just made through Stash) or an external
   * sync (chain history scanned in the background). Classification always
   * runs regardless of source: the backend never trusts a caller's claim
   * that a transaction is eligible, per BUILD_UPDATED.md §12/§19 — `source`
   * only labels *how* an already-independently-classified obligation was
   * discovered, it never skips classification.
   */
  source: ObligationSource
  knownOwnAddresses?: ReadonlySet<string>
  knownSweepTxHashes?: ReadonlySet<string>
  /** See classification.ts's ClassifyParams.knownIntentIds. */
  knownIntentIds?: ReadonlySet<string>
  /** Tx hashes that already have an obligation recorded (§8: unique per goalId + txHash). */
  alreadyProcessedTxHashes?: ReadonlySet<string>
}

/**
 * Turns a batch of observed transactions into new savings obligations.
 * Pure and idempotent: re-running with the same `alreadyProcessedTxHashes`
 * (§9 exclusion 5, §8 unique constraint) never double-counts a tx, whether
 * it repeats across calls or within the same batch. Used for both the Pay
 * & Stash flow (a single-element `transactions` array) and the external
 * chain-history sync (many elements) — see `source` above.
 */
export function buildObligations(params: BuildObligationsParams): CalculatedObligation[] {
  const obligations: CalculatedObligation[] = []
  const seenInBatch = new Set<string>()

  for (const tx of params.transactions) {
    if (params.alreadyProcessedTxHashes?.has(tx.txHash)) continue
    if (seenInBatch.has(tx.txHash)) continue
    seenInBatch.add(tx.txHash)

    const classification = classifyTransaction({
      tx,
      spendingAddress: params.spendingAddress,
      stashDestinationAddress: params.stashDestinationAddress,
      knownOwnAddresses: params.knownOwnAddresses,
      knownSweepTxHashes: params.knownSweepTxHashes,
      knownIntentIds: params.knownIntentIds,
    })
    if (classification !== 'eligible_spend') continue

    const calculatedLuna = calculateObligationLuna(params.rule, tx.valueLuna)
    if (calculatedLuna <= 0n) continue

    obligations.push({ txHash: tx.txHash, spendLuna: tx.valueLuna, calculatedLuna, source: params.source })
  }

  return obligations
}

/** The "Ready to Stash" / Catch-up total: sum of pending obligations, any source. */
export function sumReadyToStash(obligations: readonly { calculatedLuna: bigint }[]): bigint {
  return obligations.reduce((sum, o) => sum + o.calculatedLuna, 0n)
}
