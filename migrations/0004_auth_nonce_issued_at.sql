-- verifySignedChallenge must reconstruct the exact challenge message that was
-- signed, byte-for-byte. Deriving "Issued At" from auth_nonces.created_at (set
-- by Postgres's own now() at insert time) doesn't work — that's a separate
-- timestamp from the `issuedAt` value already baked into the message string
-- returned to the client moments earlier in the same request, and any drift
-- between them breaks the signature. Store the exact value instead.

alter table stash.auth_nonces add column issued_at timestamptz not null default now();
alter table stash.auth_nonces alter column issued_at drop default;
