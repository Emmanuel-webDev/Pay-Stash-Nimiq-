# Stash Competition Readiness — SCORING_CHECKLIST.md

This checklist maps Stash directly against the official Nimiq Mini Apps Competition scoring rubric.

Use the following status labels for every item:

- **PASS** — implemented and verified
- **PARTIAL** — implemented but not fully verified or polished
- **MISSING** — not implemented
- **BLOCKED** — cannot currently be completed because of an external or unresolved technical dependency

For every PASS, attach proof where possible:
- file path
- test name
- screenshot
- transaction hash
- deployed URL
- analytics evidence
- README section

Priority labels:

- **P0** — could prevent submission or break the core product
- **P1** — directly costs judging points
- **P2** — polish / quality improvement
- **P3** — optional

---

## 45 Points — Functionality, Reliability & Usefulness

### Core Promise

**Product promise:**  
**Save when you spend. Catch up when you miss.**

- [ ] **P0** Wallet connection works inside real Nimiq Pay
  - Status:
  - Proof:

- [ ] **P0** Wallet authentication works via signed challenge
  - Status:
  - Proof:

- [ ] **P0** User can create a savings goal
  - Status:
  - Proof:

- [ ] **P0** User can configure a savings rule
  - Status:
  - Proof:

- [ ] **P0** Pay & Stash merchant-payment flow works
  - Status:
  - Proof:

- [ ] **P0** Merchant transaction is independently verified on TestAlbatross
  - Status:
  - Proof:

- [ ] **P0** Savings transaction can be initiated after merchant payment
  - Status:
  - Proof:

- [ ] **P0** Savings transaction is independently verified
  - Status:
  - Proof:

- [ ] **P0** Goal progress updates only after confirmed savings activity
  - Status:
  - Proof:

- [ ] **P0** If savings is skipped/rejected after payment, a Catch-up obligation is created
  - Status:
  - Proof:

- [ ] **P0** External outgoing NIM spending can be detected and converted into Catch-up obligations
  - Status:
  - Proof:

- [ ] **P0** Catch-up sweep works end-to-end
  - Status:
  - Proof:

- [ ] **P0** Duplicate transaction hashes cannot settle multiple obligations
  - Status:
  - Proof:

### Error Handling

- [ ] **P0** Wallet permission rejection has a clear recovery state
- [ ] **P0** Signature rejection has a clear recovery state
- [ ] **P0** Invalid/expired authentication session returns a useful UI state
- [ ] **P0** Insufficient NIM is handled before starting Pay & Stash where possible
- [ ] **P0** Invalid recipient is rejected cleanly
- [ ] **P0** Merchant transaction rejection does not create false savings state
- [ ] **P0** Merchant success + savings rejection produces partial-completion state
- [ ] **P0** RPC/chain-reader outage does not cause an infinite spinner
- [ ] **P0** Pending transaction survives refresh/reopen where applicable
- [ ] **P0** Backend API failure has retry/recovery messaging
- [ ] **P0** All chain waits are bounded by timeout/retry logic

### UX Reliability

- [ ] **P1** No screen can dead-end the user
- [ ] **P1** Pending states clearly distinguish:
  - submitted
  - confirming
  - confirmed
  - failed
  - reconnecting
- [ ] **P1** Raw retry counters are hidden from normal users
- [ ] **P1** Development diagnostics are gated behind dev mode
- [ ] **P1** No fake merchant names
- [ ] **P1** No fake balances
- [ ] **P1** No fake transaction hashes
- [ ] **P1** No hardcoded success states
- [ ] **P1** No lorem ipsum / placeholder UI remains

### Usefulness

- [ ] **P1** Onboarding explains the behavioral problem clearly
- [ ] **P1** Target audience is obvious within the first screen
- [ ] **P1** Stash is positioned as a savings-habit product, not a crypto dashboard
- [ ] **P1** The product explains why Catch-up exists
- [ ] **P1** Goal completion naturally leads to creating another goal
- [ ] **P1** Weekly streaks reinforce consistency
- [ ] **P1** Milestones reinforce progress
- [ ] **P1** Rewards reinforce saving, never spending volume

