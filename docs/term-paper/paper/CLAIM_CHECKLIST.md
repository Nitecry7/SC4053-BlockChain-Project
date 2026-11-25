# Claim checklist (run on day 4 for each other's sections, and again on day 6 for the whole paper)

Tick every box before submission. A failed box means fix the sentence, hedge it, or move it to Section VII.

## Numbers
- [ ] Every number in the paper appears in `../evidence/README.md`, `../evidence/COST_MODEL.md`, or a note in
      `../notes/` with a page reference. Write the pointer next to the sentence in a `%` comment in the .tex.
- [ ] Gas figures say they were measured with Foundry 1.8.6. Absolute gas differs from the inbox reference run;
      token amounts and the E6 overhead (+606, +26, +1071) are stable across both runs.
- [ ] Profits are described as before gas, or converted with `COST_MODEL.md` K plus gas and token prices that are
      stated and cited.
- [ ] E2 and E8 attacker gains are called paper gains marked at 2.0.
- [ ] Rounded numbers keep their meaning (for example 9.999999989 may be written as "about 10").

## Literature
- [ ] No AMM measurement ([03], [04], [05]) is stated as measured on order books. Use "on AMMs" or "analogous".
- [ ] Grey literature ([24], [31], [32], [33]) is labelled as such, or dropped.
- [ ] [11] Budish: no page numbers (only the 2013 draft was read).
- [ ] [14] and [17] are not cited (not read), unless their notes have been written after a manual download.
- [ ] Corrected summaries are used in their corrected form:
  - [ ] [04] "first to formalize and quantify sandwich attacks" (p. 1), not "first formal model".
  - [ ] [06] "few academic papers" on oracle attacks; numbers cover Ethereum and BSC, Apr 2018 to Apr 2022.
  - [ ] [12] self-trades are the majority of wash trades on EtherDelta only.
  - [ ] [24] "under a tenth of fees" for OP Mainnet only; Base paid 14%.
  - [ ] [07] sandwiches count as "technical" security under its definition.
  - [ ] [23] no public mempool makes extraction harder; it does not claim it causes MEV.
- [ ] At most one direct quote per source, with page.

## Evidence strength
- [ ] Every claim whose EVIDENCE_MAP row is "weak" or "none" is hedged ("we argue", "untested") or is in Section VII.
      Rows to watch: C5e, M3, M5d, M6, M7, M8b, M12, S6.
- [ ] C1 is presented as needing ordering control (E9 keeper test); C3 is presented as not needing it (E9 atomic).
- [ ] M2 is not presented as a fix on its own (E10: 1e9 rounds; E7: stop cancelled).
- [ ] M1 is not presented as fixing C2 (E8).
- [ ] No claim that keepers are slow or fast in practice (C6b has no timing data).

## Citations and format
- [ ] Every `\cite` key exists in `overleaf/references.bib`; no field from the UNVERIFIED FIELDS list is added
      without checking it.
- [ ] Only keys listed in `REFERENCES_FINAL.md` are cited; [35] Guidi is not cited (not read).
- [ ] Code is cited as `OrderBook.sol` line numbers at public `main` commit 8753521 (`contracts/src` identical to this branch, checked 2026-11-25).
- [ ] Page count 4 to 6 INCLUDING references (template rule, `../context/README.md`).
- [ ] AI-use disclosure, if the course requires one.
