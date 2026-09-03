import * as Nimiq from '@nimiq/core'
import type { Client, ConsensusState, PlainTransactionDetails } from '@nimiq/core'

// Verified against @nimiq/core@2.21.0's actual shipped type declarations
// (types/wasm/bundler.d.ts, inspected directly from the installed package,
// not from docs paraphrase) on 2026-08-31. Do not add methods/fields here
// that aren't present in that file.
//
// rpc.nimiqwatch.com (tried earlier) is confirmed MAINNET — its own RPC
// responses report `"network":"MainAlbatross"`. No live public TestAlbatross
// JSON-RPC endpoint could be found after real investigation (dead/stale
// candidates, unreachable docs — see README). This client instead runs
// Nimiq's official light client (WASM, P2P) directly in the browser,
// connected to TestAlbatross's real seed node, which needs no RPC endpoint
// at all.
const TESTNET_SEED_NODES = ['/dns4/seed1.pos.nimiq-testnet.com/tcp/8443/wss']

let clientPromise: Promise<Client> | undefined

export function getChainClient(): Promise<Client> {
  if (!clientPromise) {
    const config = new Nimiq.ClientConfiguration()
    config.network('TestAlbatross')
    config.seedNodes(TESTNET_SEED_NODES)
    // Both 'pico' (default) and 'light' are documented as valid for web
    // clients; picking 'light' deliberately because getTransactionsByAddress's
    // own docstring says returned transactions "are verified before being
    // returned" — that needs more chain state than the minimal 'pico' mode
    // is likely to keep. Not itself confirmed by the type declarations; if
    // history reads fail or come back unverified, reconsider this first.
    config.syncMode('light')
    clientPromise = Nimiq.Client.create(config.build())
  }
  return clientPromise
}

export type { ConsensusState }

export type NormalizedTransaction = {
  txHash: string
  sender: string
  recipient: string
  /**
   * PlainTransaction.value has no unit in its own JSDoc (unlike `fee`,
   * which explicitly says "in luna") — but this is empirically confirmed
   * Luna, not NIM: live-queried the TestAlbatross faucet's real outgoing
   * transactions during Phase 0 verification and got `value: 11000000000`
   * for a transfer, i.e. 110,000 NIM, consistent with `fee`'s convention.
   */
  valueLuna: number
  blockHeight: number | undefined
  timestamp: number | undefined
  state: PlainTransactionDetails['state']
}


const CONSENSUS_WAIT_TIMEOUT_MS = 8000

/**
 * client.waitForConsensusEstablished() has no built-in timeout — it just
 * resolves whenever consensus comes back. Observed live on a real device:
 * the P2P connection can drop while the webview is backgrounded under
 * Nimiq Pay's native confirmation screen (see getConfirmedOutgoingTransactions's
 * doc comment) and not reconnect on its own, which without this bound hangs
 * every caller forever with zero feedback — e.g. Pay & Stash's poll loop
 * freezing silently on "attempt 1 of 12" instead of retrying or eventually
 * surfacing its own bounded-retry error message.
 */
async function waitForConsensusWithTimeout(client: Client): Promise<void> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Timed out waiting for TestAlbatross consensus')), CONSENSUS_WAIT_TIMEOUT_MS)
  })
  try {
    await Promise.race([client.waitForConsensusEstablished(), timeout])
  } finally {
    clearTimeout(timer!)
  }
}

async function queryWithConsensusRetry(
  client: Client,
  address: string,
  limit: number,
): Promise<PlainTransactionDetails[]> {
  if (!(await client.isConsensusEstablished())) {
    await waitForConsensusWithTimeout(client)
  }

  try {
    return await client.getTransactionsByAddress(address, undefined, undefined, undefined, limit)
  } catch (err) {
    if (!(await client.isConsensusEstablished())) {
      await waitForConsensusWithTimeout(client)
    }
    try {
      return await client.getTransactionsByAddress(address, undefined, undefined, undefined, limit)
    } catch {
      // Surface the original error — it's the more informative one.
      throw err
    }
  }
}

/**
 * Finds a just-sent transaction on-chain by matching sender/recipient/value.
 *
 * NOT called from Pay & Stash / Catch-up's confirm path anymore —
 * sendBasicTransaction()'s return value is now confirmed (verified live,
 * on a real device) to be the real tx hash directly, and confirmation now
 * happens server-side against a real RPC endpoint (apps/api/src/nimiqRpc.ts),
 * which doesn't suffer this client's core problem: the browser's P2P
 * connection dropping while Nimiq Pay's native confirmation screen
 * backgrounds the webview. Kept in place deliberately, not deleted — it's
 * the building block for a possible future recovery path (reconciling an
 * orphaned-but-real transaction whose confirm POST never landed), though
 * the recommended place to build that is server-side, scanning via the
 * same RPC access, not this fragile client. Matches 'included' or
 * 'confirmed' state (not just 'confirmed') so a caller can move forward as
 * soon as a payment is actually on-chain. Returns undefined if not found
 * yet — callers should poll with their own bounded retry, not assume this
 * means failure.
 */
export async function findOutgoingTransaction(
  client: Client,
  params: { sender: string; recipient: string; valueLuna: number; sinceTimestampMs?: number },
): Promise<NormalizedTransaction | undefined> {
  const normalize = (address: string) => address.replace(/\s+/g, '')
  const details = await queryWithConsensusRetry(client, params.sender, 10)

  const match = details.find(
    (tx) =>
      tx.sender === params.sender &&
      normalize(tx.recipient) === normalize(params.recipient) &&
      tx.value === params.valueLuna &&
      (tx.state === 'included' || tx.state === 'confirmed') &&
      tx.network.toLowerCase() === 'testalbatross' &&
      (params.sinceTimestampMs === undefined || (tx.timestamp ?? 0) >= params.sinceTimestampMs),
  )
  if (!match) return undefined

  return {
    txHash: match.transactionHash,
    sender: match.sender,
    recipient: match.recipient,
    valueLuna: match.value,
    blockHeight: match.blockHeight,
    timestamp: match.timestamp,
    state: match.state,
  }
}
