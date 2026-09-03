# Stash Design System

**Version:** 1.0  
**Product:** Stash, a Nimiq Pay Mini App  
**Design direction:** Calm, tactile, compact, and trustworthy. Stash should feel like a focused habit utility, not a crypto dashboard.

> **Product promise:** Save when you spend. Catch up when you miss.

---

## 1. Design principles

### Habit before analytics
The interface should make the next saving action obvious. Progress supports the habit, but analytics never lead the experience.

### Explicit money movement
Pay & Stash contains two separate NIM transactions and two native Nimiq Pay approvals. Never imply that the flow is atomic.

### Quiet confidence
Use clear labels, shortened addresses, restrained shadows, and calm confirmation states. Avoid confetti, hype, fake balances, invented merchants, and crypto clichÃ©s.

### One clear action
Use one dominant action per screen. The primary action is usually **Pay & Stash**, **Approve saving**, or **Approve catch-up sweep**.

### Future rules stay future-facing
Changing the savings rule, goal, or destination applies to future spending only. Existing obligations must not be silently recalculated.

---

## 2. Brand identity

### Primary logo: Stash loop mark

The prototype uses a custom inline SVG mark that draws a compact lowercase `s` as a continuous rounded loop. It sits inside a warm orange-red rounded square.

**Meaning:** a small repeatable action that builds into a habit.

**Primary construction:**

```svg
<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path
    d="M7 8.2c0-1.7 1.8-3.1 5-3.1s5 1.3 5 3.1-1.8 2.6-5 3.1-5 1.4-5 3.1 1.8 3.1 5 3.1 5-1.3 5-3.1"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
```

**Mark container:**

- Size: `34px Ã— 34px` in the top bar
- Shape: `12px` corner radius
- Fill: `var(--color-accent)`
- Icon color: `var(--color-accent-ink)`
- SVG size: `22px Ã— 22px`
- Stroke width: `2.6`
- No gradient
- No additional outline

### Wordmark

```css
.brand-name {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.06em;
}
```

The wordmark is lowercase: `stash`. Keep it visually close to the mark. Do not add a slogan inside the top bar.

### Logo lockup

The preferred mobile lockup is:

```text
[ S loop mark ] stash
```

The earlier host label, `Nimiq Pay`, was removed from the refreshed prototype to keep the header lighter. Host context can appear elsewhere when needed, but it should not compete with the wallet state.

### Logo usage rules

- Use the full lockup in the top bar.
- Use the loop mark alone for compact contexts, app icons, loading placeholders, and avatars.
- Keep the mark on the accent tile, not on a dark tile.
- Do not rotate, stretch, outline, or place the mark over a gradient.
- Do not replace the mark with a generic wallet, coin, piggy bank, or crypto symbol.
- Maintain clear space equal to at least `8px` around the mark.

---

## 3. Iconography

The prototype uses one consistent icon family: **Lucide**. Icons are functional, outlined, and quiet. Do not mix Lucide with another icon library.

### Icon defaults

```css
.icon {
  width: 18px;
  height: 18px;
  stroke-width: 2;
  color: currentColor;
}
```

- Default stroke: `2`
- Small utility icon: `15px` to `16px`
- Navigation icon: `18px`
- State icon: `28px`
- Use `currentColor` so the icon follows its control state.
- Icons never carry meaning alone. Pair status icons with text.

### Icons used in the prototype

| Icon | Lucide name | Usage |
|---|---|---|
| History | `history` | Centered top-bar Activity action |
| Chevron | `chevron-down` | Connected wallet disclosure |
| Sparkles | `sparkles` | Active savings rule band |
| Arrow up-right | `arrow-up-right` | Primary outbound payment and approval actions |
| House | `house` | Home navigation |
| Target | `target` | Savings navigation |
| Send | `send` | Pay navigation |
| Rotate counter-clockwise | `rotate-ccw` | Catch-up navigation |
| Arrow left | `arrow-left` | Back and edit actions |
| Shield check | `shield-check` | Savings destination trust note |
| Check | `check` | Save setup and verified success states |
| Info | `info` | Two-approval guidance note |
| Arrow right | `arrow-right` | Continue and return actions |
| Arrow down-right | `arrow-down-right` | Partial completion, payment complete but saving missed |
| Archive | `archive` | Payment-only activity row with catch-up pending |
| Triangle alert | `triangle-alert` | Destination change warning |

