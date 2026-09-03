import type { Pool } from 'pg'
import { buildObligations, classifyTransaction, type ObservedTx } from '@stash/domain'
import { goalToRule, type GoalRow } from './goalAccess.js'
import { isUniqueViolation } from './util.js'
import { verifyTransactionOnChain } from './nimiqRpc.js'

// Extracted from what used to be the entire body of POST
// /payment-intents/:intentId/submit, so the HTTP route and the background
// reconciler (paymentIntentReconciler.ts) run exactly the same settlement
// logic — one verification path, not two. The HTTP route is now a thin
// wrapper: parse body -> requireAuth -> getOwnedGoal -> settlePaymentIntent
// -> map the outcome to a reply.

export const PAYMENT_INTENT_TTL_MS = 24 * 60 * 60 * 1000

export type IntentRow = {
  id: string
  goal_id: string
  wallet_address: string
  purpose: 'merchant_payment' | 'stash_transfer'
  expected_recipient: string
  expected_value_luna: string
  status: 'pending' | 'confirmed' | 'skipped' | 'expired'
  tx_hash: string | null
  linked_intent_id: string | null
  expires_at: string
  created_at: string
  last_checked_at: string | null
}

export function intentPublicShape(row: IntentRow) {
  return {
    intentId: row.id,
    recipient: row.expected_recipient,
    valueLuna: row.expected_value_luna,
    expiresAt: row.expires_at,
  }
}

type ConfirmedBody =
  | { obligation: Record<string, unknown> | null; savingsIntent: ReturnType<typeof intentPublicShape> | null }
  | { sweepId: string; obligationIds: string[] }

export type SettleOutcome =
  | { httpStatus: 200; body: ConfirmedBody }
  | { httpStatus: 404; body: { error: string } }
  | { httpStatus: 409; body: { error: string; retryable?: boolean } }

