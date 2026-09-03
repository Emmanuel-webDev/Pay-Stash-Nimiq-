-- Tracks when a pending intent's wallet was last RPC-scanned by the
-- background reconciler (apps/api/src/paymentIntentReconciler.ts), so it
-- can apply per-intent age-based backoff instead of hitting the public RPC
-- for every pending intent on every 30s tick indefinitely.

alter table stash.payment_intents add column if not exists last_checked_at timestamptz;
