# Humanizer pass: changed sentences

Pass over the prose of `overleaf/sections/*.tex` and the abstract in `overleaf/main.tex` with the humanizer skill
(patterns numbered as in the skill). Rules kept: prose only; no change to `%` comments, `\cite`, `\ref`, `\label`,
numbers, code names, tables, the figure or `references.bib`; formal register and "we"; every hedge, the scope
statement, every "what remains open" clause and every defined term kept; no em or en dashes.

Result: the prose had already been through seven audits, so few tells remained. A scan for the skill's stock
words and staging phrases found only three "matters" openers; one further sentence lacked an actor. Four
sentences changed; none is longer than before. Left unchanged on purpose: the triads that are real (three
concerns, three parts, three contributions, three reasons), the "X, not Y" sentences whose negative half is a
hedge, "Neither change is complete on its own" (a what-remains-open clause), the abstract (179 words, no tell
found), and the run-in labels in Sec. IV that map to the template's per-solution requirements.

## 1. Section II-A, privacy sentence (`sections/02-motivation-survey.tex`)
Pattern: 4 staged run-up; 7 repeated opening ("X matters because" twice).

Before:

    Privacy matters because every order, limit and stop trigger is public, and public Ethereum activity lets an observer link one user's addresses: combining two embeddings of an address's position in the transaction graph shrank a user's anonymity set about threefold~\cite{src25beres2021}.

After:

    On privacy, every order, limit and stop trigger is public, and public Ethereum activity lets an observer link one user's addresses: combining two embeddings of an address's position in the transaction graph shrank a user's anonymity set about threefold~\cite{src25beres2021}.

## 2. Section II-A, scalability sentence (`sections/02-motivation-survey.tex`)
Pattern: 4 staged run-up; 7 repeated opening.

Before:

    Scalability matters because an on-chain book is expensive: in its worst case, with every order marketable, the call market Lissy (which matches all orders of a period at once) could close only 38 to 152 trades in one block under the July 2020 gas limit, depending on its data structure~\cite{src09moosavi2023}.

After:

    On scalability, an on-chain book is expensive: in its worst case, with every order marketable, the call market Lissy (which matches all orders of a period at once) could close only 38 to 152 trades in one block under the July 2020 gas limit, depending on its data structure~\cite{src09moosavi2023}.

## 3. Section II-B, Lissy comparison (`sections/02-motivation-survey.tex`)
Pattern: 4 staged run-up ("The difference matters:").

Before:

    The difference matters: our book is continuous, and each order is matched on arrival at the resting order's price, with earlier orders first among equal prices, so the order in which transactions land decides who trades with whom and who is the maker, which the fill-cap sandwich and stop snipe of Sec.~\ref{sec:analysis} exploit.

After:

    Our book differs because it is continuous: each order is matched on arrival at the resting order's price, with earlier orders first among equal prices, so the order in which transactions land decides who trades with whom and who is the maker, which the fill-cap sandwich and stop snipe of Sec.~\ref{sec:analysis} exploit.

## 4. Section III-D, C5 and C6 opener (`sections/03-observations.tex`)
Pattern: 11 missing actor; the hedge is kept.

Before:

    These two are reasoning from the code without an experiment.

After:

    We reason about both from the code; neither has an experiment.

## Re-audit (A numbers, B citations, D overclaims) on the four changed sentences
One fresh subagent checked all four against the notes and PDF pages: A, B and D pass, no must-fix. One should-fix
applied: sentence 4 first read "from the code alone", which conflicted with the [15] and [09] citations later in the
same subsection; "alone" was dropped (the After text above is the final version).
