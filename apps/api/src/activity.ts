import type { FastifyInstance } from 'fastify'
import { classifyTransaction } from '@stash/domain'
import { decodeIntentId, getOutgoingTransactions } from './nimiqRpc.js'
import { getPool } from './db.js'

// Backend-side transaction history for the Activity screen, via the same
// public RPC apps/api/src/nimiqRpc.ts already uses for payment
// confirmation — replaces the browser-side @nimiq/core light client
// (apps/web/src/lib/nimiq/chainClient.ts's getConfirmedOutgoingTransactions),
// which is unreliable on real devices for the same P2P/consensus reasons
// documented there. Matches BUILD_UPDATED.md §14's originally suggested
// `GET /api/wallets/:address/activity` route.
//
// Runs the same classification as Catch-up (packages/domain's
// classifyTransaction) so the two screens agree on what counts as real
// activity — see BUILD_UPDATED.md §24. getOutgoingTransactions already
// excludes inbound-looking transactions (refunds, self-payments); this
// route additionally hides contract-creation (HTLC funding) and
// self-transfer, which still pass the outgoing test but aren't spends.
// 'ignored' is excluded too, though it should never actually occur here:
// sender is always set to `address` itself (see comment below) and
// getOutgoingTransactions already filters out failed transactions.
const HIDDEN_FROM_ACTIVITY = new Set(['contract_creation', 'self_transfer', 'ignored'])

export async function activityRoutes(app: FastifyInstance) {
  app.get<{ Params: { address: string } }>('/api/wallets/:address/activity', async (request) => {
    const limitParam = (request.query as Record<string, unknown>).limit
    const limit = typeof limitParam === 'string' ? Math.min(Math.max(Number(limitParam) || 30, 1), 100) : 30
    const address = request.params.address
    const pool = getPool()

    // Single active goal per wallet is this cycle's scope (BUILD_UPDATED.md
    // §23) — used only for stashDestinationAddress; a wallet with no goal
    // yet just never matches the stash_sweep exclusion.
    const { rows: goalRows } = await pool.query<{ destination_address: string }>(
      `select destination_address from goals where owner_address = $1 and status = 'active' order by created_at desc limit 1`,
      [address],
    )
    const stashDestinationAddress = goalRows[0]?.destination_address ?? ''

    const { rows: intentRows } = await pool.query<{ id: string }>(`select id from payment_intents where wallet_address = $1`, [
      address,
    ])
    const knownIntentIds = new Set(intentRows.map((r) => r.id))

    const transactions = await getOutgoingTransactions(address, limit)

    const visible = transactions.filter((tx) => {
      const classification = classifyTransaction({
        tx: {
          txHash: tx.hash,
          // The identity that's been verified to have sent this is the
          // wallet itself (getOutgoingTransactions already established
          // that), never the raw on-chain `tx.from` — same substitution as
          // paymentIntentSettlement.ts, for the same HTLC reason.
          sender: address,
          recipient: tx.to,
          valueLuna: BigInt(tx.value),
          executionResult: tx.executionResult,
          isContractCreation: tx.flags === 1 || tx.toType !== 0,
          intentId: decodeIntentId(tx.recipientData),
        },
        spendingAddress: address,
        stashDestinationAddress,
        knownIntentIds,
      })
      return !HIDDEN_FROM_ACTIVITY.has(classification)
    })

    return {
      transactions: visible.map((tx) => ({
        txHash: tx.hash,
        recipient: tx.to,
        valueLuna: tx.value.toString(),
        blockHeight: tx.blockNumber,
        timestamp: tx.timestamp,
      })),
    }
  })
}
