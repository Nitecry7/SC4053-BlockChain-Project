# Proofreading report (report only, no files changed)

Paper: `docs/term-paper/paper/overleaf/` (source) and `build/SC4053_term_paper_draft.pdf` (6 pages, commit 201e6b8).
Line numbers refer to the source files as committed. "Meaning?" says whether the fix could change what the sentence
claims.

Method:
- chktex 1.7.9 (MiKTeX, already installed) on `main.tex`, each file in `sections/`, and also `tables/` and `figures/`.
- A fresh proofreading subagent read every printed sentence of the PDF and source (spelling, grammar, punctuation,
  duplicated words, ambiguity).
- Scripted checks for term consistency, British vs American spelling, abbreviations, numbers, cross-references and
  headings, plus a read of the rendered reference list.

**Page budget warning:** the paper fills 5.95 of 6 pages. Several fixes below add a few words (marked "+len"). Applying
all of them may push the appendix onto page 7; re-measure after editing.

## 1. chktex

| Warning | Count | Where | Verdict |
|---|---|---|---|
| W12 interword spacing after "et al." | 13 | `02` lines 12, 16, 17, 18, 19, 25, 27, 35, 42; `03` lines 47, 76; `04` lines 44, 53 | **Real.** LaTeX treats "al." as a sentence end and adds extra space. Fix: `et al.\ ` (or `et~al.\ `) |
| W13 intersentence spacing | 4 + 1 | `main.tex` 23, 24, 29, 30 ("TODO:"); `tables/mitigations.tex` 18 ("W;") | False positive |
| W1 command terminated with space | 1 | `main.tex` 67 (`\raggedright` at line end) | False positive |
| W18 straight quotes | 2 | `main.tex` 68, inside `\texttt{... "test/termpaper/*" ...}` | False positive (a shell argument must use straight quotes) |
| W8 wrong dash length | 2 | `main.tex` 68, the ISO date 2026-11-25 | False positive (hyphens in a date); see 5.4 for date style |
| W38 punctuation before quote | 1 | `03` line 82, "et al.'s" | False positive (possessive apostrophe) |
| W24 space before label | 3 | `tables/*` line 8, `figures/fig1-sandwich.tex` 38 | False positive (label on its own line inside a float) |
| W31 text may be ignored | 1 | `figures/fig1-sandwich.tex` 36, `}` closing `\resizebox` | False positive |
| W2 non-breaking space before cite | 6 | `tables/mitigations.tex` 19 to 24 (`\cite` at the start of a table cell) | False positive |

## 2. Language (grammar, punctuation, ambiguity, spelling)

