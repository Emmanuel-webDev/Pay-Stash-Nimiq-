import { ApiError } from './api'

export const POLL_INTERVAL_MS = 3000
export const MAX_POLL_ATTEMPTS = 12

/**
 * Polls a payment-intent `submit` call until it settles. Only retries when
 * the backend explicitly says the failure is retryable (ApiError.retryable
 * — "not visible on-chain yet", set by apps/api/src/nimiqRpc.ts) so a
 * genuinely wrong transaction surfaces immediately instead of being retried
 * for no reason.
 */
export function pollUntilConfirmed<T>(params: {
  attempt: number
  submit: () => Promise<T>
  onAttempt: (attempt: number) => void
  onSuccess: (result: T) => void
  onTerminalError: (message: string) => void
}): void {
  params
    .submit()
    .then(params.onSuccess)
    .catch((err: unknown) => {
      const retryable = err instanceof ApiError && err.retryable === true
      if (retryable && params.attempt + 1 < MAX_POLL_ATTEMPTS) {
        const nextAttempt = params.attempt + 1
        params.onAttempt(nextAttempt)
        setTimeout(() => pollUntilConfirmed({ ...params, attempt: nextAttempt }), POLL_INTERVAL_MS)
        return
      }
      const message = retryable
        ? "We couldn't confirm this in time. If it actually went through, it'll show up in Activity shortly — otherwise, try again."
        : err instanceof Error
          ? err.message
          : String(err)
      params.onTerminalError(message)
    })
}
