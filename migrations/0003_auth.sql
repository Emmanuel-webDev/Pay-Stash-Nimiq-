-- Signed-challenge wallet auth (BUILD_UPDATED.md §8/§19). Replaces the
-- self-reported `ownerAddress` trust model with real proof of wallet
-- ownership: a nonce is challenged, signed with the wallet's private key via
-- Nimiq Pay, and verified server-side against the derived Nimiq address.

create table if not exists stash.auth_nonces (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  nonce text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Sessions store only a hash of the bearer token, never the raw token —
-- same principle as password storage, so a DB read alone can't produce a
-- usable session.
create table if not exists stash.sessions (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
