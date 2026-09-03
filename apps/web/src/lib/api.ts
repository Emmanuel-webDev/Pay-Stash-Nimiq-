const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787'

export type RuleType = 'percentage' | 'fixed' | 'round_up'

export type Goal = {
  id: string
  owner_address: string
  name: string
  target_luna: string
  destination_address: string
  rule_type: RuleType
  rule_value: string
  status: 'active' | 'paused' | 'completed'
  created_at: string
  updated_at: string
}

export type ObligationSource = 'pay_and_stash' | 'external_spend' | 'skipped_savings'

export type Obligation = {
  id: string
  goal_id: string
  tx_hash: string
  recipient: string
  spend_luna: string
  calculated_luna: string
  status: 'pending' | 'swept'
  source: ObligationSource
  created_at: string
}

export type Sweep = {
  id: string
  goal_id: string
  amount_luna: string
  tx_hash: string
  status: 'submitted' | 'confirmed' | 'failed'
  created_at: string
  confirmed_at: string | null
}

export type PaymentIntent = {
  intentId: string
  recipient: string
  valueLuna: string
  expiresAt: string
}

class ApiError extends Error {
  status: number
  /** true only for "not visible on-chain yet" — safe to retry. Absent for non-verification errors. */
  retryable?: boolean

  constructor(message: string, status: number, retryable?: boolean) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.retryable = retryable
  }
}

// Session token is a Bearer credential, not accounting data — sessionStorage
// (cleared on tab close) is the right place for it, unlike goals/obligations
// which must never be trusted from browser storage (BUILD_UPDATED.md §5).
const SESSION_STORAGE_KEY = 'stash.sessionToken'

export function getSessionToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setSessionToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(SESSION_STORAGE_KEY, token)
    else sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // Ignore storage failures (e.g. private browsing) — the session just
    // won't survive a reload, which is a degraded-but-safe outcome.
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSessionToken()
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    })
  } catch {
    // fetch() itself throwing (not an HTTP error response) means the
    // request never reached the server — offline, DNS failure, the API
    // being down. Distinguishable from a real server error so callers like
    // pollUntilConfirmed can keep retrying through a transient blip instead
    // of surfacing a confusing raw "Failed to fetch".
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    throw new ApiError(offline ? "You're offline. Check your connection and try again." : "Couldn't reach Stash. Check your connection and try again.", 0, true)
  }
  const body = await res.json().catch(() => undefined)
  if (!res.ok) {
    if (res.status === 401) setSessionToken(null)
    const rawError = body && typeof body === 'object' && 'error' in body ? body.error : undefined
    const message = typeof rawError === 'string' ? rawError : rawError !== undefined ? JSON.stringify(rawError) : res.statusText
    const retryable = body && typeof body === 'object' && 'retryable' in body ? Boolean(body.retryable) : undefined
    throw new ApiError(message, res.status, retryable)
  }
  return body as T
}

export function requestChallenge(walletAddress: string): Promise<{ nonce: string; message: string }> {
  return request('/api/auth/challenge', { method: 'POST', body: JSON.stringify({ walletAddress }) })
}

export function verifyChallenge(input: {
  walletAddress: string
  nonce: string
  publicKey: string
  signature: string
}): Promise<{ token: string; expiresAt: string }> {
  return request('/api/auth/verify', { method: 'POST', body: JSON.stringify(input) })
}

export type CreateGoalInput = {
  name: string
  targetNim: string
  destinationAddress: string
  ruleType: RuleType
  ruleValue: number | string
}

export function createGoal(input: CreateGoalInput): Promise<Goal> {
  return request('/api/goals', { method: 'POST', body: JSON.stringify(input) })
}

export async function listGoals(address: string): Promise<Goal[]> {
  const { goals } = await request<{ goals: Goal[] }>(`/api/goals?address=${encodeURIComponent(address)}`)
  return goals
}

export type UpdateGoalInput = {
  name?: string
  targetNim?: string
  status?: 'active' | 'paused' | 'completed'
  destinationAddress?: string
}

export function updateGoal(goalId: string, input: UpdateGoalInput): Promise<Goal> {
  return request(`/api/goals/${goalId}`, { method: 'PATCH', body: JSON.stringify(input) })
}

