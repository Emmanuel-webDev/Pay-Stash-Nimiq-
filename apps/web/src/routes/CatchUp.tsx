import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ArrowUpRight, Check } from 'lucide-react'
import { lunaToNimString, toSdkValue } from '@stash/domain'
import { useAppState } from '../state/AppState'
import { listObligations, createStashTransferIntent, submitStashTransferIntent, type Obligation } from '../lib/api'
import { shortenAddress } from '../lib/format'
import { pollUntilConfirmed, MAX_POLL_ATTEMPTS } from '../lib/pollUntilConfirmed'

const SOURCE_LABEL: Record<Obligation['source'], string> = {
  pay_and_stash: 'Pay & Stash',
  external_spend: 'Detected outside Stash',
  skipped_savings: 'Skipped at checkout',
}

type SweepState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'confirming'; attempt: number }
  | { status: 'error'; message: string }
  | { status: 'done'; amountLuna: bigint }

export function CatchUp() {
  const { wallet, goal, refetchGoal } = useAppState()
  const [obligations, setObligations] = useState<Obligation[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sweep, setSweep] = useState<SweepState>({ status: 'idle' })

  useEffect(() => {
    if (wallet.status !== 'connected' || !goal) return
    listObligations(goal.id, wallet.address, 'pending').then((obs) => {
      setObligations(obs)
      setSelected(new Set(obs.map((o) => o.id)))
    })
  }, [wallet, goal])

  if (wallet.status !== 'connected' || !goal) {
    return (
      <div className="screen">
        <h1 className="state-heading">Catch-up</h1>
        <p>{wallet.status !== 'connected' ? 'Connect your wallet from Home first.' : 'Create a savings goal first.'}</p>
      </div>
    )
  }
  if (obligations === null) {
    return (
      <div className="screen">
        <p className="empty-state">Loading…</p>
      </div>
    )
  }

  const selectedObligations = obligations.filter((o) => selected.has(o.id))
  const totalLuna = selectedObligations.reduce((sum, o) => sum + BigInt(o.calculated_luna), 0n)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function approveSweep() {
    if (wallet.status !== 'connected' || !goal || selectedObligations.length === 0) return
    setSweep({ status: 'sending' })
    try {
      const intent = await createStashTransferIntent(
        goal.id,
        selectedObligations.map((o) => o.id),
      )
      const result = await wallet.provider.sendBasicTransactionWithData({
        recipient: intent.recipient,
        value: toSdkValue(BigInt(intent.valueLuna)),
        data: intent.intentId,
      })
      if (typeof result !== 'string') {
        setSweep({ status: 'error', message: result.error.message })
        return
      }
      const txHash = result
      setSweep({ status: 'confirming', attempt: 0 })
      pollUntilConfirmed({
        attempt: 0,
        submit: () => submitStashTransferIntent(goal.id, intent.intentId, txHash),
        onAttempt: (attempt) => setSweep({ status: 'confirming', attempt }),
        onSuccess: async () => {
          const remaining = await listObligations(goal.id, wallet.address, 'pending')
          setObligations(remaining)
          setSelected(new Set(remaining.map((o) => o.id)))
          setSweep({ status: 'done', amountLuna: totalLuna })
          await refetchGoal()
        },
        onTerminalError: (message) => setSweep({ status: 'error', message }),
      })
    } catch (err) {
      setSweep({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  if (sweep.status === 'done') {
    return (
      <div className="screen">
        <div className="state-panel">
          <span className="verified-mark">
            <Check size={28} />
          </span>
          <p className="eyebrow">Catch-up complete</p>
          <h1>Back on track.</h1>
          <p>The pending savings were verified and added to your goal.</p>
          <div className="state-detail">
            <strong className="tabular">{lunaToNimString(sweep.amountLuna)} NIM</strong>
            <span>added to {goal.name}</span>
          </div>
          <Link to="/" className="button button-dark" onClick={() => setSweep({ status: 'idle' })}>
            Back to home <ArrowRight size={17} />
          </Link>
        </div>
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
        <p className="eyebrow">Catch-up</p>
        <h1>Bring it back.</h1>
        <p>Collect missed savings into one approval. Remove anything you do not want to sweep.</p>
      </div>

      <div className="catchup-total">
        <strong className="tabular">{lunaToNimString(totalLuna)} NIM</strong>
        <span>
          across {selectedObligations.length} pending obligation{selectedObligations.length === 1 ? '' : 's'}
        </span>
      </div>

      {obligations.length === 0 ? (
        <p className="field-note" style={{ padding: '24px 0' }}>
          Nothing waiting here. Nice.
        </p>
      ) : (
        <>
          <div className="obligation-list">
            {obligations.map((o) => (
              <div key={o.id} className="obligation-row">
                <div className="obligation-copy">
                  <strong>{shortenAddress(o.recipient)}</strong>
                  <span>
                    {SOURCE_LABEL[o.source]} · {new Date(o.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="obligation-side">
                  <span className="obligation-amount tabular">{lunaToNimString(BigInt(o.calculated_luna))} NIM</span>
                  <button className="remove-action" onClick={() => toggle(o.id)}>
                    {selected.has(o.id) ? 'Remove' : 'Add back'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {sweep.status === 'error' && <p className="notice notice-error">{sweep.message}</p>}
          {sweep.status === 'confirming' && sweep.attempt > 2 && (
            <p className="field-note">
              Still checking ({sweep.attempt + 1} of {MAX_POLL_ATTEMPTS})…
            </p>
          )}

          <div className="sweep-footer">
            <button
              className="button button-dark"
              onClick={approveSweep}
              disabled={selectedObligations.length === 0 || sweep.status === 'sending' || sweep.status === 'confirming'}
            >
              {sweep.status === 'sending' && 'Awaiting Nimiq Pay…'}
              {sweep.status === 'confirming' && 'Confirming your transfer…'}
              {(sweep.status === 'idle' || sweep.status === 'error') && (
                <>
                  Approve catch-up sweep <ArrowUpRight size={17} />
                </>
              )}
            </button>
            <p className="sweep-note">
              One native Nimiq Pay approval. Removing an item does not create a blockchain transaction.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
