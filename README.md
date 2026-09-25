# tokenlab

### Your Greek text costs more than your English text. This page shows you exactly how much.

### [Open it and type something](https://broikos-nikos.github.io/tokenlab/)

AI models charge by the token, a chunk of text a few letters long. The same
sentence written in Greek is chopped into far more chunks than the English one,
so it costs more to send, fills a context window faster, and gets cut into worse
pieces by every retrieval pipeline built on an English tutorial.

Nobody shows you that happening. This does, live, on text you type.

![The page opens on an old vocabulary, where every Greek letter is its own token, then switches to the newest one, where they collapse back into word pieces](docs/shatter.gif)

That is the real page in a real browser, recorded by `npm run capture`. One
sentence, pinned so the recording can be checked: 82 tokens on `cl100k` and 37
on `o200k`.

---

## The number

> **Greek costs 1.92 times the tokens of English on the newest OpenAI
> vocabulary. Almost none of that is the tokenizer.**

Greek is 1.904 times the UTF-8 bytes of English before anything tokenizes it. On
top of that, `o200k` adds 1.1 percent, and forty sentence pairs cannot tell that
apart from nothing: the interval runs -3.5 to +5.7 percent and it includes zero.

The same measurement on `cl100k` adds 146 percent, interval +133.0 to +158.4,
which is not a null result, and on `p50k` and `r50k` it adds 207 percent.

So the honest sentence is not "o200k charges Greek 1.1 percent". It is that
whatever `o200k` charges Greek beyond the alphabet, forty sentence pairs cannot
see it.

**Why that matters if you are shipping something.** Every cost model built on a
GPT-4 era tokenizer overstates modern Greek by roughly two and a half times. Every
chunk size copied from an English tutorial indexes a whole section in English and
a sentence fragment in Greek. Nothing errors. The pipeline just quietly performs
worse, and the team blames the embedding model.

---

## See it standing still

The same sentence, the same moment, two vocabularies:

| the newest vocabulary, `o200k`, 37 tokens for 14 Greek words | the one before it, `cl100k`, 82 tokens for the same 14 words |
|---|---|
| ![37 tokens, two and a half per word](docs/shatter-o200k.png) | ![82 tokens, nearly one per letter](docs/shatter-cl100k.png) |

The English word `build` sitting in the middle of that Greek sentence is one
token in both pictures. On the right, every Greek letter around it is its own:
94 characters of Greek, 82 tokens.

---

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

No backend and no API key. The page fetches its own JavaScript, fonts and
vocabularies from wherever it is hosted and then talks to nothing: no request
leaves for a third party, and your text never goes anywhere.

The opening is precomputed. Every sentence the page can open with and every
encoding it can open in are known at build time, so `npm run prerender` computes
those segments ahead of the vocabulary: 11 kB gzipped against the 439 kB of
`cl100k` that would otherwise sit between you and the first chip. Measured with
the vocabulary artificially delayed by four seconds, first chip went from
4,533 ms to 126 ms, with the same 76 chips and the same 6 red ones.

---

## The numbers

Forty sentence pairs, written by hand in both languages across five registers,
committed in [`data/pairs.json`](data/pairs.json). Ratios are totals over
totals, not a mean of per sentence ratios. Intervals are a paired bootstrap,
10,000 resamples, fixed seed.

| encoding | used by | raw token ratio | 95% interval | bytes per token, Greek | vocabulary cost beyond the script | its 95% interval |
|---|---|---|---|---|---|---|
| `o200k_base` | GPT-6, GPT-5.x, GPT-4.1, GPT-4o | 1.92x | 1.80 to 2.05 | 5.06 | **+1.1%** | -3.5 to +5.7, includes zero |
| `cl100k_base` | GPT-4, GPT-3.5 Turbo, text-embedding-3 | 4.68x | 4.33 to 5.04 | 2.08 | **+145.6%** | +133.0 to +158.4 |
| `p50k_base` | Codex, text-davinci-003 | 5.84x | 5.43 to 6.28 | 1.65 | **+206.9%** | +191.8 to +222.8 |
| `r50k_base` | GPT-3 base: davinci, curie, ada | 5.84x | 5.43 to 6.28 | 1.65 | **+206.9%** | +191.8 to +222.8 |

A raw token ratio measures the writing system and the vocabulary at once and
hands the credit to the vocabulary, which is why the split above matters more
than the headline.

