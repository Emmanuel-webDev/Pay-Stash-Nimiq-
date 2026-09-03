import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from './auth.js'
import { getPool } from './db.js'
import { getOwnedGoal } from './goalAccess.js'
import { nimiqAddressSchema } from './nimiqAddress.js'
import { PAYMENT_INTENT_TTL_MS, intentPublicShape, settlePaymentIntent, type IntentRow } from './paymentIntentSettlement.js'
import { isSameAddress } from './util.js'

// Payment-intent-based transaction confirmation (see project plan). The
// server fixes an intent's expected recipient/value BEFORE the frontend
// ever sends the transaction; `submit` re-derives those expected values
// from the stored intent row (never from the request body) and
// independently verifies the real on-chain transaction against them via
// nimiqRpc.ts. Replaces the after-the-fact `sweeps` POST flow, which
// trusted a client-submitted tx hash without independent verification.
//
// Two purposes:
// - 'merchant_payment': Pay & Stash's payment leg. Its expected
//   recipient/value are arbitrary user input with no other prior server
//   record, so they're frozen here before the send.
// - 'stash_transfer': the savings leg (Pay & Stash, auto-created the
//   instant its linked merchant_payment intent confirms) or a Catch-up
//   sweep (created directly against user-selected obligations) — both are
//   just "a transfer to the goal's destination address covering one or
//   more pending obligations," so they share one shape and one obligation
//   join table (payment_intent_obligations).
//
// The actual verify-and-settle logic lives in paymentIntentSettlement.ts,
// shared with the background reconciler (paymentIntentReconciler.ts) so
// there's exactly one implementation of "how do we settle an intent" —
// this file only handles the HTTP surface (parsing, auth, ownership).

const createMerchantIntentSchema = z.object({
  purpose: z.literal('merchant_payment'),
  recipient: nimiqAddressSchema,
  valueLuna: z.string(),
})
const createStashTransferIntentSchema = z.object({
  purpose: z.literal('stash_transfer'),
  obligationIds: z.array(z.string().uuid()).min(1).max(100),
})
const createIntentSchema = z.discriminatedUnion('purpose', [
  createMerchantIntentSchema,
  createStashTransferIntentSchema,
])

const submitSchema = z.object({ txHash: z.string().min(1) })