| # | File:line | Problem | Proposed fix | Meaning? |
|---|---|---|---|---|
| L1 | `01`:11 | "...the maker, which makes it a limit order book": "which" seems to refer to the maker, "it" has no antecedent; missing comma before "and" joining two clauses | "Traders quote their own prices, and each trade settles at the price of the order already resting in the book, the maker; this makes each market a limit order book rather than an automated market maker (AMM)." | No |
| L2 | `01`:16 | "...as deterministic tests, a fill-cap sandwich, a stop hunt, ..." reads as a five-item list | "...as deterministic tests (a fill-cap sandwich, a stop hunt, a stop snipe that fits in one transaction and a dust wall that blocks one side of the book; Sec. III);" | No |
| L3 | `01`:17 | Appositive then ", and measure" parses as a list; "change and leave" lacks an object | "...in a research copy of the engine (a modified copy kept only for experiments) and measure what they change and what they leave open, including..." (+len) | No |
| L4 | `02`:19 | Brand spelled "Sushiswap" | "SushiSwap" | No |
| L5 | `02`:27 | "count 28 ... incidents ..., and few academic papers on price oracle attacks": "count" governs both objects | "..., and note that few academic papers study price oracle attacks~\cite{...}" (+len) | No |
| L6 | `02`:34 | "It pays for this in throughput" follows "our engine keeps cancellation", so "It" reads as our engine | "Lissy pays for this in throughput: ..." | No (removes a misreading) |
| L7 | `03`:38 | "$K$ ... is an order of magnitude" is garbled | "...and is only an order-of-magnitude estimate, since..." (+len) | No |
| L8 | `03`:43 | Dangling modifier "valuing the $10^{-8}$ base she sold at 1.5" (attaches to the keeper call) | "...worse off when the $10^{-8}$ base she sold is valued at 1.5 (...)" | No |
| L9 | `04`:38 | "among such incidents": no antecedent in this paragraph | "among decentralized finance incidents (Sec. II-B)" (DeFi is no longer defined in the text, so spell it out) | No |
| L10 | `04`:60 | Garden path: "untouched by M1 and M2 and C3's residual effect" | "Second, M6 and M7 for stops, since M1 and M2 leave C2 untouched, and C3's residual effect, the cancelled stop, needs a better activation rule; ..." | No |
| L11 | `main.tex`:41; `05`:5 | (a) "but alone turns" can read as "only turns"; (b) tense switch: "removes/turns" (present) vs "bounded" (past) in one sentence | (a) "but, used alone, turns"; (b) pick one tense for both measured results, e.g. "bounds" | No (tense is editorial). Abstract is at 179 of 180 words: "used alone" adds 1 word, so drop one elsewhere (+len) |
| L12 | `05`:8 | (a) serial comma ", and" while the rest of the paper uses none; (b) list not parallel ("build and measure ... a minimum-size sweep") | "Future work: build and measure the stop-hardening options and the clearing of crossings before a new order takes (M3), and run a minimum-size sweep." | No |
| L13 | `tables/experiments.tex`:7; `tables/mitigations.tex`:7 | Multi-sentence captions whose last sentence has no full stop (Fig. 1 caption does end with one) | Add a final "." to both captions | No |

No findings: duplicated words (also checked in the PDF text), subject-verb agreement, articles, semicolon or colon misuse,
mismatched parentheses, spacing around punctuation, unresolved "??" references or citations.

## 3. Spelling consistency (British vs American)

The paper mixes conventions: American "-ize" (decentralized, decentralization, monopolizing) with British "defence",
"summarises", "Acknowledgement" and doubled-l "cancelled/cancelling". IEEE house style is American. Proposed (all
"Meaning? No"):

| File:line | Now | American (IEEE) |
|---|---|---|
| `02`:37 (run-in label), 38, 43 | Defences, defence, defences | Defenses, defense, defenses |
| `04`:5 | summarises | summarizes |
| `main.tex`:57 | Acknowledgement of AI Use | Acknowledgment of AI Use |
| `main.tex`:41; `05`:5 | cancelling | canceling |
| `03`:14; `04`:60 | cancelled | canceled |

"cancellation" is correct in both conventions. The proofreading subagent instead suggested Oxford spelling (keep
defence and cancelled, change only "summarises"); either is acceptable if applied consistently, but IEEE expects American.

## 4. Terms, abbreviations and capitalisation

| # | File:line | Problem | Proposed fix | Meaning? |
|---|---|---|---|---|
| T1 | `tables/mitigations.tex`:20 | "Commit-reveal" in Table II vs "commit and reveal" in the text | "Commit and reveal, ordering" (check column width) | No |
| T2 | `03`:37 | "ETH" never spelled out | "the dollar price of ether (ETH)" | No |
| T3 | `01`:9 | "ERC-20" not explained | "...fixed-supply tokens following the ERC-20 token standard" (+len); optional, ERC-20 is widely known | No |
| T4 | `main.tex`:38 to 42 (abstract) | "keeper", "quote", "base" and "research copy" are used before Section III defines them; IEEE abstracts should stand alone | e.g. "pays 5.0 extra quote tokens", "no keeper (a third party that clears the book) can interrupt"; abstract is at 179 of 180 words, so trade words elsewhere | Possibly, if the trade-off drops a qualifier; check against VERIFICATION_REPORT |
| T5 | consistent, no fix | "order book" (noun) vs "order-book DEX" (adjective); "on-chain" (adjective) vs "on chain" (adverb); "layer-two chain" vs "a layer two"; "front-running", "back-run", "stop-limit", "self-trade" | none | n/a |
| T6 | consistent, no fix | Headings use title case throughout; run-in labels consistently end with a full stop | none | n/a |
| T7 | `03`:9, 11, `main.tex` | C, E and M labels are defined in the Notation paragraph; E11 is defined but never used in the text | optional: drop "E11 the gas break-even model" or cite it where $K$ is introduced | No |

