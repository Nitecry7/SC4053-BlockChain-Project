# 32: Hyperliquid API docs, tick and lot size, rate limits and user limits (grey literature)

## 1. Verified citation (IEEE style)
Hyperliquid, "Tick and lot size," Hyperliquid Docs (For developers, API). [Online]. Available: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/tick-and-lot-size (accessed Nov. 17, 2026).
Hyperliquid, "Rate limits and user limits," Hyperliquid Docs (For developers, API). [Online]. Available: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits (accessed Nov. 17, 2026).
- Checked against: saved HTML docs/term-paper/papers/32-hyperliquid-docs.html and 32-hyperliquid-ratelimits.html (canonical URLs as above; saved 2026-11-17 per file timestamps). Tick page shows "Last updated 1 year ago"; rate-limit page shows "Last updated 4 days ago" (relative to the save date). Both HTML files carry a site-level `updatedAt` of 2026-11-14T07:31:46Z, which matches "4 days ago" for the rate-limit page but is likely the site build time, not the tick page's edit date.
- Version read: live GitBook pages as saved on 2026-11-17. Published version: living vendor documentation; no fixed version.
- Differences between what I read and the published version: none applicable; pages can change at any time (rate-limit page edited within days of saving).
- Fields NOT verified: no named author (corporate author "Hyperliquid"); exact edit date of the tick page.
- Peer review status: grey literature (vendor documentation).
- Context: Hyperliquid runs its own L1 (HyperCore order book; HyperEVM is listed separately in the page navigation), so these are protocol and API rules, not rules of an EVM smart-contract order book.

## 2. Findings
| # | Finding (own words) | Pointer |
|---|---|---|
| 1 | Prices: up to 5 significant figures and at most MAX_DECIMALS minus szDecimals decimal places (MAX_DECIMALS 6 for perps, 8 for spot); integer prices always allowed. | Tick and lot size, first section |
| 2 | Sizes are rounded to the asset's szDecimals (e.g. szDecimals = 3 allows 1.001 but not 1.0001); szDecimals comes from the info endpoint meta response. | Tick and lot size, first section |
| 3 | Per-IP: REST weight limit 1200 per minute; exchange actions weigh 1 + floor(batch_length / 40). | Rate limits, IP section |
| 4 | Per-IP websocket caps: 10 connections, 30 new connections per minute, 1000 subscriptions, 2000 messages per minute, 100 inflight post messages. | Rate limits, IP section |
| 5 | Address-based: 1 request per 1 USDC traded cumulatively since address inception; initial buffer 10000 requests; when limited, one request every 10 seconds; cancels get a higher cap min(limit + 100000, limit * 2). | Rate limits, "Address-based limits" |
| 6 | Open orders: default 1000 per user plus one per 5M USDC volume, capped at 5000; with at least 1000 open orders, new reduce-only or trigger orders are rejected. | Rate limits, "Address-based limits" |
| 7 | Under congestion, addresses are limited to their previous day maker share of block space. | Rate limits, "Address-based limits" |
| 8 | A batch of n orders counts as one request for IP limits but n requests for address limits. | Rate limits, "Batched Requests" |
| 9 | A minimum order value (e.g. 10 USDC) is NOT stated on either page: not found in the pages read. | both pages |

## 3. Mapping to considerations and mitigations
| # | Supports | Directness | Why |
|---|---|---|---|
| 1 | background (tick rule) | analogous | Production venue enforces a price grid, like our TICK_SIZE. |
| 2 | M1, C4 | analogous | Lot granularity per asset, like our LOT_SIZE; a grid, not a minimum value. |
| 3 | C4 | analogous | Off-chain request throttling against spam; no equivalent possible in a public contract. |
| 4 | C4 | background | API-level; not transferable. |
| 5 | C4, M1 | analogous | Ties order-spam allowance to traded volume: an economic anti-spam rule. |
| 6 | C4, M8 | analogous | Per-user cap on resting orders limits dust walls from one account (sybil accounts each get their own cap, since sub-accounts are separate users). |
| 7 | C4 | background | Congestion rationing depends on a custom L1. |
| 8 | C4 | background | Clarifies how batching is charged. |
| 9 | M1 | direct (as a gap) | Cannot cite these pages for a minimum notional rule. |

## 4. Limits for an on-chain order book
- Hyperliquid is its own L1; limits are enforced by the protocol and API front end, not by an EVM contract with public calls.
- Per-IP limits do not exist on a public EVM chain; anyone can call OrderBook.sol directly.
- Per-address limits are sybil-prone on a permissionless chain (new addresses are free); Hyperliquid's volume-linked allowance partly addresses this, but the docs do not discuss sybils.
- No minimum notional is stated in these two pages, so M1 (minimum order size) is not supported by them.

## 5. Gap question answered
- Question(s): c.
- Answer from this source: documents a price tick rule (5 significant figures, decimal cap) and a size lot rule (szDecimals) (Tick and lot size); per-IP and per-address rate limits, with the address allowance tied to volume traded (1 request per 1 USDC, 10000 initial buffer); an open-order cap of 1000 rising to at most 5000 (Rate limits, "Address-based limits"). Minimum order value: not found in the pages read.
- Strength: moderate as evidence that a production order book DEX uses tick/lot grids, open-order caps and volume-linked rate limits; grey literature (vendor docs), documented rules not measured effects, and an app-specific L1, not an on-chain contract book.

## 6. One quote (optional, max one sentence)
> "Each user has a default open order limit of 1000 plus one additional order for every 5M USDC of volume, capped at a total of 5000 open orders." (Rate limits, "Address-based limits")
