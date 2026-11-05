---
name: SC4053 DEX
description: A premium dark trading interface of layered translucent glass, violet and azure lighting, and exact on-chain numbers.
colors:
  background: "#080d19"
  foreground: "#f4f5ff"
  card: "#121a2d"
  popover: "#141c31"
  secondary: "#1c2540"
  muted: "#1a2238"
  muted-foreground: "#a8b0cb"
  accent: "#232c4a"
  primary-violet: "#7c5cf2"
  focus-ring: "#a58bff"
  lilac: "#b49cff"
  azure: "#6aa4ff"
  buy-green: "#3ddc9e"
  sell-rose: "#f37aa3"
  destructive: "#f06a8e"
  warn-amber: "#f2c14e"
  subtle: "#8a94b3"
  sidebar: "#10172a"
  sidebar-accent: "#222b49"
  border: "rgb(174 194 255 / 0.16)"
  input-border: "rgb(174 194 255 / 0.2)"
  glass-border: "rgb(186 202 255 / 0.2)"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.048em"
  page-title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.045em"
  brand:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.3125rem"
    fontWeight: 700
    letterSpacing: "-0.045em"
  figure:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    fontFeature: "'tnum', 'zero'"
  panel-title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.625
    letterSpacing: "-0.011em"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
  mono:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
rounded:
  control: "12px"
  tile: "14px"
  panel: "18px"
  hero: "22px"
  pill: "9999px"
spacing:
  grid-gap: "16px"
  panel-padding: "20px"
  panel-padding-compact: "16px"
  header-height: "64px"
  sidebar-width: "212px"
  sidebar-width-compact: "76px"
  content-max: "1680px"
components:
  panel:
    rounded: "{rounded.panel}"
    padding: "{spacing.panel-padding}"
    textColor: "{colors.foreground}"
  hero-panel:
    rounded: "{rounded.hero}"
    padding: "20px 24px"
    textColor: "{colors.foreground}"
  button-default:
    backgroundColor: "{colors.primary-violet}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 10px"
  connect-pill:
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "0 12px 0 14px"
  nav-pill:
    textColor: "#d3d7ea"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
  nav-pill-active:
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
  side-link:
    textColor: "#e1e4f6"
    rounded: "16.8px"
    height: "44px"
    padding: "0 14px"
  search-pill:
    backgroundColor: "rgb(15 21 40 / 0.8)"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "0 14px"
  status-chip:
    backgroundColor: "rgb(255 255 255 / 0.05)"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
---

# Design System: SC4053 DEX

This file records the approved P2-4 interface as implemented in `web/`. Values come from `web/app/globals.css`, the shell, dashboard and data components, and the Playwright renders in `docs/ai-audit/test-evidence/person2/p2-4-screens/`. It documents; it does not redesign. P2-5 and later phases extend this system and must not restyle it.

## Overview

**Creative North Star: "The Liquid Glass Trading Terminal"**

A premium dark decentralized trading interface that combines layered translucent glass, rich violet and azure lighting, elegant depth and shadow, refined typography, and precise, trustworthy on-chain data presentation. The reference is the user-approved Liquid Glass dashboard screenshot; the implementation follows it for depth, lighting, gradients, spacing and composition, and it is the source of truth for P2-4 and every later phase.

The surface is a deep navy ground lit from above by a violet-blue bloom, with panels that behave like frosted glass catching that light: a soft top-left highlight, a hairline pale border, a long shadow beneath. A glowing wave marks the hero and the sidebar. Around that atmosphere the data stays plain and exact. Numbers are set in tabular figures, truncated rather than rounded, with trailing digits dimmed; addresses are monospaced; buy and sell carry a text label as well as a colour. The atmosphere is allowed to be rich because the data is not allowed to be.

The interface is dark-only by design. It is an Operate surface (people work in it), so density and legibility outrank expression, and the glow belongs to the frame rather than the figures.

