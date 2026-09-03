import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, TriangleAlert, Check } from 'lucide-react'
import { lunaToNimString } from '@stash/domain'
import { useAppState } from '../state/AppState'
import { createGoal, updateGoal, listGoals, ApiError, type Goal, type RuleType } from '../lib/api'
import { formatShortDate } from '../lib/format'

type RuleDraft = { type: RuleType; value: string }

/** Never deleted or hidden — see BUILD_UPDATED.md's goal-completion note. */
function PastGoalsList({ goals }: { goals: Goal[] }) {
  if (goals.length === 0) return null
  return (
    <div className="activity-section" style={{ marginTop: 24 }}>
      <p className="eyebrow">Past goals</p>
      <div className="settings-list">
        {goals.map((g) => (
          <div key={g.id} className="setting-row">
            <div className="setting-copy">
              <strong>{g.name}</strong>
              <span>
                {lunaToNimString(BigInt(g.target_luna))} NIM · completed {formatShortDate(new Date(g.updated_at))}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Savings() {
  const { wallet, goal, refetchGoal } = useAppState()
  const [name, setName] = useState('')
  const [targetNim, setTargetNim] = useState('')
  const [destination, setDestination] = useState('')
  const [rule, setRule] = useState<RuleDraft>({ type: 'percentage', value: '5' })
  const [editing, setEditing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pastGoals, setPastGoals] = useState<Goal[]>([])

  // A completed goal is treated the same as "no goal" for the purposes of
  // this form — it must fall through to goal *creation*, not silently edit
  // the goal that just finished (BUILD_UPDATED.md: the one-active-goal
  // constraint is partial/active-only, so a new goal is always allowed
  // once the current one is completed).
  const isCreating = !goal || goal.status === 'completed'

  useEffect(() => {
    if (!goal || goal.status === 'completed') return
    setName(goal.name)
    setTargetNim(lunaToNimString(BigInt(goal.target_luna)))
    setDestination(goal.destination_address)
    if (goal.rule_type === 'percentage') {
      setRule({ type: 'percentage', value: (Number(goal.rule_value) / 100).toString() })
    } else {
      setRule({ type: goal.rule_type, value: lunaToNimString(BigInt(goal.rule_value)) })
    }
  }, [goal])

  useEffect(() => {
    if (wallet.status !== 'connected') return
    listGoals(wallet.address).then((goals) => setPastGoals(goals.filter((g) => g.status === 'completed')))
  }, [wallet, goal])

  if (wallet.status !== 'connected') {
    return (
      <div className="screen">
        <h1 className="state-heading">Savings</h1>
        <p>Connect your wallet from Home first.</p>
      </div>
    )
  }

  const destinationChanged = !isCreating && goal ? destination.trim() !== goal.destination_address : false

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (wallet.status !== 'connected') return
    setSaved(false)
    if (destination.trim() === wallet.address) {
      setError('Savings destination must be a different address from your spending wallet.')
      return
    }
    if (isCreating) {
      const parsedRuleValue = Number(rule.value)
      if (rule.type === 'percentage' && (!Number.isFinite(parsedRuleValue) || parsedRuleValue <= 0 || parsedRuleValue > 100)) {
        setError('Percentage must be greater than 0 and no more than 100.')
        return
      }
      if (rule.type !== 'percentage' && (!Number.isFinite(parsedRuleValue) || parsedRuleValue <= 0)) {
        setError(`${rule.type === 'fixed' ? 'Fixed amount' : 'Round-up interval'} must be greater than 0.`)
        return
      }
    }
    setSubmitting(true)
    setError(null)
    try {
      const ruleValue = rule.type === 'percentage' ? Math.round(Number(rule.value) * 100) : rule.value

      if (isCreating) {
        await createGoal({ name, targetNim, destinationAddress: destination, ruleType: rule.type, ruleValue })
      } else if (goal) {
        await updateGoal(goal.id, { name, targetNim, destinationAddress: destination })
      }
      await refetchGoal()
      setSaved(true)
      setEditing(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong saving this goal.')
    } finally {
      setSubmitting(false)
    }
  }

  async function togglePause() {
    if (!goal || wallet.status !== 'connected') return
    setSubmitting(true)
    try {
      await updateGoal(goal.id, { status: goal.status === 'active' ? 'paused' : 'active' })
      await refetchGoal()
    } finally {
      setSubmitting(false)
    }
  }

  if (goal && !isCreating && !editing) {
    return (
      <div className="screen">
        <div className="page-head">
          <Link to="/" className="back-action">
            <ArrowLeft size={16} />
            <span>Home</span>
          </Link>
          <p className="eyebrow">Goal settings</p>
          <h1>Keep it yours.</h1>
          <p>Future rules can change. Existing obligations do not get rewritten.</p>
        </div>

        {saved && (
          <p className="notice notice-ok" style={{ marginBottom: 16 }}>
            <Check size={16} /> Saved.
          </p>
        )}

        <div className="settings-list">
          <div className="setting-row">
            <div className="setting-copy">
              <strong>Goal name</strong>
              <span>{goal.name}</span>
            </div>
            <button className="text-link" onClick={() => setEditing(true)}>
              Edit
            </button>
          </div>
          <div className="setting-row">
            <div className="setting-copy">
              <strong>Target</strong>
              <span className="tabular">{lunaToNimString(BigInt(goal.target_luna))} NIM</span>
            </div>
            <button className="text-link" onClick={() => setEditing(true)}>
              Edit
            </button>
          </div>
          <div className="setting-row">
            <div className="setting-copy">
              <strong>Rule</strong>
              <span>{ruleSummary(goal.rule_type, goal.rule_value)}</span>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-copy">
              <strong>Calculations</strong>
              <span>{goal.status === 'active' ? 'Stash is active on future payments' : 'Paused — nothing new is being calculated'}</span>
            </div>
            <button
              className="switch"
              role="switch"
              aria-checked={goal.status === 'active'}
              aria-label="Pause or resume calculations"
              onClick={togglePause}
              disabled={submitting}
            />
          </div>
          <div className="setting-row">
            <div className="setting-copy">
              <strong>Destination</strong>
              <span className="address">{goal.destination_address}</span>
            </div>
            <button className="text-link" onClick={() => setEditing(true)}>
              Update
            </button>
          </div>
        </div>

        <div className="helper-banner" style={{ marginTop: 24 }}>
          <TriangleAlert size={17} />
          <span>Changing the destination affects future savings only. Verify the new address before saving.</span>
        </div>

        <PastGoalsList goals={pastGoals} />
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="page-head">
        {!isCreating ? (
          <button className="back-action" onClick={() => setEditing(false)}>
            <ArrowLeft size={16} />
            <span>Goal settings</span>
          </button>
        ) : (
          <Link to="/" className="back-action">
            <ArrowLeft size={16} />
            <span>Home</span>
          </Link>
        )}
        <p className="eyebrow">Savings setup</p>
        <h1>{isCreating ? 'Shape the habit.' : 'Update your goal.'}</h1>
        <p>Set the reason, the finish line, and what happens next time you spend.</p>
      </div>

      <form onSubmit={handleSubmit} className="form-stack">
        <label className="field">
          <span>Goal name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rainy day fund" required />
        </label>

        <label className="field">
          <span>Target amount</span>
          <input
            value={targetNim}
            onChange={(e) => setTargetNim(e.target.value)}
            placeholder="500"
            inputMode="decimal"
            className="tabular"
            required
          />
          <span className="field-note">NIM</span>
        </label>

        {isCreating && (
          <fieldset className="rule-selector">
            <legend>Savings rule</legend>
            {(['percentage', 'fixed', 'round_up'] as const).map((type) => (
              <label key={type} className={`radio-row${rule.type === type ? ' radio-row-selected' : ''}`}>
                <span className="radio-dot" aria-hidden="true" />
                <span className="radio-copy">
                  <span className="radio-title">{ruleTypeLabel(type)}</span>
                  <span className="radio-description">{ruleTypeDescription(type)}</span>
                </span>
                {rule.type === type ? (
                  <span className="radio-value-editable">
                    <input
                      className="radio-value-input"
                      value={rule.value}
                      onChange={(e) => setRule({ type, value: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      inputMode="decimal"
                      aria-label={`${ruleTypeLabel(type)} value`}
                    />
                    <span className="radio-value-unit">{type === 'percentage' ? '%' : 'NIM'}</span>
                  </span>
                ) : (
                  <span className="radio-value">{type === 'percentage' ? '5%' : type === 'fixed' ? '2 NIM' : 'to 10'}</span>
                )}
                <input
                  type="radio"
                  name="ruleType"
                  className="radio-row-native"
                  checked={rule.type === type}
                  onChange={() => setRule({ type, value: type === 'percentage' ? '5' : '2' })}
                />
              </label>
            ))}
            <div className="example-note" aria-live="polite">
              {ruleExample(rule)}
            </div>
          </fieldset>
        )}

        <label className="field">
          <span>Savings destination</span>
          <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="nimiq..." required />
          <span className="destination-note">
            <ShieldCheck size={15} />
            <span>This is the wallet you control. Changing it applies to future savings.</span>
          </span>
        </label>

        {destinationChanged && (
          <p className="notice notice-warn">
            <TriangleAlert size={16} /> Changing your destination only affects future sweeps — it does not move already-saved NIM.
          </p>
        )}
        {error && <p className="notice notice-error">{error}</p>}

        <div className="form-footer">
          <button type="submit" className="button button-accent" disabled={submitting}>
            {isCreating ? 'Save setup' : 'Save changes'} <Check size={17} />
          </button>
          <p className="field-note">Past obligations stay as they are. New rules start with future spending.</p>
        </div>
      </form>

      <PastGoalsList goals={pastGoals} />
    </div>
  )
}

function ruleTypeLabel(type: RuleType): string {
  if (type === 'percentage') return 'Percentage'
  if (type === 'fixed') return 'Fixed amount'
  return 'Round-up'
}

function ruleTypeDescription(type: RuleType): string {
  if (type === 'percentage') return 'A steady slice of every eligible payment'
  if (type === 'fixed') return 'The same amount, each time'
  return 'Round the payment up to the nearest interval'
}

function ruleExample(rule: RuleDraft): string {
  const value = rule.value || '0'
  if (rule.type === 'percentage') return `For a 100 NIM payment, Stash would save ${(Number(value) * 1).toFixed(2)} NIM.`
  if (rule.type === 'fixed') return `Every eligible payment stashes ${value} NIM.`
  return `A 47 NIM payment rounds up to the next ${value} NIM.`
}

function ruleSummary(ruleType: RuleType, ruleValue: string): string {
  if (ruleType === 'percentage') return `${Number(ruleValue) / 100}% of eligible payments`
  if (ruleType === 'fixed') return `${lunaToNimString(BigInt(ruleValue))} NIM per eligible payment`
  return `Round up to nearest ${lunaToNimString(BigInt(ruleValue))} NIM`
}
