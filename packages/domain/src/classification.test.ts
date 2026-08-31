import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyTransaction, type ObservedTx } from './classification.js'

const SPENDING = 'NQ-SPENDING'
const STASH_DEST = 'NQ-STASH-DEST'

function tx(overrides: Partial<ObservedTx> = {}): ObservedTx {
  return {
    txHash: 'hash-1',
    sender: SPENDING,
    recipient: 'NQ-MERCHANT',
    valueLuna: 1_000n,
    executionResult: true,
    ...overrides,
  }
}

test('eligible spend: sender is spending address, executed, positive value, no exclusions match', () => {
  const result = classifyTransaction({ tx: tx(), spendingAddress: SPENDING, stashDestinationAddress: STASH_DEST })
  assert.equal(result, 'eligible_spend')
})

test('excludes failed transactions', () => {
  const result = classifyTransaction({
    tx: tx({ executionResult: false }),
    spendingAddress: SPENDING,
    stashDestinationAddress: STASH_DEST,
  })
  assert.equal(result, 'ignored')
})

test('excludes zero-value transactions', () => {
  const result = classifyTransaction({
    tx: tx({ valueLuna: 0n }),
    spendingAddress: SPENDING,
    stashDestinationAddress: STASH_DEST,
  })
  assert.equal(result, 'ignored')
})

test('excludes transactions not sent from the spending address', () => {
  const result = classifyTransaction({
    tx: tx({ sender: 'NQ-SOMEONE-ELSE' }),
    spendingAddress: SPENDING,
    stashDestinationAddress: STASH_DEST,
  })
  assert.equal(result, 'ignored')
})

test('stash sweep exclusion: transfer to the configured Stash destination', () => {
  const result = classifyTransaction({
    tx: tx({ recipient: STASH_DEST }),
    spendingAddress: SPENDING,
    stashDestinationAddress: STASH_DEST,
  })
  assert.equal(result, 'stash_sweep')
})

test('stash sweep exclusion: tx hash already recorded as a sweep', () => {
  const result = classifyTransaction({
    tx: tx({ txHash: 'already-a-sweep' }),
    spendingAddress: SPENDING,
    stashDestinationAddress: STASH_DEST,
    knownSweepTxHashes: new Set(['already-a-sweep']),
  })
  assert.equal(result, 'stash_sweep')
})

test('self-transfer exclusion: recipient is a known own address', () => {
  const result = classifyTransaction({
    tx: tx({ recipient: 'NQ-MY-OTHER-WALLET' }),
    spendingAddress: SPENDING,
    stashDestinationAddress: STASH_DEST,
    knownOwnAddresses: new Set(['NQ-MY-OTHER-WALLET']),
  })
  assert.equal(result, 'self_transfer')
})
