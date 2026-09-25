/**
 * Every number in the README, checked against the measurement that produced it.
 *
 *   npm run check
 *
 * This exists because of a specific failure. The README once carried two token
 * counts in the alt text of its only picture, both typed by hand, both wrong,
 * one screen above a line claiming that no number in this repository is typed by
 * hand. Nothing caught it, because nothing was looking.
 *
 * So the rule became mechanical. Each claim below states where the number comes
 * from and what string must therefore appear in README.md. Change the corpus,
 * re-run `npm run measure`, and every claim whose value moved fails by name
 * until the prose is brought back into line.
 *
 * A claim that cannot be expressed this way does not belong in the README as a
 * number.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashInputs } from './inputs-hash'
import { ENCODINGS } from '../src/lib/encodings'
// @ts-expect-error the capture state is plain JavaScript, shared with the recorder
import { PINNED_PAIR } from './capture-state.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readme = readFileSync(resolve(root, 'README.md'), 'utf8')
const f = JSON.parse(readFileSync(resolve(root, 'src/generated/findings.json'), 'utf8'))

interface Claim {
  /** What the sentence is asserting, in words. */
  about: string
  /** The exact text that must appear in README.md, built from the measurement. */
  must: string
  /**
   * How many times it must appear. One, almost always.
   *
   * This field is the answer to a real hole. Claims used to be a substring test
   * against the whole document, and the strings for p50k and r50k were
   * character for character identical because the two encodings measure the
   * same on this corpus. Deleting the entire r50k row from the table left all
   * thirty claims passing. A claim that can be satisfied by a different row is
   * not checking anything, so every claim now says how many times it should be
   * found and is failed for finding too few or too many.
   */
  count: number
}

const claims: Claim[] = []
const add = (about: string, must: string, count = 1) => claims.push({ about, must, count })

const enc = (id: string) => f.encodings[id]
const pct = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
/** English needs the article to agree with how the number is read aloud. */
const article = (n: number) => (n === 8 || n === 11 || n === 18 || (n >= 80 && n < 90) ? 'an' : 'a')

// ---- the headline ---------------------------------------------------------

add(
  'the raw o200k ratio in the first sentence',
  `Greek costs ${enc('o200k_base').ratio} times the tokens of English`,
)
add(
  'the byte ratio, which is the whole correction',
  `${f.headline.scriptCost} times the UTF-8 bytes`,
)
add(
  'what o200k adds on top of the script',
  `\`o200k\` adds ${pct(enc('o200k_base').lengthControlled.vocabularyPenaltyPercent)} percent`,
)
// The interval on that figure, which is the whole point of HE-F1: it includes
// zero, and a README that prints the point estimate without it is breaking its
// own stated rule two screens further down.
{
  const [plo, phi] = enc('o200k_base').lengthControlled.vocabularyPenaltyInterval95
  add(
    'the interval on the o200k penalty, and that it includes zero',
    `the interval runs ${plo.toFixed(1)} to +${phi.toFixed(1)} percent and it includes zero`,
  )
}
{
  const [plo, phi] = enc('cl100k_base').lengthControlled.vocabularyPenaltyInterval95
  add('the interval on the cl100k penalty', `interval +${plo.toFixed(1)} to +${phi.toFixed(1)}`)
}
add(
  'what cl100k adds',
  `on \`cl100k\` adds ${Math.round(enc('cl100k_base').lengthControlled.vocabularyPenaltyPercent)} percent`,
)
// The sentence says "on `p50k` and `r50k` it adds N percent", one number for two
// encodings. That is only true while they measure the same, so the checker
// verifies the premise before it verifies the sentence.
const p50kPenalty = Math.round(enc('p50k_base').lengthControlled.vocabularyPenaltyPercent)
const r50kPenalty = Math.round(enc('r50k_base').lengthControlled.vocabularyPenaltyPercent)
if (p50kPenalty !== r50kPenalty) {
  console.error(
    `FAIL  the README says p50k and r50k add the same amount, and they no longer do ` +
      `(${p50kPenalty}% against ${r50kPenalty}%). That sentence has to be split.`,
  )
  process.exit(1)
}
add('what the two older vocabularies add', `\`p50k\` and\n\`r50k\` it adds ${r50kPenalty} percent`)

