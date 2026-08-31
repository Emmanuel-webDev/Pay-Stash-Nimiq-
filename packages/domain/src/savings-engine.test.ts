import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculateObligationLuna, type SavingsRule } from './savings-engine.js'
import { nimStringToLuna } from './money.js'

test('percentage: BUILD_UPDATED.md §10.A worked example (100 NIM @ 5% = 5 NIM)', () => {
  const rule: SavingsRule = { type: 'percentage', basisPoints: 500 }
  assert.equal(calculateObligationLuna(rule, nimStringToLuna('100')), nimStringToLuna('5'))
})

test('percentage: truncates toward zero on non-exact division', () => {
  const rule: SavingsRule = { type: 'percentage', basisPoints: 333 } // 3.33%
  // 33 Luna * 333 / 10000 = 1.0989 -> truncates to 1
  assert.equal(calculateObligationLuna(rule, 33n), 1n)
})

test('percentage: rejects out-of-range basis points', () => {
  assert.throws(() => calculateObligationLuna({ type: 'percentage', basisPoints: 10_001 }, 100n))
  assert.throws(() => calculateObligationLuna({ type: 'percentage', basisPoints: -1 }, 100n))
})

test('fixed: BUILD_UPDATED.md §10.B worked example (2 NIM per eligible payment)', () => {
  const rule: SavingsRule = { type: 'fixed', amountLuna: nimStringToLuna('2') }
  assert.equal(calculateObligationLuna(rule, nimStringToLuna('500')), nimStringToLuna('2'))
  // Fixed amount is independent of spend size.
  assert.equal(calculateObligationLuna(rule, nimStringToLuna('0.5')), nimStringToLuna('2'))
})

test('round-up: BUILD_UPDATED.md §10.C worked example (spend 47, interval 10 -> stash 3)', () => {
  const rule: SavingsRule = { type: 'round_up', intervalLuna: nimStringToLuna('10') }
  assert.equal(calculateObligationLuna(rule, nimStringToLuna('47')), nimStringToLuna('3'))
})

test('round-up: exact multiple of the interval produces no obligation', () => {
  const rule: SavingsRule = { type: 'round_up', intervalLuna: nimStringToLuna('10') }
  assert.equal(calculateObligationLuna(rule, nimStringToLuna('40')), 0n)
})

test('round-up: rejects a non-positive interval', () => {
  assert.throws(() => calculateObligationLuna({ type: 'round_up', intervalLuna: 0n }, 100n))
})

test('zero spend produces zero obligation for every rule type', () => {
  const rules: SavingsRule[] = [
    { type: 'percentage', basisPoints: 500 },
    { type: 'round_up', intervalLuna: nimStringToLuna('10') },
  ]
  for (const rule of rules) {
    assert.equal(calculateObligationLuna(rule, 0n), 0n)
  }
})

test('very large spend: near total NIM supply does not overflow or lose precision', () => {
  // Nimiq total supply is ~21,000,000,000 NIM.
  const hugeSpend = nimStringToLuna('21000000000')
  const rule: SavingsRule = { type: 'percentage', basisPoints: 500 }
  assert.equal(calculateObligationLuna(rule, hugeSpend), nimStringToLuna('1050000000'))
})

test('negative spend is rejected', () => {
  assert.throws(() => calculateObligationLuna({ type: 'fixed', amountLuna: 1n }, -1n))
})
