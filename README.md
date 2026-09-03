# Stash

Implementation follows `BUILD_UPDATED.md` §21's phase order. Status:

- **Phase 0 (TestAlbatross integration spike) — DONE.** Full exit criteria
  closed on a real device: real Nimiq Pay session, real TestAlbatross
  address, real consensus, real faucet funding, a real
  `sendBasicTransaction()` send, and that exact transaction showing up
  through the app's own activity reader afterward. See "Live verification
  results" below for the actual data.
- **Phase 1 (domain engine)** — done. Pure calculation logic has no
  dependency on the blockchain-integration questions below, so it didn't
  need to wait on Phase 0's live verification.
- **Phase 2 (persistence + auth) — DONE.** Schema + goal CRUD against a real
  Postgres/Supabase instance (no mocked DB), extended in Phase 3 with
  obligations/sweeps routes. Signed-challenge wallet auth
  (`apps/api/src/auth.ts`) is implemented and every mutating route requires
  it — see "Phase 2 — persistence + auth" below. Verified end-to-end,
  including a real on-device Nimiq Pay `provider.sign()` round trip (device
  test run 2026-09-01, over a LAN URL from `vite --host`): the wallet
  connected, the sign prompt appeared, the server verified the signature and
  issued a session, and an authenticated `GET /api/goals` request from the
  device succeeded immediately after. That test also settled the one open
  question this phase carried — which message-signing scheme Nimiq Pay's
  `provider.sign()` uses — confirming the Nimiq Hub-style prefixed-SHA256
  scheme; the speculative raw-bytes fallback has been removed.
- **Phase 3 (product UI) — built, not yet device-verified.** All 5 screens
  (Home, Savings, Pay & Stash, Catch-up, Activity) are live, wired to real
  wallet/chain/API calls, typecheck clean, and render correctly in a real
  browser with zero console errors (verified). The Pay & Stash send flow,
  Savings goal creation, and Catch-up sweep all need a real Nimiq Pay
  session to actually exercise — that's the same category of limitation as
  Phase 0's wallet calls, not done yet. See "Phase 3 — product UI" below.
- Phase 4 onward (hardening) — not started.

## What's here

```text
apps/web        React + TS + Vite Mini App page (wallet connect, chain reader, activity, test send)
apps/api        Fastify + TS backend (goal persistence only — see architecture note below)
packages/domain Pure savings-rule engine, tx classification, obligation ledger (Phase 1)
migrations      SQL schema (Phase 2), applied via `npm run migrate --workspace apps/api`
```

## Known limitation: Stash cannot detect spending made outside the app

Stash cannot automatically detect a payment a user makes outside Stash's own
Pay & Stash flow. Earlier drafts of this project described that as
Catch-up's fallback source ("spending detected after the fact from chain
history") — that's not implementable on this platform, confirmed with real
testnet data, not a gap left for later.

**Why**: Nimiq Pay sends every payment through an HTLC (hashed time-locked
contract) it creates itself, not directly from the connected wallet. A
wallet's own transaction history — from the public RPC's
`getTransactionsByAddress` (`apps/api/src/nimiqRpc.ts`), which is what
Activity, payment verification, and the reconciler actually read from —
only includes transactions where that wallet is literally the `from` or
`to` address. It does not include transactions where the wallet only
appears in `relatedAddresses`, which is exactly what happens for every real
Nimiq-Pay-routed payment. Querying a wallet's own address therefore cannot
surface a payment made through Nimiq Pay, no matter how the query is
structured.

**Evidence** (real TestAlbatross data):

- `getTransactionsByAddress` for wallet `NQ36 9F2P L44G 8TS0 XTP1 6KH0 N0GA
  6PXA CV8M` returned only 5 transactions, the newest at block 10409626.
- Two real payments made through Nimiq Pay from that same wallet are absent
  from that result, despite both containing NQ36 in `relatedAddresses`:
  `672b586759ff0a039052fec3e114367d263de758fde1c30f6f0ccca08b4db056` (block
  10441970) and
  `52730624d6f0de35355d5af8018842b80674a39668f813d26f420c8268bc7304` (block
  10444533).
- `ef690b474fdb21870e39ecf582d7e8e418fb88ec07759b3bdd8a8c58db7f0419` is the
  real TestAlbatross faucet (NQ37 → NQ36, 110,000 NIM, a real fee) sending
  directly to a basic account — confirming the faucet itself never touches
  HTLCs; Nimiq Pay's own send mechanism does, for its own payments only.

