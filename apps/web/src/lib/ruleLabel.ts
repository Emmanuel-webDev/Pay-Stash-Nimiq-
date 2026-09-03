import { lunaToNimString } from '@stash/domain'
import type { Goal } from './api'

export function ruleLabel(goal: Pick<Goal, 'rule_type' | 'rule_value'>): string {
  if (goal.rule_type === 'percentage') return `Save ${Number(goal.rule_value) / 100}% of eligible spending`
  if (goal.rule_type === 'fixed') return `Save ${lunaToNimString(BigInt(goal.rule_value))} NIM per payment`
  return `Round up to ${lunaToNimString(BigInt(goal.rule_value))} NIM`
}
