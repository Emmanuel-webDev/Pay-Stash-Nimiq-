-- Schema per BUILD_UPDATED.md §15. All monetary values are BIGINT Luna
-- (1 NIM = 100,000 Luna) — never floating point, per §12 "Financial
-- integrity". BIGINT's max (~9.2e18) comfortably covers Nimiq's total
-- supply in Luna (~2.1e15).
--
-- Lives in its own `stash` schema, not `public` — this Supabase project
-- already hosts an unrelated app's tables (including its own `profiles`),
-- so table names alone aren't safe to assume are free.

create schema if not exists stash;

create table if not exists stash.profiles (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stash.goals (
  id uuid primary key default gen_random_uuid(),
  owner_address text not null references stash.profiles (wallet_address),
  name text not null,
  target_luna bigint not null check (target_luna > 0),
  destination_address text not null,
  rule_type text not null check (rule_type in ('percentage', 'round_up', 'fixed')),
  -- basis points (0-10000) for 'percentage'; Luna for 'round_up'/'fixed'.
  rule_value bigint not null check (rule_value > 0),
  status text not null default 'active' check (status in ('active', 'paused', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- §8: one active goal per spending wallet for the Cycle II MVP.
create unique index if not exists one_active_goal_per_owner
  on stash.goals (owner_address)
  where status = 'active';

create table if not exists stash.observed_transactions (
  tx_hash text primary key,
  owner_address text not null references stash.profiles (wallet_address),
  sender text not null,
  recipient text not null,
  value_luna bigint not null check (value_luna >= 0),
  fee_luna bigint not null default 0 check (fee_luna >= 0),
  block_height bigint not null,
  "timestamp" timestamptz not null,
  execution_result boolean not null,
  classification text not null check (
    classification in ('eligible_spend', 'self_transfer', 'stash_sweep', 'ignored')
  ),
  created_at timestamptz not null default now()
);

create table if not exists stash.obligations (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references stash.goals (id),
  tx_hash text not null references stash.observed_transactions (tx_hash),
  spend_luna bigint not null check (spend_luna > 0),
  calculated_luna bigint not null check (calculated_luna > 0),
  status text not null default 'pending' check (status in ('pending', 'swept')),
  created_at timestamptz not null default now(),
  unique (goal_id, tx_hash)
);

create table if not exists stash.sweeps (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references stash.goals (id),
  amount_luna bigint not null check (amount_luna > 0),
  tx_hash text not null unique,
  status text not null default 'submitted' check (status in ('submitted', 'confirmed', 'failed')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create table if not exists stash.sweep_obligations (
  sweep_id uuid not null references stash.sweeps (id),
  obligation_id uuid not null references stash.obligations (id),
  primary key (sweep_id, obligation_id)
);
