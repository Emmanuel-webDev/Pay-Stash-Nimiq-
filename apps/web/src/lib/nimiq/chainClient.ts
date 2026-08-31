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

/**
 * Real confirmed outgoing TestAlbatross transactions for `address`, sender
 * side only. Filters out anything not reporting state 'confirmed' and
 * anything not reporting network 'TestAlbatross' (defensive — the client
 * itself is TestAlbatross-only, but nothing here should silently accept a
 * mismatched network's data). Note the live value is lowercase
 * ("testalbatross"), unlike ClientConfiguration.network()'s canonical
 * "TestAlbatross" — confirmed by live query, hence the .toLowerCase() below.
 *
 * Observed live on a real device (Phase 0 verification, 2026-08-31): calling
 * this right after Nimiq Pay's native sendBasicTransaction confirmation
 * screen closes can throw a bare network error ("couldn't send request").
 * The transaction itself was confirmed on-chain correctly — this is the P2P
 * connection dropping while the webview is backgrounded under that native
 * screen, not a data problem. Retried once after re-establishing consensus
 * rather than surfacing the raw error on the first hiccup.
 */
export async function getConfirmedOutgoingTransactions(
  client: Client,
  address: string,
  limit = 20,
): Promise<NormalizedTransaction[]> {
  const details = await queryWithConsensusRetry(client, address, limit)

  return details
    .filter((tx) => tx.sender === address)
    .filter((tx) => tx.state === 'confirmed')
    .filter((tx) => tx.network.toLowerCase() === 'testalbatross')
    .map((tx) => ({
      txHash: tx.transactionHash,
      sender: tx.sender,
      recipient: tx.recipient,
      valueLuna: tx.value,
      blockHeight: tx.blockHeight,
      timestamp: tx.timestamp,
      state: tx.state,
    }))
}

async function queryWithConsensusRetry(
  client: Client,
  address: string,
  limit: number,
): Promise<PlainTransactionDetails[]> {
  if (!(await client.isConsensusEstablished())) {
    await client.waitForConsensusEstablished()
  }

  try {
    return await client.getTransactionsByAddress(address, undefined, undefined, undefined, limit)
  } catch (err) {
    if (!(await client.isConsensusEstablished())) {
      await client.waitForConsensusEstablished()
    }
    try {
      return await client.getTransactionsByAddress(address, undefined, undefined, undefined, limit)
    } catch {
      // Surface the original error — it's the more informative one.
      throw err
    }
  }
}