**What Stash actually tracks**: the Pay & Stash flow (payment and savings,
both explicit user-approved transactions made through Stash) and a skipped
Pay & Stash savings leg, which lands in Catch-up (`source:
'skipped_savings'`). What it cannot track: spending made through Nimiq
Pay's normal payment flow without going through Stash's own Pay & Stash
screen. Activity correctly shows nothing for a wallet whose spending all
went through Nimiq Pay — that's not a bug, it's this limitation surfacing
honestly rather than silently.

**Planned fix, out of scope for this submission — a two-hop scan.** A
wallet's contract-creation transactions (`flags: 1`, `toType: 2` — the
wallet funding an HTLC) *are* visible in its own history, since the wallet
genuinely is `from` on those. The real payment lives in that HTLC address's
own transaction history instead, which a second, direct scan of the HTLC
address correctly indexes. Verified viable: querying
`getTransactionsByAddress` directly for HTLC address `NQ59 RCVY 8X71 0XY8
YAYB 7RAS B9J3 KBHG CE5Y` returned all three of its real transactions. Not
implemented here — the classification logic and the server-side endpoint
that would consume the second hop's results (`POST
/api/goals/:goalId/obligations`, `apps/api/src/obligations.ts`) already
exist and are correct; only the first-hop-to-second-hop wiring is missing.

## Architecture: no RPC endpoint, by necessity

The original plan (`BUILD_UPDATED.md` §3) was Mini App SDK for wallet ops +
a small backend proxying a public Nimiq JSON-RPC endpoint for transaction
history. Phase 0 investigation found **no live public TestAlbatross RPC
endpoint anywhere** — `rpc.nimiqwatch.com` is confirmed mainnet (its own
responses say `"network":"MainAlbatross"`), the RPC client library that
documents `rpc.nimiq-testnet.com` as testnet-default points at a dead
domain (`NXDOMAIN` on two independent resolvers), and `nimiq.dev`'s own RPC
docs page won't load. This isn't a gap that more searching fixes — it
matches `BUILD_UPDATED.md` §24 open question #3 exactly.

**Current architecture** instead runs Nimiq's official light client
(`@nimiq/core`, Rust-to-WASM, P2P) directly in the browser:

```text
Stash Mini App
  ├─ @nimiq/mini-app-sdk   (apps/web/src/lib/nimiq/provider.ts)
  │    ├─ init()
  │    ├─ listAccounts()
  │    └─ sendBasicTransaction()
  │
  └─ @nimiq/core            (apps/web/src/lib/nimiq/chainClient.ts)
       ├─ ClientConfiguration().network('TestAlbatross')
       ├─ waitForConsensusEstablished() / addConsensusChangedListener
       └─ getTransactionsByAddress() — real chain reads, no RPC endpoint at all
