# Stash

**Save when you spend. Catch up when you miss.**

Stash is a Nimiq Pay Mini App that turns spending into saving. You pay someone through Stash, and Stash prompts you to move a slice of that payment into a savings goal you control — in the same flow, as a second transaction you approve yourself.

Every NIM movement is a real, user-approved transaction on TestAlbatross. Stash never holds your funds, never stores a private key, and never marks progress from anything the browser claims. Goal progress derives exclusively from transactions the backend has independently verified on-chain.

---

## The loop

```
Pay & Stash                    →  pay a merchant through Stash
  ↓                                (Nimiq Pay approval #1)
Savings prompt                 →  save 5% of that payment
  ↓                                (Nimiq Pay approval #2)
Goal progress updates          →  only after on-chain verification

Skipped the savings leg?       →  it lands in Catch-up
  ↓
Catch-up sweep                 →  clear several at once, one transaction
```

The two legs are never presented as atomic. They are two separate transactions with two separate approvals, and the UI says so. If you approve the payment and skip the save, the payment stands and the missed amount becomes a pending obligation in Catch-up.

---

## Why the wallet is load-bearing

Remove Nimiq Pay and Stash stops existing. The product is not a tracker with a wallet bolted on:

- Saving **is** a NIM transaction to an address the user controls.
- Goal progress is a sum of **verified on-chain sweeps**, not a database balance.
- The backend independently confirms every payment against the chain before any state changes.
- The savings destination is the user's own address. Stash has no custody wallet and no way to move user funds.

---

## Architecture

```
┌─────────────────────────────────────────┐
│              Nimiq Pay                  │
│  ┌───────────────────────────────────┐  │
│  │   Stash Mini App (React + Vite)   │  │
│  │   @nimiq/mini-app-sdk             │  │
│  │   init / listAccounts / sign /    │  │
│  │   sendBasicTransactionWithData    │  │
│  └────────────────┬──────────────────┘  │
└───────────────────┼─────────────────────┘
                    │ HTTPS
                    ▼
┌─────────────────────────────────────────┐
│         Stash API (Fastify + TS)        │
│                                         │
│  payment intents · on-chain verification│
│  obligations · sweeps · background      │
│  reconciler · signed-challenge auth     │
└───────────────────┬─────────────────────┘
                    │ JSON-RPC
                    ▼
┌─────────────────────────────────────────┐
│      TestAlbatross (public RPC)         │
│      rpc.testnet.nimiqwatch.com         │
└─────────────────────────────────────────┘
                    │
                    ▼
              PostgreSQL
```

The backend never holds keys and cannot move funds. It only reads the chain and records what it can prove.

---

## Payment verification

The core design decision: **the frontend never gets to say a payment succeeded.**

```
1.  POST /api/payment-intents
      server stores the expected recipient and expected value,
      returns an intent ID

2.  sendBasicTransactionWithData()
      client sends using the SERVER'S values,
      with the intent ID in the data field

3.  POST /api/payment-intents/:id/submit { txHash }
      server verifies that hash against RPC
```

The intent exists **before** the transaction is sent. That ordering is what makes the check meaningful — otherwise the client supplies both the claim and the thing it's compared against.

The server checks, independently:

| Check | Source of truth |
|---|---|
| Transaction exists and executed | RPC `getTransactionByHash` |
| Recipient matches | Server-stored intent |
| Value matches, exact Luna | Server-stored intent |
| Network is TestAlbatross | `networkId: 5` |
| Sender relates to authenticated wallet | `from` or `relatedAddresses` |
| Sufficient confirmations | Chain head vs. block height |
| Hash not already used | Unique constraint in Postgres |

The intent ID travels on-chain in the transaction's `recipientData`, hex-encoded UTF-8. This makes each transaction self-identifying, which is what allows recovery when the client never reports back.

### Wallet authentication

Addresses are proven, not asserted. The server issues a nonce, the wallet signs it through `provider.sign()`, and the server derives the address from the public key and verifies the Ed25519 signature. Nonces are single-use and row-locked against replay. Sessions are stored as `SHA256(token)`, never raw.

Nimiq Pay uses the same prefixed-SHA256 message scheme as Nimiq Hub — confirmed on device, not assumed.

### Background reconciler

If the app is closed, crashes, or loses network after a transaction is approved, nothing would ever confirm it. Money moved; Stash never noticed.

A background job scans for pending intents, finds the matching transaction on-chain by its embedded intent ID, and settles it through the **same code path** as the HTTP route — one settlement function, not two implementations that can drift.

