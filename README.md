# tokenlab

AI models charge by the token, which is a chunk of text a few letters long. The
same sentence written in Greek is chopped into far more chunks than the English
one, so it costs more to send. This page shows that happening, live, on text you
type.

![The page opens on an old vocabulary, where every Greek letter is its own token, then switches to the newest one, where they collapse back into word pieces](docs/shatter.gif)

That is the real page in a real browser, recorded by `npm run capture`, which
needs `npx playwright install chromium` and `ffmpeg` on the path. One
sentence, pinned so the recording can be checked: 82 tokens on `cl100k` and 37
on `o200k`. The price only appears once the selected encoding is the one the
chosen model actually uses, and a vocabulary that has not arrived yet says
loading rather than pretending to be selected.

The same moment standing still, the same sentence both times:

| the newest vocabulary, `o200k`, 37 tokens for 14 Greek words | the one before it, `cl100k`, 82 tokens for the same 14 words |
|---|---|
| ![37 tokens, two and a half per word](docs/shatter-o200k.png) | ![82 tokens, nearly one per letter](docs/shatter-cl100k.png) |

The English word `build` sitting in the middle of that Greek sentence is one
token in both pictures. On the right, every Greek letter around it is its own:
94 characters of Greek, 82 tokens.

## The figure, for the reader who wants it

**Greek costs 2.06 times the tokens of English on the newest OpenAI vocabulary.
Almost none of that is the tokenizer.** Greek is 2.004 times the UTF-8 bytes of
English before anything tokenizes it. On top of that, `o200k` adds 2.9 percent,
and forty pairs cannot tell that apart from nothing: the interval runs -2.0 to
+7.6 percent and it includes zero. The same measurement on `cl100k` adds 156
percent, interval +143.8 to +167.6, which is not a null result, and on `p50k`
and `r50k` it adds 220 percent.

So the honest sentence is not "o200k charges Greek 2.9 percent". It is that
whatever `o200k` charges Greek beyond the alphabet, forty sentence pairs cannot
see it.

A raw token ratio measures the writing system and the vocabulary at once and
hands the credit to the vocabulary, which is why the split above matters more
than the headline. Which is also why that split now carries its own interval:
the figure this project says matters most was, until 2026-09-21, the only one
published without one.

## The numbers

Forty sentence pairs, written by hand in both languages across five registers,
committed in [`data/pairs.json`](data/pairs.json). Ratios are totals over
totals, not a mean of per sentence ratios. Intervals are a paired bootstrap,
10,000 resamples, fixed seed.

| encoding | used by | raw token ratio | 95% interval | bytes per token, Greek | vocabulary cost beyond the script | its 95% interval |
|---|---|---|---|---|---|---|
| `o200k_base` | GPT-6, GPT-5.x, GPT-4.1, GPT-4o | 2.06x | 1.94 to 2.18 | 5.10 | **+2.9%** | -2.0 to +7.6, includes zero |
| `cl100k_base` | GPT-4, GPT-3.5 Turbo, text-embedding-3 | 5.12x | 4.79 to 5.45 | 2.05 | **+155.7%** | +143.8 to +167.6 |
| `p50k_base` | Codex, davinci-002 | 6.42x | 6.00 to 6.82 | 1.62 | **+220.3%** | +205.6 to +235.2 |
| `r50k_base` | GPT-3, GPT-2 | 6.42x | 6.00 to 6.82 | 1.62 | **+220.3%** | +205.6 to +235.2 |

Both interval columns come from that same paired bootstrap. A pair is the unit
of resampling, so its Greek tokens, English tokens, Greek bytes and English
bytes move together, which is what makes the second interval meaningful rather
than a ratio of two independent guesses.

English gets 5.24 bytes per token on `o200k` and 5.24 on `cl100k`, unchanged to
two decimals. Greek goes from 2.05 to 5.10 between the two. That is what the last
column is measuring: how many tokens the vocabulary spends per byte of Greek,
against how many it spends per byte of English.

`p50k` and `r50k` tokenize this corpus identically, to the token. They are
different vocabularies, but on this text they are one result, not two.

Reproduce all of it:

```bash
npm install
npm run measure   # writes src/generated/findings.json
npm run check     # asserts every number above against that file
```

The page reads `findings.json` directly. This README cannot, because it is
prose, so `npm run check` holds the two together: it rebuilds every numeric
claim on this page from the measurement and fails by name if any of them has
drifted. It runs as part of `npm run build`, so the README cannot go stale
without the build going red. It also refuses any corpus pair that is not marked
`provenance: written`.

It earned its place twice. On its first run it caught a bytes per token figure
that had been typed by hand and was wrong. When the corpus was revised it named
all twenty claims that had moved, which is a job nobody does correctly by eye.

Prices in [`data/pricing.json`](data/pricing.json) are the one set of numbers
not measured here, and they carry the date they were checked and the page they
came from.

## What the numbers say

`o200k` has closed the Greek vocabulary gap to within what forty pairs can
measure. The point estimate is 2.9 percent and the interval crosses zero, so the
correct reading is that there is no detectable penalty here, not that there is a
small one. What remains is the script: Greek is two UTF-8 bytes a letter and
English is one, and no vocabulary can undo that.

