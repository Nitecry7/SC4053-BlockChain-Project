# Source index (Phase 2)

Downloaded 2026-11-17 with plain `curl -sSL` (no browser user agent, no cookies). Check per file: first bytes are
`%PDF` (or HTML for [24]), size is not an error page, and the title on PDF page 1 matches (checked with `pdftotext`,
page counts with PyMuPDF). PDFs and HTML in this folder are git-ignored; only this index is committed.
Full verified citations are in `../notes/NN-*.md` (Phase 3); the citation column here is what page 1 of the file shows.

Status key: **OK** = downloaded and checked. **OK (other copy)** = the URL in the task failed, a legal open copy was
used instead. **FAILED** = no copy obtained. **Library** = needs NTU library access.

| ID | Citation (as on page 1 of the file read) | URL used | Local file | Pages | Status |
|---|---|---|---|---|---|
| 01 | P. Daian et al., "Flash Boys 2.0: Frontrunning, Transaction Reordering, and Consensus Instability in Decentralized Exchanges", arXiv:1904.05234v1, 10 Apr 2019 | https://arxiv.org/pdf/1904.05234 | 01-daian-2020.pdf | 23 | OK (arXiv v1 preprint, not the S&P version) |
| 02 | S. Eskandari, S. Moosavi, J. Clark, "SoK: Transparent Dishonesty: Front-running Attacks on Blockchain", arXiv:1902.05164v3, 9 Apr 2019 | https://arxiv.org/pdf/1902.05164 | 02-eskandari-2019.pdf | 19 | OK |
| 03 | C. Ferreira Torres, R. Camino, R. State, "Frontrunner Jones and the Raiders of the Dark Forest: An Empirical Study of Frontrunning on the Ethereum Blockchain", arXiv:2102.03347v2, 3 Jun 2021 | https://arxiv.org/pdf/2102.03347 | 03-torres-2021.pdf | 17 | OK |
| 04 | L. Zhou, K. Qin, C. Ferreira Torres, D. V. Le, A. Gervais, "High-Frequency Trading on Decentralized On-Chain Exchanges", arXiv:2009.14021v1, 29 Sep 2020 | https://arxiv.org/pdf/2009.14021 | 04-zhou-2021.pdf | 18 | OK |
| 05 | K. Qin, L. Zhou, A. Gervais, "Quantifying Blockchain Extractable Value: How dark is the forest?", arXiv:2101.05511v5, 10 Dec 2021 | https://arxiv.org/pdf/2101.05511 | 05-qin-2022.pdf | 17 | OK |
| 06 | L. Zhou et al., "SoK: Decentralized Finance (DeFi) Attacks", arXiv:2208.13035v3, 7 Apr 2023 | https://arxiv.org/pdf/2208.13035 | 06-zhou-2023.pdf | 18 | OK |
| 07 | S. Werner et al., "SoK: Decentralized Finance (DeFi)" | https://arxiv.org/pdf/2101.08778 | 07-werner-2022.pdf | 17 | OK |
| 08 | K. Babel, P. Daian, M. Kelkar, A. Juels, "Clockwork Finance: Automated Analysis of Economic Security in Smart Contracts", arXiv:2109.04347v2, 18 May 2023 | https://arxiv.org/pdf/2109.04347 | 08-babel-2023.pdf | 46 | OK |
| 09 | M. Moosavi, J. Clark, "Lissy: Experimenting with on-chain order books", arXiv:2101.06291v3, 6 Oct 2021 | https://arxiv.org/pdf/2101.06291 | 09-moosavi-2021.pdf | 20 | OK |
| 10 | W. Warren, A. Bandeali, "0x: An open protocol for decentralized exchange on the Ethereum blockchain", 21 Feb 2017 | https://www.exodus.com/assets/docs/zrx-whitepaper.pdf | 10-warren-2017.pdf | 16 | OK (third-party mirror; no official 0x copy looked for beyond this, see note) |
| 11 | E. Budish, P. Cramton, J. Shim, "The High-Frequency Trading Arms Race: Frequent Batch Auctions as a Market Design Response", working paper dated 17 Sep 2013 | https://conference.nber.org/conf_papers/f69665.pdf | 11-budish-2015.pdf | 68 | OK (other copy: **2013 NBER conference draft, not the QJE 2015 version**). Published version: **Library** |
| 12 | F. Victor, A. M. Weintraud, "Detecting and Quantifying Wash Trading on Decentralized Cryptocurrency Exchanges", arXiv:2102.07001v1, 13 Feb 2021 | https://arxiv.org/pdf/2102.07001 | 12-victor-2021.pdf | 10 | OK (title differs from the task list) |
| 13 | C. L. Osler, "Stop-Loss Orders and Price Cascades in Currency Markets" | https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr150.pdf | 13-osler-2002.pdf | 44 | OK (title has "in Currency Markets") |
| 14 | T. Mackinga, T. Nadahalli, R. Wattenhofer, "TWAP Oracle Attacks: Easier Done than Said?", IACR ePrint 2022/445 | https://eprint.iacr.org/2022/445.pdf | none | n/a | **FAILED**: HTTP 403, Cloudflare page titled "Just a moment..." (bot challenge). No other open copy found (web search 2026-11-17). Open on ePrint, so a manual browser download should work |
| 15 | N. Grech et al., "MadMax: Surviving Out-of-Gas Conditions in Ethereum Smart Contracts" | https://pergamos.lib.uoa.gr/uoa/dl/object/2916884/file.pdf | 15-grech-2018.pdf | 27 | OK (other copy: University of Athens repository). Task URL https://doi.org/10.1145/3276486 redirects to dl.acm.org, which returned HTTP 403 |
| 16 | N. Atzei, M. Bartoletti, T. Cimoli, "A Survey of Attacks on Ethereum Smart Contracts (SoK)" | https://link.springer.com/content/pdf/10.1007/978-3-662-54455-6_8.pdf | 16-atzei-2017.pdf | 23 | OK (other copy: publisher open-access PDF of the POST 2017 chapter). Task URL on ePrint returned HTTP 403 (Cloudflare) |
| 17 | C. Baum, J. H. Chiang, B. David, T. K. Frederiksen, L. Gentile, "SoK: Mitigation of Front-running in Decentralized Finance", IACR ePrint 2021/1628 | https://eprint.iacr.org/2021/1628.pdf | none | n/a | **FAILED**: HTTP 403, Cloudflare challenge. Springer chapter is paywalled (**Library**). Open on ePrint, manual browser download should work |
| 18 | L. Heimbach, R. Wattenhofer, "SoK: Preventing Transaction Reordering Manipulations in Decentralized Finance", arXiv:2203.11520v3 | https://arxiv.org/pdf/2203.11520 | 18-heimbach-2022.pdf | 14 | OK |
| 19 | M. Kelkar, F. Zhang, S. Goldfeder, A. Juels, "Order-Fairness for Byzantine Consensus", dated 9 Aug 2020 | https://par.nsf.gov/servlets/purl/10274566 | 19-kelkar-2020.pdf | 44 | OK (other copy: NSF Public Access Repository). ePrint and iacr.org/archive both returned HTTP 403 |
| 20 | A. Canidio, V. Danos, "Commitment Against Front-Running Attacks", arXiv:2301.13785v3, 28 Jul 2023 | https://arxiv.org/pdf/2301.13785 | 20-canidio-2024.pdf | 30 | OK (preprint, not the Management Science version) |
| 21 | M. V. X. Ferreira, D. C. Parkes, "Credible Decentralized Exchange Design via Verifiable Sequencing Rules", arXiv:2209.15569v2, 17 Apr 2023 | https://arxiv.org/pdf/2209.15569 | 21-ferreira-2023.pdf | 34 | OK |
| 22 | L. Gudgeon, P. Moreno-Sanchez, S. Roos, P. McCorry, A. Gervais, "SoK: Layer-Two Blockchain Protocols" | https://discovery.ucl.ac.uk/10182335/1/2019-360.pdf | 22-gudgeon-2020.pdf | 44 | OK (other copy: UCL Discovery green open access). ePrint returned HTTP 403 (Cloudflare) |
| 23 | C. Ferreira Torres et al., "Rolling in the Shadows: Analyzing the Extraction of MEV Across Layer-2 Rollups" | https://arxiv.org/pdf/2405.00138 | 23-torres-2024.pdf | 16 | OK |
| 24 | "MEV and the Limits of Scaling", Flashbots Writings (grey literature) | https://writings.flashbots.net/mev-and-the-limits-of-scaling | 24-miller-2025.html | n/a | OK (HTML, `<h1>` "MEV and the Limits of Scaling") |
| 25 | F. Béres, I. A. Seres, A. A. Benczúr, M. Quintyne-Collins, "Blockchain is Watching You: Profiling and Deanonymizing Ethereum Users" | https://arxiv.org/pdf/2005.14051 | 25-beres-2021.pdf | 19 | OK |

