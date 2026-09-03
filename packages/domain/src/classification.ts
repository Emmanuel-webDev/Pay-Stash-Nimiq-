// Implements the eligible-outgoing-transaction classification from
// BUILD_UPDATED.md §9, including the required exclusions.
//
// Extended 2026-09-03 for the same reason sender verification was (see
// BUILD_UPDATED.md §24): Nimiq Pay routes payments through HTLC contracts
// as normal behavior, and a wallet's real outgoing tx history now
// legitimately includes the *funding* leg of those contracts (a spend-
// shaped transaction that isn't a spend) and inbound-looking transactions
// where our own wallet is the recipient (refunds, or an HTLC redemption
// that happens to pay the wallet itself). `sender` on ObservedTx is always
// expected to already be the identity that's been verified to have sent
// this (typically the connected wallet address), never a raw on-chain
// `tx.from` — see paymentIntentSettlement.ts's comment at its call site.

export type TransactionClassification =
  | 'eligible_spend'
  | 'self_transfer'
  | 'stash_sweep'
  | 'stash_originated'
  | 'contract_creation'
  | 'ignored'

export type ObservedTx = {
  txHash: string
  sender: string
  recipient: string
  valueLuna: bigint
  executionResult: boolean
  /**
   * True if this transaction created or funded a contract (HTLC, vesting,
   * etc.) rather than spending — Nimiq tx `flags` bit 0 set, or a non-basic
   * recipient account type. Real example: NQ36 -> NQ59, flags: 1, toType: 2,
   * 110,000 NIM — the wallet funding an HTLC it (or Nimiq Pay's own send
   * path) later redeems from, not a 110,000 NIM spend.
   */
  isContractCreation?: boolean
  /**
   * Decoded payment-intent id from recipientData, if UUID-shaped (see
   * apps/api/src/nimiqRpc.ts's decodeIntentId) — not proof by itself, only
   * meaningful in combination with `knownIntentIds` below.
   */
  intentId?: string
}

export type ClassifyParams = {
  tx: ObservedTx
  spendingAddress: string
  stashDestinationAddress: string
  /** Addresses known to belong to the same user (§9 exclusion 3). */
  knownOwnAddresses?: ReadonlySet<string>
  /** Tx hashes already recorded as Stash sweeps (§9 exclusion 2). */
  knownSweepTxHashes?: ReadonlySet<string>
  /**
   * Payment-intent ids this wallet already has a payment_intents row for. A
   * transaction whose decoded intentId is a member went through Pay & Stash
   * and was already handled by that flow's own settlement — counting it
   * again here would double-charge the user. Keyed on the decoded intentId,
   * not on sender: the same HTLC address is reused across payments (a
   * Stash-originated payment and an unrelated external send can share the
   * same `from`), so sender alone can't distinguish the two.
   */
  knownIntentIds?: ReadonlySet<string>
}

export function classifyTransaction({
  tx,
  spendingAddress,
  stashDestinationAddress,
  knownOwnAddresses,
  knownSweepTxHashes,
  knownIntentIds,
}: ClassifyParams): TransactionClassification {
  // §9 required exclusions 4-6: failed, non-spending-address, zero-value.
  if (!tx.executionResult) return 'ignored'
  if (tx.sender !== spendingAddress) return 'ignored'
  if (tx.valueLuna <= 0n) return 'ignored'

  // Money moving back to our own wallet — a refund, or (observed live, see
  // BUILD_UPDATED.md §24) an HTLC redemption that happens to pay the wallet
  // itself — is inbound, not a spend. Checked directly against
  // spendingAddress (always known) rather than relying solely on the
  // caller populating knownOwnAddresses below.
  if (tx.recipient === spendingAddress) return 'self_transfer'

  // Funding a contract is not spending — see ObservedTx.isContractCreation.
  if (tx.isContractCreation) return 'contract_creation'

  // Already went through Pay & Stash and was settled there.
  if (tx.intentId && knownIntentIds?.has(tx.intentId)) return 'stash_originated'

  // §9 exclusion 2: previously created Stash sweep transactions.
  if (knownSweepTxHashes?.has(tx.txHash)) return 'stash_sweep'
  // §9 exclusion 1: transfers to the configured Stash destination.
  if (tx.recipient === stashDestinationAddress) return 'stash_sweep'
  // §9 exclusion 3: transfers between addresses known to belong to the same user.
  if (knownOwnAddresses?.has(tx.recipient)) return 'self_transfer'

  return 'eligible_spend'
}