### Repeat-Use Mechanics

- [ ] **P1** Weekly savings streak works from confirmed savings events
- [ ] **P1** First Save milestone exists
- [ ] **P1** 4-Week Streak milestone exists
- [ ] **P1** 8-Week Streak milestone exists
- [ ] **P1** 25% Goal milestone exists
- [ ] **P1** 50% Goal milestone exists
- [ ] **P1** 75% Goal milestone exists
- [ ] **P1** Goal Completed milestone exists
- [ ] **P1** Catch-up Cleared milestone exists
- [ ] **P2** Saver levels are configurable
- [ ] **P2** Cosmetic/unlockable rewards exist
- [ ] **P2** Sponsored reward eligibility architecture exists
- [ ] **P3** Community reward-pool creation exists

---

## 25 Points — Nimiq Pay & Nimiq Integration

### Wallet Integration

- [ ] **P0** `@nimiq/mini-app-sdk` initializes successfully inside Nimiq Pay
- [ ] **P0** `listAccounts()` works with a real Nimiq Pay session
- [ ] **P0** `sign()` works with a real Nimiq Pay session
- [ ] **P0** `sendBasicTransaction()` works with real test NIM
- [ ] **P0** Exact return shape of `sendBasicTransaction()` is documented
- [ ] **P0** Transaction hash is captured reliably after submission

### TestAlbatross

- [ ] **P0** Nimiq Pay is tested in TestAlbatross mode
- [ ] **P0** Free test NIM is used for development
- [ ] **P0** Backend chain verification points to TestAlbatross
- [ ] **P0** No MainAlbatross/testnet data mixing is possible

### Chain Verification

- [ ] **P0** Backend verifies transaction existence
- [ ] **P0** Backend verifies sender == authenticated wallet
- [ ] **P0** Backend verifies recipient == expected recipient
- [ ] **P0** Backend verifies value == expected Luna amount
- [ ] **P0** Backend verifies transaction confirmation/main-chain status
- [ ] **P0** Backend enforces unique tx hash
- [ ] **P1** Confirmation does not depend on browser-side P2P consensus
- [ ] **P1** Frontend polls Stash API rather than chain directly for authoritative state

### Financial Integrity

- [ ] **P0** All NIM values are stored/calculated in integer Luna
- [ ] **P0** `1 NIM = 100,000 Luna` is enforced consistently
- [ ] **P0** No floating-point accounting is used
- [ ] **P0** Stash never stores private keys
- [ ] **P0** Savings destination is user-controlled
- [ ] **P0** Stash is non-custodial
- [ ] **P0** Browser-submitted wallet address is never trusted as proof of ownership

### Authentication

- [ ] **P0** One-time challenge nonce is generated server-side
- [ ] **P0** Nonce expires quickly
- [ ] **P0** Nonce is single-use
- [ ] **P0** Backend reconstructs challenge deterministically
- [ ] **P0** Signature verification uses confirmed Nimiq Pay signing convention
- [ ] **P0** Temporary dual verification fallback has been removed after on-device verification
- [ ] **P0** Derived Nimiq address must match challenged wallet address
- [ ] **P0** Bearer session tokens are stored only as hashes server-side
- [ ] **P0** Mutating API routes require authenticated wallet identity

---

## 15 Points — Real Usage

### Product Analytics

- [ ] **P1** Unique connected users can be measured
- [ ] **P1** Goals created can be measured
- [ ] **P1** Pay & Stash attempts can be measured
- [ ] **P1** Successful merchant payments can be measured
- [ ] **P1** Successful savings transfers can be measured
- [ ] **P1** Catch-up sweeps can be measured
- [ ] **P1** Goals completed can be measured
- [ ] **P1** Returning users can be measured
- [ ] **P1** Savings streaks can be measured

### Privacy