export async function paymentIntentsRoutes(app: FastifyInstance) {
  // Generous enough for the frontend's legitimate bounded-retry polling on
  // `submit` (up to MAX_POLL_ATTEMPTS attempts, apps/web/src/lib/pollUntilConfirmed.ts)
  // while still bounding abuse — BUILD_UPDATED.md §19 point 7.
  const intentRateLimit = { max: 40, timeWindow: '1 minute' }

  app.post<{ Params: { goalId: string } }>(
    '/api/goals/:goalId/payment-intents',
    { preHandler: requireAuth, config: { rateLimit: intentRateLimit } },
    async (request, reply) => {
      const parsed = createIntentSchema.safeParse(request.body)
      if (!parsed.success) {
        reply.code(400)
        return { error: parsed.error.issues }
      }
      const body = parsed.data
      const pool = getPool()
      const walletAddress = request.walletAddress!

      const access = await getOwnedGoal(pool, request.params.goalId, walletAddress)
      if (!access.ok) {
        reply.code(access.status)
        return { error: access.error }
      }
      const goal = access.goal
      const expiresAt = new Date(Date.now() + PAYMENT_INTENT_TTL_MS).toISOString()

      if (body.purpose === 'merchant_payment') {
        const expectedValueLuna = BigInt(body.valueLuna)
        if (expectedValueLuna <= 0n) {
          reply.code(400)
          return { error: 'valueLuna must be positive' }
        }
        // The frontend also blocks this before ever sending (Pay.tsx), but a
        // merchant_payment intent existing at all for recipient === payer is
        // meaningless — classifyTransaction would exclude the eventual
        // transaction as the user's own stash destination, so there's no
        // valid outcome to protect here. Belt-and-suspenders, not the
        // primary defense.
        if (isSameAddress(body.recipient, walletAddress)) {
          reply.code(400)
          return { error: 'Recipient cannot be your own wallet address' }
        }
        const { rows } = await pool.query<IntentRow>(
          `insert into payment_intents (goal_id, wallet_address, purpose, expected_recipient, expected_value_luna, expires_at)
           values ($1, $2, 'merchant_payment', $3, $4, $5)
           returning *`,
          [goal.id, walletAddress, body.recipient, expectedValueLuna.toString(), expiresAt],
        )
        reply.code(201)
        return intentPublicShape(rows[0])
      }

      // purpose === 'stash_transfer', created directly (Catch-up sweep path;
      // the Pay & Stash savings-leg path creates these internally in `submit`).
      const client = await pool.connect()
      try {
        await client.query('begin')
        const { rows: obligationRows } = await client.query(
          `select id, calculated_luna from obligations where goal_id = $1 and id = any($2::uuid[]) and status = 'pending'`,
          [goal.id, body.obligationIds],
        )
        if (obligationRows.length !== body.obligationIds.length) {
          await client.query('rollback')
          reply.code(400)
          return { error: 'One or more obligationIds not found for this goal, or not pending' }
        }
        const expectedValueLuna = obligationRows.reduce((sum: bigint, r) => sum + BigInt(r.calculated_luna), 0n)

        const { rows: intentRows } = await client.query<IntentRow>(
          `insert into payment_intents (goal_id, wallet_address, purpose, expected_recipient, expected_value_luna, expires_at)
           values ($1, $2, 'stash_transfer', $3, $4, $5)
           returning *`,
          [goal.id, walletAddress, goal.destination_address, expectedValueLuna.toString(), expiresAt],
        )
        const intent = intentRows[0]
        for (const row of obligationRows) {
          await client.query(
            'insert into payment_intent_obligations (intent_id, obligation_id) values ($1, $2)',
            [intent.id, row.id],
          )
        }
        await client.query('commit')
        reply.code(201)
        return intentPublicShape(intent)
      } catch (err) {
        await client.query('rollback')
        throw err
      } finally {
        client.release()
      }
    },
  )

  app.post<{ Params: { goalId: string; intentId: string } }>(
    '/api/goals/:goalId/payment-intents/:intentId/submit',
    { preHandler: requireAuth, config: { rateLimit: intentRateLimit } },
    async (request, reply) => {
      const parsed = submitSchema.safeParse(request.body)
      if (!parsed.success) {
        reply.code(400)
        return { error: parsed.error.issues }
      }
      const { txHash } = parsed.data
      const pool = getPool()
      const walletAddress = request.walletAddress!
      request.log.info({ intentId: request.params.intentId, txHash, walletAddress }, '[payment-intents] submit received')

      const access = await getOwnedGoal(pool, request.params.goalId, walletAddress)
      if (!access.ok) {
        reply.code(access.status)
        return { error: access.error }
      }

      const outcome = await settlePaymentIntent({
        pool,
        intentId: request.params.intentId,
        goal: access.goal,
        walletAddress,
        txHash,
      })
      reply.code(outcome.httpStatus)
      return outcome.body
    },
  )

  app.post<{ Params: { goalId: string; intentId: string } }>(
    '/api/goals/:goalId/payment-intents/:intentId/skip',
    { preHandler: requireAuth, config: { rateLimit: intentRateLimit } },
    async (request, reply) => {
      const pool = getPool()
      const walletAddress = request.walletAddress!

      const access = await getOwnedGoal(pool, request.params.goalId, walletAddress)
      if (!access.ok) {
        reply.code(access.status)
        return { error: access.error }
      }

      const client = await pool.connect()
      try {
        await client.query('begin')
        const { rows } = await client.query<IntentRow>(
          `select * from payment_intents where id = $1 and goal_id = $2 for update`,
          [request.params.intentId, access.goal.id],
        )
        const intent = rows[0]
        if (!intent || intent.wallet_address !== walletAddress) {
          await client.query('rollback')
          reply.code(404)
          return { error: 'Payment intent not found' }
        }
        if (intent.status !== 'pending') {
          await client.query('rollback')
          reply.code(409)
          return { error: 'Only a pending intent can be skipped' }
        }

        await client.query(`update payment_intents set status = 'skipped' where id = $1`, [intent.id])
        const { rows: obligationRows } = await client.query(
          `update obligations set source = 'skipped_savings'
           where id in (select obligation_id from payment_intent_obligations where intent_id = $1)
             and goal_id = $2 and status = 'pending' and source = 'pay_and_stash'
           returning *`,
          [intent.id, access.goal.id],
        )

        await client.query('commit')
        return { obligations: obligationRows }
      } catch (err) {
        await client.query('rollback')
        throw err
      } finally {
        client.release()
      }
    },
  )
}