```

This needs no RPC endpoint because the light client *is* a real (if minimal)
TestAlbatross network participant — it connects directly to a real testnet
seed node over WebSocket P2P. `apps/api` no longer proxies chain reads; it's
goal persistence only (Phase 2). If a self-hosted `core-rs-albatross` node
with its own RPC ever becomes available, that's the documented fallback
(`BUILD_UPDATED.md` §24) — not a random public endpoint.

## Verified vs. unverified

**Verified from actual shipped type declarations**, not docs paraphrase —
`@nimiq/mini-app-sdk@0.1.0`'s `dist/*.d.ts` and `@nimiq/core@2.21.0`'s
`types/wasm/bundler.d.ts`, both inspected directly from the installed npm
packages:

- Mini App SDK: `init()`, `listAccounts()`, `isConsensusEstablished()`,
  `getBlockNumber()`, `sendBasicTransaction({recipient, value, fee?,
  validityStartHeight?})` — `value` is integer Luna. No transaction-history
  method on the provider (confirms a separate reader is required).
- `@nimiq/core`: `ClientConfiguration.network(string)` — case-insensitive,
  canonical values `'MainAlbatross' | 'TestAlbatross' | 'DevAlbatross'`, no
  default seed nodes for testnet (must set `seedNodes()` explicitly).
  `Client.getTransactionsByAddress(address, since?, known?, startAt?,
  limit?, minPeers?)` → `PlainTransactionDetails[]`, each with
  `transactionHash`, `sender`, `recipient`, `value`, `state`
  (`'new'|'pending'|'included'|'confirmed'|'invalidated'|'expired'`),
  `network`, `blockHeight?`, `timestamp?`. `ConsensusState` is exactly
  `'connecting' | 'syncing' | 'established'`.

**Unverified from the type declarations alone, but empirically confirmed
live** (see next section) — `PlainTransaction.value`'s unit isn't stated in
its own JSDoc (unlike `fee`, which says "in luna"); live-queried a real
TestAlbatross faucet transaction and got `value: 11000000000` for a transfer
matching 110,000 NIM, confirming Luna.

**Still unverified — do not build on these until confirmed:**

1. What `sendBasicTransaction`'s returned string actually is (tx hash vs.
   raw serialized bytes) — still not directly confirmed. A real device test
   (below) confirmed the *transaction itself* round-trips correctly through
   the activity reader, but the specific string shown in the app's "Provider
   returned" box wasn't captured for comparison against the known real tx
   hash. Cheap to close out later: send another test transaction and paste
   that value.

Loading this dev server as a Mini App inside Nimiq Pay, and switching Nimiq
Pay to TestAlbatross/testnet mode, is confirmed to work in practice (done on
a real device, see below) — `nimiq.dev`'s own guide page for this still
would not load during investigation, so the exact in-app menu path isn't
documented here, only that the end result works.

## Live verification results (real browser, real TestAlbatross network)

Ran the actual dev build in Chrome (not a mock, not a unit test) and drove
it with devtools to check what the type declarations alone couldn't prove:

- **WASM + worker + P2P pipeline works.** `@nimiq/core`'s ~8.9MB of WASM
  loads, the Vite plugin's worker config is correct, zero console errors.
- **Real consensus established** against the real TestAlbatross seed node
  (`seed1.pos.nimiq-testnet.com`) — watched head height climb live from
  ~4.3M to a stable ~10.23M and consensus flip from `syncing` to
  `established`, matching real chain sync behavior, not a canned response.
- **`getNetworkId()` returns `5`** for TestAlbatross (previously unknown;
  now a confirmed fact, not a guess).
- **Found the real faucet address live** (`NQ37 7C3V VMN8 FRPN FXS9 PLAG
  JMRE 8SC6 KUSQ`) by requesting test NIM via
  `https://faucet.pos.nimiq-testnet.com/tapit` and reading the sender off
  the resulting real transaction — not sourced from any doc.
- **`getConfirmedOutgoingTransactions` (the actual shipped function, called
  in-page via dynamic import, not a reimplementation) returns real,
  correctly-shaped data** for that faucet address: real tx hashes, `state:
  'confirmed'`, `network: 'testalbatross'` (lowercase — confirms the
  `.toLowerCase()` defensive check in the code is actually necessary, not
  paranoia), real recent timestamps, and `value` confirmed to be Luna (see
  above).
- `syncMode('light')` (chosen over the default `'pico'` because
  `getTransactionsByAddress`'s docstring implies verification needs more
  chain state) was **not compared against `'pico'`** — it simply is what
  was tested and confirmed working. If a future reason to try `'pico'`
  comes up, that's still open.

### Real device pass (Nimiq Pay, TestAlbatross, 2026-08-31)

Loaded the dev server (`npm run dev -- --host`) as a local Mini App inside
Nimiq Pay on a phone, switched to testnet mode, and ran the full loop for
real:

1. `listAccounts()` → real address `NQ32 08M2 EPN3 D988 GUDA 76QK 7TCY Y3A3
   TFUJ` (Mini App SDK's provider, confirmed working inside actual Nimiq Pay,
   not just typed against).
2. Funded it via the real faucet (`faucet.pos.nimiq-testnet.com/tapit`) —
   incoming 110,000 NIM from `NQ37 7C3V VMN8 FRPN FXS9 PLAG JMRE 8SC6 KUSQ`,
   confirmed at block 10229021.
3. `sendBasicTransaction()` sent 110,000 NIM to `NQ15 GVE3 B1ED NFYT DHBD
   HF6M BRX7 E3RU NSXU` — real native Nimiq Pay confirmation screen, real
   approval.
4. That exact transaction (`0727f5d3ba2f7a61a3be6ce8265abf9bb6ec3a97f4f77afb04c4725df92027e5`,
   block 10229024, `state: confirmed`) showed up through the app's own
   `getConfirmedOutgoingTransactions` — independently cross-checked by
   querying the same address directly in devtools, not just trusted from
   the phone screen.
5. **Found and fixed a real bug in the process**: the first "Load activity"
   attempt right after sending threw a bare network error
   ("couldn't send request"). Root cause: Nimiq Pay's native confirmation
   screen backgrounds the Mini App's webview, which appears to drop the
   light client's P2P connections. Fixed in `chainClient.ts` —
   `getConfirmedOutgoingTransactions` now checks `isConsensusEstablished()`
   and calls `waitForConsensusEstablished()` before querying (and once more
   on retry) instead of surfacing the raw error on the first hiccup.

This closes Phase 0's full exit criteria on a real device, not a simulation.

## Running it

```bash
npm install   # installs all workspaces (apps/*, packages/*)

cp apps/api/.env.example apps/api/.env
# fill in DATABASE_URL: a Supabase project's connection string
# (Project Settings > Database > Connection string > URI)

npm run migrate --workspace apps/api   # creates the schema in migrations/

npm run dev --workspace apps/api   # http://localhost:8787
npm run dev --workspace apps/web   # http://localhost:5173
```

Opening `apps/web` in a normal browser (not Nimiq Pay) is enough to watch
the chain reader connect to real TestAlbatross and establish consensus —
that part needs no host app. The wallet-connect step will correctly fail
with "open this inside Nimiq Pay" until you actually do that — `window.nimiq`
is only injected by the host app. Follow the current Nimiq **Load a Local
Mini App** procedure to open the dev URL inside Nimiq Pay in dev/testnet
mode and connect a real TestAlbatross account. Do not build a mock wallet
adapter to fake this locally — `BUILD_UPDATED.md` §7 explicitly rules that
out for release-path validation.

## Exit criteria (from `BUILD_UPDATED.md` §21, Phase 0, updated for the architecture pivot above) — ALL DONE

```text
Nimiq Pay testnet mode → init() → listAccounts() → real TestAlbatross address   [DONE]
  → @nimiq/core connects to TestAlbatross → consensus established              [DONE]
  → real confirmed outgoing transactions displayed                             [DONE]
  → sendBasicTransaction() sends real test NIM                                 [DONE]
  → returned transaction becomes visible in TestAlbatross history              [DONE]
```

Every step verified on a real device with real testnet NIM — see "Real
device pass" above for the actual addresses, tx hash, and block numbers. No
mocked wallet, no mocked chain data, no hardcoded transaction hash.

## Phase 1 — domain engine (`packages/domain`)

Percentage, fixed, and round-up savings rules; eligible-spend classification
with the required exclusions (self-transfer, stash-sweep, failed/zero-value
tx, duplicates); and obligation/ledger math. Everything is integer `bigint`
Luna — no floats anywhere in the money path. 30 unit tests
(`npm test --workspace packages/domain`) cover every case BUILD_UPDATED.md
§20 calls out: each rule's worked example, integer-truncation rounding,
zero and near-total-supply values, and all three exclusion types, including
same-batch and cross-run duplicate-tx dedup.

Wired into both `apps/api` (goal validation, obligation classification —
see Phase 2/3 below) and `apps/web` (Pay & Stash's live obligation preview
and Luna formatting — see Phase 3 below).

## Phase 2 — persistence + auth (`migrations/`, `apps/api/src/{db,migrate,goals,auth}.ts`)

Schema from `BUILD_UPDATED.md` §15 (`profiles`, `goals`, `observed_transactions`,
`obligations`, `sweeps`, `sweep_obligations`), all Luna amounts as `bigint`
columns, applied against a real Postgres instance via `npm run migrate`
(tracked in a `schema_migrations` table, so it's safe to re-run). `POST/GET/PATCH/DELETE
/api/goals` are wired up, use `@stash/domain`'s `nimStringToLuna` for
target/rule-value parsing, and enforce the one-active-goal-per-wallet and
idempotent-sweep constraints as real unique indexes/constraints — not
application-level checks.

**This Supabase project is shared with a pre-existing, unrelated app** (it
already had `public.profiles`, `creators`, `promises`, `videos`,
`youtube_connections`, `orders`, etc. — nothing to do with Stash). To avoid
any collision with that app's tables, every Stash table lives in its own
`stash` Postgres schema (created by the migration), not `public`. The DB
pool sets `search_path=stash,public` (`apps/api/src/db.ts`) so unqualified
table names in application code still resolve correctly. If Stash ever gets
its own dedicated Supabase project, this namespacing is harmless to keep —
but it's load-bearing as long as the project is shared.

**Supabase's direct-connection host (`db.<ref>.supabase.co`) is IPv6-only.**
On an IPv4-only network, `DATABASE_URL` needs Supabase's Session/Transaction
Pooler host instead (`aws-0-<region>.pooler.supabase.com`, username
`postgres.<project-ref>` rather than plain `postgres`) — see
`apps/api/.env.example`.

### Signed-challenge wallet auth (`apps/api/src/auth.ts`)

Implements `BUILD_UPDATED.md` §8/§19: every mutating route (`POST`/`PATCH`/
`DELETE` on goals, obligations, sweeps) now requires a valid session bearer
token instead of trusting a self-reported `ownerAddress` body field.

Flow: `POST /api/auth/challenge {walletAddress}` → server generates a
single-use nonce (5 min TTL, stored in `auth_nonces`) and returns a
deterministic, domain-specific message (`"Stash Authentication\nWallet:
...\nNonce: ...\nIssued At: ...\nPurpose: Authenticate to Stash"`) → the
client signs that exact string with `@nimiq/mini-app-sdk`'s
`provider.sign()` → `POST /api/auth/verify {walletAddress, nonce, publicKey,
signature}` → the server reconstructs the message itself (never trusts a
client-supplied message string), derives the Nimiq address from `publicKey`
via `@nimiq/core`'s `PublicKey.toAddress()` and requires it to exactly match
`walletAddress`, verifies the Ed25519 signature via `PublicKey.verify()`,
marks the nonce used atomically with verification (row-locked, so a
concurrent replay can't slip through), and issues a 12h bearer token —
stored server-side only as `SHA256(token)` (`sessions` table), never the raw
value. `requireAuth` (a Fastify `preHandler`) resolves the token on every
mutating request into `request.walletAddress`.

**Signing scheme — confirmed on-device, 2026-09-01.** Nimiq's documented
message-signing convention (Nimiq Hub API's `signMessage`) prefixes the
message with `'\x16Nimiq Signed Message:\n' + message.length` before
SHA256-hashing and signing — this stops a signed message from being
replayable as a valid transaction. It wasn't confirmed by documentation
alone whether the Mini App SDK's `provider.sign()` (a different host app,
Nimiq Pay, not Nimiq Hub) applies the same prefix, so `verifySignedChallenge`
temporarily tried both that scheme and raw-UTF8-bytes signing, logging which
one matched. A real device connected over `vite --host`'s LAN URL, approved
the sign prompt in Nimiq Pay, and the server logged
`[auth] signature verified via scheme: nimiq-prefixed-sha256` — confirming
Nimiq Pay uses the same convention as Nimiq Hub. The raw-bytes fallback has
been deleted from `auth.ts`; only the confirmed scheme remains.

Also verified end-to-end (self-generated keypair, real HTTP round trips
against the real DB, before the device test): unauthenticated writes get
401; a reused nonce is rejected; an expired nonce is rejected; a corrupted
signature is rejected; a signature from a different wallet's key is rejected
(address-derivation mismatch, checked before signature verification even
runs); an invalid bearer token is rejected; a valid session successfully
authenticates a mutating request.

Phase 3 added obligation/sweep routes on top of this schema — see below.

## Phase 3 — product UI (`apps/web/src/{routes,components,state,lib}`)

### Product pivot: Pay & Stash is primary, not the passive sweep

Original scope (`BUILD_UPDATED.md`'s first draft) was passive-only: Stash
watches spending after the fact, accumulates one "Ready to Stash" total,
one sweep button. `design.md` — the Hallmark UI prototype's design system —
specifies a different primary loop: **Pay & Stash**, where the user pays a
merchant *through* Stash and is prompted to save in the same flow, with the
passive loop demoted to **Catch-up**, the fallback for spending Stash
didn't actively prompt (a skipped Pay & Stash save, or spending detected
after the fact). `BUILD_UPDATED.md` §1 now carries a reconciliation note
making this explicit; treat `design.md` as authoritative for product UX,
not just visuals. The existing domain/backend work was **extended, not
discarded** — see below.

### Domain: `ObligationSource`

`packages/domain/src/ledger.ts` now tags every obligation with where it
came from: `'pay_and_stash'` (saved immediately, same flow as the payment),
`'skipped_savings'` (Pay & Stash payment went through, the save was
skipped/rejected), or `'external_spend'` (the original passive detection —
never actively prompted). `buildObligations` takes this as a required
`source` param rather than assuming one; **classification always runs
regardless of source** — a caller can't manufacture an obligation just by
claiming `'pay_and_stash'` for an ineligible transaction (covered by a
domain test using a payment misdirected at the stash destination itself).
32 unit tests total.

### Backend: obligations and sweeps (`apps/api/src/{obligations,sweeps,goalAccess}.ts`)

New routes, all live-tested against the real Supabase instance (created a
goal, posted obligations both ways, deduped a re-post, swept, hit the
re-sweep-conflict guard, skipped a Pay & Stash obligation, and confirmed a
misdirected `pay_and_stash` claim gets classified away rather than trusted):

```text
POST   /api/goals/:goalId/obligations         — classify + record; source is caller-claimed, classification is not
GET    /api/goals/:goalId/obligations         — list (optional ?status=pending|swept), joined with recipient
GET    /api/goals/:goalId/ready-to-stash       — sum of pending obligations
PATCH  /api/goals/:goalId/obligations/:id/skip — pay_and_stash + pending only → skipped_savings
POST   /api/goals/:goalId/sweeps               — records a sweep, marks its obligations swept
GET    /api/goals/:goalId/sweeps/:sweepId
```

**Known limitation, same root cause as Phase 0's RPC gap**: obligations are
marked `swept` as soon as a sweep is recorded, not after independent
on-chain re-verification — `BUILD_UPDATED.md` §12 wants the latter, but
that needs the backend to have its own chain reader, which this
architecture doesn't have (`@nimiq/core`'s light client runs in the
browser, not the backend). The frontend only calls this after Nimiq Pay's
own native confirmation succeeds and after independently finding the real
transaction on-chain itself (see below) — real evidence, just not
re-verified server-side. Revisit if the backend ever gets chain access.

Migration `0002_obligation_source.sql` adds the `source` column (backfilled
`'external_spend'` for any pre-existing rows, no default going forward —
every insert site must say explicitly where an obligation came from).

### Frontend: routes, state, and the trust boundary for tx hashes

`AppStateProvider` (`apps/web/src/state/AppState.tsx`) centralizes wallet
connection, the chain reader, and the active goal (Cycle II MVP: one active
goal per wallet) so every screen shares one source of truth instead of
re-deriving it. Five routes under a shared `Shell` (top bar with the
Stash mark + centered Activity button + wallet chip disclosure; bottom nav
Home/Savings/Pay/Catch-up, matching `design.md` §7 exactly):

- **Home** — active rule, goal progress (derived from real swept
  obligations, not a stored "balance" — `BUILD_UPDATED.md` §13), the Pay &
  Stash CTA, a Catch-up banner when anything's pending.
- **Savings** — doubles as both "Create Stash" (no goal yet) and "Goal
  Settings" (goal exists) — `design.md`'s bottom nav has no separate
  Settings tab, so this is where goal editing lives.
- **Pay** — the Pay & Stash flow as one component with an internal state
  machine (form → review → paying → confirming → savings-approval →
  stashing → success/partial), not separate routes per step, since these
  are flow states within one wizard, not independently navigable pages.
- **Catch-up** — pending obligations with checkboxes (unchecking one only
  excludes it from *this* sweep, per `design.md` — it's a local UI action,
  not a delete), one sweep-all action.
- **Activity** — real confirmed outgoing transactions from the live chain
  reader, cross-referenced against obligations for the "+X NIM to Stash"
  line. No invented merchant names, ever — shortened recipient addresses only.

**Never trust `sendBasicTransaction()`'s return value as a tx hash** — its
exact meaning is still unconfirmed (see "Verified vs. unverified" above).
Instead, `findOutgoingTransaction` (`chainClient.ts`) independently looks
up the just-sent transaction on-chain by matching sender/recipient/value,
and only that real, chain-confirmed hash gets recorded via the obligations/
sweeps API. Both the payment leg and the savings leg of Pay & Stash do
this, as does the Catch-up sweep.

### What's verified vs. not

Typechecks clean across all three workspaces, production build succeeds,
and the app was driven in a real Chrome browser through every route in its
pre-wallet-connect state with zero console errors. **Not yet exercised**:
actually creating a goal, running the Pay & Stash send flow, or approving a
Catch-up sweep — all three need a real Nimiq Pay session, the same
category of gap as Phase 0 before its device pass. Do that next the same
way: `npm run dev -- --host` on this machine, load the LAN URL inside
Nimiq Pay in testnet mode.

See `BUILD_UPDATED.md` and `design.md` in the repo root for the full product
spec and visual design system.
