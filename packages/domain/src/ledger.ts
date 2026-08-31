import { classifyTransaction, type ObservedTx } from './classification.js'
import { calculateObligationLuna, type SavingsRule } from './savings-engine.js'

export type CalculatedObligation = {
  txHash: string
  spendLuna: bigint
  calculatedLuna: bigint
}

export type BuildObligationsParams = {
  transactions: readonly ObservedTx[]
  rule: SavingsRule
  spendingAddress: string
  stashDestinationAddress: string
  knownOwnAddresses?: ReadonlySet<string>
  knownSweepTxHashes?: ReadonlySet<string>
  /** Tx hashes that already have an obligation recorded (§8: unique per goalId + txHash). */
  alreadyProcessedTxHashes?: ReadonlySet<string>
}

/**
 * Turns a batch of observed transactions into new savings obligations.
 * Pure and idempotent: re-running with the same `alreadyProcessedTxHashes`
 * (§9 exclusion 5, §8 unique constraint) never double-counts a tx, whether
 * it repeats across calls or within the same batch.
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
    })
    if (classification !== 'eligible_spend') continue

    const calculatedLuna = calculateObligationLuna(params.rule, tx.valueLuna)
    if (calculatedLuna <= 0n) continue

    obligations.push({ txHash: tx.txHash, spendLuna: tx.valueLuna, calculatedLuna })
  }

  return obligations
}

/** The "Ready to Stash" dashboard value (BUILD_UPDATED.md §11): sum of pending obligations. */
export function sumReadyToStash(obligations: readonly { calculatedLuna: bigint }[]): bigint {
  return obligations.reduce((sum, o) => sum + o.calculatedLuna, 0n)
}
