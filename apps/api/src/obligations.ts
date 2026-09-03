import type { FastifyInstance } from 'fastify'
import { buildObligations, classifyTransaction, type ObservedTx } from '@stash/domain'
import { requireAuth } from './auth.js'
import { getPool } from './db.js'
import { getOwnedGoal, goalToRule } from './goalAccess.js'
import { decodeIntentId, getOutgoingTransactions } from './nimiqRpc.js'

// Ownership is proven by `requireAuth` (see auth.js) on every mutating route
// below. Classification always runs server-side against freshly-fetched
// chain data — see packages/domain's buildObligations docstring and
// BUILD_UPDATED.md §12/§19/§24.
//
// This route used to accept a client-submitted transaction batch (designed
// for the browser light client as the data source). That source was
// dropped as unreliable on real devices (see chainClient.ts's own
// comments) in favor of backend RPC reads everywhere else in this app —
// this route now does the same: it fetches the wallet's own outgoing
// transactions server-side (nimiqRpc.ts's getOutgoingTransactions, the same
// function activity.ts and the payment-intent reconciler use) rather than
// trusting a client-supplied batch, so there's nothing left for a caller to
// submit at all.

export async function obligationsRoutes(app: FastifyInstance) {
  // Triggers an RPC scan — bounded so a Catch-up screen a user keeps
  // revisiting can't hammer the public RPC (BUILD_UPDATED.md §19 point 7's
  // rate-limiting principle, same as payment-intents).
  const syncRateLimit = { max: 20, timeWindow: '1 minute' }

  app.post<{ Params: { goalId: string } }>(
    '/api/goals/:goalId/obligations',
    { preHandler: requireAuth, config: { rateLimit: syncRateLimit } },
    async (request, reply) => {
    const pool = getPool()
    const walletAddress = request.walletAddress!

    const access = await getOwnedGoal(pool, request.params.goalId, walletAddress)
    if (!access.ok) {
      reply.code(access.status)
      return { error: access.error }
    }
    const goal = access.goal
    const rule = goalToRule(goal)

    const transactions = await getOutgoingTransactions(walletAddress, 50)

    const client = await pool.connect()
    try {
      await client.query('begin')

      const { rows: intentRows } = await client.query<{ id: string }>(
        `select id from payment_intents where wallet_address = $1`,
        [walletAddress],
      )
      const knownIntentIds = new Set(intentRows.map((r) => r.id))

      const observedTxs: ObservedTx[] = []
      for (const tx of transactions) {
        const isContractCreation = tx.flags === 1 || tx.toType !== 0
        const intentId = decodeIntentId(tx.recipientData)
        const classification = classifyTransaction({
          tx: {
            txHash: tx.hash,
            // The identity verified to have sent this is the wallet itself
            // (getOutgoingTransactions already established that), never the
            // raw on-chain `tx.from` — see BUILD_UPDATED.md §24.
            sender: walletAddress,
            recipient: tx.to,
            valueLuna: BigInt(tx.value),
            executionResult: tx.executionResult,
            isContractCreation,
            intentId,
          },
          spendingAddress: walletAddress,
          stashDestinationAddress: goal.destination_address,
          knownIntentIds,
        })
        await client.query(
          `insert into observed_transactions
             (tx_hash, owner_address, sender, recipient, value_luna, fee_luna, block_height, "timestamp", execution_result, classification)
           values ($1, $2, $3, $4, $5, 0, $6, to_timestamp($7 / 1000.0), $8, $9)
           on conflict (tx_hash) do nothing`,
          [tx.hash, walletAddress, walletAddress, tx.to, tx.value.toString(), tx.blockNumber, tx.timestamp, tx.executionResult, classification],
        )
        observedTxs.push({
          txHash: tx.hash,
          sender: walletAddress,
          recipient: tx.to,
          valueLuna: BigInt(tx.value),
          executionResult: tx.executionResult,
          isContractCreation,
          intentId,
        })
      }

      const { rows: existingObligations } = await client.query('select tx_hash from obligations where goal_id = $1', [
        goal.id,
      ])
      const { rows: existingSweeps } = await client.query('select tx_hash from sweeps where goal_id = $1', [goal.id])

      const calculated = buildObligations({
        transactions: observedTxs,
        rule,
        spendingAddress: walletAddress,
        stashDestinationAddress: goal.destination_address,
        source: 'external_spend',
        knownSweepTxHashes: new Set(existingSweeps.map((r) => r.tx_hash)),
        knownIntentIds,
        alreadyProcessedTxHashes: new Set(existingObligations.map((r) => r.tx_hash)),
      })

      const inserted = []
      for (const ob of calculated) {
        const { rows } = await client.query(
          `insert into obligations (goal_id, tx_hash, spend_luna, calculated_luna, source)
           values ($1, $2, $3, $4, $5)
           on conflict (goal_id, tx_hash) do nothing
           returning *`,
          [goal.id, ob.txHash, ob.spendLuna.toString(), ob.calculatedLuna.toString(), ob.source],
        )
        if (rows[0]) inserted.push(rows[0])
      }

      await client.query('commit')
      reply.code(201)
      return { obligations: inserted }
    } catch (err) {
      await client.query('rollback')
      throw err
    } finally {
      client.release()
    }
  },
  )

  app.get<{ Params: { goalId: string } }>('/api/goals/:goalId/obligations', async (request, reply) => {
    const query = request.query as Record<string, unknown>
    const address = query.address
    if (typeof address !== 'string' || address.length === 0) {
      reply.code(400)
      return { error: 'address query parameter is required' }
    }
    const access = await getOwnedGoal(getPool(), request.params.goalId, address)
    if (!access.ok) {
      reply.code(access.status)
      return { error: access.error }
    }

    const params: unknown[] = [request.params.goalId]
    let sql = `
      select o.*, t.recipient
      from obligations o
      join observed_transactions t on t.tx_hash = o.tx_hash
      where o.goal_id = $1`
    if (query.status === 'pending' || query.status === 'swept') {
      params.push(query.status)
      sql += ` and o.status = $${params.length}`
    }
    sql += ' order by o.created_at desc'
    const { rows } = await getPool().query(sql, params)
    return { obligations: rows }
  })

  app.get<{ Params: { goalId: string } }>('/api/goals/:goalId/ready-to-stash', async (request, reply) => {
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
      `select coalesce(sum(calculated_luna), 0) as total from obligations where goal_id = $1 and status = 'pending'`,
      [request.params.goalId],
    )
    return { readyToStashLuna: rows[0].total as string }
  })

  // Marks a Pay & Stash obligation as skipped (design.md's "Savings not
  // completed" path) — only valid while it's still pending and still
  // tagged pay_and_stash, so this can't be used to un-sweep or relabel an
  // externally-detected obligation.
  app.patch<{ Params: { goalId: string; obligationId: string } }>(
    '/api/goals/:goalId/obligations/:obligationId/skip',
    { preHandler: requireAuth },
    async (request, reply) => {
      const access = await getOwnedGoal(getPool(), request.params.goalId, request.walletAddress!)
      if (!access.ok) {
        reply.code(access.status)
        return { error: access.error }
      }

      const { rows } = await getPool().query(
        `update obligations set source = 'skipped_savings'
         where id = $1 and goal_id = $2 and status = 'pending' and source = 'pay_and_stash'
         returning *`,
        [request.params.obligationId, request.params.goalId],
      )
      if (rows.length === 0) {
        reply.code(409)
        return { error: 'Obligation not found, not pending, or not eligible to be marked skipped' }
      }
      return rows[0]
    },
  )
}