// ---- the picture ----------------------------------------------------------

// The recording is pinned to one sentence precisely so its numbers can be
// checked like any other. An unpinned capture would put uncheckable numbers at
// the top of the README, which is where this project has been wrong before.
add(
  'the token counts in the caption under the recording',
  `${enc('cl100k_base').figureSentence.el} tokens on \`cl100k\` and ` +
    `${enc('o200k_base').figureSentence.el} on \`o200k\``,
)

add('the o200k count on the left picture', `\`o200k\`, ${enc('o200k_base').figureSentence.el} tokens for ${enc('o200k_base').figureSentence.elWords} Greek words`)
// Both captions in the same unit. They were in two different ones, which is
// not a comparison a reader can make in the two seconds they give it.
add('the cl100k count on the right picture', `\`cl100k\`, ${enc('cl100k_base').figureSentence.el} tokens for the same ${enc('o200k_base').figureSentence.elWords} words`)
add('the character count, now in the prose rather than a caption', `${enc('o200k_base').figureSentence.elChars} characters of Greek`)

// ---- the table ------------------------------------------------------------

/**
 * Each row is asserted whole, keyed by its encoding, rather than cell by cell.
 * Cell by cell was the hole: `| 6.42x |` is true of two different rows, so the
 * check could be satisfied by the wrong one, or by one that was still there
 * after the other had been deleted.
 *
 * The "used by" column is a label rather than a measurement, so it lives here.
 * Putting it in the assertion means a row cannot be mislabelled either.
 */
const USED_BY: Record<string, string> = Object.fromEntries(
  ENCODINGS.map((e) => [e.id, e.models]),
)

for (const id of Object.keys(USED_BY)) {
  const e = enc(id)
  const [lo, hi] = e.ratioInterval95
  // The table is exact to one decimal. The prose above it rounds, which is a
  // different job, and both are checked.
  const L = e.lengthControlled
  const penalty = L.vocabularyPenaltyPercent.toFixed(1)
  const [plo, phi] = L.vocabularyPenaltyInterval95
  const sign = (n: number) => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(1)}`
  // The penalty interval is part of the row, not an optional extra. It was
  // missing entirely and the figure it belongs to is the one the project leads
  // with, so it is asserted like everything else.
  const band = `${sign(plo)} to ${sign(phi)}` + (L.penaltyIndistinguishableFromZero ? ', includes zero' : '')
  add(
    `the whole ${id} row of the table`,
    `| \`${id}\` | ${USED_BY[id]} | ${e.ratio}x | ` +
      `${lo.toFixed(2)} to ${hi.toFixed(2)} | ` +
      // Two decimals always, so a column of figures lines up instead of showing
      // 5.1 next to 1.62 because one of them happened to round short.
      `${L.bytesPerToken.el.toFixed(2)} | **+${penalty}%** | ${band} |`,
  )

  /*
   * And the normalisation row. ME-F11: the README answered "what does NFD cost"
   * with the word "substantially", which is the one kind of answer this
   * repository does not accept. Two decimals on the ratios so the column lines
   * up, one on the percentage, matching what the measurement rounds to.
   */
  const n = e.nfd
  /*
   * The whole row, penalty columns included. HE-F6: the token counts were
   * measured and the vocabulary penalty was not, and the penalty is the column
   * that says whether "almost none of that is the tokenizer" survives the input.
   */
  add(
    `the NFD row for ${id}`,
    `| \`${id}\` | ${n.nfcTokens} | ${n.nfdTokens} | +${n.costPercent}% | ${n.ratioNfc.toFixed(2)}x | ` +
      `${n.ratioNfd.toFixed(2)}x | +${pct(n.penaltyPercentNfc)}% | +${pct(n.penaltyPercentNfd)}% |`,
  )
}

