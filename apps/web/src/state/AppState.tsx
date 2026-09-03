import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { NimiqProvider } from '@nimiq/mini-app-sdk'
import type { Client } from '@nimiq/core'
import { getNimiqProvider } from '../lib/nimiq/provider'
import { getChainClient, type ConsensusState } from '../lib/nimiq/chainClient'
import { listGoals, requestChallenge, verifyChallenge, setSessionToken, type Goal } from '../lib/api'

export type WalletState =
  | { status: 'idle' }
  | { status: 'connecting' }
  | { status: 'not-in-nimiq-pay'; detail: string }
  | { status: 'authenticating'; provider: NimiqProvider; address: string }
  | { status: 'unauthenticated'; provider: NimiqProvider; address: string; detail: string }
  | { status: 'connected'; provider: NimiqProvider; address: string }
  | { status: 'error'; detail: string }

export type ChainState =
  | { status: 'connecting' }
  | { status: 'connected'; client: Client; networkId: number }
  | { status: 'error'; detail: string }

type AppStateValue = {
  wallet: WalletState
  connectWallet: () => Promise<void>
  retryAuthentication: () => Promise<void>
  chain: ChainState
  consensus: ConsensusState
  headHeight: number | null
  /** Cycle II MVP: one active goal per wallet (BUILD_UPDATED.md §8). null once loaded means "no goal yet". */
  goal: Goal | null
  goalLoading: boolean
  refetchGoal: () => Promise<void>
}

const AppStateContext = createContext<AppStateValue | undefined>(undefined)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletState>({ status: 'idle' })
  const [chain, setChain] = useState<ChainState>({ status: 'connecting' })
  const [consensus, setConsensus] = useState<ConsensusState>('connecting')
  const [headHeight, setHeadHeight] = useState<number | null>(null)
  const [goal, setGoal] = useState<Goal | null>(null)
  const [goalLoading, setGoalLoading] = useState(false)

  // Chain reader connects independently of the wallet provider — see
  // apps/web/README notes carried from Phase 0.
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
          await client.addConsensusChangedListener((state) => setConsensus(state)),
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

  const refetchGoal = useCallback(async () => {
    if (wallet.status !== 'connected') {
      setGoal(null)
      return
    }
    setGoalLoading(true)
    try {
      const goals = await listGoals(wallet.address)
      setGoal(goals.find((g) => g.status === 'active') ?? goals[0] ?? null)
    } finally {
      setGoalLoading(false)
    }
  }, [wallet])

  useEffect(() => {
    refetchGoal()
  }, [refetchGoal])

  // Proves wallet ownership to Stash via a signed challenge (BUILD_UPDATED.md
  // §8/§19) — this is a message signature, not an on-chain transaction, and
  // costs no NIM. `wallet.status === 'connected'` means authenticated; a
  // rejected or failed signature lands in 'unauthenticated' instead, still
  // holding the provider/address so `retryAuthentication` can re-prompt
  // without re-running listAccounts().
  const authenticate = useCallback(async (provider: NimiqProvider, address: string) => {
    setWallet({ status: 'authenticating', provider, address })
    try {
      const { nonce, message } = await requestChallenge(address)
      const signed = await provider.sign(message)
      if ('error' in signed) {
        setWallet({
          status: 'unauthenticated',
          provider,
          address,
          detail:
            'Signing this message proves the wallet is yours to Stash — it is not an on-chain transaction and costs no NIM.',
        })
        return
      }
      const { token } = await verifyChallenge({
        walletAddress: address,
        nonce,
        publicKey: signed.publicKey,
        signature: signed.signature,
      })
      setSessionToken(token)
      setWallet({ status: 'connected', provider, address })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setWallet({ status: 'unauthenticated', provider, address, detail: message })
    }
  }, [])

  const retryAuthentication = useCallback(async () => {
    if (wallet.status !== 'unauthenticated') return
    await authenticate(wallet.provider, wallet.address)
  }, [wallet, authenticate])

  const connectWallet = useCallback(async () => {
    setWallet({ status: 'connecting' })
    try {
      const provider = await getNimiqProvider()
      const accounts = await provider.listAccounts()

      if (!Array.isArray(accounts)) {
        setWallet({ status: 'error', detail: accounts.error.message })
        return
      }
      if (accounts.length === 0) {
        setWallet({ status: 'error', detail: 'No accounts returned by listAccounts()' })
        return
      }
      await authenticate(provider, accounts[0])
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setWallet({
        status: 'not-in-nimiq-pay',
        detail: `${message} — open this page inside Nimiq Pay (dev/testnet mode) to connect a real wallet.`,
      })
    }
  }, [authenticate])

  const value: AppStateValue = {
    wallet,
    connectWallet,
    retryAuthentication,
    chain,
    consensus,
    headHeight,
    goal,
    goalLoading,
    refetchGoal,
  }

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}