## Counts
- Downloaded and checked: 23 of 25 (21 PDFs from the listed URL or a legal alternative, plus [24] as HTML; [11] is
  an earlier working-paper version).
- Failed: 2 ([14], [17]), both Cloudflare 403 on IACR ePrint.
- Needs NTU library access: [11] published QJE version (OUP returned 403; the task said "open access", not
  confirmed), [17] Springer chapter if ePrint stays blocked.

## Failure log (exact errors)
- `eprint.iacr.org/2022/445.pdf`, `/2016/1007.pdf`, `/2021/1628.pdf`, `/2020/269.pdf`, `/2019/360.pdf`: HTTP 403,
  body an HTML page with `<title>Just a moment...` and Cloudflare challenge markup. Not retried with a spoofed user
  agent (that would be working around the challenge).
- `iacr.org/archive/crypto2020/12171344/12171344.pdf`: HTTP 403.
- `doi.org/10.1093/qje/qjv027` to `academic.oup.com/qje/article/130/4/1547/1916146`: HTTP 403. Also tried
  `academic.oup.com/qje/article-pdf/130/4/1547/30637331/qjv027.pdf`: HTTP 403.
- `faculty.chicagobooth.edu/eric.budish/research/HFT-FrequentBatchAuctions.pdf`: HTTP 404.
  `www.cramton.umd.edu/papers2010-2014/budish-cramton-shim-hft-arms-race.pdf`: HTTP 404 (guessed URL).