## 5. Numbers, units, cross-references and IEEE conventions

| # | File:line | Problem | Proposed fix | Meaning? |
|---|---|---|---|---|
| N1 | `03`:27 | Sentence starts with "Fig.~\ref": IEEE spells out "Figure" at the start of a sentence | "Figure~\ref{fig:sandwich} traces..." | No |
| N2 | 14 places, all sections | "Sec.~\ref{...}": IEEE style normally writes "Section~\ref{...}" in running text | Replace "Sec." with "Section" (+len, about 14 short additions) | No |
| N3 | `02`:19 | "174.34M USD" vs "100 USD" elsewhere; IEEE prefers "USD 174.34 million" or "\$174.34 million" | "...which earned the attackers USD 174.34 million in all" | No |
| N4 | `main.tex`:68 | ISO date "2026-11-25" while the text elsewhere writes "April 2018", "March 2023" | "on Nov. 25, 2026" (IEEE date style) | No |
| N5 | consistent, no fix | Thousands separators (`{,}`), "\%" with no space, "ms", "base"/"quote" units, Table I and Table II, Fig. 1 references all resolve | none | n/a |
| N6 | `main.tex`:65 | Appendix heading "Appendix: Reproducing Table I" (merged to save a line) instead of IEEE `\appendix` + "Appendix" | Keep (deliberate, saves space) or restore `\appendix` if space allows | No |

## 6. Reference list (as rendered in the PDF)