- [ ] **P1** Analytics are aggregate-first
- [ ] **P1** No unnecessary personal information is collected
- [ ] **P1** Individual wallet history is not publicly exposed

### Usage Targets

- [ ] **P1** At least 5 real testers completed the core flow
- [ ] **P1** At least 10 real users tested Stash
- [ ] **P1** Target: 20–30 real users before judging
- [ ] **P1** At least one user returned for a second session
- [ ] **P1** At least one real Catch-up flow completed
- [ ] **P1** At least one goal milestone was reached by a real tester

### Feedback

- [ ] **P1** Feedback mechanism exists
- [ ] **P1** User feedback has been reviewed
- [ ] **P1** At least one product change was made from real feedback
- [ ] **P2** Feedback quotes/screenshots are archived for submission evidence

### Evidence

- [ ] **P1** Usage numbers are truthful and reproducible
- [ ] **P1** Screenshots of real use exist
- [ ] **P1** Demo video shows real Nimiq Pay interaction
- [ ] **P1** No fabricated metrics appear anywhere

---

## 10 Points — Design & UX

`design.md` is the authoritative visual and UX specification for Stash.

The design direction is:

> **Calm, tactile, compact, and trustworthy.**

The product must feel like a focused savings-habit utility, not a crypto dashboard.

### Design Principles

- [ ] **P1** Habit before analytics: the next savings action is always more prominent than analytics
- [ ] **P1** Pay & Stash is presented as two explicit NIM transactions and two native Nimiq Pay approvals
- [ ] **P0** UI never implies Pay & Stash is atomic
- [ ] **P1** Confirmation states are quiet and trustworthy, not celebratory or casino-like
- [ ] **P1** One dominant action per screen
- [ ] **P1** Changing goal/rule/destination affects future spending only
- [ ] **P0** Existing obligations are never silently recalculated after rule changes
- [ ] **P1** Missed savings are surfaced honestly rather than hidden
- [ ] **P1** No analytics-heavy dashboard replaces the savings habit loop

### Brand Identity

- [ ] **P1** Custom Stash loop mark is implemented from `design.md`
- [ ] **P1** Loop mark uses a continuous lowercase `s` construction
- [ ] **P1** Logo tile is `34px × 34px`
- [ ] **P1** Logo tile corner radius is `12px`
- [ ] **P1** Logo tile uses `var(--color-accent)`
- [ ] **P1** Logo icon uses `var(--color-accent-ink)`
- [ ] **P1** Logo SVG is approximately `22px × 22px`
- [ ] **P1** Logo stroke width is `2.6`
- [ ] **P1** No gradient is used in the logo
- [ ] **P1** Wordmark is lowercase `stash`
- [ ] **P1** Wordmark uses the display font at `18px / 700 / -0.06em`
- [ ] **P1** Full `[mark] stash` lockup appears in the top bar
- [ ] **P1** Logo clear space is at least `8px`
- [ ] **P1** Logo is never replaced with a generic wallet/coin/piggy-bank icon

### Iconography

- [ ] **P1** Lucide is the only icon family
- [ ] **P1** Default icon size is about `18px`
- [ ] **P1** Utility icons remain within `15–16px`
- [ ] **P1** Navigation icons are `18px`
- [ ] **P1** State icons are approximately `28px`
- [ ] **P1** Default Lucide stroke width is `2`
- [ ] **P1** Icons use `currentColor`
- [ ] **P1** Icons are always paired with text when carrying status/meaning
- [ ] **P1** Bottom navigation is never icon-only

Required icon usage where applicable:

- [ ] **P1** `history` for centered Activity action
- [ ] **P1** `chevron-down` for wallet disclosure
- [ ] **P1** `sparkles` for active savings-rule band
- [ ] **P1** `arrow-up-right` for outbound payment/approval actions
- [ ] **P1** `house` for Home
- [ ] **P1** `target` for Savings
- [ ] **P1** `send` for Pay
- [ ] **P1** `rotate-ccw` for Catch-up
- [ ] **P1** `shield-check` for savings-destination trust note
- [ ] **P1** `triangle-alert` for destination-change warnings