- `doi.org/10.1145/3276486` to `dl.acm.org/doi/10.1145/3276486`: HTTP 403.

## Notes
- [10]: the file is hosted by Exodus, not 0x. The content matches the 0x v1 white paper (title, authors, date on
  page 1). An official 0x copy was not located in this session.
- [24] author: the task says "Miller". Author attribution must be checked in the page (Phase 3 note).

## Phase 4 additions (26 to 33)
Same checks as above. Peer review status is in each note and in `../notes/PHASE4_GAPS.md`.

| ID | Citation (as on page 1 / page header) | URL used | Local file | Pages | Status |
|---|---|---|---|---|---|
| 26 | S. Yang, F. Zhang, K. Huang, X. Chen, Y. Yang, F. Zhu, "SoK: MEV Countermeasures: Theory and Practice", arXiv:2212.05111v2, 20 Oct 2023 | https://arxiv.org/pdf/2212.05111 | 26-yang-2024.pdf | 19 | OK (preprint; published version shorter, see note) |
| 27 | T. Gong, Z. Liu, A. Kate, "The Case of FBA as a DEX Processing Model", arXiv:2302.01177v5, 16 Feb 2025 | https://arxiv.org/pdf/2302.01177 | 27-gong-2025.pdf | 13 | OK |
| 28 | G. Ramseyer, A. Goel, D. Mazieres, "SPEEDEX: A Scalable, Parallelizable, and Economically Efficient Decentralized EXchange", arXiv:2111.02719v6, 2 Mar 2023 | https://arxiv.org/pdf/2111.02719 | 28-ramseyer-2023.pdf | 27 | OK |
| 29 | A. R. Choudhuri, S. Garg, J. Piet, G.-V. Policharla, "Mempool Privacy via Batched Threshold Encryption: Attacks and Defenses", USENIX Security 2024 | https://www.usenix.org/system/files/usenixsecurity24-choudhuri.pdf | 29-choudhuri-2024.pdf | 18 | OK (publisher open access) |
| 30 | Y. Yuminaga, D. Chen, D. Sui, "Execution Welfare Across Solver-based DEXes", arXiv:2503.00738v3 | https://arxiv.org/pdf/2503.00738 | 30-yuminaga-2025.pdf | 22 | OK (preprint only) |
| 31 | "Shutterized Optimism: Performance Evaluation", Shutter Forum, 2025-10-27 (grey) | https://shutternetwork.discourse.group/t/shutterized-optimism-performance-evaluation/764 | 31-shutter-2025.html | n/a | OK (HTML) |
| 32 | Hyperliquid Docs, "Tick and lot size"; "Rate limits and user limits" (grey) | https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/tick-and-lot-size ; https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits | 32-hyperliquid-docs.html, 32-hyperliquid-ratelimits.html | n/a | OK (HTML, saved 2026-11-17) |
| 33 | "Fenwick + Bitmap: constant-time matching for on-chain order books", Ethereum Research forum, 2025-05-12 (grey) | https://ethresear.ch/t/fenwick-bitmap-constant-time-matching-for-on-chain-order-books/22313 | 33-fenwick-ethresearch.html | n/a | OK (HTML) |
| (none) | MITRE AADAPT, "Stop Hunting" ADT3021.002 (grey) | https://aadapt.mitre.org/techniques/ADT3021.002/ | 33-mitre-aadapt.failed-js-shell.html | n/a | **FAILED**: HTTP 200 but the page is a JavaScript shell (1990 bytes, title "MITRE \| AADAPT"), no content. Not used, not numbered |
