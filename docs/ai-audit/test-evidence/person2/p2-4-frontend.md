# P2-4 evidence: Next.js foundation, wallet integration, design system

Date: 2026-11-05. Branch `faheem` at `f13284c` plus uncommitted P2-4 files.
- **Model:** planning was done by Sonnet 5.5; design and implementation by **Opus 5.5 (Medium)** after you switched with `/model opus`.
- **Environment:** WSL2 Ubuntu 26.04, Node 26.13, npm 11.20.

**Scope of this evidence.** Automated tests, builds, and real-browser renders in Playwright Chromium (headless) against a scratch Anvil (port 8546) seeded with real orders through `cast`.
- **No MetaMask, wallet-extension or transaction flow was verified.** The browser has no wallet, and P2-4 sends no transactions.
- The owner's Anvil (8545) was read but never written to (block 0 before and after). The owner's own `next dev` on port 3000 was left running and untouched.

## Automated checks (final run)
| Command (in `web/` unless noted) | Result |
|---|---|
| `npx vitest run` | `Test Files 6 passed (6) · Tests 69 passed (69)` |
| `npx tsc --noEmit -p .` | no errors |
| `npx eslint .` | no problems (one earlier a11y warning fixed: `aria-disabled` on a list item) |
| `npm run build` | `✓ Compiled successfully`; routes `/`, `/markets`, `/tokens` prerendered static |
| `cd contracts && forge test --root .` | `185 tests passed, 0 failed` (unchanged; no contract was edited) |
| `node --test contracts/script/export-web.test.mjs` | `pass 21, fail 0` (unchanged) |
| `requiredQuote` parity: TypeScript vs the deployed OrderBook (`cast call`, scratch Anvil) | 50 cases (the SPEC example, rounding edges, 2^128 × 2^100, 45 seeded random): **0 mismatches** |
| Response headers (`curl -I`, production build) | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`; no `X-Powered-By` |
| Client bundle scan (`.next/static`) | no private key, mnemonic or `PRIVATE_KEY` string. The 64-hex strings are library constants only |
| Env vars referenced in app source | only `NEXT_PUBLIC_RPC_URL` and `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` |
| Wallet-mutating calls in app source | none: no `writeContract`, `sendTransaction` or `sign*`. The one wallet request is the user-initiated `switchChain` to Anvil |
| `npm audit` | 42 advisories (0 critical, 17 high, 22 moderate, 3 low), all transitive under the wallet stack or tooling. `npm audit fix --dry-run` without `--force` changes nothing; every fix needs wagmi 3, which RainbowKit 2 does not support. **Accepted and documented** in `docs/FRONTEND.md` |

### Mutation checks (originals restored, `diff` clean)
All 9 mutants were caught:
- U1 `requiredQuote` floors
- U2 decimals limit off by one
- U3 regex allows `5.`
- U4 `splitAmount` rounds
- U5 lot check with a zero step
- N1 wrong network treated as ready
- N2 code `"0x"` not treated as missing
- N3 case-sensitive token comparison
- C1 the `YOUR_PROJECT_ID` placeholder passed through

## Version and compatibility findings (verified, not assumed)
- RainbowKit 2.2.11 peers `wagmi ^2.9.0`, so wagmi is pinned to `^2.19.5` (npm registry).
- **ESLint 10 would break lint.** `eslint-config-next` → `eslint-plugin-react`, whose peer range is `^3 … ^9.7`. Pinned ESLint 9.39.5, which npm reports as out of support.
- TypeScript 7.0.2 is the latest but a new major, so 5.9.3 is pinned.
- **RainbowKit without a WalletConnect id (spike, read from the installed source):**
  - `getWalletConnectConnector` throws `No projectId found` on an empty id, and silently substitutes RainbowKit's example project for `"YOUR_PROJECT_ID"`.
  - `metaMaskWallet` uses WalletConnect when no extension is injected. So with no id only `injectedWallet` is registered, and the placeholder is treated as unset.
- **viem's `foundry` chain has no Multicall3.** wagmi's docs say `readContracts` then falls back to per-call `readContract`. Confirmed empirically: the rendered dashboard shows the live market, tokens and book from `useReadContracts` on Anvil.
- **Build failure from optional peers:**
  - Turbopack failed with 8 `Module not found: @x402/...` errors.
  - Traced: wagmi 2.19.5 → @wagmi/connectors 6.2.0 → @base-org/account 2.4.0 → @coinbase/cdp-sdk 1.60.0, whose `@x402/*` packages are declared **optional** peers.
  - Fix: alias exactly the five failing specifiers to a stub whose exports throw only when called (unit-tested).
  - Rejected alternatives: installing an unused payment SDK, or overriding transitive versions.

## Real-chain data used for the renders (scratch Anvil 8546, `cast send --unlocked`)
- **Seeded book:** fresh deploy (`Deploy.s.sol`, same deterministic addresses as `deployments.ts`; `export-web.mjs --check` up to date). Approvals from accounts 1–3, then:
  - asks 120 @ 2.00, 80 @ 2.05, 150 @ 2.10;
  - bids 100 @ 1.90, 140 @ 1.85, 60 @ 1.80;
  - one crossing buy of 40 @ 2.00 (one real trade, partly filling the 2.00 ask).
  - Every transaction returned status `0x1`.
- **Chain read-back:** best bid 1.9, best ask 2.0, last trade 2.0.
- **The UI shows the same numbers, and they add up:**
  - spread 0.1000 SGDx;
  - 1 trade, base volume 40.00 NTU and quote volume 80.00 SGDx (40 × 2.0);
  - the 2.00 ask shows 80 remaining (120 − 40);
  - max depth 310 NTU (asks 150 + 80 + 80);
  - lot and tick 0.000000001.

## Browser verification (Playwright Chromium, headless)
- **How it ran:** the Playwright MCP's own tools could not launch. It is configured for the Google Chrome channel at `/opt/google/chrome`, and installing that needs root. Instead, the MCP's bundled Playwright library (1.65.0-alpha) drove the approved Chromium directly (`chromium-1252`, installed with that library's own CLI). Its missing NSS libraries (`libnss3`, `libnspr4`) came from official Ubuntu packages fetched with `apt-get download`, unpacked into the session scratchpad and loaded through `LD_LIBRARY_PATH`. There was no system change and no sudo.
- **Viewports:** desktop 1586×992 (the reference screenshot's size), tablet 768×1024, mobile 375×812.
- **Per render:** screenshot, console errors and a horizontal-overflow probe.

| Pass | What was seen against the reference | What changed |
|---|---|---|
| 1 | Composition matched. Depth drawn as diagonals instead of steps; Trades column clipped; glass too flat and dark; weak hero glow; wallet card showed "?"; holdings dead area when disconnected; order fields overflowed (`fieldset` min-content); sidebar label wrapped; on mobile the hero wave stretched through the text and there was 1px of overflow | — |
| 2 | Impeccable craft-floor and detector input folded in | Stair-step depth; board columns fit; richer glass (top-left light, violet tint, firmer edge, deeper shadow); stronger hero glow; wave confined to a band; **eyebrow removed (craft-floor ban)**; wallet icon; Connect call to action in Holdings; `fieldset min-w-0`; themed selection, caret and scrollbar |
| 3 | Sidebar wave and brand not in view (sidebar too tall); depth chart had no axes; Market board had a blank band; 1px mobile header overflow | Viewport-height sticky sidebar; real price and depth axis labels; spread shown as the screen's finding; market summary (spread, trades, base and quote volume); 11px text floor; non-wrapping chips; "Connect" on phones |
| 4 | Markets and Tokens pages mostly empty below one-row tables; wave still behind mobile text; Token balances blank band | Factory facts panels (real contract address and enforced rules); mobile wave dimmed; total supplies; book footnote (fixes the taste `panel-void` WARN) |
| final | Desktop is close to the reference in hierarchy, glass depth, lighting, wave hero, rounded geometry and spacing. **No horizontal overflow and no console errors on all 9 route × width renders** | — |

States verified in the browser:
- **No deployment** (pointed at the owner's fresh Anvil, read-only): an amber banner lists every missing contract, and the hero shows "No deployment on this chain".
- **Node unreachable** (RPC on port 9): a red banner, and nothing shown as live. 48 console lines in 2.5 seconds are the browser's own `ERR_CONNECTION_REFUSED` resource errors from polling a dead port, not app exceptions.

Kept screenshots (`p2-4-screens/`, 12 MB): `pass1-overview-*` (before), `final-{overview,markets,tokens}-{desktop,tablet,mobile}`, `state-{nodeploy,unreachable}-overview-desktop`. Intermediate passes were deleted to keep the repo small and are recorded in the table above.

## Design-skill tools and their verdicts
- **impeccable:** context loader run. `critique` was run in its documented **degraded single-context** mode, because it requires two sub-agents, which conflicts with the owner's "no extra agents by default" instruction for this phase. Assessment A was my own review, written before the detector ran. The detector (`impeccable detect --json web/app web/components`) found **0 findings**. Craft-floor items applied: the eyebrow ban and themed browser surfaces. The critique snapshot and end-of-run questions were skipped, again per the owner's instructions.
- **taste-skill `inspect.mjs --app`** (production build, approved Chromium): **4 FAIL, 6 WARN.**
  - **All 4 FAILs are the pinned brief and were kept:** `gradient`, `button-fx`, `palette-purple`, `heavy-shadow` (liquid glass, violet glow, premium shadows). The skill's existing-brand rule says to keep a mandated look and record it.
  - **WARNs:** `panel-void` was fixed. The others were defended:
    - `heavy-borders` measures the border colour without its 20% alpha;
    - `icon-chips` and the 40px `app-title-size` match the reference;
    - `ragged-row` (the right column against the left) is the reference's own composition;
    - `tiny-text` matches the reference's density, with an 11px floor.
  - The inspector was not re-run after the final footnote fix.

## Independent review (one Sonnet read-only subagent; no Opus agents)
Its run: vitest 64/64 and `tsc` clean. No High or Medium findings.

**Confirmed:**
- no write path;
- reads pinned to 31337;
- no cross-account leak (query keys include account and chain);
- only the two public env vars;
- the placeholder id can never pass;
- a sound bigint parser with no floating point.

**Fixed, with regression tests (69 tests now):**
- `requiredQuote` and `quoteCost` now throw where `mulDiv` would revert (a result or input beyond uint256).
- A reverting `baseToken()` is now classified as "not an OrderBook" instead of "node unreachable".
- An empty check list is no longer "ok".
- A token with other than 18 decimals is flagged on the Tokens page.

**Documented, not changed:**
- the deployment check is not a bytecode identity check (the exporter's is);
- trade-log rescan on each block;
- non-atomic reads without Multicall3;
- the alias is Turbopack-only.

## Limits
- No MetaMask, account-switching or wrong-network flow was exercised with a real wallet. A checklist for the owner is in `docs/FRONTEND.md`.
- Visual fidelity was judged by comparing screenshots against the reference by eye. No pixel-diff tool was used.
- Person 1 has not reviewed the factory-seeded market the UI reads.
