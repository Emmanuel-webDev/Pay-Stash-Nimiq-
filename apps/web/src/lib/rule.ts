import type { SavingsRule } from '@stash/domain'
import type { Goal } from './api'

export function goalToRule(goal: Pick<Goal, 'rule_type' | 'rule_value'>): SavingsRule {
  if (goal.rule_type === 'percentage') return { type: 'percentage', basisPoints: Number(goal.rule_value) }
  if (goal.rule_type === 'fixed') return { type: 'fixed', amountLuna: BigInt(goal.rule_value) }
  return { type: 'round_up', intervalLuna: BigInt(goal.rule_value) }
}