### Typography

- [ ] **P1** DM Sans is used as `--font-display`
- [ ] **P1** Manrope is used as `--font-body`
- [ ] **P1** Display headings use DM Sans `600`
- [ ] **P1** Page/state headings use the tight negative tracking defined in `design.md`
- [ ] **P1** Headings are roman, never italic
- [ ] **P1** Body text is at least `16px`
- [ ] **P1** Supporting copy stays within `13–14px`
- [ ] **P1** Eyebrow text uses `12px / 700 / 0.10em`
- [ ] **P1** Monetary/progress values use tabular numerals
- [ ] **P1** Headings use balanced wrapping
- [ ] **P1** Paragraphs use pretty wrapping
- [ ] **P1** Larger-screen prose remains below ~`55ch`
- [ ] **P1** Mobile prose remains below ~`34ch`
- [ ] **P1** Long explanatory paragraphs are avoided in the primary flow

### Color System

- [ ] **P1** `--color-paper: oklch(95.8% 0.006 90)`
- [ ] **P1** `--color-surface: oklch(98.5% 0.004 90)`
- [ ] **P1** `--color-surface-2: oklch(88% 0.008 90)`
- [ ] **P1** `--color-ink: oklch(18% 0.008 90)`
- [ ] **P1** `--color-ink-soft: oklch(46% 0.008 90)`
- [ ] **P1** `--color-line: oklch(78% 0.008 90)`
- [ ] **P1** `--color-accent: oklch(66% 0.20 52)`
- [ ] **P1** `--color-accent-hover: oklch(59% 0.20 52)`
- [ ] **P1** `--color-accent-soft: oklch(89% 0.08 57)`
- [ ] **P1** `--color-success: oklch(45% 0.11 150)`
- [ ] **P1** `--color-danger: oklch(51% 0.15 25)`
- [ ] **P1** `--color-focus: oklch(48% 0.18 260)`

Color restrictions:

- [ ] **P1** No pure black or pure white base palette
- [ ] **P1** No blue-purple fintech gradients
- [ ] **P1** No gradient text
- [ ] **P1** No neon crypto colors
- [ ] **P1** Accent color is not used as a large page background
- [ ] **P1** Status never relies on color alone
- [ ] **P1** Danger treatment is used for missed savings / pending Catch-up
- [ ] **P1** Success treatment is reserved for verified states

### Spacing, Shape & Layout

- [ ] **P1** 4px spacing scale is implemented
- [ ] **P1** `--radius-sm: 8px`
- [ ] **P1** `--radius-md: 16px`
- [ ] **P1** `--radius-lg: 24px`
- [ ] **P1** Rounded surfaces are only used for meaningful modules
- [ ] **P1** No nested-card layout
- [ ] **P1** Hairline dividers are used for secondary grouping
- [ ] **P1** Mobile shell width is capped around `480px`
- [ ] **P1** App shell reserves bottom space for navigation
- [ ] **P1** `overflow-x: clip` is applied to `html` and `body`

### Top Bar

- [ ] **P1** Top bar uses a three-part grid: left / center / right
- [ ] **P1** Left side contains Stash logo lockup
- [ ] **P1** Activity action is centered
- [ ] **P1** Wallet chip appears on the right
- [ ] **P1** Top bar minimum height is approximately `76px`
- [ ] **P1** Activity is not moved into a corner
- [ ] **P1** Wallet chip uses a shortened connected address
- [ ] **P1** Full wallet address is not shown in compact header
- [ ] **P1** Wallet address is resolved from the real connected wallet in production
- [ ] **P1** Wallet disclosure preserves a clear `Wallet connected` state

### Bottom Navigation

- [ ] **P1** Home
- [ ] **P1** Savings
- [ ] **P1** Pay
- [ ] **P1** Catch-up
- [ ] **P1** Bottom nav uses four equal columns
- [ ] **P1** Labels remain visible
- [ ] **P1** Minimum touch target is `44px`
- [ ] **P1** Selected nav uses dark charcoal fill with light text
- [ ] **P1** Inactive nav uses soft ink
- [ ] **P1** Desktop sidebar is not used as primary navigation