export async function settlePaymentIntent(params: {
  pool: Pool
  intentId: string
  goal: GoalRow
  walletAddress: string
  txHash: string
}): Promise<SettleOutcome> {
  const { pool, intentId, goal, walletAddress, txHash } = params
  const client = await pool.connect()
  try {
    await client.query('begin')
    const { rows } = await client.query<IntentRow>(
      `select * from payment_intents where id = $1 and goal_id = $2 for update`,
      [intentId, goal.id],
    )
    const intent = rows[0]
    if (!intent || intent.wallet_address !== walletAddress) {
      await client.query('rollback')
      return { httpStatus: 404, body: { error: 'Payment intent not found' } }
    }

    if (intent.status === 'confirmed') {
      await client.query('commit')
      if (intent.tx_hash !== txHash) {
        return { httpStatus: 409, body: { error: 'This intent is already confirmed against a different transaction', retryable: false } }
      }
      return { httpStatus: 200, body: await confirmedIntentResponse(pool, intent) }
    }
    if (intent.status === 'skipped') {
      await client.query('rollback')
      return { httpStatus: 409, body: { error: 'This intent was skipped', retryable: false } }
    }
    if (intent.status === 'expired' || new Date(intent.expires_at).getTime() <= Date.now()) {
      await client.query(`update payment_intents set status = 'expired' where id = $1`, [intent.id])
      await client.query('commit')
      return { httpStatus: 409, body: { error: 'This payment window expired before it could be confirmed', retryable: false } }
    }

    const verification = await verifyTransactionOnChain({
      txHash,
      expectedSender: walletAddress,
      expectedRecipient: intent.expected_recipient,
      expectedValueLuna: BigInt(intent.expected_value_luna),
    })
    if (!verification.ok) {
      await client.query('rollback')
      return { httpStatus: 409, body: { error: verification.reason, retryable: verification.retryable } }
    }
    const tx = verification.tx

    if (intent.purpose === 'merchant_payment') {
      // classifyTransaction/buildObligations compare `sender` against the
      // authenticated wallet to decide if this was the user's own spend.
      // The real on-chain `tx.from` can legitimately be a contract the
      // wallet redeemed from instead of the wallet itself in principle
      // (verifyTransactionOnChain uses strict direct-match only as of
      // 2026-09-03 — see BUILD_UPDATED.md §24 for why a prior lenient
      // fallback here was reverted) — use `walletAddress`, the identity
      // that's actually been verified to have spent this, not the raw
      // chain address, or a contract-redeemed payment would silently
      // classify as 'ignored' and never become an obligation.
      const classification = classifyTransaction({
        tx: { txHash, sender: walletAddress, recipient: tx.to, valueLuna: BigInt(tx.value), executionResult: tx.executionResult },
        spendingAddress: walletAddress,
        stashDestinationAddress: goal.destination_address,
      })
      await client.query(
        `insert into observed_transactions
           (tx_hash, owner_address, sender, recipient, value_luna, fee_luna, block_height, "timestamp", execution_result, classification)
         values ($1, $2, $3, $4, $5, 0, $6, to_timestamp($7 / 1000.0), $8, $9)
         on conflict (tx_hash) do nothing`,
        [txHash, walletAddress, tx.from, tx.to, tx.value.toString(), tx.blockNumber, tx.timestamp, tx.executionResult, classification],
      )

      const observedTx: ObservedTx = {
        txHash,
        sender: walletAddress,
        recipient: tx.to,
        valueLuna: BigInt(tx.value),
        executionResult: tx.executionResult,
      }
      const [calculated] = buildObligations({
        transactions: [observedTx],
        rule: goalToRule(goal),
        spendingAddress: walletAddress,
        stashDestinationAddress: goal.destination_address,
        source: 'pay_and_stash',
      })

      await client.query(`update payment_intents set status = 'confirmed', tx_hash = $1 where id = $2`, [txHash, intent.id])

      if (!calculated) {
        await client.query('commit')
        return { httpStatus: 200, body: { obligation: null, savingsIntent: null } }
      }

      const { rows: obligationRows } = await client.query(
        `insert into obligations (goal_id, tx_hash, spend_luna, calculated_luna, source)
         values ($1, $2, $3, $4, $5)
         on conflict (goal_id, tx_hash) do nothing
         returning *`,
        [goal.id, calculated.txHash, calculated.spendLuna.toString(), calculated.calculatedLuna.toString(), calculated.source],
      )
      const obligation = obligationRows[0]
      if (!obligation) {
        await client.query('commit')
        return { httpStatus: 200, body: { obligation: null, savingsIntent: null } }
      }
      await client.query('insert into payment_intent_obligations (intent_id, obligation_id) values ($1, $2)', [intent.id, obligation.id])

      const savingsExpiresAt = new Date(Date.now() + PAYMENT_INTENT_TTL_MS).toISOString()
      const { rows: savingsIntentRows } = await client.query<IntentRow>(
        `insert into payment_intents (goal_id, wallet_address, purpose, expected_recipient, expected_value_luna, linked_intent_id, expires_at)
         values ($1, $2, 'stash_transfer', $3, $4, $5, $6)
         returning *`,
        [goal.id, walletAddress, goal.destination_address, obligation.calculated_luna, intent.id, savingsExpiresAt],
      )
      const savingsIntent = savingsIntentRows[0]
      await client.query('insert into payment_intent_obligations (intent_id, obligation_id) values ($1, $2)', [
        savingsIntent.id,
        obligation.id,
      ])

      await client.query('commit')
      return { httpStatus: 200, body: { obligation, savingsIntent: intentPublicShape(savingsIntent) } }
    }

    // purpose === 'stash_transfer'
    const { rows: linkedObligationRows } = await client.query(
      `select o.id, o.calculated_luna
       from payment_intent_obligations po
       join obligations o on o.id = po.obligation_id
       where po.intent_id = $1`,
      [intent.id],
    )
    const obligationIds: string[] = linkedObligationRows.map((r) => r.id)

    // Locks the goal row before the completion check below — without this,
    // two settlements against the same goal racing concurrently (the HTTP
    // /submit route and the background reconciler, or two overlapping
    // Catch-up sweeps) could each sum a sub-threshold total under READ
    // COMMITTED and both miss completion even though their combined sweeps
    // cross target_luna.
    await client.query(`select * from goals where id = $1 for update`, [goal.id])

    const { rows: sweepRows } = await client.query(
      `insert into sweeps (goal_id, amount_luna, tx_hash, status, confirmed_at)
       values ($1, $2, $3, 'confirmed', now())
       returning *`,
      [goal.id, intent.expected_value_luna, txHash],
    )
    const sweep = sweepRows[0]
    for (const obligationId of obligationIds) {
      await client.query('insert into sweep_obligations (sweep_id, obligation_id) values ($1, $2)', [sweep.id, obligationId])
    }
    await client.query(`update obligations set status = 'swept' where id = any($1::uuid[])`, [obligationIds])
    await client.query(`update payment_intents set status = 'confirmed', tx_hash = $1 where id = $2`, [txHash, intent.id])

    // Terminal completion, derived exclusively from verified, confirmed
    // sweeps — never from anything client-supplied (see goals.ts, which
    // now refuses to let a client PATCH status: 'completed' directly).
    // Idempotent: `status <> 'completed'` means a goal that's already
    // completed (e.g. further Catch-up activity after target was reached)
    // is left alone.
    const { rows: totalRows } = await client.query(
      `select coalesce(sum(amount_luna), 0) as total from sweeps where goal_id = $1 and status = 'confirmed'`,
      [goal.id],
    )
    const sweptTotal = BigInt(totalRows[0].total)
    if (sweptTotal >= BigInt(goal.target_luna)) {
      await client.query(`update goals set status = 'completed', updated_at = now() where id = $1 and status <> 'completed'`, [
        goal.id,
      ])
    }

    await client.query('commit')
    return { httpStatus: 200, body: { sweepId: sweep.id, obligationIds } }
  } catch (err) {
    await client.query('rollback')
    if (isUniqueViolation(err)) {
      return { httpStatus: 409, body: { error: 'This transaction has already been recorded elsewhere', retryable: false } }
    }
    throw err
  } finally {
    client.release()
  }
}

async function confirmedIntentResponse(pool: Pool, intent: IntentRow): Promise<ConfirmedBody> {
  const { rows: obligationRows } = await pool.query(
    `select o.* from payment_intent_obligations po join obligations o on o.id = po.obligation_id where po.intent_id = $1`,
    [intent.id],
  )
  if (intent.purpose === 'merchant_payment') {
    const { rows: savingsIntentRows } = await pool.query<IntentRow>(`select * from payment_intents where linked_intent_id = $1`, [
      intent.id,
    ])
    return {
      obligation: obligationRows[0] ?? null,
      savingsIntent: savingsIntentRows[0] ? intentPublicShape(savingsIntentRows[0]) : null,
    }
  }
  const { rows: sweepRows } = await pool.query(`select id from sweeps where tx_hash = $1`, [intent.tx_hash])
  return { sweepId: sweepRows[0]?.id ?? '', obligationIds: obligationRows.map((o) => o.id) }
}
