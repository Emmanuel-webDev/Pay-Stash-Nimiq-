import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Archive, Check } from 'lucide-react'
import { lunaToNimString } from '@stash/domain'
import { useAppState } from '../state/AppState'
import { listObligations, listSweeps, getWalletActivity, type Obligation, type Sweep, type WalletActivityTransaction } from '../lib/api'
import { shortenAddress } from '../lib/format'

export function Activity() {
  const { wallet, goal } = useAppState()
  const [transactions, setTransactions] = useState<WalletActivityTransaction[] | null>(null)
  const [obligationsByTx, setObligationsByTx] = useState<Map<string, Obligation>>(new Map())
  const [sweeps, setSweeps] = useState<Sweep[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (wallet.status !== 'connected') return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, goal])

  async function load() {
    if (wallet.status !== 'connected') return
    setLoading(true)
    setError(null)
    try {
      const [txs, obligations, sweepRows] = await Promise.all([
        getWalletActivity(wallet.address, 30),
        goal ? listObligations(goal.id, wallet.address) : Promise.resolve([]),
        goal ? listSweeps(goal.id, wallet.address) : Promise.resolve([]),
      ])
      setTransactions(txs)
      setObligationsByTx(new Map(obligations.map((o) => [o.tx_hash, o])))
      setSweeps(sweepRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  if (wallet.status !== 'connected') {
    return (
      <div className="screen">
        <h1 className="state-heading">Activity</h1>
        <p>Connect your wallet from Home first.</p>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="page-head">
        <Link to="/" className="back-action">
          <ArrowLeft size={16} />
          <span>Home</span>
        </Link>
        <p className="eyebrow">Activity</p>
        <h1>Verified activity.</h1>
        <p>Real savings and spending, shortened addresses only — no invented merchant names.</p>
      </div>

      <button className="button-quiet" onClick={load} disabled={loading}>
        {loading ? 'Loading…' : 'Refresh'}
      </button>

      {error && (
        <p className="notice notice-error">
          Couldn't load activity: {error}. Check your connection and try Refresh again.
        </p>
      )}

      {sweeps.length > 0 && (
        <div className="activity-section">
          <p className="eyebrow">Saved</p>
          <div className="activity-list">
            {sweeps.map((sweep) => (
              <div key={sweep.id} className="activity-row">
                <span className="activity-mark">
                  <Check size={17} />
                </span>
                <div className="activity-copy">
                  <strong>
                    {lunaToNimString(BigInt(sweep.amount_luna))} NIM added to {goal?.name ?? 'your goal'}
                  </strong>
                  <span>{new Date(sweep.confirmed_at ?? sweep.created_at).toLocaleDateString()} · verified on-chain</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {transactions === null && !error && <p className="empty-state">Loading…</p>}
      {transactions !== null && transactions.length === 0 && sweeps.length === 0 && (
        <div className="empty-state">
          <p>Nothing here yet — pay through Pay &amp; Stash to start building this list.</p>
        </div>
      )}

      {transactions !== null && transactions.length > 0 && (
        <div className="activity-list">
          {transactions.map((tx) => {
            const obligation = obligationsByTx.get(tx.txHash)
            return (
              <div key={tx.txHash} className="activity-row">
                <span className="activity-mark">{obligation ? <ArrowUpRight size={17} /> : <Archive size={17} />}</span>
                <div className="activity-copy">
                  <strong>{shortenAddress(tx.recipient)}</strong>
                  <span>{tx.timestamp ? new Date(tx.timestamp).toLocaleDateString() : ''} · payment{obligation ? ' + stash' : ' only'}</span>
                </div>
                <span className="activity-amount tabular">
                  {lunaToNimString(BigInt(tx.valueLuna))} NIM
                  {obligation && (
                    <small>{obligation.status === 'swept' ? `+${lunaToNimString(BigInt(obligation.calculated_luna))} NIM saved` : 'Catch-up pending'}</small>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