/*
 * And the sentence that says what those two columns mean, because a table nobody
 * reads a conclusion out of is a table.
 */
{
  const n = enc('o200k_base').nfd
  add(
    'what NFD does to the o200k penalty, in the prose',
    `becomes **+${pct(n.penaltyPercentNfd)} percent**`,
  )
  add(
    'the penalty NFD replaces',
    `the vocabulary costs +${pct(n.penaltyPercentNfc)}
percent beyond the alphabet`,
  )
  const c = enc('cl100k_base').nfd
  const p50 = enc('p50k_base').nfd
  add(
    'the three that barely move',
    `\`cl100k\` goes from +${pct(c.penaltyPercentNfc)} to +${pct(c.penaltyPercentNfd)} and the two older ones from +${pct(p50.penaltyPercentNfc)}
  to +${pct(p50.penaltyPercentNfd)}`,
  )
}

/*
 * And the sensitivity claim, which was "much less sensitive" until tick 143.
 * Register is not authorship and the README says so; it is the only variation
 * this corpus can measure, and it turns out to support "steadier" rather than
 * "much steadier", which is the kind of correction this section exists for.
 */
{
  const rows = enc('o200k_base').byRegister as { ratio: number; vocabularyPenaltyPercent: number }[]
  const raws = rows.map((r) => r.ratio)
  const pens = rows.map((r) => r.vocabularyPenaltyPercent)
  const rawSpan = Math.max(...raws) / Math.min(...raws)
  const penSpan = (1 + Math.max(...pens) / 100) / (1 + Math.min(...pens) / 100)
  add('how much the raw ratio moves across registers', `factor of **${rawSpan.toFixed(2)}**`)
  add('how much the byte controlled figure moves', `by **${penSpan.toFixed(2)}**`)
  add(
    'the two ends of the penalty band',
    `${pens.reduce((a, b) => Math.min(a, b)).toFixed(1)} percent to +${Math.max(...pens).toFixed(1)}
  percent on tokens per byte`,
  )
}

// ---- the prose around the table -------------------------------------------

add(
  'English bytes per token on o200k',
  `English gets ${enc('o200k_base').lengthControlled.bytesPerToken.en.toFixed(2)} bytes per token`,
)
add(
  'English bytes per token on cl100k',
  `${enc('cl100k_base').lengthControlled.bytesPerToken.en.toFixed(2)} on \`cl100k\``,
)
add(
  'Greek bytes per token, both ends',
  `Greek goes from ${enc('cl100k_base').lengthControlled.bytesPerToken.el.toFixed(2)} to ` +
    `${enc('o200k_base').lengthControlled.bytesPerToken.el.toFixed(2)}`,
)

// ---- the register claim, the one that was overstated ----------------------

const reg = (id: string) => {
  const rows = enc(id).byRegister as { ratio: number; elTokensPerWord: number }[]
  const raw = rows.map((r) => r.ratio)
  const tpw = rows.map((r) => r.elTokensPerWord)
  const lo = Math.min(...tpw)
  const hi = Math.max(...tpw)
  return {
    rawLo: Math.min(...raw),
    rawHi: Math.max(...raw),
    tpwLo: lo,
    tpwHi: hi,
    spreadPct: Math.round((hi / lo - 1) * 100),
  }
}

const o = reg('o200k_base')
const c = reg('cl100k_base')
add('the raw register spread on o200k', `runs ${o.rawLo}x to ${o.rawHi}x across registers`)
add('the honest register spread on o200k', `${o.tpwLo} to ${o.tpwHi}, ${article(o.spreadPct)} ${o.spreadPct} percent difference`)
add('the register spread on cl100k', `${c.tpwLo.toFixed(2)} to ${c.tpwHi.toFixed(2)}, ${article(c.spreadPct)} ${c.spreadPct} percent difference`)

