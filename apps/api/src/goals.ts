import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { nimStringToLuna } from '@stash/domain'
import { getPool } from './db.js'

// NOTE: no ownership verification yet. `ownerAddress` is a self-reported
// value from the request body, not a proven wallet owner — BUILD_UPDATED.md
// §19 explicitly forbids trusting that for real writes. This module exists
// to prove the persistence schema and idempotency, not as a secured API.
// Signed-challenge auth (§8) is a follow-up, gated on verifying Nimiq's
// actual signature/address-derivation scheme first (see README).

const ruleSchema = z.discriminatedUnion('ruleType', [
  z.object({ ruleType: z.literal('percentage'), ruleValue: z.number().int().min(0).max(10_000) }),
  z.object({ ruleType: z.literal('fixed'), ruleValue: z.string() }),
  z.object({ ruleType: z.literal('round_up'), ruleValue: z.string() }),
])

const createGoalSchema = z
  .object({
    ownerAddress: z.string().min(1),
    name: z.string().min(1).max(200),
    targetNim: z.string(),
    destinationAddress: z.string().min(1),
  })
  .and(ruleSchema)

const updateGoalSchema = z.object({
  ownerAddress: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  targetNim: z.string().optional(),
  status: z.enum(['active', 'paused', 'completed']).optional(),
  destinationAddress: z.string().min(1).optional(),
})

/** rule_value is stored as bigint Luna for fixed/round_up, or the raw basis-point integer for percentage. */
function ruleValueToStorage(input: z.infer<typeof ruleSchema>): bigint {
  if (input.ruleType === 'percentage') return BigInt(input.ruleValue)
  return nimStringToLuna(input.ruleValue)
}

export async function goalsRoutes(app: FastifyInstance) {
  app.post('/api/goals', async (request, reply) => {
    const parsed = createGoalSchema.safeParse(request.body)
    if (!parsed.success) {
      reply.code(400)
      return { error: parsed.error.issues }
    }
    const body = parsed.data
    const targetLuna = nimStringToLuna(body.targetNim)
    const ruleValue = ruleValueToStorage(body)

    const pool = getPool()
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query(
        `insert into profiles (wallet_address) values ($1)
         on conflict (wallet_address) do nothing`,
        [body.ownerAddress],
      )

      const { rows } = await client.query(
        `insert into goals (owner_address, name, target_luna, destination_address, rule_type, rule_value)
         values ($1, $2, $3, $4, $5, $6)
         returning id, owner_address, name, target_luna, destination_address, rule_type, rule_value, status, created_at`,
        [body.ownerAddress, body.name, targetLuna.toString(), body.destinationAddress, body.ruleType, ruleValue.toString()],
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

  app.patch<{ Params: { goalId: string } }>('/api/goals/:goalId', async (request, reply) => {
    const parsed = updateGoalSchema.safeParse(request.body)
    if (!parsed.success) {
      reply.code(400)
      return { error: parsed.error.issues }
    }
    const body = parsed.data
    const pool = getPool()

    const { rows: existingRows } = await pool.query('select owner_address from goals where id = $1', [
      request.params.goalId,
    ])
    if (existingRows.length === 0) {
      reply.code(404)
      return { error: 'Goal not found' }
    }
    if (existingRows[0].owner_address !== body.ownerAddress) {
      reply.code(403)
      return { error: 'ownerAddress does not match this goal' }
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

    const { rows } = await pool.query(`update goals set ${updates.join(', ')} where id = $${i} returning *`, values)
    return rows[0]
  })

  app.delete<{ Params: { goalId: string }; Body: { ownerAddress?: string } }>(
    '/api/goals/:goalId',
    async (request, reply) => {
      const ownerAddress = request.body?.ownerAddress
      if (!ownerAddress) {
        reply.code(400)
        return { error: 'ownerAddress is required' }
      }
      const { rowCount } = await getPool().query('delete from goals where id = $1 and owner_address = $2', [
        request.params.goalId,
        ownerAddress,
      ])
      if (rowCount === 0) {
        reply.code(404)
        return { error: 'Goal not found for this owner' }
      }
      reply.code(204)
    },
  )
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === '23505'
}
