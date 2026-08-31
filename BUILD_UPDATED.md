# Stash — BUILD.md

## 1. Product Definition

**Stash** is a Nimiq Pay Mini App that helps users build savings habits from their existing NIM spending.

The core loop is:

1. User opens Stash inside Nimiq Pay.
2. Stash requests access to the user’s Nimiq account.
3. User creates a savings goal and chooses a savings rule.
4. Stash reads confirmed outgoing NIM transaction history for the selected spending address.
5. Stash calculates how much should be saved from eligible spending.
6. New obligations accumulate into a single **Ready to Stash** amount.
7. User taps **Stash now**.
8. Nimiq Pay shows the native confirmation screen.
9. NIM moves from the user’s spending address to a user-controlled savings address.
10. Stash records the sweep and updates goal progress.

### Product promise

> **Save a little whenever you spend.**

### Competition scope

This build must be:
- a real Nimiq Pay Mini App, not a standalone mockup;
- fully usable on first try;
- open-source under MIT;
- published in a public GitHub repository;
- built around real NIM wallet/transaction functionality;
- production-oriented, with no fake balances or hardcoded demo transactions.

---


## 2. Development Network: TestAlbatross First

Stash must be developed and validated on the **Nimiq TestAlbatross testnet** before any mainnet release.

The Hallmark prototype is UI-only. The real Mini App implementation must use:

- Nimiq Pay running in developer/testnet mode;
- TestAlbatross accounts;
- free test NIM;
- real `@nimiq/mini-app-sdk` wallet calls;
- real testnet transaction hashes;
- real testnet transaction-history verification.

### Required development progression

```text
Hallmark UI prototype
        ↓
Local Mini App inside Nimiq Pay
        ↓
Switch Nimiq Pay to TestAlbatross
        ↓
Claim free test NIM
        ↓
Real wallet connection
        ↓
Real Pay & Stash transactions
        ↓
Real outside-spend detection
        ↓
Real Catch-up sweep
        ↓
Production/mainnet only after validation
```

### Core test scenario

Use separate testnet-controlled addresses for:

```text
Spending wallet
Merchant / recipient
Savings wallet
```

Example:

```text
Spending wallet: 1000 test NIM

Pay merchant: 100 NIM
Savings rule: 5%
Savings transfer: 5 NIM
```

The implementation must verify two real testnet transactions:

```text
100 NIM → merchant
5 NIM   → savings wallet
```

For Catch-up:

```text
User sends 200 NIM outside Stash
        ↓
Stash detects outgoing testnet tx
        ↓
5% rule
        ↓
10 NIM becomes Ready to Catch Up
        ↓
User approves Catch-up
        ↓
10 NIM → savings wallet
```

No mainnet funds should be used during development.

---

## 3. Important Technical Finding

The Nimiq Pay Mini App SDK and the Nimiq blockchain-history client serve **different responsibilities**.

### Nimiq Pay Mini App SDK

Use `@nimiq/mini-app-sdk` for wallet operations inside Nimiq Pay:

- initialize the provider with `init()`;
- request the user’s Nimiq accounts with `listAccounts()`;
- check network readiness with `isConsensusEstablished()`;
- get the current block height with `getBlockNumber()`;
- initiate NIM transfers with `sendBasicTransaction()`;
- optionally initiate transactions with text data using `sendBasicTransactionWithData()`.

Sensitive wallet actions require user confirmation in Nimiq Pay.

### Transaction history

The documented Mini App provider does **not** currently expose `getTransactionsByAddress()`.

For Stash transaction history, use one of these separately:

**Preferred MVP:** Nimiq RPC from the Stash backend.

RPC method:

`getTransactionsByAddress`

This returns transactions where an address is sender or recipient.

**Alternative:** `@nimiq/core` Web Client.

The Web Client supports `getTransactionsByAddress()` and verifies returned transactions, but adds browser-side WASM/network complexity.

### Architecture decision

For the competition build:

> **Use the Mini App SDK for wallet authorization and sending NIM; use a small backend + Nimiq RPC for transaction-history indexing.**

This gives the simplest, most reliable mobile Mini App architecture.

---

## 4. High-Level Architecture