Both interval columns come from that same paired bootstrap. A pair is the unit
of resampling, so its Greek tokens, English tokens, Greek bytes and English
bytes move together, which is what makes the second interval meaningful rather
than a ratio of two independent guesses.

English gets 5.11 bytes per token on `o200k` and 5.11 on `cl100k`, unchanged to
two decimals. Greek goes from 2.08 to 5.06 between the two. That is what the last
column is measuring: how many tokens the vocabulary spends per byte of Greek,
against how many it spends per byte of English.

`p50k` and `r50k` tokenize this corpus identically, to the token. They are
different vocabularies, but on this text they are one result, not two.

The raw ratio runs 1.58x to 2.24x across registers on `o200k`, and part of that
is the author writing the conversational Greek 20 percent shorter than its
English partner. Measured in tokens per Greek word, which is what a Greek cost
model actually uses, the spread is 1.97 to 2.46, a 25 percent difference. On
`cl100k` the same comparison is 4.32 to 6.59, a 53 percent difference, and that
one is genuinely the tokenizer.

**Tokens per word is a figure inside one language, and the two sides do not
divide.** This corpus takes 474 words in Greek and 500 in English to say the
same things, because Greek incorporates into one word what English splits into
two. Divide 2.31 tokens per Greek word by 1.14 per English word and the answer
is 2.03x, above the 1.92x measured, and the excess is exactly the word counts:
500 against 474 is 5.5 percent. Per sentence it is several times that and it
changes sign, from 38.4 percent high on the conversational pair at index 2 to
19.9 percent low on the technical pair at index 22, so it is not a bias a reader
can learn to subtract. The page does that division under the comparison card
rather than leave it to be done quietly. The unit that is comparable between the
two languages is the byte, which is what the last two columns of the table
measure.

**The cheapest Greek in this corpus is the technical register, on both
vocabularies.** 1.97 tokens per word against 2.46 for commerce on `o200k`, and
4.32 against 6.59 for formal on `cl100k`. The reason is visible in the
sentences: a quarter of the technical Greek is Latin identifiers and digits,
`npm run build`, `created_at`, `Cache-Control: no-cache`, `3000`, and those cost
the same in both languages. **The more of your Greek is code, the less the
tokenizer charges you for it**, and the register that looks most expensive to
write is the one that is cheapest to send.

That finding did not exist here until 2026-09-25. The technical register used to
spell its numbers out and carry one Latin word in eight sentences, which made it
the second dearest register rather than the cheapest and put the headline at
2.06x instead of 1.92x. The corpus was measuring Greek prose about computers,
not the Greek that developers write.

Reproduce all of it:

```bash
npm run measure   # writes src/generated/findings.json
npm run check     # asserts every number above against that file
```

Prices in [`data/pricing.json`](data/pricing.json) are the one set of numbers
not measured here, and they carry the date they were checked and the page they
came from.

---

## Why you can believe the numbers

Every figure in this README is generated, not typed. `npm run check:claims`
rebuilds each one from the measurement and fails the build by name if any has
drifted. On its first run it caught a hand typed `1.63` against a measured
`1.61`.

Seven gates, all of them in CI, and **not one was written before the defect it
exists for**:

| gate | what it stops |
|---|---|
| `check:claims` | a number in this README the measurement does not produce |
| `check:segments` | the page drawing text nobody typed. 92 cases across four encodings, every prefix of a polytonic line as it is typed, plus twelve exact fracture counts |
| `check:loading` | a page that looks broken while every number on it is correct. Runs against the built output in a real browser |
| `check:measurement` | a `findings.json` that is no longer what `tools/measure.ts` produces, and a number spelled into the page instead of read from the measurement |
| `check:licences` | a font whose licence file, embedded records and prose do not all agree. The binary is the authority, not the README |
| `check:prerender` | a precomputed opening that no longer matches what the tokenizer produces |
| `check:workflow` | deployment permissions held by any job other than the one that deploys, an action pinned to a mutable tag, a checkout that leaves its token behind |

**Nine independent agents have audited this project**, one assigned perspective
each, none of them allowed to edit it: a recruiter with ten seconds, a hiring
engineer with three minutes, a deep reviewer, a hostile stranger, a measurement
auditor, a design eye, a performance and access pass, a supply chain pass, and a
maintainer six months from now.

