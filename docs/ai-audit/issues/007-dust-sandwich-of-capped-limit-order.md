# Issue 007: an honest limit order can be sandwiched through the fill cap (accepted limitation)

- **Date:** 2026-11-08
- **Phase:** 8 (final independent audit, finding M-1)
- **Found by:** The final independent audit. A fresh subagent with no session context confirmed it with a proof of concept in a scratch copy. The main session reproduced it in the repo.
- **Severity:** Medium (economic). No escrow is stolen and solvency holds, but a victim can be made to pay up to their own limit price instead of the best available price.
- **Status:** **Accepted by design, documented, behaviour pinned by a test.** The human decided on 8 Nov not to change the engine at the end of the project. Unlike issues 001 to 006, there is no code fix.

## 1. Why the AI made the mistake
The AI, and the human decisions it implemented, treated two behaviours as separate, acceptable limitations:
- **O4:** a placement that hits `MAX_MATCHES_PER_TX` rests its remainder, even when it still crosses. `matchOrders` clears that later.
- **Dust griefing:** one-lot orders cost almost nothing and can use up a taker's fills.

Each one was analysed alone. The section 8 entry for the composed attack, "stop sniping", was written for stop orders only. The AI did not ask whether an attacker could *cause* the crossing on purpose against an ordinary limit order, then trade against the victim at the victim's own limit before anyone calls `matchOrders`. It reasoned about each limitation's direct effect, not about what an adversary can build from the two together.

## 2. Why it is problematic
**Real-world impact:** an attacker who sees a buy in the mempool front-runs it with `MAX_MATCHES_PER_TX` one-lot asks just below the best ask.
- The buy's 10 fills are spent on the dust, and its remainder rests crossed **at its limit price**.
- The attacker then sells into it at that limit, as it is now the maker, and buys the honest ask more cheaply.

In the reproduction:
- Carol (limit 2.0, against Bob's ask at 1.5) paid 20e18 − 5.01e9 quote for 10 base instead of 15e18.
- The attacker made 5e18 − 5.01e9, at a cost of gas plus 10 lots.
- Any limit order with a loose limit price is exposed. The mirror attack works on sells.

The loss is bounded by the victim's own limit, and no escrow is stolen. A8 solvency and list integrity hold throughout.

## 3. How we fixed it
**Not fixed in code (human decision, 8 Nov).** Three engine changes were considered:
- clear any crossing before a new order matches
- do not rest a remainder that still crosses after the cap (cancel and refund it)
- a minimum fill size

Each one changes O4 or the dust rules, existing tests, the factory bytecode and the frontend's expectations. They were judged too risky to make at the end of the project.

What was done instead:
- **SPEC.md section 8:** a new entry describing the composed attack, its cost, its bound and the mitigations not built.
- **Regression test** `test_issue007_dustSandwichMakesAHonestBuyPayItsLimit` (`contracts/test/OrderBook.Regression.t.sol`). It reproduces the attack and **pins** the documented outcome to the wei. Any future change to this behaviour must therefore be deliberate, and must update the test.
- **`docs/ENGINE_HANDOFF.md`:** advice for the UI to suggest tight limit prices.

## 4. Evidence
There is no before-and-after pair, because the behaviour is accepted rather than fixed. The evidence is the reproduction, run in this session on the engine as it is (`contracts/src` unchanged since `1adcc59`):
```
[PASS] test_issue007_dustSandwichMakesAHonestBuyPayItsLimit() (gas: 6238758)
Suite result: ok. 1 passed; 0 failed; 0 skipped; finished in 7.00ms (4.33ms CPU time)
```

The test asserts:
- all 10 of Carol's fills went to dust
- her remainder rests crossed (best bid > best ask)
- Carol paid `20e18 - 5.01e9` for 10 base
- Bob sold his 10 at 1.5
- the attacker's net base is 0 and its net quote is `+5e18 - 5.01e9`
- `assertSolvent` and `assertBookSorted` hold

These figures match the auditor's independent proof of concept (Carol paid 19.99999999499; the attacker gained 4.99999999499).
