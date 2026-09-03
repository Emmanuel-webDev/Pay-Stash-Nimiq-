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

// The five fixtures below are real TestAlbatross transactions for wallet
// NQ36 9F2P L44G 8TS0 XTP1 6KH0 N0GA 6PXA CV8M, captured live this session
// — see BUILD_UPDATED.md §24. `sender` on each is set to NQ36 itself, not
// the real on-chain `from` (usually an HTLC): that substitution is the
// caller's job (nimiqRpc.ts's getOutgoingTransactions establishes the tx is
// really NQ36's before classification ever runs), not classifyTransaction's
// — see the comment at the top of classification.ts.
const OUR_WALLET = 'NQ36 9F2P L44G 8TS0 XTP1 6KH0 N0GA 6PXA CV8M'

test('real fixture: contract creation is excluded (bbb16711... NQ36 -> NQ59 HTLC, flags:1, toType:2, 110,000 NIM)', () => {
  const result = classifyTransaction({
    tx: {
      txHash: 'bbb167119f51ae50af05a6cebd806f23a25f34291f88766bc64fdada89579b45',
      sender: OUR_WALLET,
      recipient: 'NQ59 RCVY 8X71 0XY8 YAYB 7RAS B9J3 KBHG CE5Y',
      valueLuna: 11_000_000_000n,
      executionResult: true,
      isContractCreation: true, // flags: 1, toType: 2
    },
    spendingAddress: OUR_WALLET,
    stashDestinationAddress: STASH_DEST,
  })
  assert.equal(result, 'contract_creation')
})

test('real fixture: refund back to our own wallet is excluded (51ec79a0... 109,500 NIM to NQ36)', () => {
  const result = classifyTransaction({
    tx: {
      txHash: '51ec79a01321bf52767cce7de6b4ef2b7be6defd436121a465073356dc8ef8bd',
      sender: OUR_WALLET, // real on-chain from is NQ59 (HTLC), substituted per convention
      recipient: OUR_WALLET, // real on-chain to
      valueLuna: 10_950_000_000n,
      executionResult: true,
    },
    spendingAddress: OUR_WALLET,
    stashDestinationAddress: STASH_DEST,
  })
  assert.equal(result, 'self_transfer')
})

test('real fixture: self-payment (to == our wallet) is excluded even though recipientData decodes to a real intentId (872b874b...)', () => {
  const result = classifyTransaction({
    tx: {
      txHash: '872b874becdad1ba29512f9c8868d30b879f6e617a12d934a9905faa842fdd83',
      sender: OUR_WALLET,
      recipient: OUR_WALLET,
      valueLuna: 50_000_000n,
      executionResult: true,
      intentId: '96f7feac-39fb-40df-b55f-8528cc4aade7',
    },
    spendingAddress: OUR_WALLET,
    stashDestinationAddress: STASH_DEST,
    // Even if this exact id were still a known intent, self-payment must
    // win — a transaction paying our own wallet is never a real spend.
    knownIntentIds: new Set(['96f7feac-39fb-40df-b55f-8528cc4aade7']),
  })
  assert.equal(result, 'self_transfer')
})

test('real fixture: Stash-originated payment is recognized and not double-charged (672b5867..., NQ17 HTLC -> NQ71 third party)', () => {
  const intentId = '5e56cd8d-de68-4af6-b2f1-6b9c1bc0d3b2' // real decoded recipientData
  const result = classifyTransaction({
    tx: {
      txHash: '672b586759ff0a039052fec3e114367d263de758fde1c30f6f0ccca08b4db056',
      sender: OUR_WALLET, // real on-chain from is NQ17 (HTLC), substituted per convention
      recipient: 'NQ71 CK94 3V7U H62Y 4L0F GUUK DPA4 6SA6 DKKM',
      valueLuna: 10_000_000n,
      executionResult: true,
      intentId,
    },
    spendingAddress: OUR_WALLET,
    stashDestinationAddress: STASH_DEST,
    knownIntentIds: new Set([intentId]),
  })
  assert.equal(result, 'stash_originated')
})

test('real fixture: a genuine external spend is eligible (52730624..., NQ17 HTLC -> NQ82 third party, 50,000,000 Luna)', () => {
  // Same HTLC (NQ17) as the Stash-originated fixture above — proves sender
  // alone can't distinguish the two; only the decoded intentId does.
  const result = classifyTransaction({
    tx: {
      txHash: '52730624d6f0de35355d5af8018842b80674a39668f813d26f420c8268bc7304',
      sender: OUR_WALLET, // real on-chain from is NQ17 (HTLC), substituted per convention
      recipient: 'NQ82 BHPS UR9K 07X1 X6QH 3DY3 J325 UCSP UHV3',
      valueLuna: 50_000_000n,
      executionResult: true,
      intentId: undefined, // real recipientData is empty — no intent to decode
    },
    spendingAddress: OUR_WALLET,
    stashDestinationAddress: STASH_DEST,
    knownIntentIds: new Set(['5e56cd8d-de68-4af6-b2f1-6b9c1bc0d3b2']), // a different intent; must not match
  })
  assert.equal(result, 'eligible_spend')
})
