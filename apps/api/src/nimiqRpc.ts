import { MIN_TX_CONFIRMATIONS } from '@stash/domain'

// Backend-side transaction verification against a public TestAlbatross
// JSON-RPC endpoint (from nimiq/awesome's "Testnet Open RPC Servers" list —
// suitable for hackathon/testnet use, not guaranteed production infra; see
// .env.example). Verified live this session: real consensus, real block
// height, and getTransactionByHash/getTransactionsByAddress both return
// complete, correct historical data matching known real transactions.
//
// This exists because no backend chain reader was previously possible: a
// self-hosted Node @nimiq/core client can't sync in this environment
// (verified — its consensus/sync machinery depends on browser-only APIs,
// IndexedDB and a DOM-style addEventListener, that Node doesn't provide),
// and a self-hosted Docker core-rs-albatross node in `light` mode can sync
// but explicitly rejects both of the RPC methods below ("Method not
// supported for a light blockchain") — a full/history node was ruled out
// as unnecessary infrastructure once this public endpoint proved reliable.

const RPC_URL = process.env.NIMIQ_RPC_URL ?? 'https://rpc.testnet.nimiqwatch.com/'

// Confirmed empirically via live RPC responses this session (every real
// TestAlbatross transaction looked up reported networkId: 5).
const TESTALBATROSS_NETWORK_ID = 5

type RpcTransaction = {
  hash: string
  blockNumber: number
  timestamp: number
  confirmations: number
  from: string
  to: string
  value: number
  senderData: string
  recipientData: string
  networkId: number
  executionResult: boolean
  relatedAddresses: string[]
  /** Nimiq tx flags — bit 0 (value 1) means this transaction creates/funds a contract, not a plain transfer. */
  flags: number
  /** Recipient account type — 0 is a plain basic account; non-zero (e.g. 2 = HTLC) means this funds a contract. */
  toType: number
}

// Retries only transient failures (network error, non-2xx from the gateway)
// — a clean JSON-RPC response carrying `error` (e.g. "transaction not
// found") is a legitimate, fast answer and is never retried here. This is
// the "hackathon/testnet-grade, not guaranteed production infra" public RPC
// (see this file's top comment) — worth a couple of quick retries before
// callers treat it as unreachable.
const RPC_MAX_RETRIES = 2
const RPC_RETRY_DELAY_MS = 300

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function rpcCall<T>(method: string, params: unknown[]): Promise<T | undefined> {
  for (let attempt = 0; attempt <= RPC_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      })
      if (!res.ok) {
        if (attempt < RPC_MAX_RETRIES) {
          await sleep(RPC_RETRY_DELAY_MS * (attempt + 1))
          continue
        }
        return undefined
      }
      const body = (await res.json()) as { result?: { data: T }; error?: unknown }
      if (body.error || !body.result) return undefined
      return body.result.data
    } catch {
      if (attempt < RPC_MAX_RETRIES) {
        await sleep(RPC_RETRY_DELAY_MS * (attempt + 1))
        continue
      }
      return undefined
    }
  }
  return undefined
}

export async function getTransactionByHash(txHash: string): Promise<RpcTransaction | undefined> {
  return rpcCall<RpcTransaction>('getTransactionByHash', [txHash])
}

// Mirrors verifyTransactionOnChain's sender check (see BUILD_UPDATED.md
// §24): Nimiq Pay routes payments through HTLC contracts as normal
// behavior, so a real outgoing payment's `from` is often the HTLC, not the
// wallet directly. A strict `tx.from === address` filter here missed every
// real payment and only ever surfaced the HTLC *funding* transactions
// (where the wallet genuinely is `from`) — confirmed live: with the old
// filter, Activity showed only contract-creation transactions and nothing
// else. `to !== address` on the relatedAddresses branch excludes inbound
// transactions (refunds, or an HTLC redemption that happens to pay the
// wallet itself) from counting as outgoing at all.
function isOutgoingForWallet(tx: RpcTransaction, wallet: string): boolean {
  const normalizedWallet = normalizeAddress(wallet)
  if (normalizeAddress(tx.from) === normalizedWallet) return true
  return (
    normalizeAddress(tx.to) !== normalizedWallet &&
    tx.relatedAddresses.some((addr) => normalizeAddress(addr) === normalizedWallet)
  )
}

/** Real confirmed outgoing transactions for `address` — the backend equivalent of
 * apps/web's browser-side getConfirmedOutgoingTransactions, used because the browser light client's
 * P2P connection is unreliable on real devices (see this file's top comment). */