// ---- the division the two per word figures invite, ME-F13 ------------------

/*
 * Every figure in this paragraph is one a reader can arrive at themselves by
 * dividing two numbers the page prints, which is exactly why it has to be
 * derived here rather than typed: the README is claiming what that division
 * gives, and a stale one would be a wrong answer to arithmetic the reader is
 * being invited to check.
 */
{
  const e = enc('o200k_base')
  const d = e.perWordDivision
  const t = e.totals
  add(
    'the word counts, which are what make the two per word figures incomparable',
    `${t.elWords} words in Greek and ${t.enWords} in English`,
  )
  add(
    'the two figures a reader divides',
    `${e.tokensPerWord.el} tokens per Greek word by ${e.tokensPerWord.en} per English word`,
  )
  add(
    'what the division gives, against what was measured',
    `the answer is ${d.fromPrinted}x, above the ${d.measured}x measured`,
  )
  add(
    'that the excess is the word counts and nothing else',
    `${t.enWords} against ${t.elWords} is ${pct(d.overstatesPercent)} percent`,
  )
  add(
    'the hottest sentence, where the division runs furthest above the cost',
    `${pct(d.hottest.percent)} percent high on the ${d.hottest.register} pair at index ${d.hottest.pair}`,
  )
  add(
    'the coldest sentence, which is what stops a reader correcting for it',
    `${pct(Math.abs(d.coldest.percent))} percent low on the ${d.coldest.register} pair at index ${d.coldest.pair}`,
  )
}

// ---- the corpus ------------------------------------------------------------

/**
 * The corpus size was hand typed at both ends: a literal in this file and a word
 * in the README, with `f.corpus.pairs` read by neither. Three pairs were removed
 * on 2026-09-21 and nothing here would have noticed if the word had stayed
 * wrong. It is spelled from the measurement now, and every place the README
 * says it is asserted, including the lower case one.
 */
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function spell(n: number): string {
  if (n < 20) return ONES[n]
  if (n < 100) return n % 10 === 0 ? TENS[Math.floor(n / 10)] : `${TENS[Math.floor(n / 10)]} ${ONES[n % 10]}`
  throw new Error(`no spelling for ${n}; add one rather than typing it into the README`)
}

const capital = (s: string) => s[0].toUpperCase() + s.slice(1)
const pairWord = spell(f.corpus.pairs)

add('the corpus size where the table is introduced', `${capital(pairWord)} sentence pairs`)
add('the corpus size in how it works', `the corpus, ${pairWord} pairs`)
add('the corpus size in the honest limits', `${capital(pairWord)} pairs is a small corpus`)
add('the number of registers', `across ${spell(f.corpus.registers.length)} registers`)
add(
  'the number of encodings, wherever the README counts them',
  `${spell(ENCODINGS.length)} encodings`,
  2,
)
add('the bootstrap size', `${(10000).toLocaleString('en-US')} resamples`)

// ---- run -------------------------------------------------------------------

// Markdown wraps prose, and line endings differ between a Windows checkout and a
// Linux one. A claim must not fail for either, so both sides are flattened to
// single spaced text before they are compared.
const flatten = (s: string) => s.replace(/\s+/g, ' ').trim()
const haystack = flatten(readme)

function occurrences(hay: string, needle: string): number {
  if (needle === '') return 0
  let n = 0
  let at = hay.indexOf(needle)
  while (at !== -1) {
    n++
    at = hay.indexOf(needle, at + 1)
  }
  return n
}

let failed = 0
for (const c2 of claims) {
  const want = flatten(c2.must)
  const found = occurrences(haystack, want)
  if (found === c2.count) continue
  failed++
  console.error(`FAIL  ${c2.about}`)
  console.error(`      expected ${c2.count} occurrence(s) in README.md, found ${found}`)
  console.error(`      ${JSON.stringify(want)}`)
}

