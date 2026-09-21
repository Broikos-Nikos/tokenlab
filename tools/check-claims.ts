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
  `adds ${pct(enc('o200k_base').lengthControlled.vocabularyPenaltyPercent)} percent on top`,
)
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
const USED_BY: Record<string, string> = {
  o200k_base: 'GPT-6, GPT-5.x, GPT-4.1, GPT-4o',
  cl100k_base: 'GPT-4, GPT-3.5 Turbo, text-embedding-3',
  p50k_base: 'Codex, davinci-002',
  r50k_base: 'GPT-3, GPT-2',
}

for (const id of Object.keys(USED_BY)) {
  const e = enc(id)
  const [lo, hi] = e.ratioInterval95
  // The table is exact to one decimal. The prose above it rounds, which is a
  // different job, and both are checked.
  const penalty = e.lengthControlled.vocabularyPenaltyPercent.toFixed(1)
  add(
    `the whole ${id} row of the table`,
    `| \`${id}\` | ${USED_BY[id]} | ${e.ratio}x | ` +
      `${lo.toFixed(2)} to ${hi.toFixed(2)} | ` +
      // Two decimals always, so a column of figures lines up instead of showing
      // 5.1 next to 1.62 because one of them happened to round short.
      `${e.lengthControlled.bytesPerToken.el.toFixed(2)} | **+${penalty}%** |`,
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
if (corpus.pairs.length !== f.corpus.pairs) {
  console.error(`FAIL  data/pairs.json has ${corpus.pairs.length} pairs, findings.json says ${f.corpus.pairs}`)
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

console.log(`${claims.length} claims in README.md check out against findings.json`)
console.log(`corpus: ${corpus.pairs.length} pairs, measured ${f.generatedAt}`)