```text
┌─────────────────────────────────────┐
│            Nimiq Pay App            │
│                                     │
│  ┌───────────────────────────────┐  │
│  │       Stash Mini App          │  │
│  │     React + TypeScript        │  │
│  │                               │  │
│  │ Goal UI                       │  │
│  │ Savings-rule engine           │  │
│  │ Ready-to-Stash calculation    │  │
│  │ Transaction history UI        │  │
│  └──────────────┬────────────────┘  │
│                 │                   │
│      @nimiq/mini-app-sdk            │
│                 │                   │
│     listAccounts / send NIM         │
└─────────────────┼───────────────────┘
                  │
                  │ HTTPS
                  ▼
┌─────────────────────────────────────┐
│             Stash API               │
│        Node.js + TypeScript         │
│                                     │
│ goal persistence                    │
│ transaction sync                    │
│ spend classification                │
│ processed-tx deduplication          │
│ sweep records                       │
└─────────────────┬───────────────────┘
                  │
                  │ JSON-RPC
                  ▼
┌─────────────────────────────────────┐
│              Nimiq RPC              │
│                                     │
│ getTransactionsByAddress            │
│ getTransactionByHash                │
│ chain state                         │
└─────────────────────────────────────┘
```

The backend **never** stores private keys and can never move user funds.

---

## 5. Recommended Stack

### Frontend

- React
- TypeScript
- Vite
- React Router if multiple screens are needed
- `@nimiq/mini-app-sdk`
- Zod for runtime validation
- lightweight state management only if necessary

### Backend

- Node.js 22+
- TypeScript
- Fastify
- Zod
- PostgreSQL / Supabase Postgres

### Blockchain

- Nimiq Pay Mini App provider for wallet operations
- Nimiq JSON-RPC for transaction history
- NIM as the competition token

### Deployment

- Frontend: Vercel, Cloudflare Pages, or equivalent HTTPS hosting
- API: Railway, Render, Fly.io, or equivalent
- Database: Supabase/Postgres

Do not depend on browser `localStorage` as the authoritative record of processed transactions or goals.

---

## 6. Make the Web App a Nimiq Mini App

A Nimiq Mini App is still a normal web application. What makes it a Mini App is that it is loaded inside Nimiq Pay and initializes the provider injected by the host.

### Step 1 — Create the app

```bash
npm create vite@latest stash -- --template react-ts
cd stash
npm install
```

### Step 2 — Install the official SDK

```bash
npm install @nimiq/mini-app-sdk
```

As of August 2026, npm lists `@nimiq/mini-app-sdk` version `0.1.0`. Do not hardcode this version in future setup instructions without checking npm again.

### Step 3 — Install Nimiq’s official AI skill

Because the project will be built with an AI coding agent, install the official Nimiq Mini Apps skill in the project:

```bash
npx skills add nimiq/developer-center --skill mini-apps
```

The skill provides current Mini App API signatures, chain information, framework rules, and pre-ship guidance.

### Step 4 — Create the provider adapter

Create:

```text
src/lib/nimiq/provider.ts
```

Conceptually:

```ts
import { init } from '@nimiq/mini-app-sdk'

let providerPromise: ReturnType<typeof init> | undefined

export function getNimiqProvider() {
  if (!providerPromise) {
    providerPromise = init()
  }

  return providerPromise
}
```

Do not directly assume `window.nimiq` exists at page load. Use the SDK `init()` helper so the application waits for Nimiq Pay to inject the provider.

### Step 5 — Request an account

Only request wallet permission at the point where it is meaningful.

Example workflow:

```ts
const nimiq = await getNimiqProvider()
const accounts = await nimiq.listAccounts()
```

`listAccounts()` requires user confirmation.

The user selects one address as the **spending account**.

### Step 6 — Check network readiness

Before chain-dependent actions:

```ts
const ready = await nimiq.isConsensusEstablished()

if (!ready) {
  // show "Connecting to Nimiq..."
}
```

Do not initiate a stash transfer while the provider is not ready.

### Step 7 — Send the stash transaction

Nimiq uses **Luna** as the smallest unit:

```text
1 NIM = 100,000 Luna
```

Therefore:

```ts
const amountLuna = Math.round(amountNim * 100_000)

const txHash = await nimiq.sendBasicTransaction({
  recipient: stashAddress,
  value: amountLuna,
})
```

Nimiq Pay handles the confirmation UX.

Never calculate NIM amounts using floating-point arithmetic internally. Store all monetary values as integer Luna.

---

## 7. Local Mini App Development

A normal desktop browser does not provide the Nimiq Pay-injected Mini App provider.

