# Stage 3: write the frame (Sections I, II, V, abstract, title) and finish the references

Read `prompts/00-RULES.md`, `paper/OUTLINE_V2.md`, `paper/REFERENCES_FINAL.md`, `paper/CLAIM_CHECKLIST.md`,
`paper/STAGE_LOG.md`, and the finished Sections III and IV. Open each note in `notes/` before citing its source.
The frame must promise only what Sections III and IV deliver.

## Section I. Introduction (budget in OUTLINE_V2)

The template asks for: a brief account of blockchain, the three concerns (security, privacy, scalability), what the
group built, and the chosen issue.
1. Two or three sentences on blockchains and decentralized exchanges, and the three concerns.
2. What we built: token factory, market factory, on-chain order book with partial fills, cancel, batch matching
   and stop-limit orders, wallet front end. It is an order book, not an AMM.
3. The chosen issue and the thesis in one sentence.
4. Contributions as three short items that match Sections III and IV exactly.
5. One sentence on scope: local chain, reproducible tests.

## Section II. Motivation and Literature Survey

II-A Motivation: argue why security outranks privacy and scalability for THIS DEX, using EVIDENCE_MAP part C
(rows S1 to S10). Give the other two a fair hearing in two sentences each, then show that the scalability bounds
and the public order data are what the attacks are built from.

II-B Survey, organised by theme and written critically, not as a list:
1. Front-running and extractable value: taxonomy, priority gas auctions, measurements. Say what is AMM-specific.
2. Economic security as distinct from contract bugs, and composition of individually safe features.
3. Order books on chain: cost, call markets, batch auctions as the market-design answer to speed races.
4. Defences against reordering and their costs: commit and reveal, fair ordering, encrypted mempools, sequencing.
5. The gap: what the surveyed work does not cover for a fully on-chain limit order book with bounded matching.
   Phrase it as "we did not find", supported by `notes/PHASE4_GAPS.md`.
For every source: one accurate statement of what it shows, and one clause on how far it transfers to our book.

## Section V. Conclusion

Four to six sentences: the issue, the two strongest measured results, the recommended fixes and their limits, one
line of future work. No new claims.

## Abstract, title, index terms

Abstract of 150 to 180 words, written last: system, issue, method, the headline numbers, the proposal, the scope
limit. Use the title chosen in stage 1. Five or six index terms.

## References

1. Cut `paper/overleaf/references.bib` down to the entries actually cited.
2. For each remaining entry resolve every item under UNVERIFIED FIELDS by looking it up on the DOI landing page or
   DBLP. If a field cannot be confirmed, remove the field. Never guess a page range or venue.
3. Cite the repository once, pinned to the commit stage 1 confirmed, plus the specific files only if space allows.
4. Check the cite order produces sensible numbering and that every key resolves.

## Optional appendix

Only if the template allows material after the references: half a column with the reproduction command, the
Foundry version, the commit, and the test names behind Table I.

## Before you finish

1. Add the `%` pointer comment to every line with a number or a literature claim.
2. Run `paper/CLAIM_CHECKLIST.md` over Sections I, II, V and the abstract. Fix every failing sentence.
3. Compile the whole paper. Report total pages and pages per section against the budget.
4. Commit and write the stage log.
