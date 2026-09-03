import type { Pool } from 'pg'
import type { SavingsRule } from '@stash/domain'

export type GoalRow = {
  id: string
  owner_address: string
  name: string
  target_luna: string
  destination_address: string
  rule_type: 'percentage' | 'fixed' | 'round_up'
  rule_value: string
  status: 'active' | 'paused' | 'completed'
  created_at: string
  updated_at: string
}

export type GoalAccessResult = { ok: true; goal: GoalRow } | { ok: false; status: 403 | 404; error: string }

/** `ownerAddress` here is `request.walletAddress`, resolved from a verified session by `requireAuth` — see auth.ts. */
export async function getOwnedGoal(pool: Pool, goalId: string, ownerAddress: string): Promise<GoalAccessResult> {
  const { rows } = await pool.query<GoalRow>('select * from goals where id = $1', [goalId])
  if (rows.length === 0) return { ok: false, status: 404, error: 'Goal not found' }
  if (rows[0].owner_address !== ownerAddress) {
    return { ok: false, status: 403, error: 'ownerAddress does not match this goal' }
  }
  return { ok: true, goal: rows[0] }
}

export function goalToRule(goal: GoalRow): SavingsRule {
  if (goal.rule_type === 'percentage') return { type: 'percentage', basisPoints: Number(goal.rule_value) }
  if (goal.rule_type === 'fixed') return { type: 'fixed', amountLuna: BigInt(goal.rule_value) }
  return { type: 'round_up', intervalLuna: BigInt(goal.rule_value) }
}