Develop the visual application normally in Vite, but integration tests must run inside Nimiq Pay.

Start the local server:

```bash
npm run dev -- --host 0.0.0.0
```

Then follow the current Nimiq Developer Center **Load a Local Mini App** procedure to open the local URL inside Nimiq Pay.

Important:

- phone and development machine must be reachable over the same network when using a LAN URL;
- do not create a fake production wallet adapter just to make wallet calls appear to work;
- a development-only mock adapter may be used for isolated UI/unit tests, but all release-path validation must run against the real Nimiq Pay provider.

Official guide:

`https://nimiq.dev/mini-apps/load-local-mini-app`

---

## 8. Core Domain Model

### User

```ts
type UserProfile = {
  id: string
  spendingAddress: string
  createdAt: string
}
```

Do not identify users solely by a mutable browser session.

For MVP, the Nimiq address is the domain identity.

If authenticated backend writes are required, add signed-message login:

1. API issues nonce.
2. Mini App calls `nimiq.sign()`.
3. API verifies the signature.
4. API creates short-lived authenticated session.

Do not treat a user-provided address string as proof of wallet ownership.

---

### Savings Goal

```ts
type SavingsGoal = {
  id: string
  ownerAddress: string
  name: string
  targetLuna: bigint
  destinationAddress: string
  ruleType: 'percentage' | 'round_up' | 'fixed'
  ruleValue: number
  status: 'active' | 'paused' | 'completed'
  createdAt: string
}
```

For Cycle II MVP allow **one active goal per spending wallet**.

This prevents unnecessary complexity.

---

### Observed Transaction

```ts
type ObservedTransaction = {
  txHash: string
  ownerAddress: string
  sender: string
  recipient: string
  valueLuna: bigint
  feeLuna: bigint
  blockHeight: number
  timestamp: string
  executionResult: boolean
  classification: 'eligible_spend' | 'self_transfer' | 'stash_sweep' | 'ignored'
}
```

`txHash` is the immutable deduplication key.

---

### Savings Obligation

A savings obligation is calculated from one eligible outgoing payment.

```ts
type SavingsObligation = {
  id: string
  txHash: string
  goalId: string
  spendLuna: bigint
  calculatedLuna: bigint
  status: 'pending' | 'swept'
}
```

Exactly one obligation may exist for a given:

```text
goalId + txHash
```

Enforce this with a database unique constraint.

---

### Sweep

```ts
type Sweep = {
  id: string
  goalId: string
  amountLuna: bigint
  transactionHash: string
  createdAt: string
  confirmedAt: string | null
  status: 'submitted' | 'confirmed' | 'failed'
}
```

A sweep groups multiple pending obligations into one user-approved transfer.

---

## 9. Spending Detection

### API endpoint

```text
GET /api/wallets/:address/activity
```

The backend queries Nimiq RPC:

```text
getTransactionsByAddress(address, max, startAt)
```

Only confirmed transactions should feed the savings engine.

### Eligible outgoing transaction

An observed transaction is initially eligible if:

```text
sender == selected spendingAddress
AND executionResult == true
AND value > 0
```

Then apply exclusions.

### Required exclusions

Do not count:

1. transfers to the configured Stash destination;
2. previously created Stash sweep transactions;
3. transfers between addresses known to belong to the same user, where detectable;
4. failed transactions;
5. duplicate transaction hashes;
6. zero-value transactions.

### Ambiguous transfers

The chain cannot inherently know whether every outgoing transaction was a purchase, gift, wallet transfer, or another economic action.

Therefore do not claim:

> “Stash knows every purchase.”

Product wording should be:

> **Eligible outgoing NIM spending**

The MVP may allow users to exclude a transaction from savings calculation.

---

## 10. Savings Rules

Implement only three rules for Cycle II.

### A. Percentage

Example:

```text
Spend: 100 NIM
Rule: 5%
Stash: 5 NIM
```

Integer calculation:

```ts
stashLuna = spendLuna * BigInt(basisPoints) / 10_000n
```

Store percentage as basis points.

Example:

```text
5% = 500 bps
```

---

### B. Fixed amount

Example:

```text
Every eligible outgoing payment
→ stash 2 NIM
```

Rule:

```ts
stashLuna = fixedAmountLuna
```

---

### C. Round-up

Round spending to a selected NIM interval.

MVP interval:

```text
10 NIM
```

Example:

```text
Spend 47 NIM
→ next 10 = 50
→ stash 3 NIM
```

Do calculations in Luna.

---

## 11. Ready-to-Stash Calculation

The dashboard value is:

```text
sum(all pending savings obligations)
```

Example:

```text
Tx A -> 2.0 NIM
Tx B -> 5.0 NIM
Tx C -> 1.5 NIM
------------------
Ready to Stash = 8.5 NIM
```

Do not create a separate wallet confirmation for every spending event.

The key UX advantage is:

> detect many spends → accumulate savings → one sweep.

---

## 12. The Stash Transaction

When the user presses:

```text
Stash 42.3 NIM
```

the frontend must:

1. fetch the latest pending amount from the API;
2. validate that it is greater than zero;
3. verify the configured destination address;
4. convert integer Luna amount safely;
5. call `sendBasicTransaction`;
6. receive transaction hash;
7. submit the tx hash to the API;
8. API independently verifies the transaction on-chain;
9. only after confirmation mark obligations as swept.

Pseudo-flow:

```ts
const amount = await api.getReadyToStash(goalId)

const nimiq = await getNimiqProvider()

const txHash = await nimiq.sendBasicTransaction({
  recipient: goal.destinationAddress,
  value: amount.luna,
})

await api.recordSweep({
  goalId,
  txHash,
})
```

The server must **not** trust the amount reported by the frontend.

It must verify:

- sender;
- recipient;
- amount;
- execution result;
- transaction hash;
- confirmation.

---

## 13. Stash Destination

### MVP rule

Stash does not custody funds.

The user provides or selects a separate **user-controlled Nimiq address** as the Stash destination.

The UI should clearly state:

> “Stash never holds your funds. Savings are sent to a Nimiq address you control.”

### Do not do

- do not generate/store private keys on the backend;
- do not maintain an omnibus custody wallet;
- do not send funds to the developer;
- do not call a database balance a “savings balance.”

The displayed Stash progress must derive from actual confirmed sweep transactions.

### Validation needed during implementation

Verify current Nimiq Pay behavior for multiple user accounts and whether `listAccounts()` provides enough UX for choosing a second address.

If not, support destination-address entry with checksum/address validation.

Do not invent a wallet-creation API unless the current Mini App SDK documents one.

---

## 14. Backend API

Suggested routes:

```text
GET    /health

POST   /api/auth/challenge
POST   /api/auth/verify

GET    /api/profile
PUT    /api/profile/spending-account

GET    /api/goals
POST   /api/goals
PATCH  /api/goals/:goalId
DELETE /api/goals/:goalId

POST   /api/wallets/:address/sync
GET    /api/wallets/:address/activity

GET    /api/goals/:goalId/obligations
GET    /api/goals/:goalId/ready-to-stash

POST   /api/goals/:goalId/sweeps
GET    /api/goals/:goalId/sweeps/:sweepId
```

Do not expose arbitrary RPC proxying to clients.

---

## 15. Database

Minimum tables:

### profiles

```text
id
wallet_address UNIQUE
created_at
updated_at
```

### goals

```text
id
owner_address
name
target_luna
destination_address
rule_type
rule_value
status
created_at
updated_at
```

### observed_transactions

```text
tx_hash PRIMARY KEY
owner_address
sender
recipient
value_luna
fee_luna
block_height
timestamp
execution_result
classification
created_at
```

### obligations

```text
id
goal_id
tx_hash
spend_luna
calculated_luna
status
created_at

UNIQUE(goal_id, tx_hash)
```

### sweeps

```text
id
goal_id
tx_hash UNIQUE
amount_luna
status
created_at
confirmed_at
```

### sweep_obligations

```text
sweep_id
obligation_id

PRIMARY KEY(sweep_id, obligation_id)
```

All NIM values use integer database types large enough for Luna amounts.

---

## 16. Frontend Screens

Keep the Mini App compact.

### 1. First-run / Connect

Content:

```text
Save whenever you spend.

Connect your Nimiq wallet
[Continue]
```

`Continue` triggers `listAccounts()`.

---

### 2. Create Stash

Fields:

```text
What are you saving for?
Target amount
Savings destination
Savings rule
```

Example:

```text
MacBook
15,000 NIM
NQ...
5% of eligible spending
```

CTA:

```text
Start Stashing
```

---

### 3. Dashboard

Primary hierarchy:

```text
MacBook Fund

3,420 / 15,000 NIM
[progress bar]

42.3 NIM
ready to stash

from 12 recent payments

[Stash 42.3 NIM]
```

Secondary content:

```text
This week
Spent 846 NIM
Saved 42.3 NIM
Rule 5%
```

---

### 4. Activity

Each eligible transaction shows:

```text
Coffee Shop
-40 NIM
+2 NIM to Stash
```

Where merchant identity is unknown, show shortened recipient address rather than inventing a merchant name.

Allow:

```text
Exclude from savings
```

for ambiguous wallet transfers.

---

### 5. Goal Settings

Allow:

- rename goal;
- change future savings rule;
- change target;
- pause calculations;
- update destination with explicit warning.

Changing the rule must not retroactively mutate already-created obligations unless the user explicitly requests recalculation.

---

## 17. No Fake Data Policy

Release build must not contain:

- fake wallet balances;
- fake transaction history;
- fake merchant names;
- hardcoded transaction hashes;
- simulated savings totals;
- demo-only blockchain success states.

Loading states are acceptable.

Empty states are required.

Example:

```text
No eligible spending yet.
Use NIM normally and come back after your next transaction.
```

---

## 18. Error Handling

Handle these explicitly:

### Provider not injected

```text
Open Stash inside Nimiq Pay to connect your wallet.
```

### User rejects account request

Return to disconnected state without crashing.

### User rejects transfer

Do not create a confirmed sweep.

### Consensus unavailable

Disable the transaction CTA and display connection state.

### RPC unavailable

Keep existing verified data visible and show:

```text
Unable to refresh transaction history.
Try again.
```

### Transaction submitted but confirmation pending

Show:

```text
Stash transfer pending
```

Do not mark savings as completed yet.

### Duplicate API request

Sweep creation and transaction ingestion must be idempotent.

---

## 19. Security Requirements

1. Never request, log, persist, or transmit private keys.
2. Never trust wallet addresses submitted by the browser as proof of ownership.
3. Use signed challenges for authenticated backend mutations.
4. Verify sweep transactions independently from Nimiq blockchain data.
5. Store all monetary values as integer Luna.
6. Validate all addresses and API payloads.
7. Rate-limit auth, sync, and sweep endpoints.
8. Do not expose internal RPC credentials.
9. Use HTTPS everywhere in production.
10. Do not mark an obligation swept based only on a frontend callback.
11. Prevent transaction-replay accounting with unique tx hashes.
12. Use secure session cookies if cookie authentication is used.
13. No secrets in the public GitHub repository.

---

## 20. Testing Plan

### Unit tests

Savings engine:

- percentage calculation;
- fixed calculation;
- round-up calculation;
- zero values;
- very large values;
- integer rounding;
- duplicate tx;
- self-transfer exclusion;
- stash sweep exclusion.

### API integration tests

- signed challenge cannot be reused;
- wallet ownership required for writes;
- history sync idempotency;
- duplicate transaction not re-counted;
- sweep cannot claim another wallet’s obligations;
- invalid sweep recipient rejected;
- incorrect sweep amount rejected.

### Frontend tests

- first-run flow;
- permission rejection;
- empty history;
- create goal;
- edit rule;
- activity exclusion;
- stash CTA;
- pending transfer;
- successful confirmation;
- RPC failure.

### Real-device tests inside Nimiq Pay

Required before shipping:

1. load Mini App in Nimiq Pay;
2. grant `listAccounts()` permission;
3. verify actual account;
4. generate or locate a real outgoing transaction;
5. sync it through RPC;
6. calculate obligation;
7. initiate real NIM stash transfer;
8. approve Nimiq Pay confirmation;
9. verify tx hash;
10. wait for chain confirmation;
11. verify goal progress;
12. restart Mini App;
13. confirm the original payment is not counted twice.

---

## 21. Implementation Phases

### Phase 0 — TestAlbatross Integration Spike

Goal: prove the critical path on **Nimiq TestAlbatross** before building product UI.

Build only:

```text
Nimiq Pay testnet mode
↓
init()
↓
listAccounts()
↓
selected TestAlbatross address
↓
claim/use free test NIM
↓
RPC getTransactionsByAddress()
↓
display real confirmed outgoing testnet transactions
↓
sendBasicTransaction()
↓
verify returned testnet tx hash
```

**Exit criteria:**