Between them they found a shared `TextDecoder` in a dependency that was
corrupting polytonic Greek, a headline figure published without the interval
that would have shown it straddling zero, an empty red error bar that had
shipped to every visitor, and a font licence file that named neither the font
nor its copyright holder.

[`docs/AUDITS.md`](docs/AUDITS.md) is the full list, including what is still
open. Commit messages cite the identifiers in it.

---

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
- The eight technical pairs were rewritten on 2026-09-25, for the same reason in
  the other direction. They spelled their numbers out and carried one Latin word
  between them, so the register named "technical" contained no identifier, no
  version and no port number, which is not what technical Greek looks like. The
  rewrite moved that register's ratio 2.33x to 1.67x, the headline 2.06x to
  1.92x, and the o200k vocabulary penalty 2.9 percent to 1.1 percent. It still
  includes zero, so again the finding did not depend on it.
- Only the four encodings in the registry are covered, all of them tiktoken. Llama, Gemma and Qwen use
  SentencePiece vocabularies that are not here yet, and Greek behaves
  differently on each.
- The corpus is NFC normalised, so every figure above is an NFC measurement.
  Greek written in NFD, with combining accents rather than precomposed letters,
  is the same text on screen and a different string to a tokenizer. Measured on
  this corpus, `npm run measure` reads NFC and this is what the other form
  costs:

  | encoding | NFC | NFD | NFD costs | ratio, NFC | ratio, NFD |
  |---|---|---|---|---|---|
  | `o200k_base` | 1093 | 1508 | +38% | 1.92x | 2.65x |
  | `cl100k_base` | 2656 | 2896 | +9% | 4.68x | 5.10x |
  | `p50k_base` | 3343 | 3730 | +11.6% | 5.84x | 6.52x |
  | `r50k_base` | 3343 | 3730 | +11.6% | 5.84x | 6.52x |

  `o200k` is hit hardest because it has tokens for precomposed Greek letters and
  none for base plus combining mark, so the vocabulary that is best at Greek is
  the one that loses most when the accents arrive separately. The page detects
  it now: paste NFD and it says so, and says what the same text would cost in
  NFC. That is a caveat on the numbers rather than a measurement of its own, so
  it is not in the table above.
- Every model on the encoding buttons and in the price list is checked against
  `gpt-tokenizer`'s own `modelToEncodingMap`, which is pinned at 4.0.0 and is
  the table the encoder consults, so it cannot be edited after this is
  published. Two attributions were wrong until 2026-09-25: `p50k` claimed
  `davinci-002`, which is `cl100k_base`, and `r50k` claimed GPT-2, which is the
  separate `gpt2` encoding. The o200k models are not in that table at all, 61
  entries and none of them o200k, so they rest on `data/pricing.json` and its
  date and link instead, and `npm run check:models` refuses that arrangement to
  go unmarked.
- A larger corpus could resolve that 1.1 percent into something real or into
  nothing. This one cannot, and saying so is cheaper than pretending otherwise.

---

## How it works

- `src/lib/encodings.ts` the encoding registry, one lazy import per encoding.
- `src/lib/segment.ts` turns token ids into things you can look at. The
  interesting case: when a tokenizer has no token for a character it emits the
  raw UTF-8 bytes, so one character becomes several tokens and none of them
  decodes to anything on its own. Those are the red chips. It works in bytes
  and assembles UTF-8 itself, because `gpt-tokenizer` shares one streaming
  `TextDecoder` across every `decode` call and never flushes it, so decoding a
  prefix that ends mid character poisons the next call anywhere on the page.
  That bug drew the first line of the Odyssey with characters nobody had typed.
- `tools/measure.ts` the measurement, run by `npm run measure`.
- `data/pairs.json` the corpus, forty pairs, CC0.

Before committing:

```bash
npx playwright install chromium   # once, for the two browser driven tools
npm run verify                    # build, then drive the built page in a real browser
```

---

## Licence and credits

Built by **Nikos Broikos**. [broikos.gr](https://broikos.gr)

Code MIT. Corpus CC0.

The two fonts are under different licences and the difference is not cosmetic:
Manrope is **SIL Open Font License 1.1**, Roboto Mono as distributed by Google
Fonts is **Apache License 2.0**. Both are subset to Latin, Greek, punctuation
and currency, and both binaries carry their own copyright and licence records.
[`public/fonts/README.md`](public/fonts/README.md) names the copyright holder
for each, links the full text, and records how the subsets were made.