**Verified on a real device:** a payment was approved in Nimiq Pay, the app was force-quit before confirmation, and on reopening the amount was correctly recorded in Catch-up.

---

## Finding: Nimiq Pay routes payments through HTLC contracts

Undocumented behavior, discovered while building this, verified across five real transactions.

Nimiq Pay does not send from the connected wallet's basic account. It creates an HTLC (hashed time-locked contract), funds it, and sends payments out of that contract. A payment's on-chain `from` is the contract address, not the user's wallet.

**Evidence:**

- `872b874b...` — `from` NQ59, `fromType: 2`
- `672b5867...` — `from` NQ17, `fromType: 2`, a *different* contract
- `getAccountByAddress(NQ59)` now returns `type: "basic", balance: 0` — the contract drained and was pruned from the accounts tree

That last point matters: any fix based on looking up the contract's owner is impossible, because the contract no longer exists by the time you'd query it. Stash instead checks `relatedAddresses`, which is stored on the transaction itself and survives pruning.

This is documented honestly in the code as defense-in-depth, not authentication. The real binding is recipient + value + the server-generated intent ID.

Not documented by Nimiq. Mainnet behavior unverified.

---

## Known limitation: spending outside Stash isn't detected

Stash cannot automatically detect payments made through Nimiq Pay's own flow without going through Stash.

**Why:** the RPC's address index only covers transactions where an address is literally `from` or `to`. Because Nimiq Pay payments originate from HTLCs, they never appear in the wallet's own history.

**Evidence:** `getTransactionsByAddress` for wallet `NQ36 9F2P...` returns 5 transactions, newest at block 10409626. Two known real payments from that wallet — `672b5867...` (block 10441970) and `52730624...` (block 10444533) — are absent, despite both listing NQ36 in `relatedAddresses`.

**Planned fix (out of scope here):** a two-hop scan. Contract creations (`flags: 1`, `toType: 2`) *are* visible in the wallet's history, so the HTLC addresses are discoverable; the payments live in each contract's own history. Verified viable — querying NQ59 directly returned all three of its transactions.

Catch-up still works from its other source: savings legs skipped during Pay & Stash.

---

## What's built

- Pay & Stash — two-leg payment with independent on-chain verification of each leg
- Catch-up — pending obligations, batched into a single sweep
- Savings goals — percentage, fixed, and round-up rules, all integer Luna
- Goal completion — server-derived from verified sweeps, with a past-goals list
- Weekly savings streak — computed from confirmed sweeps, wallet-scoped
- Background reconciliation for interrupted payments
- Signed-challenge wallet authentication
- Rate limiting, security headers, address validation, RPC retry with backoff

No mock data, no fake balances, no hardcoded hashes. Empty states throughout.

---

## Money handling

All amounts are integer `bigint` Luna. No floating point anywhere in the money path.

```
1 NIM = 100,000 Luna
```

Percentages are stored as basis points and applied with integer arithmetic.

---

## Running locally

```bash
npm install

cp apps/api/.env.example apps/api/.env
# DATABASE_URL     — Postgres connection string
# SESSION_SECRET   — any strong random value
# NIMIQ_RPC_URL    — https://rpc.testnet.nimiqwatch.com/
# APP_ORIGIN       — the web app's URL

npm run migrate --workspace apps/api

npm run dev --workspace apps/api    # :8787
npm run dev --workspace apps/web -- --host   # :5173
```

Then follow Nimiq's **Load a Local Mini App** procedure to open the LAN URL inside Nimiq Pay in testnet mode. The wallet-connect step will correctly fail in a desktop browser — `window.nimiq` is only injected by the host app.

Test NIM: `https://faucet.pos.nimiq-testnet.com/tapit`

**Note on the public RPC:** `rpc.testnet.nimiqwatch.com` is listed in Nimiq's curated [`nimiq/awesome`](https://github.com/nimiq/awesome) repository under Testnet Open RPC Servers. It carries no uptime guarantee and is not production infrastructure.

---

## Repository layout

```
apps/web        React + TypeScript + Vite Mini App
apps/api        Fastify + TypeScript backend
packages/domain Savings rules, classification, streak, Luna math (pure, tested)
migrations      SQL schema
```

## Tests

```bash
npm test --workspace packages/domain   # rules, classification, streak
npm test --workspace apps/api          # on-chain verification against real tx fixtures
```

Verification tests use real TestAlbatross transactions as fixtures, including the HTLC case.

---

## License

MIT