| # | Entry | Problem | Proposed fix | Meaning? |
|---|---|---|---|---|
| R1 | [7] Daian et al. | IEEEtran lowercases the title: "Flash boys 2.0" (the paper's title is "Flash Boys 2.0") | Brace the words in the bib: `{Flash Boys} 2.0` | No |
| R2 | [3], [6], [19] (LNCS) | Series and publisher given, editors omitted (only [19] had editors, removed to save space) | Consistent as is; optional: add editors to all three or none | No |
| R3 | [4], [9], [13], [16] | Publisher "ACM" printed; IEEE S&P entries [5], [7], [8], [10], [11] and USENIX [15] have no publisher | Optional: add "IEEE"/"USENIX Association" or drop "ACM" for uniformity | No |
| R4 | all | No DOIs printed (IEEEtran default ignores the `doi` field in this setup) | Optional: enable DOI printing; costs space | No |
| R5 | [1] | Repository URL breaks across lines at "/tree/"; fine | none | n/a |
| R6 | consistent, no fix | Author initials, "and" before last author, sentence-case titles with protected acronyms (SoK, MEV, DeFi, Ethereum), "pp." ranges, numbered order of first citation | none | n/a |

Note: the PDF text extraction showed "B´eres" and "Highfrequency"; these are extraction artefacts of an accented
glyph and a line-end hyphen, not errors in the PDF.

## Summary

| Category | Real issues | False positives |
|---|---|---|
| chktex | 13 (et al. spacing) | 21 |
| Language | 13 (L1 to L13), no typos | |
| British/American mix | 5 locations (9 words) | |
| Terms and abbreviations | 4 (T1 to T4), 1 optional (T7) | |
| Numbers, refs, IEEE style | 4 (N1 to N4), 1 optional (N6) | |
| Reference list | 1 (R1), 3 optional (R2 to R4) | |

None of the proposed fixes changes a claim, except possibly T4 (the abstract is at its word limit, so adding definitions
there means removing other words). Highest value, lowest risk: L1, L5, L6, L7, L8, L10 (sentences a reader could
misparse), the et al. spacing, L4 (SushiSwap), R1 (Flash Boys), and one spelling convention.

## Applied (commit "Term paper: proofread fixes")
Every definite fix marked "Meaning? No" was applied:
- chktex W12: all 13 "et al." spacings (`et al.\ `); chktex now reports 0 W12.
- Language: L1 to L13 (L11 tense set to present, "bounds", in both abstract and conclusion; abstract now 180 words).
- Spelling: American throughout (defense, defenses, summarizes, Acknowledgment, canceling, canceled).
- Terms: T1 (Commit and reveal in Table II), T2 (ether (ETH)), T3 (ERC-20 token standard), T7 ("(E11)" cited where K is defined).
- IEEE: N1 (Figure at sentence start), N2 (all 14 "Sec." to "Section", plus "Secs." to "Sections"), N3 (USD 174.34 million), N4 (Nov. 25, 2026).
- References: R1 ({Flash Boys} braced in both bib files).
- Layout side effect: "Commit and reveal" made Table II 6pt too wide; column padding reduced from 3pt to 2.3pt (no text change).

Recompiled (pdflatex, bibtex, pdflatex x2): 6 pages, about 5.98 page-equivalents, 0 errors, 0 overfull boxes,
0 undefined references, 0 BibTeX warnings. `build/SC4053_term_paper_draft.pdf` and `build/overleaf.zip` refreshed.

## Left for the authors to decide
| Item | Why not applied |
|---|---|
| T4 abstract definitions of keeper, quote, base, research copy | Could change meaning: the abstract is at 180 of 180 words, so adding definitions means dropping other words, possibly a qualifier |
| R2 LNCS editors | A choice: add editors to [3], [6], [19] (longer) or leave all three without (current) |
| R3 publisher field | A choice: add IEEE/USENIX publishers to match the ACM entries, or drop "ACM" from [4], [9], [13], [16] |
| R4 DOIs | A choice: enable DOI printing (costs space; the paper has about 0.02 page left) or keep the IEEEtran default |
| N6 appendix heading | A choice: keep the merged "Appendix: Reproducing Table I" (saves a line) or restore IEEE `\appendix` |

## IEEE conference template conformance (applied after the proofread fixes)
Checked against the IEEE conference template source on Overleaf
(https://www.overleaf.com/latex/templates/ieee-conference-latex-template/hkfsmxcvymyk). IEEE's own templates page
returned an empty response and could not be checked.

| Template rule | Change |
|---|---|
| "Use the abbreviation Fig.~\ref{fig}, even at the beginning of a sentence" | Reverted proofread fix N1: "Figure 1 traces" back to "Fig. 1 traces" (N1 was wrong for this template) |
| No symbols, special characters or math in the title or abstract | Abstract: "$10^{9}$-round" to "billion-round", "33%" to "33 percent"; "the gas a defender needs" to "the gas needed" to stay within 180 words (now 179) |
| Figure labels in 8 point | Fig. 1 keeper note raised from 7 pt to 8 pt and split over two lines; steps 3 and 4 moved down |
| Sub-titles should not be used | Title "Bounded Loops, Open Books: Economic Security of a Fully On-Chain Limit Order Book" to "Economic Security of a Fully On-Chain Limit Order Book with Bounded Loops and Open Books" (same words, no colon) |
| Author fields: dept., organization, City, Country, email | Added "Singapore"; department and organization in italics as in the template; matriculation-number and email placeholders kept |
| No abbreviations in headings unless unavoidable; heading "Acknowledgment" | Headings no longer carry C, M or AI labels; the C1 to C6 names are given in the Notation paragraph, and IV-A and IV-B name the labels in their first sentence; heading is now "Acknowledgment" |

Space: these changes added about seven lines and pushed the appendix onto page 7. Recovered by shortening words
only, with no claim, hedge or open point removed: scope sentence ("did not deploy publicly and had no external
audit"), "open problem", "already public", "None is implemented", "futures and equity markets", "makes the victim the
maker", "E10 assumes Mallory sees every resubmission", and the two placeholders ("TODO: how artificial intelligence
tools were used", "TODO: public commit of the branch").
Final compile: 6 pages (US Letter), 0 errors, 0 overfull boxes, 0 undefined references; the last page is full, so
any further addition needs a matching cut.