/**
 * Triggers a server-side scan of this wallet's real outgoing transactions
 * (backend RPC, not this client) and creates any new 'external_spend'
 * obligations found — see apps/api/src/obligations.ts.
 *
 * NOT called from any screen (BUILD_UPDATED.md §9's platform-limitation
 * note, established 2026-09-03): the public RPC's address index only
 * covers transactions where the wallet is literally `from` or `to`, and
 * Nimiq Pay sends every payment through an HTLC it creates itself — so a
 * real payment's `from` is the HTLC, not this wallet, and it never appears
 * in this scan no matter how often it runs. Kept in place (endpoint and
 * this wrapper) because the classification logic it calls is correct and
 * the two-hop scan that would make it actually work (BUILD_UPDATED.md §9)
 * is documented future work, not a design that needs redoing.
 */
export async function syncExternalSpend(goalId: string): Promise<Obligation[]> {
  const { obligations } = await request<{ obligations: Obligation[] }>(`/api/goals/${goalId}/obligations`, { method: 'POST' })
  return obligations
}

export async function listObligations(
  goalId: string,
  address: string,
  status?: 'pending' | 'swept',
): Promise<Obligation[]> {
  const q = new URLSearchParams({ address })
  if (status) q.set('status', status)
  const { obligations } = await request<{ obligations: Obligation[] }>(`/api/goals/${goalId}/obligations?${q}`)
  return obligations
}

export async function getReadyToStash(goalId: string, address: string): Promise<bigint> {
  const { readyToStashLuna } = await request<{ readyToStashLuna: string }>(
    `/api/goals/${goalId}/ready-to-stash?address=${encodeURIComponent(address)}`,
  )
  return BigInt(readyToStashLuna)
}

export async function listSweeps(goalId: string, address: string): Promise<Sweep[]> {
  const { sweeps } = await request<{ sweeps: Sweep[] }>(`/api/goals/${goalId}/sweeps?address=${encodeURIComponent(address)}`)
  return sweeps
}

export type WalletActivityTransaction = {
  txHash: string
  recipient: string
  valueLuna: string
  blockHeight: number
  timestamp: number
}

export async function getWalletActivity(address: string, limit = 30): Promise<WalletActivityTransaction[]> {
  const { transactions } = await request<{ transactions: WalletActivityTransaction[] }>(
    `/api/wallets/${encodeURIComponent(address)}/activity?limit=${limit}`,
  )
  return transactions
}

/** Wallet-scoped weekly streak — see packages/domain's computeStreakWeeks for the exact definition. */
export async function getSavingsStreak(address: string): Promise<number> {
  const { weeks } = await request<{ weeks: number }>(`/api/wallets/${encodeURIComponent(address)}/streak`)
  return weeks
}

export function createMerchantPaymentIntent(goalId: string, recipient: string, valueLuna: bigint): Promise<PaymentIntent> {
  return request(`/api/goals/${goalId}/payment-intents`, {
    method: 'POST',
    body: JSON.stringify({ purpose: 'merchant_payment', recipient, valueLuna: valueLuna.toString() }),
  })
}

export function createStashTransferIntent(goalId: string, obligationIds: string[]): Promise<PaymentIntent> {
  return request(`/api/goals/${goalId}/payment-intents`, {
    method: 'POST',
    body: JSON.stringify({ purpose: 'stash_transfer', obligationIds }),
  })
}

export type MerchantPaymentSubmitResult = {
  obligation: Obligation | null
  savingsIntent: PaymentIntent | null
}

export function submitMerchantPaymentIntent(goalId: string, intentId: string, txHash: string): Promise<MerchantPaymentSubmitResult> {
  return request(`/api/goals/${goalId}/payment-intents/${intentId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ txHash }),
  })
}

export type StashTransferSubmitResult = {
  sweepId: string
  obligationIds: string[]
}

export function submitStashTransferIntent(goalId: string, intentId: string, txHash: string): Promise<StashTransferSubmitResult> {
  return request(`/api/goals/${goalId}/payment-intents/${intentId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ txHash }),
  })
}

export function skipPaymentIntent(goalId: string, intentId: string): Promise<{ obligations: Obligation[] }> {
  return request(`/api/goals/${goalId}/payment-intents/${intentId}/skip`, { method: 'POST' })
}

export { ApiError }