### Core Components

- [ ] **P1** Standard primary button minimum height is `52px`
- [ ] **P1** Home Pay & Stash action minimum height is `64px`
- [ ] **P1** Standard primary action radius is `8px`
- [ ] **P1** Dominant Home action radius is `16px`
- [ ] **P1** Primary labels are concise and verb-led
- [ ] **P1** Dark attention button is used appropriately for high-attention approvals/sweeps
- [ ] **P1** Inputs have minimum height `52px`
- [ ] **P1** Inputs use surface background
- [ ] **P1** Inputs support default/hover/focus/error/disabled/success
- [ ] **P1** Input state changes do not alter border width
- [ ] **P1** Native radio semantics are used for savings rules
- [ ] **P1** Selected radio row uses accent-soft background + accent border
- [ ] **P1** Progress track uses surface-2
- [ ] **P1** Progress fill uses accent
- [ ] **P1** Progress height is `10px`
- [ ] **P1** Progress uses `role="progressbar"` and numeric ARIA values
- [ ] **P1** Progress supports the habit but is not the hero

### Screen Composition

#### Home
- [ ] **P1** Date marker
- [ ] **P1** Active savings-rule band
- [ ] **P1** Goal progress module
- [ ] **P1** Pay & Stash primary action
- [ ] **P1** Catch-up waiting module

#### Savings Setup
- [ ] **P1** Goal name field
- [ ] **P1** Target amount in NIM
- [ ] **P1** Savings rule selector
- [ ] **P1** User-controlled destination address
- [ ] **P1** Live savings example
- [ ] **P1** Clear note that changes affect future spending only

#### Pay & Stash
- [ ] **P1** Recipient field
- [ ] **P1** Payment amount field
- [ ] **P1** Dark calculation block
- [ ] **P1** Calculation block shows payment, stash amount, and total before fees

#### Payment Review
- [ ] **P0** Recipient is shown
- [ ] **P0** Merchant payment amount is shown
- [ ] **P0** Savings destination is shown
- [ ] **P0** Stash amount is shown
- [ ] **P0** Total requirement is shown
- [ ] **P0** Copy explicitly states there are two transactions / two approvals

#### Savings Confirmation
- [ ] **P0** Exact phrase `Payment complete` appears after merchant confirmation
- [ ] **P0** Exact savings amount is shown
- [ ] **P0** User-controlled destination is shown
- [ ] **P0** Second approval action is available
- [ ] **P0** Skip option exists and routes to Catch-up

#### Success
- [ ] **P1** Quiet verified treatment
- [ ] **P1** Updated goal progress visible
- [ ] **P1** Return-to-home action exists
- [ ] **P1** No confetti

#### Partial Completion
- [ ] **P0** Exact phrase `Payment complete`
- [ ] **P0** Exact phrase `Savings not completed`
- [ ] **P0** Missed savings amount is shown
- [ ] **P0** Copy explains it is now in Catch-up
- [ ] **P0** Direct Catch-up action exists

#### Catch-up
- [ ] **P1** Large pending total appears first
- [ ] **P1** Simple obligation list follows
- [ ] **P1** Each row shows shortened recipient/address, source description, date, savings amount
- [ ] **P1** Removing an item only changes the sweep list
- [ ] **P1** Removing an item never implies a blockchain transaction occurred

#### Activity
- [ ] **P1** Only verified outgoing activity is shown
- [ ] **P1** Unknown recipients remain shortened addresses
- [ ] **P1** No merchant names/descriptions are invented
- [ ] **P1** Confirmed state is visible
- [ ] **P1** Savings contribution is shown where applicable

#### Settings
- [ ] **P1** Goal rename
- [ ] **P1** Target change
- [ ] **P1** Future savings-rule change
- [ ] **P1** Pause/resume
- [ ] **P1** Destination update with explicit warning
- [ ] **P0** Settings never silently rewrite historical obligations