### Icon placement

- Put icons after the label for forward actions: `Review payment â†’`.
- Put icons before the label for contextual notes and back actions: `â† Home`.
- Use the centered Activity action in the top bar.
- Keep bottom navigation labels visible. Do not use icon-only navigation.

---

## 4. Typography

### Font families

```css
:root {
  --font-display: "DM Sans", ui-sans-serif, sans-serif;
  --font-body: "Manrope", ui-sans-serif, sans-serif;
}
```

Google Fonts import:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

### Type roles

| Role | Family | Size | Weight | Tracking | Line height |
|---|---|---:|---:|---:|---:|
| Display heading | DM Sans | `clamp(3rem, 14vw, 4.8rem)` | `600` | `-0.09em` | `0.88` |
| Page heading | DM Sans | `clamp(2.6rem, 12vw, 4rem)` | `600` | `-0.09em` | `0.88` |
| State heading | DM Sans | `clamp(2.8rem, 13vw, 4.6rem)` | `600` | `-0.09em` | `0.86` |
| Section heading | DM Sans | `22px` | `600` | `-0.05em` | `1.05` |
| Primary action | DM Sans | `18px` | `700` | `-0.03em` | `1` |
| Body | Manrope | `16px` minimum | `400` | normal | `1.5` |
| Supporting copy | Manrope | `13px` to `14px` | `400` | normal | `1.5` |
| Eyebrow | Manrope | `12px` | `700` | `0.10em` | `1.2` |
| Metadata | Manrope | `12px` | `500` to `600` | normal | `1.4` |

### Typography rules

- Headings are always roman, never italic.
- Use tight display leading between `0.84` and `0.94`.
- Use aggressive negative tracking only on display type.
- Keep body copy at `16px` minimum for primary reading.
- Keep supporting copy between `12px` and `14px`.
- Use tabular numerals for all monetary values and progress figures.

```css
.tabular {
  font-variant-numeric: tabular-nums;
}
```

- Headings use `text-wrap: balance`.
- Paragraphs use `text-wrap: pretty`.
- Keep larger-screen prose below `55ch`.
- Keep mobile prose below `34ch`.
- Avoid long explanatory paragraphs. Short labels win.

---

## 5. Color system

The palette is restrained and warm. Orange-red is reserved for action, selected states, progress, and attention.

```css
:root {
  --color-paper: oklch(95.8% 0.006 90);
  --color-surface: oklch(98.5% 0.004 90);
  --color-surface-2: oklch(88% 0.008 90);

  --color-ink: oklch(18% 0.008 90);
  --color-ink-soft: oklch(46% 0.008 90);
  --color-line: oklch(78% 0.008 90);

  --color-accent: oklch(66% 0.20 52);
  --color-accent-hover: oklch(59% 0.20 52);
  --color-accent-soft: oklch(89% 0.08 57);
  --color-accent-ink: oklch(18% 0.008 90);

  --color-dark: oklch(18% 0.008 90);
  --color-dark-soft: oklch(27% 0.012 90);
  --color-dark-ink: oklch(98% 0.004 90);

  --color-success: oklch(45% 0.11 150);
  --color-success-soft: oklch(88% 0.055 150);
  --color-danger: oklch(51% 0.15 25);
  --color-danger-soft: oklch(91% 0.055 25);
  --color-focus: oklch(48% 0.18 260);
}
```

### Color usage

- Paper is the page canvas.
- Surface is used for raised inputs and light interactive surfaces.
- Surface 2 is used for progress tracks, quiet notes, and inactive control backgrounds.
- Ink is primary text and dark action surfaces.
- Ink soft is secondary text and metadata.
- Accent is for primary actions, progress fill, selected radio states, and the logo tile.
- Accent soft is for guidance modules, selected setup rows, and approval callouts.
- Dark is for attention moments and calculation blocks.
- Success is for verified states and the connected wallet indicator.
- Danger is for missed savings and pending catch-up amounts.
- Focus is reserved for visible keyboard focus rings.

