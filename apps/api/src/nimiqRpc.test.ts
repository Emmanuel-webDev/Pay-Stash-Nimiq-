import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyTransactionOnChain, getOutgoingTransactions } from './nimiqRpc.js'

const OUR_WALLET = 'NQ36 9F2P L44G 8TS0 XTP1 6KH0 N0GA 6PXA CV8M'

// Fixture is a REAL TestAlbatross transaction captured this session —
// 872b874becdad1ba29512f9c8868d30b879f6e617a12d934a9905faa842fdd83 — an
// HTLC-sourced payment where tx.from is the HTLC contract, not the paying
// wallet, and relatedAddresses is what makes the payment verifiable at all
// (see BUILD_UPDATED.md §24 for how this was established).
const REAL_HTLC_TX = {
  hash: '872b874becdad1ba29512f9c8868d30b879f6e617a12d934a9905faa842fdd83',
  blockNumber: 1,
  timestamp: Date.now(),
  confirmations: 999,
  from: 'NQ59 RCVY 8X71 0XY8 YAYB 7RAS B9J3 KBHG CE5Y',
  to: 'NQ36 9F2P L44G 8TS0 XTP1 6KH0 N0GA 6PXA CV8M',
  value: 50000000,
  senderData: '',
  recipientData: '39366637666561632d333966622d343064662d623535662d383532386363346161646537',
  networkId: 5,
  executionResult: true,
  relatedAddresses: [
    'NQ36 9F2P L44G 8TS0 XTP1 6KH0 N0GA 6PXA CV8M',
    'NQ54 FTGY F6VJ EJPU NSMN RA5Q 0K21 8EQT Q05P',
    'NQ59 RCVY 8X71 0XY8 YAYB 7RAS B9J3 KBHG CE5Y',
  ],
}

function stubFetch(result: unknown) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { data: result } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch
  return () => {
    globalThis.fetch = originalFetch
  }
}

test('accepts a real HTLC-sourced payment via the relatedAddresses fallback (872b874b...)', async () => {
  const restore = stubFetch(REAL_HTLC_TX)
  try {
    const result = await verifyTransactionOnChain({
      txHash: REAL_HTLC_TX.hash,
      expectedSender: 'NQ36 9F2P L44G 8TS0 XTP1 6KH0 N0GA 6PXA CV8M', // strict tx.from match would wrongly reject this
      expectedRecipient: REAL_HTLC_TX.to,
      expectedValueLuna: BigInt(REAL_HTLC_TX.value),
    })
    assert.equal(result.ok, true)
  } finally {
    restore()
  }
})

