-- Payment-intent-based transaction confirmation (see project plan). The
-- server fixes an intent's expected recipient/value *before* the frontend
-- ever sends the transaction, then independently verifies the real
-- on-chain transaction against that stored expectation — never against
-- whatever the client claims at submit time. Replaces the after-the-fact
-- `sweeps` POST flow, which trusted a client-submitted tx hash without
-- independent verification (see sweeps.ts's former "KNOWN LIMITATION").
--
-- 'merchant_payment': the Pay & Stash payment leg. Its expected
-- recipient/value are arbitrary user input with no other prior record, so
-- they're frozen here before the send.
-- 'stash_transfer': the savings leg (Pay & Stash) or a Catch-up sweep —
-- both are just "a transfer to the goal's destination address covering one
-- or more already-existing pending obligations," so they share one shape.

create table if not exists stash.payment_intents (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references stash.goals (id),
  wallet_address text not null,
  purpose text not null check (purpose in ('merchant_payment', 'stash_transfer')),
  expected_recipient text not null,
  expected_value_luna bigint not null check (expected_value_luna > 0),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'skipped', 'expired')),
  tx_hash text unique,
  -- For a 'stash_transfer' intent created automatically alongside a
  -- confirmed 'merchant_payment' intent, points back to it.
  linked_intent_id uuid references stash.payment_intents (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- Links a 'stash_transfer' intent to the pending obligation(s) it covers
-- (one for the Pay & Stash savings leg, possibly many for a Catch-up sweep).
create table if not exists stash.payment_intent_obligations (
  intent_id uuid not null references stash.payment_intents (id),
  obligation_id uuid not null references stash.obligations (id),
  primary key (intent_id, obligation_id)
);