### Color restrictions

- Never use pure black or pure white as a base color.
- Never use blue-purple fintech gradients.
- Never use gradient text.
- Never use neon crypto colors.
- Never fill large page areas with the accent color.
- Never rely on color alone for status. Pair color with a label or icon.

---

## 6. Spacing and layout

### Spacing tokens

Use a `4px` base scale:

```css
:root {
  --space-3xs: 4px;
  --space-2xs: 8px;
  --space-xs: 12px;
  --space-sm: 16px;
  --space-md: 24px;
  --space-lg: 32px;
  --space-xl: 48px;
  --space-2xl: 64px;
}
```

Use `gap` for sibling relationships. Sections generally use `24px` to `48px` separation.

### Shape tokens

```css
:root {
  --radius-sm: 8px;
  --radius-md: 16px;
  --radius-lg: 24px;
  --shadow-soft: 0 18px 44px oklch(35% 0.03 90 / 0.10);
  --shadow-button: 0 10px 24px oklch(50% 0.12 52 / 0.20);
}
```

Use rounded surfaces only for distinct modules. Do not nest cards inside cards. Use whitespace and hairline dividers for secondary grouping.

### Mobile shell

```css
.app-shell {
  width: min(100%, 480px);
  min-height: 100svh;
  margin: 0 auto;
  padding: 0 var(--space-sm) 112px;
}
```

Supported widths: `320px`, `375px`, `414px`, and `768px`. The app must not produce horizontal scrolling.

```css
html,
body {
  overflow-x: clip;
}
```

---

## 7. Navigation and header

### Top bar

The refreshed prototype uses a three-part grid:

```css
.topbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  min-height: 76px;
  gap: var(--space-2xs);
}
```

- Left: Stash logo lockup.
- Center: Activity action.
- Right: connected wallet chip.

### Wallet connected state

The wallet chip displays a shortened address instead of a generic status label:

```text
â— nimiq...k7âŒ„
```

Rules:

- Use `nimiq...k7` in the prototype style.
- Preserve the connected dot and `Wallet connected` text in the disclosure detail.
- The chip is tappable and opens a compact disclosure.
- The full address should not be shown in the compact top bar.
- Do not fabricate a real wallet address in production. Resolve it from the wallet connection.

### Bottom navigation

Four primary destinations:

1. Home
2. Savings
3. Pay
4. Catch-up

```css
.nav-inner {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  width: min(100%, 448px);
}
```

- Minimum touch target: `44px`.
- Selected item: dark charcoal fill with light text.
- Inactive item: soft ink.
- Labels remain visible.
- Do not replace this with a desktop sidebar.

---

## 8. Core component styling

### Primary button

```css
.primary-action,
.button-accent {
  background: var(--color-accent);
  color: var(--color-accent-ink);
  box-shadow: var(--shadow-button);
}

.primary-action:hover,
.button-accent:hover {
  background: var(--color-accent-hover);
}
```

Primary buttons use:

- `8px` radius for standard actions
- `16px` radius for the dominant Home action
- Minimum height of `52px`
- Minimum height of `64px` for the Home Pay & Stash action
- One concise verb-led label

### Dark attention button

Use `var(--color-dark)` for payment approval and catch-up sweep actions when the action requires extra attention.

### Inputs

```css
.field input {
  min-height: 52px;
  padding: 0 var(--space-sm);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
}
```

Inputs must support default, hover, focus, error, disabled, and success treatments without changing border width.

### Radio rows

Use stacked selectable rows for savings rules.

- Unselected: surface background and line border.
- Selected: accent-soft background and accent border.
- Radio indicator: circular, filled with accent when selected.
- Use native radio inputs with radio semantics.

### Progress

- Track: surface 2.
- Fill: accent.
- Height: `10px`.
- Rounded ends.
- Use `role="progressbar"` with numeric ARIA values.
- Progress is supporting context, not the hero.

### Dividers