test('rejects an unrelated wallet — fails both the direct-match and relatedAddresses paths', async () => {
  const restore = stubFetch(REAL_HTLC_TX)
  try {
    const result = await verifyTransactionOnChain({
      txHash: REAL_HTLC_TX.hash,
      expectedSender: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000', // not tx.from, not in relatedAddresses
      expectedRecipient: REAL_HTLC_TX.to,
      expectedValueLuna: BigInt(REAL_HTLC_TX.value),
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, 'Sender does not match the authenticated wallet')
  } finally {
    restore()
  }
})

// Five real TestAlbatross transactions for NQ36, captured live this
// session — see BUILD_UPDATED.md §24 and packages/domain/src/classification.test.ts,
// which uses the same five as classification fixtures.
const EXTERNAL_SPEND_TX = {
  hash: '52730624d6f0de35355d5af8018842b80674a39668f813d26f420c8268bc7304',
  blockNumber: 10444533,
  timestamp: 1788425638038,
  confirmations: 655,
  from: 'NQ17 LN1L GPTP 63K8 85N9 NJA7 UT35 XBNK L70J', // HTLC
  to: 'NQ82 BHPS UR9K 07X1 X6QH 3DY3 J325 UCSP UHV3', // third party
  value: 50000000,
  senderData: '',
  recipientData: '',
  flags: 0,
  toType: 0,
  networkId: 5,
  executionResult: true,
  relatedAddresses: [OUR_WALLET, 'NQ82 BHPS UR9K 07X1 X6QH 3DY3 J325 UCSP UHV3', 'NQ54 FTGY F6VJ EJPU NSMN RA5Q 0K21 8EQT Q05P', 'NQ17 LN1L GPTP 63K8 85N9 NJA7 UT35 XBNK L70J'],
}
const STASH_ORIGINATED_TX = {
  hash: '672b586759ff0a039052fec3e114367d263de758fde1c30f6f0ccca08b4db056',
  blockNumber: 10441970,
  timestamp: 1788423114714,
  confirmations: 3219,
  from: 'NQ17 LN1L GPTP 63K8 85N9 NJA7 UT35 XBNK L70J', // same HTLC as EXTERNAL_SPEND_TX
  to: 'NQ71 CK94 3V7U H62Y 4L0F GUUK DPA4 6SA6 DKKM',
  value: 10000000,
  senderData: '',
  recipientData: '35653536636438642d646536382d346166362d623266312d366239633162633064336232',
  flags: 0,
  toType: 0,
  networkId: 5,
  executionResult: true,
  relatedAddresses: [OUR_WALLET, 'NQ71 CK94 3V7U H62Y 4L0F GUUK DPA4 6SA6 DKKM', 'NQ54 FTGY F6VJ EJPU NSMN RA5Q 0K21 8EQT Q05P', 'NQ17 LN1L GPTP 63K8 85N9 NJA7 UT35 XBNK L70J'],
}
const CONTRACT_CREATION_TX = {
  hash: 'bbb167119f51ae50af05a6cebd806f23a25f34291f88766bc64fdada89579b45',
  blockNumber: 10408330,
  timestamp: 1788389976952,
  confirmations: 36860,
  from: OUR_WALLET, // wallet itself funds the HTLC — the old strict filter's one hit
  to: 'NQ59 RCVY 8X71 0XY8 YAYB 7RAS B9J3 KBHG CE5Y',
  value: 11000000000,
  senderData: '',
  recipientData: '4bc57a10...',
  flags: 1,
  toType: 2,
  networkId: 5,
  executionResult: true,
  relatedAddresses: [OUR_WALLET, 'NQ54 FTGY F6VJ EJPU NSMN RA5Q 0K21 8EQT Q05P', 'NQ59 RCVY 8X71 0XY8 YAYB 7RAS B9J3 KBHG CE5Y'],
}
const REFUND_TX = {
  hash: '51ec79a01321bf52767cce7de6b4ef2b7be6defd436121a465073356dc8ef8bd',
  blockNumber: 10409624,
  timestamp: 1788391250922,
  confirmations: 35566,
  from: 'NQ59 RCVY 8X71 0XY8 YAYB 7RAS B9J3 KBHG CE5Y', // HTLC
  to: OUR_WALLET, // money coming back to us
  value: 10950000000,
  senderData: '',
  recipientData: '',
  flags: 0,
  toType: 0,
  networkId: 5,
  executionResult: true,
  relatedAddresses: [OUR_WALLET, 'NQ54 FTGY F6VJ EJPU NSMN RA5Q 0K21 8EQT Q05P', 'NQ59 RCVY 8X71 0XY8 YAYB 7RAS B9J3 KBHG CE5Y'],
}

test('getOutgoingTransactions: HTLC-sourced external spends and Stash-originated payments count as outgoing; refunds and self-payments do not', async () => {
  const restore = stubFetch([EXTERNAL_SPEND_TX, STASH_ORIGINATED_TX, CONTRACT_CREATION_TX, REFUND_TX])
  try {
    const results = await getOutgoingTransactions(OUR_WALLET, 50)
    const hashes = results.map((tx) => tx.hash).sort()
    // REFUND_TX excluded: to === our wallet fails the relatedAddresses
    // branch's `to !== wallet` condition. CONTRACT_CREATION_TX included at
    // this layer (from === wallet, fast path) — it's excluded downstream by
    // classification's contract_creation check, not here (this mirrors the
    // pre-fix bug: it was the ONLY transaction the old strict filter ever
    // surfaced).
    assert.deepEqual(hashes, [EXTERNAL_SPEND_TX.hash, STASH_ORIGINATED_TX.hash, CONTRACT_CREATION_TX.hash].sort())
  } finally {
    restore()
  }
})
