import type { FastifyInstance } from 'fastify'
import { computeStreakWeeks } from '@stash/domain'
import { getPool } from './db.js'
import { getOwnedGoal } from './goalAccess.js'

// The former POST /api/goals/:goalId/sweeps route (which trusted a
// client-submitted tx hash without independent verification — see its old
// "KNOWN LIMITATION" comment) has been replaced by
// paymentIntentsRoutes' /submit handler for 'stash_transfer' intents,
// which verifies the transaction against the public TestAlbatross RPC
// before ever writing a sweep row. This file now only serves the existing
// read route; sweeps/sweep_obligations remain the receipt/grouping record,
// just no longer a client-facing write path — one verification path, not two.

export async function sweepsRoutes(app: FastifyInstance) {
  // Wallet-scoped, not goal-scoped (packages/domain's computeStreakWeeks
  // doc comment) — a completed goal's sweeps count exactly the same toward
  // the streak as a new goal's, so starting a new goal after completing
  // one cannot reset it. No new table: purely a read-time computation over
  // sweeps joined to goals by owner_address.
  app.get<{ Params: { address: string } }>('/api/wallets/:address/streak', async (request, reply) => {
    const { rows } = await getPool().query<{ confirmed_at: Date }>(
      `select s.confirmed_at
       from sweeps s
       join goals g on g.id = s.goal_id
       where g.owner_address = $1 and s.status = 'confirmed'`,
      [request.params.address],
    )
    const weeks = computeStreakWeeks(rows.map((r) => r.confirmed_at.getTime()))
    return { weeks }
  })


  // Confirmed sweeps for a goal — real, server-verified savings events
  // (each one only exists because settlePaymentIntent independently
  // verified its transaction against the chain by hash, not an
  // address-indexed history scan — see BUILD_UPDATED.md §9's
  // platform-limitation note). This is what Activity's "Saved" list reads.
  app.get<{ Params: { goalId: string } }>('/api/goals/:goalId/sweeps', async (request, reply) => {
    const address = (request.query as Record<string, unknown>).address
    if (typeof address !== 'string' || address.length === 0) {
      reply.code(400)
      return { error: 'address query parameter is required' }
    }
    const access = await getOwnedGoal(getPool(), request.params.goalId, address)
    if (!access.ok) {
      reply.code(access.status)
      return { error: access.error }
    }

    const { rows } = await getPool().query(
      `select * from sweeps where goal_id = $1 and status = 'confirmed' order by confirmed_at desc`,
      [request.params.goalId],
    )
    return { sweeps: rows }
  })

  app.get<{ Params: { goalId: string; sweepId: string } }>(
    '/api/goals/:goalId/sweeps/:sweepId',
    async (request, reply) => {
      const address = (request.query as Record<string, unknown>).address
      if (typeof address !== 'string' || address.length === 0) {
        reply.code(400)
        return { error: 'address query parameter is required' }
      }
      const access = await getOwnedGoal(getPool(), request.params.goalId, address)
      if (!access.ok) {
        reply.code(access.status)
        return { error: access.error }
      }

      const { rows } = await getPool().query('select * from sweeps where id = $1 and goal_id = $2', [
        request.params.sweepId,
        request.params.goalId,
      ])
      if (rows.length === 0) {
        reply.code(404)
        return { error: 'Sweep not found' }
      }
      return rows[0]
    },
  )
}
