import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Info, ArrowRight, ArrowUpRight, ArrowDownRight, Check, TriangleAlert } from 'lucide-react'
import { nimStringToLuna, lunaToNimString, calculateObligationLuna, toSdkValue } from '@stash/domain'
import { useAppState } from '../state/AppState'
import {
  createMerchantPaymentIntent,
  submitMerchantPaymentIntent,
  submitStashTransferIntent,
  skipPaymentIntent,
  type Obligation,
  type PaymentIntent,
} from '../lib/api'
import { pollUntilConfirmed, MAX_POLL_ATTEMPTS } from '../lib/pollUntilConfirmed'
import { goalToRule } from '../lib/rule'
import { shortenAddress, isSameAddress } from '../lib/format'

type FlowState =
  | { step: 'form' }
  | { step: 'review'; recipient: string; paymentLuna: bigint; stashLuna: bigint }
  | { step: 'paying'; recipient: string; paymentLuna: bigint; stashLuna: bigint }
  | { step: 'confirming-payment'; attempt: number }
  | { step: 'awaiting-savings-approval'; obligation: Obligation; savingsIntent: PaymentIntent }
  | { step: 'stashing'; obligation: Obligation; savingsIntent: PaymentIntent }
  | { step: 'confirming-savings'; obligation: Obligation; attempt: number }
  | { step: 'success'; stashedLuna: bigint }
  | { step: 'partial'; missedLuna: bigint }
  | { step: 'error'; message: string }

