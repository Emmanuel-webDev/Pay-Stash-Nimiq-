import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, ArrowUpRight, ArrowRight, Check } from 'lucide-react'
import { lunaToNimString } from '@stash/domain'
import { useAppState } from '../state/AppState'
import { getReadyToStash, getSavingsStreak, listObligations } from '../lib/api'
import { formatDateMarker, formatShortDate } from '../lib/format'
import { ruleLabel } from '../lib/ruleLabel'
import { shortenAddress } from '../lib/format'

export function Home() {
  const { wallet, goal, goalLoading } = useAppState()
  const [readyToStash, setReadyToStash] = useState<bigint | null>(null)
  const [sweptLuna, setSweptLuna] = useState<bigint | null>(null)
  const [sweptCount, setSweptCount] = useState<number | null>(null)
  const [streakWeeks, setStreakWeeks] = useState<number | null>(null)

  useEffect(() => {
    if (wallet.status !== 'connected' || !goal) return
    getReadyToStash(goal.id, wallet.address).then(setReadyToStash)
    listObligations(goal.id, wallet.address, 'swept').then((obligations) => {
      setSweptLuna(obligations.reduce((sum, o) => sum + BigInt(o.calculated_luna), 0n))
      setSweptCount(obligations.length)
    })
  }, [wallet, goal])

  useEffect(() => {
    if (wallet.status !== 'connected') return
    // Own try/catch: a streak failure must never block the rest of Home —
    // "show no streak rather than a wrong one."
    getSavingsStreak(wallet.address)
      .then(setStreakWeeks)
      .catch(() => setStreakWeeks(null))
  }, [wallet])

  if (wallet.status !== 'connected') {
    return (
      <div className="screen">
        <div className="masthead">
          <p className="eyebrow">Welcome</p>
          <h1>Save when you spend.</h1>
          <p className="lead">Connect your Nimiq wallet to get started.</p>
        </div>
        <ConnectPrompt />
      </div>
    )
  }

  if (goalLoading) {
    return (
      <div className="screen">
        <p className="empty-state">Loading your goal…</p>
      </div>
    )
  }

  if (!goal) {
    return (
      <div className="screen">
        <div className="masthead">
          <p className="eyebrow">{formatDateMarker()}</p>
          <h1>No savings goal yet</h1>
          <p className="lead">Create one to start stashing a little every time you pay.</p>
        </div>
        <Link to="/savings" className="primary-action">
          <span>Create a goal</span>
          <span className="button-arrow">
            <ArrowUpRight size={17} />
          </span>
        </Link>
      </div>
    )
  }

  const targetLuna = BigInt(goal.target_luna)
  const progressPct = targetLuna > 0n && sweptLuna !== null ? Number((sweptLuna * 100n) / targetLuna) : 0
  const remainingLuna = sweptLuna !== null ? (targetLuna > sweptLuna ? targetLuna - sweptLuna : 0n) : null

  // A single week isn't a run yet, and "1-week streak" reads as noise on a
  // new wallet — hidden until week two so the line's first appearance is
  // itself the signal. Display-only: the API still returns the true value.
  const streakLine = streakWeeks !== null && streakWeeks >= 2 && (
    <p className="field-note">
      {streakWeeks}-week streak
    </p>
  )

  if (goal.status === 'completed') {
    return (
      <div className="screen">
        {streakLine}
        <div className="state-panel">
          <span className="verified-mark">
            <Check size={28} />
          </span>
          <p className="eyebrow">Goal complete</p>
          <h1>{goal.name}</h1>
          <div className="state-detail">
            <strong className="tabular">
              {lunaToNimString(sweptLuna ?? targetLuna)} / {lunaToNimString(targetLuna)} NIM
            </strong>
            <span>
              {sweptCount !== null ? `Saved across ${sweptCount} payment${sweptCount === 1 ? '' : 's'}` : ' '}
              <br />
              Started {formatShortDate(new Date(goal.created_at))}
            </span>
          </div>
          <Link to="/savings" className="button button-dark">
            Start another goal <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="masthead">
        <p className="eyebrow">{formatDateMarker()}</p>
        <h1>Save when you spend.</h1>
        <p className="lead">A small step after every payment. A useful buffer over time.</p>
      </div>

      {streakLine}

      <section className="rule-band">
        <div className="rule-band-head">
          <div>
            <p className="eyebrow">Active rule</p>
            <h2>{ruleLabel(goal)}</h2>
          </div>
          <span className="rule-icon">
            <Sparkles size={18} />
          </span>
        </div>
        <p>Applied to future eligible payments. You approve the saving separately, every time.</p>
        <div className="rule-band-meta">
          <span>Destination</span>
          <strong>{shortenAddress(goal.destination_address)}</strong>
        </div>
      </section>

      <section className="goal-section">
        <div className="section-kicker">
          <span>{goal.name}</span>
          <Link to="/savings" className="text-link">
            Manage goal
          </Link>
        </div>
        <div className="goal-amount">
          <strong className="tabular">{sweptLuna !== null ? lunaToNimString(sweptLuna) : '…'}</strong>
          <span className="tabular">/ {lunaToNimString(targetLuna)} NIM</span>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-label={`${goal.name} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPct}
        >
          <div className="progress-fill" style={{ width: `${Math.min(100, progressPct)}%` }} />
        </div>
        <div className="goal-foot">
          <span>{progressPct}% saved</span>
          {remainingLuna !== null && <span className="tabular">{lunaToNimString(remainingLuna)} NIM to go</span>}
        </div>
      </section>

      <Link to="/pay" className="primary-action" aria-label="Start Pay and Stash">
        <span>Pay &amp; Stash</span>
        <span className="button-arrow">
          <ArrowUpRight size={17} />
        </span>
      </Link>

      {readyToStash !== null && readyToStash > 0n && (
        <section className="catchup-teaser">
          <div className="catchup-teaser-head">
            <div>
              <p className="eyebrow">Catch-up</p>
              <h2>You have savings waiting.</h2>
              <p>Bring them back into one sweep.</p>
            </div>
            <strong className="teaser-amount tabular">{lunaToNimString(readyToStash)} NIM</strong>
          </div>
          <Link to="/catch-up" className="secondary-action">
            Review catch-up
          </Link>
        </section>
      )}
    </div>
  )
}

function ConnectPrompt() {
  const { connectWallet, retryAuthentication, wallet } = useAppState()

  if (wallet.status === 'unauthenticated') {
    return (
      <div>
        <button className="primary-action" onClick={retryAuthentication}>
          <span>Sign in to Stash</span>
          <span className="button-arrow">
            <ArrowUpRight size={17} />
          </span>
        </button>
        <p className="notice notice-warn" style={{ marginTop: 12 }}>
          {wallet.detail}
        </p>
      </div>
    )
  }

  return (
    <div>
      <button
        className="primary-action"
        onClick={connectWallet}
        disabled={wallet.status === 'connecting' || wallet.status === 'authenticating'}
      >
        <span>
          {wallet.status === 'connecting' && 'Connecting…'}
          {wallet.status === 'authenticating' && 'Waiting for signature…'}
          {wallet.status !== 'connecting' && wallet.status !== 'authenticating' && 'Connect Nimiq wallet'}
        </span>
        <span className="button-arrow">
          <ArrowUpRight size={17} />
        </span>
      </button>
      {(wallet.status === 'not-in-nimiq-pay' || wallet.status === 'error') && (
        <p className="notice notice-error" style={{ marginTop: 12 }}>
          {wallet.detail}
        </p>
      )}
    </div>
  )
}