if (failed > 0) {
  console.error(
    `\n${failed} of ${claims.length} claims in README.md do not match ` +
      `src/generated/findings.json. Re-run "npm run measure", then correct the prose.`,
  )
  process.exit(1)
}

// The corpus file describes itself, and that description is a claim too. It was
// wrong once: the method said every pair was written by hand in both languages
// while three of them were adapted from an official translation.
const corpus = JSON.parse(readFileSync(resolve(root, 'data/pairs.json'), 'utf8'))
const notWritten = corpus.pairs.filter((p: { provenance?: string }) => p.provenance !== 'written')
if (notWritten.length > 0) {
  console.error(
    `FAIL  ${notWritten.length} pairs in data/pairs.json are not marked provenance "written", ` +
      `but the method in that file says every pair was written by hand in both languages.`,
  )
  process.exit(1)
}
/*
 * A register's name is a claim about what is in it, and this one was false.
 *
 * ME-F10: "technical" held no digit and one Latin word across its eight
 * sentences, because it spelled its numbers out and translated its
 * identifiers. Measured before the rewrite, that cost the register a fifth of
 * its ratio, 2.33x against 1.67x, and the corpus headline 2.06x against 1.92x,
 * because digits and Latin identifiers are the two things that cost the same in
 * both languages and technical text is full of both.
 *
 * The thresholds are deliberately far below what the register now carries, 15
 * digits and 26 Latin words, because this is a floor on what the word
 * "technical" has to mean and not a description of today's eight sentences.
 */
/*
 * The corpus is NFC, and the measurement is therefore an NFC measurement.
 *
 * ME-F11: that was true and said nowhere. Greek written with combining accents
 * is the same text on screen and a different string to a tokenizer, and it
 * costs 38 percent more on o200k, which moves the ratio a reader would be
 * looking at from 1.92x to 2.65x. A corpus that drifted into mixed forms would
 * move every published number without anything saying why.
 */
const notNormalised = corpus.pairs.filter(
  (p: { el: string; en: string }) => p.el !== p.el.normalize('NFC') || p.en !== p.en.normalize('NFC'),
)
if (notNormalised.length > 0) {
  console.error(
    `FAIL  ${notNormalised.length} of ${corpus.pairs.length} pairs in data/pairs.json are not in NFC, ` +
      'and every figure here is measured as if they were.',
  )
  console.error('      Greek with combining accents costs 38 percent more on o200k than the same text precomposed.')
  process.exit(1)
}

const TECHNICAL_FLOOR = { digits: 6, latin: 10 }
const technical = corpus.pairs.filter((p: { register?: string }) => p.register === 'technical')
if (technical.length === 0) {
  console.error('FAIL  data/pairs.json has no technical register, and the README quotes one')
  process.exit(1)
}
const greek = technical.map((p: { el: string }) => p.el).join(' ')
const digitCount = (greek.match(/[0-9]/g) ?? []).length
const latinCount = (greek.match(/[A-Za-z]+/g) ?? []).length
if (digitCount < TECHNICAL_FLOOR.digits || latinCount < TECHNICAL_FLOOR.latin) {
  console.error(
    `FAIL  the technical register holds ${digitCount} digits and ${latinCount} Latin words ` +
      `across ${technical.length} sentences, against a floor of ${TECHNICAL_FLOOR.digits} and ${TECHNICAL_FLOOR.latin}.`,
  )
  console.error(
    '      Technical Greek is full of identifiers, ports and version numbers, and those are exactly the two things',
  )
  console.error(
    '      that cost the same in both languages. A technical register without them overstates the Greek penalty:',
  )
  console.error('      measured at 2.33x against 1.67x for this register, and 2.06x against 1.92x for the headline.')
  process.exit(1)
}

if (corpus.pairs.length !== f.corpus.pairs) {
  console.error(`FAIL  data/pairs.json has ${corpus.pairs.length} pairs, findings.json says ${f.corpus.pairs}`)
  process.exit(1)
}