**Key Characteristics:**
- Dark-only: navy ground (#080d19) with layered radial lighting; no light theme.
- Four glass levels (`glass`, `glass-raised`, `glass-active`, `glass-inset`), each a translucent gradient with a light border and an inner highlight.
- Violet (#7c5cf2) and lilac (#b49cff) as the brand pair, azure (#6aa4ff) as the cool counterpoint.
- Generous rounding: 18px panels, 22px hero and sidebar, fully round pills.
- Tabular, exact numerals; mono addresses; 11px minimum text.
- Disabled-by-design placeholders for features that are not built, never styled to look live.

## Colors

A cold, saturated navy field with violet and azure light, and a warm-free palette: the only warm colour is amber for warnings. The pinned reference makes gradients, glow and violet part of the brief, so they are intentional rather than defaults.

### Primary
- **Signal Violet** (#7c5cf2, `--primary`): the default button fill, active-state glow and selection tint (45% alpha). The principal interactive colour.
- **Lilac** (#b49cff, `--lilac`): the "DEX" in the brand and h1, input caret, empty-state icons and highlight text. The brand's light accent.
- **Focus Lilac** (#a58bff, `--ring`): the 2px focus-visible outline (2px offset) and sidebar ring.

### Secondary
- **Azure** (#6aa4ff, `--azure`): chart series, the network icon and cool gradients. The counterpoint to violet.

### Tertiary (semantic)
- **Buy Mint** (#3ddc9e, `--buy`): bids, buy side, healthy status dot. Always accompanied by a "Buy"/"Buyers (bids)" label.
- **Sell Rose** (#f37aa3, `--sell`): asks, sell side, unreachable-node status. Always accompanied by a "Sell"/"Sellers (asks)" label.
- **Warn Amber** (#f2c14e, `--warn`): wrong network, missing deployment, caution banners and the Wrong network pill.
- **Destructive Rose** (#f06a8e, `--destructive`): destructive button variant and invalid-field states.

### Neutral
- **Abyss Navy** (#080d19, `--background`): the page ground, under the layered body lighting.
- **Lavender White** (#f4f5ff, `--foreground`): primary text.
- **Mist** (#a8b0cb, `--muted-foreground`): secondary text and captions.
- **Subtle Slate** (#8a94b3, `--subtle`): tertiary notes, the dimmed amount tail (at 60% alpha) and units.
- **Card Navy** (#121a2d), **Popover Navy** (#141c31), **Secondary Navy** (#1c2540), **Muted Navy** (#1a2238), **Accent Navy** (#232c4a): opaque tonal surfaces used by shadcn primitives.
- **Sidebar Navy** (#10172a) and **Sidebar Accent** (#222b49): sidebar tokens.
- **Hairline Border** (rgb(174 194 255 / 0.16)), **Input Border** (rgb(174 194 255 / 0.2)) and **Glass Border** (rgb(186 202 255 / 0.2)): pale blue lines at low alpha.
- Component-level literals not promoted to tokens: nav and body copy on glass use #d3d7ea, #e1e4f6, #cbd1e7, #bbc3d9 and #c3cce0; chart grid uses #71819c at 16%.

### Chart and token colours
Five chart tokens exist (`--chart-1` #9c80fb, `--chart-2` #6aa4ff, `--chart-3` #36dc9a, `--chart-4` #f06a8e, `--chart-5` #f2c14e). The depth chart itself uses Buy Mint and Sell Rose strokes (2px) over a 38% to 3% vertical area fill. Token coin marks use fixed gradients: NTU violet (#a07bff to #5b3ad8), SGDx blue (#7ec1ff to #2f74ee), other tokens a hash-chosen violet, blue, green or rose gradient; account avatars are deterministic HSL gradients from the address.

### Named Rules
**The Label-Not-Colour Rule.** Buy and sell are never shown by colour alone. Every green or rose value sits next to the words Buy or Sell (or Buyers/Sellers).

**The Ground Does the Glowing Rule.** Ambient light lives in the body background and the wave artwork. Figures, table text and form text stay in Lavender White or Mist; they do not glow.

## Typography

**Display, Body and Label Font:** Inter (loaded through `next/font`, variable `--font-inter`, fallback `ui-sans-serif, system-ui, sans-serif`). Body features `cv11` and `ss01` are on; text rendering is `optimizeLegibility`, antialiased.
**Mono Font:** IBM Plex Mono (400 and 500, variable `--font-plex-mono`) for addresses and code.

**Character:** One confident geometric sans carries every role, tightened at display sizes and quiet at body sizes, with a monospace reserved for identifiers. Hierarchy comes from weight and negative tracking, not from a second typeface.

### Hierarchy
- **Display** (700, 2.25rem to 2.5rem, 1.08, -0.048em): the hero title "SC4053 DEX" with "DEX" in Lilac.
- **Page title** (700, 1.875rem, tight, -0.045em): Markets and Tokens page headers.
- **Brand** (700, 1.3125rem, -0.045em): the header wordmark.
- **Figure** (600, 1.375rem, tabular): large entered or displayed values, such as the order ticket's price and amount fields.
- **Panel title** (600, 0.9375rem, -0.02em): every panel heading.
- **Body** (400, 0.8125rem, relaxed 1.625, -0.011em body tracking): supporting copy and table text. Hero and header paragraphs are capped near 60ch to 62ch.
- **Label** (500, 0.6875rem): field labels, captions, "Soon" and "Coming soon" markers. This is the size floor.
- **Mono** (400, 0.8125rem): addresses (shortened in chips, full in tooltips and accessible names).

### Named Rules
**The Exact Numbers Rule.** Amounts are tabular (`tnum`, `zero`), show the integer and the first four decimals, and dim the remaining digits instead of rounding them away. The full exact value is the accessible name and the tooltip. Never round a chain value for display.

**The Eleven Pixel Floor Rule.** No text is smaller than 0.6875rem (11px).

**The No Eyebrow Rule.** Headings are not preceded by tracked uppercase eyebrow labels. P2-4 removed one on this basis.

## Layout

An app shell around a content column. A sticky 64px header (brand, pill navigation, search, wallet control) spans the page; below it, a glass sidebar and the main column sit in a grid inside a 1680px maximum width, with 16px gaps between panels.

- **Breakpoints:** Tailwind defaults (sm 640, md 768, lg 1024, xl 1280, 2xl 1536); the project defines no custom breakpoints.
- **Desktop (xl and above):** 212px sidebar plus fluid content. The Overview content splits into a main column and a 20rem right column (22.5rem at 2xl) holding the order ticket and the Create and List card. Main-column rows use two-up grids with the ratios 1.9:1 (holdings and quick actions), 0.95:1.15 (token balances and market board) and 1.1:1 (depth and book).
- **Tablet (md to xl):** the sidebar collapses to a 76px icon rail with tooltips; the top nav is hidden below lg; the right column wraps to two columns.
- **Mobile (below md):** the sidebar becomes a left Sheet opened from a menu button; panels stack in one column; the Connect button label shortens to "Connect"; the hero wave is dimmed (45% opacity) and confined to an 11rem band.
- **Padding:** panels use 16px (20px from sm); the hero uses 20px (24px from sm); page gutters are 12px, 16px from md; header gutters 16px, 24px from md, and a 32px left gutter from lg.
- **Density:** moderate and tidy. Information sits in repeated rounded panels with a heading row.
- **Overflow rule:** no horizontal page scroll at 375, 768 or 1586 widths (verified in the P2-4 renders). Fields inside `fieldset` use `min-w-0`.

## Elevation & Depth

Depth is a hybrid of tonal layering and soft long shadows: glass planes at four levels over a lit navy ground. Surfaces are never flat at rest; each carries a gradient fill, a light border, an inner top highlight and a shadow. Backdrop blur separates planes.

### Glass levels
- **`glass`** (panel): fill `radial-gradient(120% 90% at 0% 0%, rgb(120 128 222 / 0.16), transparent 55%)` over `linear-gradient(135deg, rgb(58 70 120 / 0.42), rgb(20 28 52 / 0.8) 50%, rgb(26 34 64 / 0.7))`; border 1px `rgb(186 202 255 / 0.2)`; backdrop `blur(18px) saturate(140%)`.
- **`glass-raised`** (cards sitting on a panel, such as hero status cards): fill `linear-gradient(135deg, rgb(98 102 168 / 0.42), rgb(34 44 74 / 0.62))`; border `rgb(198 212 255 / 0.22)`; backdrop `blur(14px)`.
- **`glass-active`** (active pill, active sidebar item, Connect button): fill `linear-gradient(140deg, rgb(140 118 240 / 0.62), rgb(70 76 150 / 0.5))`; border `rgb(200 188 255 / 0.34)`.
- **`glass-inset`** (icon wells, nested areas): fill `rgb(88 104 160 / 0.13)`; border `rgb(170 186 255 / 0.08)`.

### Shadow vocabulary
- **Glass shadow** (`0 22px 48px -14px rgb(0 0 0 / 0.6), 0 3px 10px rgb(3 6 18 / 0.4)`): every `glass` panel.
- **Glass highlight** (`inset 0 1px 0 rgb(255 255 255 / 0.09), inset 0 0 0 1px rgb(140 150 255 / 0.03)`): the inner top edge light on `glass`.
- **Raised shadow** (`inset 0 1px 0 rgb(255 255 255 / 0.1), 0 12px 28px -10px rgb(0 0 0 / 0.5)`): `glass-raised`.
- **Active glow** (`inset 0 1px 6px rgb(255 255 255 / 0.18), 0 0 18px -4px rgb(132 101 230 / 0.45)`): `glass-active`.
- **Violet glow** (`0 0 0 1px rgb(196 182 255 / 0.32), 0 8px 24px -6px rgb(124 92 242 / 0.55)`): `--violet-glow`, a reserved emphasis token.
- **Token coin shadows** (`0 4px 14px -2px` in the coin's own hue at 45% to 55%): coin marks.
- **Status dots** (3px ring in a dark tint of the status colour): green ok, amber warning, rose error.

### Lighting
- **Body background:** four stacked layers over `#080d19`, fixed: a violet-blue bloom (`radial-gradient(60rem 28rem at 58% -6%, rgb(40 56 140 / 0.55), transparent 62%)`), a violet wash lower left (`40rem 30rem at 8% 70%, rgb(92 64 196 / 0.16)`), an azure wash lower right (`46rem 30rem at 100% 100%, rgb(48 96 196 / 0.12)`) and a base `linear-gradient(165deg, #0a1020 0%, #080c17 72%)`.
- **Header:** `linear-gradient(90deg, rgb(7 10 22 / 0.94), rgb(15 23 46 / 0.9), rgb(8 12 24 / 0.95))` with `backdrop-blur-xl` and a `rgb(255 255 255 / 0.08)` bottom border.
- **Hero wave:** an SVG band with a radial glow (#7482ea at 85%), a gradient fill and a 2.4px stroke (#5c79bd to #9ab4ff to #8a6bff) with a `drop-shadow(0 0 6px rgb(140 160 255 / 0.65))`. The sidebar carries four faint wave strokes.

### Named Rules
**The Glass Stack Rule.** Use `glass` for a panel, `glass-raised` only for a card that sits on a panel, `glass-active` only for the current or primary selection, and `glass-inset` for wells. Do not invent a fifth level.

**The Light From Above Rule.** Highlights come from the top-left; shadows fall down and away. Never reverse the light direction.

## Shapes

Generous, soft geometry. Panels are 18px (1.125rem); the hero, sidebar and glass shell are 22px (1.375rem); inner tiles are 14px (0.875rem); controls such as shadcn buttons are 12px (`--radius` 0.75rem); icon tiles and side links are about 16.8px; navigation, search, Connect, status chips and badges are fully round pills. Coin marks are circles, and account avatars are 9px-radius squares with a pale ring. Borders are always a 1px pale blue hairline at low alpha; there is no heavy outline. The shadcn radius scale derives from `--radius` (sm ×0.6, md ×0.8, lg ×1, xl ×1.4, 2xl ×1.8, 3xl ×2.2, 4xl ×2.6).

## Components

### Buttons
- **Shape:** 12px radius at default size (32px high, 10px side padding, 0.875rem medium weight); icon sizes from 24px to 36px.
- **Default:** Signal Violet fill (#7c5cf2) with white text; hover lowers to 80% opacity.
- **Outline, secondary, ghost, destructive, link:** shadcn variants kept as installed; destructive is a 10% rose tint with rose text.
- **Press and focus:** 1px downward translate on press; a 3px ring (`ring/50`) on keyboard focus; disabled is 50% opacity with no pointer events.

### Connect control (header)
- **Disconnected:** a 40px glass-active pill with a wallet icon and "Connect wallet" ("Connect" below sm).
- **Wrong network:** a 40px amber pill (border `warn/40`, fill `warn/12`) with an alert icon and "Wrong network".
- **Connected:** a 40px pill, fill `#1a2034` at 85% with a `white/16` border, showing a gradient avatar, the shortened address in mono and a chevron.
- **Loading:** a pulsing neutral pill.

### Navigation
- **Top nav:** pills, `#d3d7ea` text at 0.875rem medium; the active page uses `glass-active` with white text. Entries without a route are muted, show a tooltip and are not links.
- **Sidebar:** 44px rows with a 20px icon, 16.8px radius, `#e1e4f6` text, `white/6` hover and `glass-active` for the current page. Unavailable items are muted with a "Soon" marker. On tablet it is an icon rail with tooltips; on mobile it is a Sheet with a dark glass backdrop.

### Search
A 40px pill (fill `#0f1528` at 80%, border `white/16`), a 16px search icon, 0.8125rem text, and a `⌘ K` key hint on large screens. Focus shifts the border to lilac at 50%.

### Panels
A `glass` container, 18px radius, 16px or 20px padding, `overflow-hidden`, with an optional heading row (panel title left, action right, 12px below). Hero and page headers use a 22px `glass` panel with a custom blue-violet gradient and a soft radial bloom.

### Glass status cards (hero)
Two `glass-raised` cards at 18px radius, one for the wallet and one for the network (the network card carries an extra teal-tinted gradient), each with a 40px rounded icon tile and a status dot (green ok, amber warning, rose error).

### Data display
- **Amount:** tabular figures, unit in Mist, dimmed tail, full value in the accessible name.
- **Address chip:** shortened mono address with the full address available on hover.
- **Token and pair marks:** circular letter coins with gradient and ring; a pair is two coins overlapping by 6px.
- **Side badge:** a pill at 0.6875rem semibold, `buy/15` with Buy Mint text or `sell/15` with Sell Rose text, always carrying the word Buy or Sell.
- **Depth chart:** stair-step bid and ask areas with a 2px line, faint grid, labelled axes and a legend with coloured dots plus the words "Buyers (bids)" and "Sellers (asks)". With no data it shows a dash, not a flat line.
- **Tables:** shadcn table with a bottom border under the header row; registry tables are filterable.

### Empty and unavailable states
Centred, with an optional 40px `glass-inset` icon well in lilac, a one-line title and a short explanation of at most 34ch. They state what is true ("Node unreachable", "No deployment on this chain") and what to do. Status banners use a bordered strip with a 21.6px radius (`rounded-2xl`) and an amber or rose icon.

### Placeholders for unbuilt features
- **"Coming soon" chip:** `white/12` border, `white/5` fill, Mist 0.6875rem text, never wrapping.
- **Roadmap tiles:** 14px-radius tiles with a violet-tinted gradient and a 40px icon tile.

### Order ticket
The ticket is a `glass` panel titled "Limit order" (the trade page and the dashboard use the same component). Buy and Sell are a two-segment control in a `#10162a` track, the active segment using `glass-active`, labelled "Buy NTU" and "Sell NTU" from the pair. Price and amount are `glass-inset` fields at 14px radius with 1.375rem tabular figures and a token chip on the right; an invalid field gets a `sell/50` border and a 0.6875rem message in Sell Rose. Below sit small label and value rows, then an order summary and an "Estimate against the current book" block inside a `glass-inset` panel. The review step is a 14px-radius card with a lilac border (`lilac/30` over `#161d36`). The primary action is one full-width 44px button using the violet gradient of the active controls; when disabled it drops to 40% fill and 70% text, with `cursor-not-allowed`. Its label always says what the click will do ("Review order", "Approve 8.8 SGDx", "Place buy order", "Switch to Anvil", "Connect wallet").

### Wallet notices and step list
Every wallet request, from connecting to approving, placing and switching network, uses one notice: a `glass-inset` card at 14px radius with a coloured 1px border, a 20px status icon and a title with a short body, announced politely (`role="status"`). It has four states, never conveyed by colour alone (each has its own icon and title): waiting (lilac border, spinning loader; after 20 seconds it adds a numbered recovery list and a "Try again" outline button), rejected (amber), error (Sell Rose), success (Buy Mint). The connect notice floats at the bottom centre above everything, because RainbowKit's dialog covers the page. The lifecycle step list is a `glass-inset` ordered list with a 20px icon per step (empty dot, spinning loader, mint check, rose cross) and the transaction hash as a mono link.

### Result card and tables
After a confirmed order, the ticket shows a mint-tinted confirmation strip, then labelled groups in `glass-inset` boxes (executed, still locked, in your wallet), so these four quantities are never merged. The trade list, My orders and transaction page reuse the existing table and chip patterns: pill side badges that always carry the word Buy or Sell, a neutral status pill (Resting, Partly filled, Filled), mono hash links in lilac, and the same `Amount` pattern for every figure.

### Brand mark
Two interlocking ribbons in a lilac to azure gradient (#dccbff, #8a6cf5, #5f8dff and #7aa8ff, #7c5cf2) with a violet drop shadow (`0 2px 10px rgb(146 107 255 / 0.6)`), followed by the wordmark "SC4053 DEX" in Brand type with "DEX" in lilac.

### Motion
Motion is minimal and functional: colour and background transitions on interactive elements (about 150ms), a 1px press translate on buttons, and a pulse on the loading wallet pill. There are no entrance animations. `prefers-reduced-motion: reduce` collapses all animation and transition durations.

## Do's and Don'ts

### Do:
- **Do** preserve the approved P2-4 look in every later phase; extend it with the same glass levels, radii and type.
- **Do** build new panels with `glass`, rows and cards with `glass-raised` or `glass-inset`, and selections with `glass-active`.
- **Do** show amounts through the `Amount` pattern (tabular, exact, dimmed tail) and prices with the contract's real precision.
- **Do** pair buy and sell colours with the words Buy and Sell.
- **Do** keep the focus-visible ring (2px Focus Lilac, 2px offset) and the 11px text floor.
- **Do** mark unbuilt features as disabled with a plain "Soon" or "Coming soon" label, and say what is true in empty and error states.
- **Do** give every wallet request the one pending notice, with its recovery steps after 20 seconds, and word it as "where to look", never as something the page can detect.
- **Do** label a primary button with the action it will perform, and keep each wallet request a separate explicit click.
- **Do** use IBM Plex Mono for addresses and hashes only.

### Don't:
- **Don't** redesign, re-theme or add a light mode; the approved design is dark-only.
- **Don't** show a USD value, a 24h change, a price history or any figure the contracts and `Trade` events cannot produce.
- **Don't** make a disabled or unbuilt control look functional, and do not add a cancel control while the engine's `cancelOrder` reverts.
- **Don't** convey buy or sell, or any status, by colour alone.
- **Don't** round chain values for display or use floating-point arithmetic for token amounts.
- **Don't** add tracked uppercase eyebrow labels above headings.
- **Don't** introduce a fifth glass level, a second typeface or a new accent colour without approval.
- **Don't** let figures or table text glow; reserve glow for the frame, the wave and the active selection.
- **Don't** classify a pending stop-limit order as part of the live book in any visual treatment.