### Interaction States

Every interactive control supports:

- [ ] **P1** Default
- [ ] **P1** Hover
- [ ] **P1** Focus-visible
- [ ] **P1** Active
- [ ] **P1** Disabled
- [ ] **P1** Loading
- [ ] **P1** Error
- [ ] **P1** Success

### Focus & Motion

- [ ] **P1** Focus outline uses `2px solid var(--color-focus)`
- [ ] **P1** Focus outline offset is `3px`
- [ ] **P1** Native focus is never removed without a replacement
- [ ] **P1** Screen entrance uses restrained fade + ~`8px` vertical motion
- [ ] **P1** Screen animation stays within roughly `260–380ms`
- [ ] **P1** Button press uses approximately `translateY(1px)` / `100ms`
- [ ] **P1** Only background-color, opacity, transform, and box-shadow are animated
- [ ] **P1** `prefers-reduced-motion` is respected
- [ ] **P1** Success remains static rather than becoming spectacle

### Accessibility

- [ ] **P1** Semantic headings and landmarks
- [ ] **P1** Stash logo has an accessible label
- [ ] **P1** Focus remains visible
- [ ] **P1** Concise action labels
- [ ] **P1** Status never depends on color alone
- [ ] **P1** `aria-live="polite"` is used for calculated amounts/payment status
- [ ] **P1** Native radio semantics are used
- [ ] **P1** Touch targets are at least `44px`
- [ ] **P1** Clickable text remains on one line at mobile widths
- [ ] **P1** No horizontal scrolling between `320px` and `768px`

### Responsive Verification

- [ ] **P1** Tested at `320px`
- [ ] **P1** Tested at `375px`
- [ ] **P1** Tested at `414px`
- [ ] **P1** Tested at `768px`
- [ ] **P1** No horizontal clipping
- [ ] **P1** Bottom navigation remains usable at all supported widths
- [ ] **P1** Monetary values do not overflow
- [ ] **P1** Wallet chip does not collide with centered Activity action

### Financial Integrity Reflected in UX

- [ ] **P0** Production uses integer Luna, never floating-point accounting
- [ ] **P0** Production wallet actions use `@nimiq/mini-app-sdk`
- [ ] **P0** Verified history/confirmation comes from backend + Nimiq chain source
- [ ] **P0** Private keys are never stored
- [ ] **P0** Browser-submitted address is not proof of ownership
- [ ] **P0** Savings are not marked complete from frontend callback alone
- [ ] **P0** Fake balances are never shown
- [ ] **P0** Fake transaction hashes are never shown
- [ ] **P0** Merchant names are never invented
- [ ] **P0** Pay & Stash is always represented as two transactions

### Explicit Do-Not Checklist

- [ ] **P1** No desktop sidebar as primary mobile navigation
- [ ] **P1** No crypto-neon visual language
- [ ] **P1** No gradient text
- [ ] **P1** No nested cards
- [ ] **P1** No generic marketing hero / feature grid / footer inside the Mini App
- [ ] **P1** No fabricated metrics
- [ ] **P1** No fabricated testimonials
- [ ] **P1** No fabricated merchant names
- [ ] **P1** No fabricated balances
- [ ] **P0** Failed savings step is never hidden
- [ ] **P1** Setup does not begin with a modal
- [ ] **P1** No italic headings
- [ ] **P1** Full wallet address is not turned into a noisy header element
- [ ] **P1** Activity remains centered in the top bar

---

## 5 Points — Builder Promotion Checklist

### Repository

- [ ] **P1** Public GitHub repository
- [ ] **P1** MIT license
- [ ] **P1** No secrets committed
- [ ] **P1** Clean repository structure
- [ ] **P1** `.env.example` exists

### README

- [ ] **P1** README begins with:
  - `# Stash`
  - `Save when you spend. Catch up when you miss.`

