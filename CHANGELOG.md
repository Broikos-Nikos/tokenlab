# Changelog

## 0.1.0, 2026-09-20

First working version, built in one session.

- The measurement: forty aligned Greek and English sentence pairs across five
  registers, four tiktoken encodings, ratios as totals over totals with a
  paired bootstrap interval. `npm run measure`.
- The page: live tokenization, encoding switch, language switch, animated token
  count, cost per thousand requests at real prices.
- Byte fracture rendering: characters that cost more than one token are drawn
  as broken chips with the token count on them.
- Self hosted Manrope and Roboto Mono, subset to Latin and Greek, 31 KB and
  48 KB as variable woff2. Both checked against real Greek copy including final
  sigma, accented capitals and the euro sign before being chosen.