Use a `1px` line in `var(--color-line)` for activity rows, settings rows, and secondary grouping. Never use thick colored side stripes.

---

## 9. Screen composition

### Home

Order:

1. Date marker
2. Active savings rule band
3. Goal progress module
4. Pay & Stash action
5. Catch-up waiting module

The top bar remains visible and the bottom rail remains persistent.

### Savings setup

Fields:

- Goal name
- Target amount in NIM
- Savings rule
- User-controlled destination address

Show one live example and clearly state that changes apply to future spending only.

### Pay & Stash

Fields:

- Recipient address
- Payment amount

The dark calculation block shows payment, stash amount, and total required before fees.

### Payment review

Show recipient, payment amount, savings destination, stash amount, and total requirement. State that the flow contains two separate NIM transactions and two native Nimiq Pay approvals.

### Savings confirmation

After the merchant payment succeeds:

- Say `Payment complete`.
- Show the exact savings amount.
- Show the user-controlled destination.
- Provide a second approval action.
- Provide a skip option that leads to Catch-up.

### Success

Use a quiet verified state. Show the updated progress and a return-to-home action. No confetti.

### Partial completion

Use the exact language:

- `Payment complete`
- `Savings not completed`
- Show the missed amount.
- Explain that it is now in Catch-up.
- Link directly to Catch-up.

### Catch-up

Show the large pending total first, then a simple list of obligations. Each row includes a shortened recipient address, source description, date, and savings amount. Removing an item changes the sweep list only. It does not imply a blockchain transaction occurred.

### Activity

Show verified outgoing activity only. Keep unknown recipients shortened. Never invent merchant names or descriptions. Show confirmed state and savings contribution where applicable.

### Settings

Allow goal rename, target change, future savings rule change, pause or resume, and destination update with a clear warning.

---

## 10. Interaction and motion

### State checklist

Every interactive control needs styling for:

- Default
- Hover
- Focus-visible
- Active
- Disabled
- Loading
- Error
- Success

### Focus

```css
:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 3px;
}
```

Never remove the native focus indicator without replacing it.

### Motion tokens

```css
:root {
  --ease-out: cubic-bezier(.16, 1, .3, 1);
}
```

- Screen entrance: fade plus `8px` vertical movement, `260ms` to `380ms`.
- Button press: `translateY(1px)`, `100ms`.
- Loading: restrained spinner only when necessary.
- Success: static verified state.
- Animate only `background-color`, `opacity`, `transform`, and `box-shadow`.
- Respect `prefers-reduced-motion: reduce`.

---

## 11. Accessibility requirements

- Use semantic headings and landmarks.
- Give the Stash logo an accessible label.
- Keep focus visible.
- Use concise action labels.
- Do not rely on color alone for status.
- Use `aria-live="polite"` for calculated amounts and payment status changes.
- Use native radio semantics for savings rule selection.
- Keep touch targets at least `44px`.
- Support `320px` through `768px` without horizontal scrolling.
- Add `overflow-x: clip` to both `html` and `body`.
- Keep clickable text on one line at mobile widths.

---

## 12. Financial integrity

The prototype may simulate flows. Production implementation must:

- Store money as integer Luna, never floating-point monetary values.
- Use `@nimiq/mini-app-sdk` for wallet access and transaction approval.
- Use the backend and Nimiq RPC for verified history.
- Never store private keys.
- Never treat browser-submitted addresses as proof of ownership.
- Never mark savings complete from a frontend callback alone.
- Never show fake balances or fake transaction hashes.
- Never invent merchant names.
- Treat Pay & Stash as two separate transactions, never an atomic transfer.

---

## 13. Do not

- Do not use a desktop sidebar as primary mobile navigation.
- Do not use crypto-neon visual language.
- Do not use gradient text.
- Do not use nested cards.
- Do not use a generic hero, feature grid, or marketing footer.
- Do not fabricate metrics, testimonials, merchant names, or balances.
- Do not hide a failed savings step.
- Do not use a modal as the first interaction for setup.
- Do not use italic headings.
- Do not turn the wallet address into a long noisy header element.
- Do not move Activity back to a corner. It belongs centered in the refreshed top bar.