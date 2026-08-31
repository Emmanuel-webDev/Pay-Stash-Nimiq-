import { useCallback, useEffect, useState } from 'react'
import type { NimiqProvider } from '@nimiq/mini-app-sdk'
import type { Client } from '@nimiq/core'
import { getNimiqProvider } from './lib/nimiq/provider'
import { getChainClient, getConfirmedOutgoingTransactions, type ConsensusState, type NormalizedTransaction } from './lib/nimiq/chainClient'
import { nimToLuna } from './lib/money'
import './App.css'

type ConnectState =
  | { status: 'idle' }
  | { status: 'connecting' }
  | { status: 'not-in-nimiq-pay'; detail: string }
  | { status: 'connected'; provider: NimiqProvider; address: string }
  | { status: 'error'; detail: string }

type ChainState =
  | { status: 'connecting' }
  | { status: 'connected'; client: Client; networkId: number }
  | { status: 'error'; detail: string }

type SendState =
  | { status: 'idle' }
  | { status: 'sending' }
  // sendBasicTransaction's docstring says it returns "the serialized
  // transaction" as a string. Whether that string is a tx hash or raw
  // signed-tx bytes is UNVERIFIED (see README) — labelled generically here.
  | { status: 'sent'; returnedValue: string }
  | { status: 'rejected'; detail: string }