A real **testnet** NIM transfer can be made from Stash running inside Nimiq Pay, confirmed on TestAlbatross, and later found through the transaction-history source.

Do not continue until this works. Do not use mainnet funds for Phase 0.

---

### Phase 1 — Domain Engine

Implement:

- transaction normalization;
- eligible-spend classification;
- percentage rule;
- fixed rule;
- round-up rule;
- transaction deduplication;
- pending obligations;
- sweep grouping.

**Exit criteria:**

Unit tests prove deterministic calculations with Luna integer arithmetic.

---

### Phase 2 — Persistence + Authentication

Implement:

- Postgres schema;
- signed nonce authentication;
- goal persistence;
- transaction persistence;
- obligations;
- sweeps;
- idempotency constraints.

**Exit criteria:**

Reloading or changing device does not corrupt accounting.

---

### Phase 3 — Core Mini App UI

Implement:

- onboarding;
- account connection;
- create goal;
- dashboard;
- activity;
- goal settings;
- empty/error/loading states.

Mobile-first only.

---

### Phase 4 — Real Sweep Flow

Implement:

```text
Ready to Stash
↓
user taps
↓
fresh server calculation
↓
Nimiq Pay confirmation
↓
tx submitted
↓
server verifies
↓
sweep confirmed
↓
obligations marked swept
```

**Exit criteria:**

No savings total changes before an independently verified transaction confirmation.

---

### Phase 5 — Production Hardening

Add:

- rate limits;
- structured logs;
- retry strategy for RPC;
- monitoring;
- CSP/security headers;
- validation;
- API health endpoint;
- graceful offline states;
- mobile performance pass.

---

### Phase 6 — Nimiq Pay Release Validation

Run the official Nimiq Mini App readiness flow.

Verify:

- provider initialization;
- wallet permissions;
- mobile layout;
- NIM unit correctness;
- confirmation UX;
- errors/rejections;
- production HTTPS origin;
- no secrets;
- no mocks;
- public GitHub repository;
- MIT license.

---

### Phase 7 — Early Access

Ship before Week 3.

Recruit real testers and track:

- users connected;
- goals created;
- eligible spending detected;
- Ready-to-Stash calculations;
- sweep attempts;
- successful sweeps;
- second-session return rate.

Do not measure success only by page views.

The strongest proof for judges is:

> real users actually moved NIM into their own savings addresses using Stash.

---

## 22. Critical Acceptance Test

The product is not finished until this exact story works:

```text
A user opens Stash inside Nimiq Pay
        ↓
connects a real Nimiq wallet
        ↓
creates “Laptop Fund”
        ↓
chooses “Save 5%”
        ↓
Stash detects a real confirmed outgoing NIM transaction
        ↓
calculates the correct savings obligation
        ↓
shows a real Ready-to-Stash amount
        ↓
user taps Stash
        ↓
Nimiq Pay requests native confirmation
        ↓
user approves
        ↓
NIM moves to the user-controlled savings address
        ↓
backend verifies the real transaction
        ↓
goal progress increases
        ↓
reloading the Mini App does not double-count anything
```

If any arrow above relies on fake state, the build is not submission-ready.

---

## 23. What We Are Explicitly NOT Building

Cycle II scope excludes:

- automatic background withdrawals;
- global interception of payments from other Mini Apps;
- custody;
- smart contracts;
- pooled savings;
- yield generation;
- staking users’ savings;
- USDT support;
- AI savings advice;
- social goals;
- shared accounts;
- bank integrations;
- merchant categorization based on guesses;
- push notification infrastructure;
- multiple simultaneous goals.

These can be explored only after the NIM savings loop is production-stable.

---

## 24. Open Questions to Verify, Not Assume

Before implementation decisions depend on them, verify from current Nimiq documentation or with the Nimiq technical-support channel:

1. Current exact local-Mini-App loading workflow on Android and iOS.
2. Whether Nimiq Pay exposes multiple Nimiq addresses cleanly through `listAccounts()`.
3. Best production RPC endpoint policy for competition Mini Apps.
4. Recommended transaction-confirmation depth/finality semantics for app accounting.
5. Current transaction object schema returned by the chosen RPC service.
6. Whether an official balance method has been added to the Mini App provider.
7. Whether any new Mini App transaction-history/event APIs appear during Cycle II.
8. Whether Mini App submission requires additional manifest or metadata beyond the public hosted URL/repository.

Never implement guessed integration APIs.

---

## 25. Repository Structure