// findings.json has to be the measurement of the corpus sitting next to it, not
// of some earlier version of it. Editing data/pairs.json and forgetting to
// re-run the measurement would otherwise be silent, and every claim above would
// then have been checked against the wrong file.
const recomputed = hashInputs(corpus.pairs)
if (recomputed !== f.inputsHash) {
  console.error(
    `FAIL  src/generated/findings.json was measured from a different corpus.
` +
      `      findings.json says ${f.inputsHash}, data/pairs.json hashes to ${recomputed}.
` +
      `      Run "npm run measure".`,
  )
  process.exit(1)
}

// The corpus describes its own size in prose too, and that sentence went stale
// once already.
const methodSize = `${capital(pairWord)} sentence pairs`
if (!flatten(corpus.method).includes(methodSize)) {
  console.error(
    `FAIL  the method in data/pairs.json does not say "${methodSize}", ` +
      `but the file holds ${corpus.pairs.length} pairs.`,
  )
  process.exit(1)
}

/*
 * And the pictures are pictures of the sentence those counts are about.
 *
 * DR-F8. The caption's counts came from a hand typed copy of a corpus sentence
 * in `measure.ts`, the recording came from `PINNED_PAIR`, the two stills came
 * from nowhere anybody could name, and nothing tied any of them together. Tick
 * 128 rewrote the technical register and the copy stayed as it was, so for ten
 * ticks the README said **82 tokens on cl100k and 37 on o200k** under a picture
 * of a sentence that costs **71 and 35**, and the four claims above passed the
 * whole time because both sides of the check came from the same wrong copy.
 *
 * So the check runs the other way now: every artefact has to name the pin, and
 * the numbers recorded in each one have to be the numbers the measurement
 * produces for that pair.
 */
{
  const capture = JSON.parse(readFileSync(resolve(root, 'docs/capture.json'), 'utf8'))
  const stills = JSON.parse(readFileSync(resolve(root, 'docs/stills.json'), 'utf8'))
  const pin = Number(PINNED_PAIR)
  let wrong = 0
  const bad = (what: string, detail: string) => {
    wrong++
    console.error(`FAIL  ${what}`)
    console.error(`      ${detail}`)
  }

  if (enc('o200k_base').figureSentence.pair !== pin) {
    bad(
      'the measurement is not of the pinned sentence',
      `findings.json counts pair ${enc('o200k_base').figureSentence.pair} and the pin is ${pin}`,
    )
  }
  if (String(capture.pair) !== String(PINNED_PAIR)) {
    bad('the recording is not of the pinned sentence', `docs/capture.json says pair ${capture.pair}, the pin is ${PINNED_PAIR}`)
  }
  if (String(stills.pair) !== String(PINNED_PAIR)) {
    bad('the stills are not of the pinned sentence', `docs/stills.json says pair ${stills.pair}, the pin is ${PINNED_PAIR}`)
  }
  for (const shot of stills.shots ?? []) {
    const expected = enc(shot.encoding).figureSentence.el
    const seen = Number(String(shot.tokens).replace(/,/g, ''))
    if (seen !== expected) {
      bad(
        `${shot.file} shows ${seen} tokens and the measurement says ${expected}`,
        'The picture and its caption are about the same sentence, so they cannot disagree about what it costs. Re-run "npm run stills".',
      )
    }
  }
  if (wrong > 0) {
    console.error('\nThe caption, the recording and the two stills are one sentence or they are four claims.')
    process.exit(1)
  }
  console.log(
    `  ok      the caption, the recording and ${stills.shots.length} stills are all pair ${PINNED_PAIR}, ` +
      `at ${stills.shots.map((s: { tokens: string }) => s.tokens).join(' and ')} tokens`,
  )
}

console.log(`${claims.length} claims in README.md check out against findings.json`)
console.log(`corpus: ${corpus.pairs.length} pairs, dated ${f.corpusDated}, inputs ${f.inputsHash}`)
