import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildObligations, sumReadyToStash } from './ledger.js'
import type { ObservedTx } from './classification.js'
import { nimStringToLuna } from './money.js'

const SPENDING = 'NQ-SPENDING'
const STASH_DEST = 'NQ-STASH-DEST'
const RULE = { type: 'percentage' as const, basisPoints: 500 } // 5%

function tx(overrides: Partial<ObservedTx>): ObservedTx {
  return {
    txHash: 'hash',
    sender: SPENDING,
    recipient: 'NQ-MERCHANT',
    valueLuna: nimStringToLuna('100'),
    executionResult: true,
    ...overrides,
  }
}

test('builds an obligation per eligible transaction (§11 worked example)', () => {
  const transactions = [
    tx({ txHash: 'a', valueLuna: nimStringToLuna('40') }), // 5% -> 2.0
    tx({ txHash: 'b', valueLuna: nimStringToLuna('100') }), // 5% -> 5.0
    tx({ txHash: 'c', valueLuna: nimStringToLuna('30') }), // 5% -> 1.5
  ]
  const obligations = buildObligations({
    transactions,
    rule: RULE,
    spendingAddress: SPENDING,
    stashDestinationAddress: STASH_DEST,
  })
  assert.equal(obligations.length, 3)
  assert.equal(sumReadyToStash(obligations), nimStringToLuna('8.5'))
})

test('duplicate tx hash within one batch is only counted once', () => {
  const transactions = [tx({ txHash: 'dup' }), tx({ txHash: 'dup' })]
  const obligations = buildObligations({
    transactions,
    rule: RULE,
    spendingAddress: SPENDING,
    stashDestinationAddress: STASH_DEST,
  })
  assert.equal(obligations.length, 1)
})

test('tx hash already processed in a prior run is not recounted', () => {
  const transactions = [tx({ txHash: 'already-seen' })]
  const obligations = buildObligations({
    transactions,
    rule: RULE,
    spendingAddress: SPENDING,
    stashDestinationAddress: STASH_DEST,
    alreadyProcessedTxHashes: new Set(['already-seen']),
  })
  assert.equal(obligations.length, 0)
})

test('self-transfer and stash-sweep transactions produce no obligation', () => {
  const transactions = [
    tx({ txHash: 'self', recipient: 'NQ-MY-OTHER-WALLET' }),
    tx({ txHash: 'sweep', recipient: STASH_DEST }),
  ]
  const obligations = buildObligations({
    transactions,
    rule: RULE,
    spendingAddress: SPENDING,
    stashDestinationAddress: STASH_DEST,
    knownOwnAddresses: new Set(['NQ-MY-OTHER-WALLET']),
  })
  assert.equal(obligations.length, 0)
})

test('sumReadyToStash of an empty list is zero', () => {
  assert.equal(sumReadyToStash([]), 0n)
})