function App() {
  const [connect, setConnect] = useState<ConnectState>({ status: 'idle' })

  const [chain, setChain] = useState<ChainState>({ status: 'connecting' })
  const [consensus, setConsensus] = useState<ConsensusState>('connecting')
  const [headHeight, setHeadHeight] = useState<number | null>(null)

  const [activity, setActivity] = useState<
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'loaded'; data: NormalizedTransaction[] }
    | { status: 'error'; detail: string }
  >({ status: 'idle' })

  const [recipient, setRecipient] = useState('')
  const [amountNim, setAmountNim] = useState('')
  const [send, setSend] = useState<SendState>({ status: 'idle' })

  // The chain reader (@nimiq/core, TestAlbatross P2P light client) is
  // independent of the wallet provider (Nimiq Pay) — it needs no host app
  // and no RPC endpoint, so it starts connecting immediately on mount.
  // getChainClient() is a module-level singleton, so React StrictMode's
  // double-invoke of this effect reuses the same Client rather than
  // creating two; listener handles are still cleaned up per-effect-run.
  useEffect(() => {
    let cancelled = false
    let ownedClient: Client | undefined
    const handles: number[] = []

    getChainClient()
      .then(async (client) => {
        if (cancelled) return
        ownedClient = client
        const networkId = await client.getNetworkId()
        setChain({ status: 'connected', client, networkId })

        handles.push(
          await client.addConsensusChangedListener((state) => {
            setConsensus(state)
          }),
          await client.addHeadChangedListener(() => {
            client.getHeadHeight().then(setHeadHeight)
          }),
        )

        const established = await client.isConsensusEstablished()
        setConsensus(established ? 'established' : 'syncing')
        setHeadHeight(await client.getHeadHeight())
      })
      .catch((err) => {
        if (cancelled) return
        setChain({ status: 'error', detail: err instanceof Error ? err.message : String(err) })
      })

    return () => {
      cancelled = true
      handles.forEach((h) => ownedClient?.removeListener(h))
    }
  }, [])

  const connectWallet = useCallback(async () => {
    setConnect({ status: 'connecting' })
    try {
      const provider = await getNimiqProvider()
      const accounts = await provider.listAccounts()

      if (!Array.isArray(accounts)) {
        // ErrorResponse shape: { error: { type, message } }
        setConnect({ status: 'error', detail: accounts.error.message })
        return
      }
      if (accounts.length === 0) {
        setConnect({ status: 'error', detail: 'No accounts returned by listAccounts()' })
        return
      }

      setConnect({ status: 'connected', provider, address: accounts[0] })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // init() with a timeout is how we detect "not running inside Nimiq Pay"
      // per the SDK's InitOptions.timeout — there is no separate "is Nimiq
      // Pay present" check exposed by the SDK.
      setConnect({
        status: 'not-in-nimiq-pay',
        detail: `${message} — open this page inside Nimiq Pay (dev/testnet mode) to connect a real wallet.`,
      })
    }
  }, [])

  const loadActivity = useCallback(
    async (address: string) => {
      if (chain.status !== 'connected') return
      setActivity({ status: 'loading' })
      try {
        const data = await getConfirmedOutgoingTransactions(chain.client, address)
        setActivity({ status: 'loaded', data })
      } catch (err) {
        setActivity({ status: 'error', detail: err instanceof Error ? err.message : String(err) })
      }
    },
    [chain],
  )

  const sendTestTransaction = useCallback(
    async (provider: NimiqProvider) => {
      setSend({ status: 'sending' })
      try {
        const value = nimToLuna(amountNim)
        const result = await provider.sendBasicTransaction({ recipient, value })

        if (typeof result !== 'string') {
          setSend({ status: 'rejected', detail: result.error.message })
          return
        }
        setSend({ status: 'sent', returnedValue: result })
      } catch (err) {
        setSend({ status: 'rejected', detail: err instanceof Error ? err.message : String(err) })
      }
    },
    [recipient, amountNim],
  )

  return (
    <main className="shell">
      <h1>Stash — Phase 0 integration spike</h1>
      <p className="lede">
        Proves the critical path on Nimiq TestAlbatross before any product UI is built. See{' '}
        <code>BUILD_UPDATED.md</code> §21 and the root <code>README.md</code> for exit criteria and known
        blockers.
      </p>

      <section aria-live="polite">
        <h2>Network diagnostics</h2>
        <dl className="diagnostics">
          <dt>Wallet provider</dt>
          <dd>
            TestAlbatross expected — <em>not verifiable from the SDK</em>. Nimiq Pay must be switched to
            dev/testnet mode manually; the Mini App SDK exposes no way to confirm this programmatically.
          </dd>

          <dt>Chain reader</dt>
          <dd>
            {chain.status === 'connecting' && 'connecting…'}
            {chain.status === 'error' && <span className="notice-inline notice-error">{chain.detail}</span>}
            {chain.status === 'connected' && (
              <>
                TestAlbatross (configured) — networkId <code>{chain.networkId}</code> from{' '}
                <code>getNetworkId()</code>
              </>
            )}
          </dd>

          <dt>Consensus</dt>
          <dd className={consensus === 'established' ? 'notice-inline notice-ok' : 'notice-inline notice-warn'}>
            {consensus}
          </dd>

          <dt>Head height</dt>
          <dd>{headHeight ?? '…'}</dd>

          <dt>Selected address</dt>
          <dd className="address">{connect.status === 'connected' ? connect.address : '(not connected)'}</dd>
        </dl>
      </section>

      <section aria-live="polite">
        <h2>1. Wallet connection</h2>
        {connect.status === 'idle' && <button onClick={connectWallet}>Connect Nimiq wallet</button>}
        {connect.status === 'connecting' && <p>Waiting for Nimiq Pay to inject the provider…</p>}
        {(connect.status === 'not-in-nimiq-pay' || connect.status === 'error') && (
          <div className="notice notice-error">
            <p>{connect.detail}</p>
            <button onClick={connectWallet}>Retry</button>
          </div>
        )}
        {connect.status === 'connected' && (
          <div className="notice notice-ok">
            <p>
              Connected address (from <code>listAccounts()</code>, unedited):
            </p>
            <p className="address">{connect.address}</p>
          </div>
        )}
      </section>

      {connect.status === 'connected' && (
        <section aria-live="polite">
          <h2>2. Real confirmed outgoing transactions (via @nimiq/core, TestAlbatross)</h2>
          <button
            onClick={() => loadActivity(connect.address)}
            disabled={activity.status === 'loading' || chain.status !== 'connected'}
          >
            {activity.status === 'loading' ? 'Loading…' : 'Load activity'}
          </button>
          {chain.status !== 'connected' && <p className="notice notice-warn">Chain reader not connected yet.</p>}
          {activity.status === 'error' && <p className="notice notice-error">{activity.detail}</p>}
          {activity.status === 'loaded' && activity.data.length === 0 && (
            <p className="notice notice-warn">No confirmed outgoing TestAlbatross transactions found for this address.</p>
          )}
          {activity.status === 'loaded' && activity.data.length > 0 && (
            <ul className="tx-list">
              {activity.data.map((tx) => (
                <li key={tx.txHash} className="tx-row">
                  <span className="address">{tx.txHash}</span>
                  <span>
                    → <span className="address">{tx.recipient}</span>
                  </span>
                  <span>{(tx.valueLuna / 100_000).toString()} NIM</span>
                  <span>block {tx.blockHeight ?? '?'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {connect.status === 'connected' && (
        <section aria-live="polite">
          <h2>3. Controlled test transfer</h2>
          <p className="notice notice-warn">
            This sends a real TestAlbatross transaction. Use testnet-only addresses and free test NIM —
            never mainnet funds.
          </p>
          <label>
            Recipient address
            <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="NQ..." />
          </label>
          <label>
            Amount (NIM)
            <input value={amountNim} onChange={(e) => setAmountNim(e.target.value)} placeholder="1" />
          </label>
          <button
            disabled={send.status === 'sending' || !recipient || !amountNim}
            onClick={() => sendTestTransaction(connect.provider)}
          >
            {send.status === 'sending' ? 'Awaiting Nimiq Pay confirmation…' : 'Send test transaction'}
          </button>
          {send.status === 'rejected' && <p className="notice notice-error">{send.detail}</p>}
          {send.status === 'sent' && (
            <div className="notice notice-ok">
              <p>Provider returned:</p>
              <p className="address">{send.returnedValue}</p>
              <p>
                Reload activity above (may take a block or two to confirm) to verify this transaction shows
                up through the independent @nimiq/core chain reader — that's the real Phase 0 exit
                criterion, not just a successful SDK call.
              </p>
            </div>
          )}
        </section>
      )}
    </main>
  )
}

export default App
