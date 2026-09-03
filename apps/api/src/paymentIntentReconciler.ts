import type { Pool } from 'pg'
import { decodeIntentId, getOutgoingTransactions } from './nimiqRpc.js'
import { getOwnedGoal } from './goalAccess.js'
import { settlePaymentIntent, type IntentRow } from './paymentIntentSettlement.js'

// Safety net for payment-intent confirmation: the frontend's own poller
// (apps/web/src/lib/pollUntilConfirmed.ts) is the primary path and handles
// the common case in ~36s, but depends on the page staying open. If it's
// closed, backgrounded, or crashes right after a real transaction was sent
// and signed, nothing would otherwise ever call /submit again. This job
// finds those orphaned-but-real transactions on its own, using the fact
// that every intent's id is embedded in its transaction's on-chain data
// (confirmed live this session — see nimiqRpc.ts's decodeIntentId).
//
// Ordering matters: scan and settle BEFORE touching expiry, never the
// reverse. A real transaction sitting unmatched is exactly the case this
// job exists for — expiring it first would destroy the record it was
// supposed to save. See BUILD_UPDATED.md's payment-intents plan history for
// why the first draft got this backwards.

const MINUTE = 60_000

/** Per-intent backoff — how long since last_checked_at before it's worth another RPC scan, based on age. */
function requiredCheckIntervalMs(ageMs: number): number {
  if (ageMs < 5 * MINUTE) return 30_000
  if (ageMs < 30 * MINUTE) return 2 * MINUTE
  if (ageMs < 6 * 60 * MINUTE) return 15 * MINUTE
  return 60 * MINUTE
}

function isDueForCheck(intent: IntentRow, now: number): boolean {
  const ageMs = now - new Date(intent.created_at).getTime()
  if (!intent.last_checked_at) return true
  const sinceLastCheckMs = now - new Date(intent.last_checked_at).getTime()
  return sinceLastCheckMs >= requiredCheckIntervalMs(ageMs)
}

export type ReconcileResult = { scanned: number; walletsChecked: number; settled: number; expired: number }

export async function reconcilePendingIntents(pool: Pool): Promise<ReconcileResult> {
  const { rows: pending } = await pool.query<IntentRow>(`select * from payment_intents where status = 'pending'`)
  if (pending.length === 0) {
    return { scanned: 0, walletsChecked: 0, settled: 0, expired: 0 }
  }

  const now = Date.now()
  const byWallet = new Map<string, IntentRow[]>()
  for (const intent of pending) {
    const list = byWallet.get(intent.wallet_address) ?? []
    list.push(intent)
    byWallet.set(intent.wallet_address, list)
  }

  let walletsChecked = 0
  let settled = 0

  for (const [walletAddress, intents] of byWallet) {
    if (!intents.some((intent) => isDueForCheck(intent, now))) continue
    walletsChecked++

    const transactions = await getOutgoingTransactions(walletAddress, 50)
    const pendingById = new Map(intents.map((intent) => [intent.id, intent]))

    for (const tx of transactions) {
      const candidateId = decodeIntentId(tx.recipientData)
      if (!candidateId) continue
      // decodeIntentId only proves the data is UUID-shaped — this
      // membership check against THIS wallet's own pending intents is the
      // actual identification.
      const intent = pendingById.get(candidateId)
      if (!intent) continue

      const access = await getOwnedGoal(pool, intent.goal_id, walletAddress)
      if (!access.ok) continue

      const outcome = await settlePaymentIntent({
        pool,
        intentId: intent.id,
        goal: access.goal,
        walletAddress,
        txHash: tx.hash,
      })
      if (outcome.httpStatus === 200) {
        settled++
        pendingById.delete(candidateId)
      }
    }

    await pool.query(`update payment_intents set last_checked_at = now() where id = any($1::uuid[])`, [
      intents.map((intent) => intent.id),
    ])
  }

  // Only now — after every match this cycle has had the chance to settle —
  // expire whatever is still pending and past its horizon.
  const { rowCount: expired } = await pool.query(
    `update payment_intents set status = 'expired' where status = 'pending' and expires_at < now()`,
  )

  return { scanned: pending.length, walletsChecked, settled, expired: expired ?? 0 }
}
