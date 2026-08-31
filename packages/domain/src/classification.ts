// Implements the eligible-outgoing-transaction classification from
// BUILD_UPDATED.md §9, including the required exclusions.

export type TransactionClassification = 'eligible_spend' | 'self_transfer' | 'stash_sweep' | 'ignored'

export type ObservedTx = {
  txHash: string
  sender: string
  recipient: string
  valueLuna: bigint
  executionResult: boolean
}

export type ClassifyParams = {
  tx: ObservedTx
  spendingAddress: string
  stashDestinationAddress: string
  /** Addresses known to belong to the same user (§9 exclusion 3). */
  knownOwnAddresses?: ReadonlySet<string>
  /** Tx hashes already recorded as Stash sweeps (§9 exclusion 2). */
  knownSweepTxHashes?: ReadonlySet<string>
}

export function classifyTransaction({
  tx,
  spendingAddress,
  stashDestinationAddress,
  knownOwnAddresses,
  knownSweepTxHashes,
}: ClassifyParams): TransactionClassification {
  // §9 required exclusions 4-6: failed, non-spending-address, zero-value.
  if (!tx.executionResult) return 'ignored'
  if (tx.sender !== spendingAddress) return 'ignored'
  if (tx.valueLuna <= 0n) return 'ignored'

  // §9 exclusion 2: previously created Stash sweep transactions.
  if (knownSweepTxHashes?.has(tx.txHash)) return 'stash_sweep'
  // §9 exclusion 1: transfers to the configured Stash destination.
  if (tx.recipient === stashDestinationAddress) return 'stash_sweep'
  // §9 exclusion 3: transfers between addresses known to belong to the same user.
  if (knownOwnAddresses?.has(tx.recipient)) return 'self_transfer'

  return 'eligible_spend'
}