export async function getOutgoingTransactions(address: string, limit: number): Promise<RpcTransaction[]> {
  const results = await rpcCall<RpcTransaction[]>('getTransactionsByAddress', [address, limit, null])
  if (!results) return []
  return results.filter(
    (tx) => isOutgoingForWallet(tx, address) && tx.executionResult && tx.networkId === TESTALBATROSS_NETWORK_ID,
  )
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Decodes recipientData's hex back to UTF-8 and checks it's UUID-shaped —
 * every payment-intent id is passed as `data` on the real
 * sendBasicTransactionWithData call and lands here (confirmed live against
 * a real device this session). This is a cheap PREFILTER, not
 * identification — any transaction carrying any valid UUID (not
 * necessarily one of ours) passes this check. Real identification is
 * confirming the decoded id is a member of the specific wallet's own
 * pending-intent set, done by the caller (paymentIntentReconciler.ts) —
 * never treat a decodeIntentId match alone as proof of anything.
 */
export function decodeIntentId(recipientDataHex: string): string | undefined {
  if (!recipientDataHex) return undefined
  try {
    const text = Buffer.from(recipientDataHex, 'hex').toString('utf8')
    return UUID_RE.test(text) ? text : undefined
  } catch {
    return undefined
  }
}

function normalizeAddress(address: string): string {
  return address.replace(/\s+/g, '').toUpperCase()
}

export type VerifyResult =
  | { ok: true; tx: RpcTransaction }
  | { ok: false; reason: string; retryable: boolean }

/**
 * Independently verifies a transaction against server-known expected
 * values — never against anything the caller supplies about the
 * transaction itself, only the hash to look up. `retryable: true` means
 * "not visible yet, safe to poll again"; anything else is terminal — the
 * transaction that exists is definitively not the one that was expected,
 * and retrying won't change that.
 */
export async function verifyTransactionOnChain(params: {
  txHash: string
  expectedSender: string
  expectedRecipient: string
  expectedValueLuna: bigint
}): Promise<VerifyResult> {
  const tx = await getTransactionByHash(params.txHash)
  if (!tx) {
    return { ok: false, reason: 'Transaction not found', retryable: true }
  }
  if (tx.networkId !== TESTALBATROSS_NETWORK_ID) {
    return { ok: false, reason: 'Transaction is not on TestAlbatross', retryable: false }
  }
  // Nimiq Pay routes payments through HTLC contracts as normal behavior —
  // confirmed empirically on real TestAlbatross transactions (872b874b...,
  // 672b5867..., two different HTLCs) — so a strict tx.from match rejects
  // legitimate payments whenever the wallet redeemed through a contract
  // instead of sending directly (see BUILD_UPDATED.md §24). An
  // account-state lookup fallback was tried and proven impossible: an
  // HTLC's balance drains to 0 on redemption and gets pruned from the
  // accounts tree, so getAccountByAddress on tx.from returns
  // `type: "basic", balance: 0` with no owner/sender fields left to read —
  // exactly for the transactions that need checking. `relatedAddresses` is
  // stored on the transaction itself and survives pruning.
  //
  // Honesty about what this proves: relatedAddresses is a broad "these
  // addresses were involved" set — NOT proof the expected wallet authorized
  // the transaction (an HTLC's sender/recipient fields are freely chosen by
  // whoever created the contract). The real binding that makes this system
  // safe against replay/forgery is recipient + value + the
  // server-generated intentId embedded in recipientData (see
  // decodeIntentId above) — all three are effectively unforgeable in
  // combination. This sender check is defense-in-depth under that
  // binding, not sender authentication on its own.
  const senderMatches =
    normalizeAddress(tx.from) === normalizeAddress(params.expectedSender) ||
    tx.relatedAddresses.some((addr) => normalizeAddress(addr) === normalizeAddress(params.expectedSender))
  if (!senderMatches) {
    return { ok: false, reason: 'Sender does not match the authenticated wallet', retryable: false }
  }
  if (normalizeAddress(tx.to) !== normalizeAddress(params.expectedRecipient)) {
    return { ok: false, reason: 'Recipient does not match the expected recipient', retryable: false }
  }
  if (BigInt(tx.value) !== params.expectedValueLuna) {
    return { ok: false, reason: 'Value does not match the expected amount', retryable: false }
  }
  if (!tx.executionResult) {
    return { ok: false, reason: 'Transaction execution failed', retryable: false }
  }
  if (tx.confirmations < MIN_TX_CONFIRMATIONS) {
    return { ok: false, reason: 'Transaction not yet sufficiently confirmed', retryable: true }
  }
  return { ok: true, tx }
}
