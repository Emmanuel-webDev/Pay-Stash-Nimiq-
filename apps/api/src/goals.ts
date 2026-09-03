import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { nimStringToLuna } from '@stash/domain'
import { requireAuth } from './auth.js'
import { getPool } from './db.js'
import { getOwnedGoal } from './goalAccess.js'
import { nimiqAddressSchema } from './nimiqAddress.js'
import { isForeignKeyViolation, isUniqueViolation } from './util.js'

// Ownership is proven by `requireAuth` (BUILD_UPDATED.md §8/§19): every
// mutating route below requires a valid session bearer token, and uses
// `request.walletAddress` — derived from a signed challenge, not
// self-reported — as the owner address. See apps/api/src/auth.ts.

const ruleSchema = z.discriminatedUnion('ruleType', [
  z.object({ ruleType: z.literal('percentage'), ruleValue: z.number().int().min(0).max(10_000) }),
  z.object({ ruleType: z.literal('fixed'), ruleValue: z.string() }),
  z.object({ ruleType: z.literal('round_up'), ruleValue: z.string() }),
])

const createGoalSchema = z
  .object({
    name: z.string().min(1).max(200),
    targetNim: z.string(),
    destinationAddress: nimiqAddressSchema,
  })
  .and(ruleSchema)

const updateGoalSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  targetNim: z.string().optional(),
  // 'completed' is intentionally excluded — it's a terminal status derived
  // exclusively from verified confirmed sweeps reaching target_luna
  // (apps/api/src/paymentIntentSettlement.ts), never from a client claim.
  status: z.enum(['active', 'paused']).optional(),
  destinationAddress: nimiqAddressSchema.optional(),
})

/** rule_value is stored as bigint Luna for fixed/round_up, or the raw basis-point integer for percentage. */
function ruleValueToStorage(input: z.infer<typeof ruleSchema>): bigint {
  if (input.ruleType === 'percentage') return BigInt(input.ruleValue)
  return nimStringToLuna(input.ruleValue)
}

export async function goalsRoutes(app: FastifyInstance) {
  app.post('/api/goals', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = createGoalSchema.safeParse(request.body)
    if (!parsed.success) {
      reply.code(400)
      return { error: parsed.error.issues }
    }
    const body = parsed.data
    const ownerAddress = request.walletAddress!
    // A savings destination equal to the spending wallet defeats the point
    // (BUILD_UPDATED.md §13: savings go to a separate address you control) —
    // "stashing" would just be sending NIM to yourself, with no funds
    // actually set aside.
    if (body.destinationAddress === ownerAddress) {
      reply.code(400)
      return { error: 'Savings destination must be a different address from your spending wallet.' }
    }
    const targetLuna = nimStringToLuna(body.targetNim)
    const ruleValue = ruleValueToStorage(body)

    const pool = getPool()
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query(
        `insert into profiles (wallet_address) values ($1)
         on conflict (wallet_address) do nothing`,
        [ownerAddress],
      )

      const { rows } = await client.query(
        `insert into goals (owner_address, name, target_luna, destination_address, rule_type, rule_value)
         values ($1, $2, $3, $4, $5, $6)
         returning id, owner_address, name, target_luna, destination_address, rule_type, rule_value, status, created_at`,
        [ownerAddress, body.name, targetLuna.toString(), body.destinationAddress, body.ruleType, ruleValue.toString()],
      )
      await client.query('commit')
      reply.code(201)
      return rows[0]
    } catch (err) {
      await client.query('rollback')
      // Unique violation on one_active_goal_per_owner (§8: one active goal per spending wallet).
      if (isUniqueViolation(err)) {
        reply.code(409)
        return { error: 'This wallet already has an active goal.' }
      }
      throw err
    } finally {
      client.release()
    }
  })

  app.get('/api/goals', async (request, reply) => {
    const address = (request.query as Record<string, unknown>).address
    if (typeof address !== 'string' || address.length === 0) {
      reply.code(400)
      return { error: 'address query parameter is required' }
    }
    const { rows } = await getPool().query('select * from goals where owner_address = $1 order by created_at desc', [
      address,
    ])
    return { goals: rows }
  })

  app.patch<{ Params: { goalId: string } }>('/api/goals/:goalId', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = updateGoalSchema.safeParse(request.body)
    if (!parsed.success) {
      reply.code(400)
      return { error: parsed.error.issues }
    }
    const body = parsed.data
    if (body.destinationAddress !== undefined && body.destinationAddress === request.walletAddress) {
      reply.code(400)
      return { error: 'Savings destination must be a different address from your spending wallet.' }
    }
    const pool = getPool()

    const access = await getOwnedGoal(pool, request.params.goalId, request.walletAddress!)
    if (!access.ok) {
      reply.code(access.status)
      return { error: access.error }
    }

    const updates: string[] = []
    const values: unknown[] = []
    let i = 1
    if (body.name !== undefined) {
      updates.push(`name = $${i++}`)
      values.push(body.name)
    }
    if (body.targetNim !== undefined) {
      updates.push(`target_luna = $${i++}`)
      values.push(nimStringToLuna(body.targetNim).toString())
    }
    if (body.status !== undefined) {
      updates.push(`status = $${i++}`)
      values.push(body.status)
    }
    if (body.destinationAddress !== undefined) {
      updates.push(`destination_address = $${i++}`)
      values.push(body.destinationAddress)
    }
    if (updates.length === 0) {
      reply.code(400)
      return { error: 'No fields to update' }
    }
    updates.push('updated_at = now()')
    values.push(request.params.goalId)

    try {
      const { rows } = await pool.query(`update goals set ${updates.join(', ')} where id = $${i} returning *`, values)
      return rows[0]
    } catch (err) {
      // Reactivating a paused goal (status: 'active') while another active
      // goal already exists hits one_active_goal_per_owner — same
      // constraint POST /api/goals already handles as a 409, this path
      // was just missing the same handling.
      if (isUniqueViolation(err)) {
        reply.code(409)
        return { error: 'This wallet already has an active goal.' }
      }
      throw err
    }
  })

  app.delete<{ Params: { goalId: string } }>(
    '/api/goals/:goalId',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const { rowCount } = await getPool().query('delete from goals where id = $1 and owner_address = $2', [
          request.params.goalId,
          request.walletAddress!,
        ])
        if (rowCount === 0) {
          reply.code(404)
          return { error: 'Goal not found for this owner' }
        }
        reply.code(204)
      } catch (err) {
        // A goal with any real activity (obligations, payment intents,
        // sweeps) can't be deleted out from under that history — none of
        // those tables cascade on goal deletion, by design.
        if (isForeignKeyViolation(err)) {
          reply.code(409)
          return { error: 'This goal has existing activity and cannot be deleted. Pause it instead.' }
        }
        throw err
      }
    },
  )
}
