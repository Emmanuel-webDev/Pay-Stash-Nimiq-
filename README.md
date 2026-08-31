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
- **Phase 2 (persistence)** — schema + goal CRUD done, against a real
  Postgres/Supabase instance (no mocked DB). **Auth is explicitly not
  done** — see "Phase 2 — persistence" below for why.
- Phase 3 onward (product UI, real sweep flow, hardening) — not started.

## What's here

```text
apps/web        React + TS + Vite Mini App page (wallet connect, chain reader, activity, test send)
apps/api        Fastify + TS backend (goal persistence only — see architecture note below)
packages/domain Pure savings-rule engine, tx classification, obligation ledger (Phase 1)
migrations      SQL schema (Phase 2), applied via `npm run migrate --workspace apps/api`
```

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

Not yet wired into `apps/web`; wired into `apps/api`'s goal validation (see
below).

## Phase 2 — persistence (`migrations/`, `apps/api/src/{db,migrate,goals}.ts`)

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

**Auth is deliberately not implemented yet, and the goal routes are
correspondingly insecure right now** (a request just self-reports
`ownerAddress` — nothing verifies it owns that wallet, which
`BUILD_UPDATED.md` §19 explicitly forbids for production writes). §8's
signed-challenge flow (`nimiq.sign()` → server verifies) needs Nimiq's exact
signature scheme and address-derivation algorithm confirmed first, the same
way the SDK's real methods were confirmed in Phase 0 — I have not verified
that yet and didn't want to guess cryptographic verification code. Treat
`/api/goals` as a schema/persistence proof, not a secured API, until that
lands.

See `BUILD_UPDATED.md` and `design.md` in the repo root for the full product
spec and visual design system — neither fully applies yet; the design system
in particular is Phase 3 (product UI), not this spike.