```text
stash/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   │   ├── auth/
│   │   │   │   ├── goals/
│   │   │   │   ├── activity/
│   │   │   │   └── sweeps/
│   │   │   ├── lib/
│   │   │   │   ├── nimiq/
│   │   │   │   │   └── provider.ts
│   │   │   │   └── api/
│   │   │   └── pages/
│   │   └── package.json
│   │
│   └── api/
│       ├── src/
│       │   ├── auth/
│       │   ├── goals/
│       │   ├── nimiq/
│       │   │   ├── rpc.ts
│       │   │   ├── normalize.ts
│       │   │   └── verify.ts
│       │   ├── obligations/
│       │   ├── sweeps/
│       │   └── db/
│       └── package.json
│
├── packages/
│   ├── domain/
│   │   ├── savings-engine.ts
│   │   ├── classification.ts
│   │   └── money.ts
│   └── shared/
│
├── migrations/
├── .env.example
├── BUILD.md
├── README.md
├── LICENSE
└── package.json
```

A monorepo is optional. If it slows the build, use a single Vite frontend + Fastify backend repository.

---

## 26. Environment Variables

Example only:

```env
DATABASE_URL=
SESSION_SECRET=
NIMIQ_RPC_URL=
APP_ORIGIN=
API_ORIGIN=
NODE_ENV=
```

Never commit actual secrets.

Do not put private keys in environment variables because Stash does not require any private key.

---

## 27. Definition of Done

Stash is submission-ready only when:

- [ ] Hosted Mini App opens successfully inside Nimiq Pay.
- [ ] `@nimiq/mini-app-sdk` initializes through `init()`.
- [ ] Real user account permission works.
- [ ] Real confirmed NIM transaction history is loaded.
- [ ] Spending classification is deterministic.
- [ ] At least one savings rule produces correct Luna calculations.
- [ ] User-controlled destination is validated.
- [ ] Real NIM stash transfer can be initiated.
- [ ] Native Nimiq Pay confirmation appears.
- [ ] Submitted tx is independently verified.
- [ ] Goal progress derives from confirmed sweeps.
- [ ] Duplicate transaction processing is impossible.
- [ ] No private keys are stored.
- [ ] No mock data appears in production.
- [ ] Mobile UX works on Android/iOS-size screens.
- [ ] Permission rejection does not break the app.
- [ ] Network/RPC failures have usable states.
- [ ] Repo is public.
- [ ] MIT license included.
- [ ] README includes setup, architecture, screenshots, and known limitations.
- [ ] Production URL uses HTTPS.
- [ ] At least five real users have tested the core flow.
- [ ] Early-access feedback has been addressed.

---

## 28. Official References

Use these as the source of truth during implementation:

- Nimiq Mini Apps API Reference  
  https://nimiq.dev/mini-apps/api-reference/

- Nimiq Provider API  
  https://nimiq.dev/mini-apps/api-reference/nimiq-provider/

- Build with AI / official Mini Apps skill  
  https://nimiq.dev/mini-apps/build-with-ai

- Local Mini App testing  
  https://nimiq.dev/mini-apps/load-local-mini-app

- Nimiq RPC  
  https://nimiq.dev/rpc/

- `getTransactionsByAddress` RPC  
  https://nimiq.dev/rpc/methods/get-transactions-by-address

- Nimiq Web Client  
  https://nimiq.dev/web-client/

- Competition Rules  
  https://miniappscompetition.com/rules

- Competition Starter Kit  
  https://miniappscompetition.com/starterkit

---

## 29. First Build Command for Codex

After repository initialization and installation of the official Nimiq Mini Apps skill, give Codex this task first:

> Implement only Phase 0 of BUILD.md on Nimiq TestAlbatross. Do not build the product UI yet. Use the installed Nimiq Mini Apps skill and current official Nimiq documentation as source of truth. Create a minimal mobile page that initializes `@nimiq/mini-app-sdk`, requests `listAccounts()`, displays the selected real Nimiq address, reads that address’s real transaction history through a separately configured Nimiq RPC client, displays confirmed outgoing NIM transactions, and provides a controlled test action that calls `sendBasicTransaction()` to a user-entered Nimiq address. Use integer Luna throughout. Do not invent undocumented SDK methods, do not add mock production data, and stop with an explicit blocker if an integration detail cannot be verified.

That spike proves whether Stash can exist before we invest time in design.