A larger corpus could resolve that 2.9 percent into something real or into
nothing. This one cannot, and saying so is cheaper than pretending otherwise.

`cl100k` is the interesting one. There the vocabulary really does charge Greek
two and a half times per byte, which means any cost model built on a GPT-4 era
tokenizer overstates modern Greek by roughly two and a half times, and one built
before that overstates it by three.

The register spread is smaller than it looks. The raw ratio runs 1.58x to 2.33x
across registers on `o200k`, but most of that is the author writing the
conversational Greek 20 percent shorter than its English partner. Measured in
tokens per Greek word, which is what a Greek cost model actually uses, the spread
is 2.23 to 2.46, a 10 percent difference. On `cl100k` the same comparison is
5.00 to 6.59, a 32 percent difference, and that one is genuinely the tokenizer.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static files in dist/, deploys to any static host

npx playwright install chromium   # once, for the two browser driven tools
npm run verify   # build, then drive the built page in a real browser
```

`npm run verify` is the one to run before committing. `npm run build` covers the
two gates that need no browser; the third needs a served page and a real one,
because the defect it exists for is a page that looks broken while every number
on it is correct. CI runs all three on every push and every pull request, and
nothing deploys unless they pass.

No backend and no API key. The page fetches its own JavaScript, fonts and
vocabularies from wherever it is hosted and then talks to nothing: no request
leaves for a third party, and your text never goes anywhere. The vocabularies are
loaded one per encoding on demand, so the page paints before the largest of them
arrives.

## How it works

- `src/lib/tokenizers.ts` the encoding registry, one lazy import per encoding.
- `src/lib/segment.ts` turns token ids into things you can look at. The
  interesting case: when a tokenizer has no token for a character it emits the
  raw UTF-8 bytes, so one character becomes several tokens and none of them
  decodes to anything on its own. Those are the red chips. It works in bytes
  and assembles UTF-8 itself, because `gpt-tokenizer` shares one streaming
  `TextDecoder` across every `decode` call and never flushes it, so decoding a
  prefix that ends mid character poisons the next call anywhere on the page.
  That bug drew the first line of the Odyssey with characters nobody had typed.
- `tools/check-segments.ts` is the gate that would have caught it: every
  encoding, over polytonic Greek, Coptic, Linear B, Korean, emoji, NFD and
  every prefix of a line as it is typed, the drawn text must equal the typed
  text exactly.
- `tools/measure.ts` the measurement, run by `npm run measure`.
- `data/pairs.json` the corpus, forty pairs, CC0.

## How this was checked

Four gates, all four run in CI, and none of them was written before the defect
it exists for:

| gate | what it stops |
|---|---|
| `npm run check:claims` | a number in this README that the measurement does not produce. Caught a hand typed `1.63` against a measured `1.61` on its first run. |
| `npm run check:segments` | the page drawing text that was never typed. 92 cases across four encodings, including every prefix of a polytonic line as it is typed. |
| `npm run check:loading` | a page that looks broken while every number on it is correct. Runs against the built output in a real browser. |
| `npm run check:measurement` | a `findings.json` that is no longer what `tools/measure.ts` produces, and a number spelled into the page instead of read from the measurement. Found one on its first run that four other gates had missed. |
| `npm run build` | all of the above except the browser one, before anything is written to `dist/`. |

Eight separate agents have audited this project, one assigned perspective each,
none of them allowed to edit it: a recruiter with ten seconds, a hiring engineer
with three minutes, a deep reviewer, a hostile stranger, a measurement auditor, a
design eye, a performance and access pass, and a maintainer six months from now. Between them they found a shared
`TextDecoder` in a dependency that was corrupting polytonic Greek, a headline
figure published without the interval that would have shown it straddling zero,
and an empty red error bar that had shipped to every visitor.

[`docs/AUDITS.md`](docs/AUDITS.md) is the full list, including what is still
open. Commit messages cite the identifiers in it.

## The honest limits

- Forty pairs is a small corpus. That is why the interval is shown and why the
  ratio is never quoted without it.
- The pairs are written by one bilingual author. A different author would write
  different Greek and the raw ratio would move. The byte controlled figure is
  much less sensitive to that, which is another reason to prefer it.
- Every pair carries a `provenance` field and `written` is the only value the
  corpus accepts, which `npm run check` enforces. Three formal pairs adapted
  from the Universal Declaration of Human Rights were removed on 2026-09-21:
  public domain and properly aligned, but the Greek side of it is an official
  translation of the English, which is the one thing this method exists to keep
  out. Removing them moved the headline from 2.09x to 2.06x and the o200k
  vocabulary penalty from 3.6 percent to 2.9 percent, so the finding did not
  depend on them.
- Only the four tiktoken encodings are covered. Llama, Gemma and Qwen use
  SentencePiece vocabularies that are not here yet, and Greek behaves
  differently on each.
- The corpus is NFC normalised. Greek written in NFD, which happens when text
  comes off some macOS pipelines, costs substantially more and is not measured
  here.

## Licence

Code MIT. Corpus CC0. Fonts are Manrope and Roboto Mono, both SIL Open Font
License, subset to Latin, Greek and punctuation, licences in `public/fonts/`.