export function Pay() {
  const { wallet, goal, refetchGoal } = useAppState()
  const [recipient, setRecipient] = useState('')
  const [amountNim, setAmountNim] = useState('')
  const [flow, setFlow] = useState<FlowState>({ step: 'form' })

  const reset = useCallback(() => {
    setFlow({ step: 'form' })
    setRecipient('')
    setAmountNim('')
  }, [])

  if (wallet.status !== 'connected' || !goal) {
    return (
      <div className="screen">
        <h1 className="state-heading">Pay &amp; Stash</h1>
        <p>{wallet.status !== 'connected' ? 'Connect your wallet from Home first.' : 'Create a savings goal first.'}</p>
      </div>
    )
  }

  if (goal.status !== 'active') {
    return (
      <div className="screen">
        <h1 className="state-heading">Pay &amp; Stash</h1>
        <p>
          {goal.name} is complete —{' '}
          <Link to="/savings" className="text-link">
            start a new goal
          </Link>{' '}
          to keep paying and stashing.
        </p>
      </div>
    )
  }

  const wallet_ = wallet
  const goal_ = goal

  function onReview(e: React.FormEvent) {
    e.preventDefault()
    const trimmedRecipient = recipient.trim()
    if (isSameAddress(trimmedRecipient, wallet_.address)) {
      setFlow({ step: 'error', message: "You can't pay yourself — enter the recipient you're actually paying." })
      return
    }
    try {
      const paymentLuna = nimStringToLuna(amountNim)
      const stashLuna = calculateObligationLuna(goalToRule(goal_), paymentLuna)
      setFlow({ step: 'review', recipient: trimmedRecipient, paymentLuna, stashLuna })
    } catch {
      setFlow({ step: 'error', message: 'Enter a valid payment amount.' })
    }
  }

  async function sendPayment(recipient: string, paymentLuna: bigint, stashLuna: bigint) {
    if (wallet_.status !== 'connected') return
    setFlow({ step: 'paying', recipient, paymentLuna, stashLuna })
    try {
      // The server fixes the expected recipient/value before anything is
      // sent; the send below uses exactly what it echoes back, not the
      // locally-typed values, so the eventual verification isn't just
      // comparing the client against itself.
      const intent = await createMerchantPaymentIntent(goal_.id, recipient, paymentLuna)
      const result = await wallet_.provider.sendBasicTransactionWithData({
        recipient: intent.recipient,
        value: toSdkValue(BigInt(intent.valueLuna)),
        data: intent.intentId,
      })
      if (typeof result !== 'string') {
        setFlow({ step: 'error', message: result.error.message })
        return
      }
      const txHash = result
      setFlow({ step: 'confirming-payment', attempt: 0 })
      pollUntilConfirmed({
        attempt: 0,
        submit: () => submitMerchantPaymentIntent(goal_.id, intent.intentId, txHash),
        onAttempt: (attempt) => setFlow({ step: 'confirming-payment', attempt }),
        onSuccess: ({ obligation, savingsIntent }) => {
          if (!obligation || !savingsIntent) {
            setFlow({ step: 'success', stashedLuna: 0n })
            void refetchGoal()
            return
          }
          setFlow({ step: 'awaiting-savings-approval', obligation, savingsIntent })
        },
        onTerminalError: (message) => setFlow({ step: 'error', message }),
      })
    } catch (err) {
      setFlow({ step: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  async function approveSaving(obligation: Obligation, savingsIntent: PaymentIntent) {
    if (wallet_.status !== 'connected') return
    setFlow({ step: 'stashing', obligation, savingsIntent })
    try {
      const result = await wallet_.provider.sendBasicTransactionWithData({
        recipient: savingsIntent.recipient,
        value: toSdkValue(BigInt(savingsIntent.valueLuna)),
        data: savingsIntent.intentId,
      })
      if (typeof result !== 'string') {
        setFlow({ step: 'error', message: result.error.message })
        return
      }
      const txHash = result
      setFlow({ step: 'confirming-savings', obligation, attempt: 0 })
      pollUntilConfirmed({
        attempt: 0,
        submit: () => submitStashTransferIntent(goal_.id, savingsIntent.intentId, txHash),
        onAttempt: (attempt) => setFlow({ step: 'confirming-savings', obligation, attempt }),
        onSuccess: () => {
          setFlow({ step: 'success', stashedLuna: BigInt(obligation.calculated_luna) })
          void refetchGoal()
        },
        onTerminalError: (message) => setFlow({ step: 'error', message }),
      })
    } catch (err) {
      setFlow({ step: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  async function skipSaving(obligation: Obligation, savingsIntent: PaymentIntent) {
    try {
      await skipPaymentIntent(goal_.id, savingsIntent.intentId)
    } finally {
      setFlow({ step: 'partial', missedLuna: BigInt(obligation.calculated_luna) })
    }
  }

  switch (flow.step) {
    case 'form':
      return (
        <div className="screen">
          <div className="page-head">
            <Link to="/" className="back-action">
              <ArrowLeft size={16} />
              <span>Home</span>
            </Link>
            <p className="eyebrow">Payment 01</p>
            <h1>Pay &amp; Stash.</h1>
            <p>Make the payment, then approve the related saving.</p>
          </div>
          <form onSubmit={onReview} className="form-stack">
            <label className="field">
              <span>Recipient address</span>
              <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="nimiq..." required />
              <span className="field-note">Unknown recipients stay shortened in activity.</span>
            </label>
            {recipient.trim() !== '' && isSameAddress(recipient, goal_.destination_address) && (
              <p className="notice notice-warn">
                <TriangleAlert size={16} /> This is your own savings destination — a payment here won't count as spending, so
                nothing will be stashed for it.
              </p>
            )}
            <label className="field">
              <span>Payment amount</span>
              <input
                value={amountNim}
                onChange={(e) => setAmountNim(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                className="tabular"
                required
              />
              <span className="field-note">NIM</span>
            </label>
            <div className="helper-banner">
              <Info size={17} />
              <span>Two separate NIM transactions and two native Nimiq Pay approvals.</span>
            </div>
            <button type="submit" className="button button-dark">
              Review payment <ArrowRight size={17} />
            </button>
          </form>
        </div>
      )

    case 'review': {
      const total = flow.paymentLuna + flow.stashLuna
      return (
        <div className="screen">
          <div className="page-head">
            <button className="back-action" onClick={reset}>
              <ArrowLeft size={16} />
              <span>Edit payment</span>
            </button>
            <p className="eyebrow">Payment review</p>
            <h1>Check twice.</h1>
            <p>One payment. One separate saving approval.</p>
          </div>
          <div className="review-list">
            <div className="review-row">
              <span>Recipient</span>
              <strong>{shortenAddress(flow.recipient)}</strong>
            </div>
            <div className="review-row">
              <span>Payment</span>
              <strong className="tabular">{lunaToNimString(flow.paymentLuna)} NIM</strong>
            </div>
            <div className="review-row">
              <span>Saving to</span>
              <strong>{shortenAddress(goal_.destination_address)}</strong>
            </div>
            <div className="review-row">
              <span>Stash amount</span>
              <strong className="tabular">{lunaToNimString(flow.stashLuna)} NIM</strong>
            </div>
            <div className="review-row">
              <span>Total before fees</span>
              <strong className="tabular">{lunaToNimString(total)} NIM</strong>
            </div>
          </div>
          {isSameAddress(flow.recipient, goal_.destination_address) && (
            <p className="notice notice-warn">
              <TriangleAlert size={16} /> This recipient is your own savings destination. Stash won't count a payment to
              yourself as spending, so no savings will be calculated for it.
            </p>
          )}
          <div className="approval-callout">
            <h2>Two approvals, clearly separated.</h2>
            <p>First, approve the merchant payment. After it succeeds, Stash asks for the saving transfer.</p>
          </div>
          <div className="button-row">
            <button className="button button-accent" onClick={() => sendPayment(flow.recipient, flow.paymentLuna, flow.stashLuna)}>
              Approve payment <ArrowUpRight size={17} />
            </button>
            <button className="button button-quiet" onClick={reset}>
              Edit details
            </button>
          </div>
        </div>
      )
    }

    case 'paying':
      return (
        <div className="screen">
          <div className="page-head">
            <h1>Awaiting Nimiq Pay…</h1>
            <p>Approve the payment in Nimiq Pay.</p>
          </div>
        </div>
      )

    case 'confirming-payment':
      return (
        <div className="screen">
          <div className="page-head">
            <h1>Confirming your payment…</h1>
            <p>Verifying it on TestAlbatross. This usually only takes a moment.</p>
          </div>
          {flow.attempt > 2 && (
            <p className="field-note">
              Still checking ({flow.attempt + 1} of {MAX_POLL_ATTEMPTS})…
            </p>
          )}
        </div>
      )

    case 'awaiting-savings-approval':
      return (
        <div className="screen">
          <div className="page-head">
            <p className="eyebrow">Payment complete</p>
            <h1>Now stash it.</h1>
            <p>The merchant payment is verified. Your saving is still a separate approval.</p>
          </div>
          <div className="state-detail">
            <strong className="tabular">{lunaToNimString(BigInt(flow.obligation.calculated_luna))} NIM</strong>
            <span>to your savings destination, {shortenAddress(goal_.destination_address)}</span>
          </div>
          <div className="approval-callout">
            <h2>Ready for approval.</h2>
            <p>This transfer goes to the wallet you chose in setup.</p>
          </div>
          <div className="button-row">
            <button className="button button-accent" onClick={() => approveSaving(flow.obligation, flow.savingsIntent)}>
              Approve saving <ArrowUpRight size={17} />
            </button>
            <button className="button button-quiet" onClick={() => skipSaving(flow.obligation, flow.savingsIntent)}>
              Skip for now
            </button>
          </div>
          <p className="field-note">Skipping moves the exact amount into Catch-up. Nothing disappears.</p>
        </div>
      )

    case 'stashing':
      return (
        <div className="screen">
          <div className="page-head">
            <h1>Awaiting Nimiq Pay…</h1>
            <p>Approve the savings transfer in Nimiq Pay.</p>
          </div>
        </div>
      )

    case 'confirming-savings':
      return (
        <div className="screen">
          <div className="page-head">
            <h1>Confirming your savings transfer…</h1>
            <p>Verifying it on TestAlbatross. This usually only takes a moment.</p>
          </div>
          {flow.attempt > 2 && (
            <p className="field-note">
              Still checking ({flow.attempt + 1} of {MAX_POLL_ATTEMPTS})…
            </p>
          )}
        </div>
      )

    case 'success':
      return (
        <div className="screen">
          <div className="state-panel">
            <span className="verified-mark">
              <Check size={28} />
            </span>
            <p className="eyebrow">Verified savings</p>
            <h1>A little more in place.</h1>
            <p>Your payment and savings are both verified. The goal moved forward without drama.</p>
            <div className="state-detail">
              <strong className="tabular">{lunaToNimString(flow.stashedLuna)} NIM</strong>
              <span>Saved just now</span>
            </div>
            <Link to="/" className="button button-dark" onClick={reset}>
              Back to home <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      )

    case 'partial':
      return (
        <div className="screen">
          <div className="state-panel">
            <span className="verified-mark is-warning">
              <ArrowDownRight size={28} />
            </span>
            <p className="eyebrow">Payment complete</p>
            <h1>Savings not completed.</h1>
            <p>The payment went through. The saving did not, so the exact amount is waiting in Catch-up.</p>
            <div className="state-detail">
              <strong className="tabular">{lunaToNimString(flow.missedLuna)} NIM</strong>
              <span>Missed savings amount, ready for one sweep</span>
            </div>
            <Link to="/catch-up" className="button button-accent" onClick={reset}>
              Go to Catch-up <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      )

    case 'error':
      return (
        <div className="screen">
          <div className="state-panel">
            <span className="verified-mark is-warning">
              <TriangleAlert size={28} />
            </span>
            <p className="eyebrow">Something went wrong</p>
            <h1>That didn't go through.</h1>
            <p>{flow.message}</p>
            <div className="button-row">
              <button className="button button-accent" onClick={reset}>
                Try again <ArrowRight size={17} />
              </button>
              <Link to="/activity" className="button button-quiet" onClick={reset}>
                View Activity
              </Link>
            </div>
            <p className="field-note">
              If a payment was actually approved in Nimiq Pay, it'll show up in Activity even if this screen couldn't confirm it.
            </p>
          </div>
        </div>
      )
  }
}