- [ ] **P1** README contains Problem
- [ ] **P1** README contains Solution
- [ ] **P1** README contains Nimiq Pay Integration
- [ ] **P1** README contains Core Flow
- [ ] **P1** README contains Architecture
- [ ] **P1** README contains Local Setup
- [ ] **P1** README contains TestAlbatross Testing
- [ ] **P1** README contains Security
- [ ] **P1** README contains Known Limitations
- [ ] **P1** README contains Screenshots
- [ ] **P1** README contains Live App
- [ ] **P1** README contains Demo Video

### Submission Assets

- [ ] **P1** Production/staging URL works
- [ ] **P1** Judges can open the Mini App without developer intervention
- [ ] **P1** Demo video is concise
- [ ] **P1** Demo video shows real wallet connection
- [ ] **P1** Demo video shows real Pay & Stash
- [ ] **P1** Demo video shows Catch-up
- [ ] **P1** Demo video shows streak/milestone/reward loop
- [ ] **P1** Screenshots are high quality
- [ ] **P1** Product description is understandable in under 15 seconds
- [ ] **P1** Technical description clearly distinguishes what is real vs. simplified on testnet

### Promotion

- [ ] **P1** Required builder-promotion steps from the competition page are completed
- [ ] **P1** Project has a concise X/social post
- [ ] **P1** Demo URL is included in promotion
- [ ] **P1** Competition tags/mentions are correct
- [ ] **P1** Public launch/posting evidence is saved

---

# Final Pre-Submission Audit

## P0 — Must Be Zero Before Submission

Count:

```text
P0 PASS:
P0 PARTIAL:
P0 MISSING:
P0 BLOCKED:
```

Submission should not proceed while any core-path P0 item is MISSING.

---

## Judge Walkthrough Test

A fresh judge should be able to do this without help:

```text
Open Stash
↓
Connect Nimiq wallet
↓
Authenticate
↓
Create savings goal
↓
Choose savings rule
↓
Pay & Stash
↓
Approve merchant payment
↓
See confirmed state
↓
Approve savings transfer
↓
See goal progress update
↓
Understand weekly streak/milestone
↓
See Catch-up behavior
```

- [ ] **P0** Entire walkthrough works on a clean device/session
- [ ] **P0** No developer intervention is required
- [ ] **P0** No mock data is required

---

# Real Testnet Proof Pack

Keep a small submission evidence pack with:

- [ ] Connected TestAlbatross wallet screenshot
- [ ] Wallet-auth signature screenshot
- [ ] Merchant transaction hash
- [ ] Merchant transaction verification proof
- [ ] Savings transaction hash
- [ ] Savings transaction verification proof
- [ ] Catch-up transaction hash
- [ ] Goal progress screenshot
- [ ] Weekly streak screenshot
- [ ] Milestone screenshot
- [ ] Reward eligibility screenshot
- [ ] Real tester feedback
- [ ] Aggregate usage metrics
- [ ] Live URL
- [ ] GitHub URL
- [ ] Demo video URL

---

# Suggested Release Order

Do not optimize cosmetic extras before the core path is stable.

```text
1. Wallet connection
2. Wallet authentication
3. Goal creation
4. Pay & Stash merchant transaction
5. Backend transaction verification
6. Savings transaction
7. Savings verification
8. Catch-up
9. External-spend detection
10. Streaks
11. Milestones
12. Sponsored reward eligibility
13. Analytics
14. UX polish
15. Submission assets
```

---

# Current Audit Summary

Fill this before each release candidate:

| Area | Max Points | Current Estimate | Main Gap |
|---|---:|---:|---|
| Functionality / Reliability / Usefulness | 45 |  |  |
| Nimiq Integration | 25 |  |  |
| Real Usage | 15 |  |  |
| Design & UX | 10 |  |  |
| Builder Promotion | 5 |  |  |
| **Total** | **100** |  |  |

---

# Release Rule

Do not ask:

> “What feature should we add next?”

Ask:

> **“Which unresolved item gives us the most scoring value per unit of effort?”**

That should drive the remaining build.
