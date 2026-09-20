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
}

const claims: Claim[] = []
const add = (about: string, must: string) => claims.push({ about, must })

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
add(
  'what the two older vocabularies add',
  `\`r50k\` it adds ${Math.round(enc('r50k_base').lengthControlled.vocabularyPenaltyPercent)} percent`,
)

// ---- the picture ----------------------------------------------------------

// The recording is pinned to one sentence precisely so its numbers can be
// checked like any other. An unpinned capture would put uncheckable numbers at
// the top of the README, which is where this project has been wrong before.
add(
  'the token counts in the caption under the recording',
  `${enc('cl100k_base').figureSentence.el} tokens on \`cl100k\` and ` +
    `${enc('o200k_base').figureSentence.el} on \`o200k\``,
)

add('the o200k count on the left picture', `\`o200k\`, ${enc('o200k_base').figureSentence.el} tokens`)
add('the cl100k count on the right picture', `\`cl100k\`, ${enc('cl100k_base').figureSentence.el} tokens`)
add('the word count under the pictures', `for ${enc('o200k_base').figureSentence.elWords} Greek words`)
add('the character count under the pictures', `same ${enc('o200k_base').figureSentence.elChars} characters`)

// ---- the table ------------------------------------------------------------

for (const [id, label] of [
  ['o200k_base', 'o200k_base'],
  ['cl100k_base', 'cl100k_base'],
  ['p50k_base', 'p50k_base'],
  ['r50k_base', 'r50k_base'],
] as const) {
  const e = enc(id)
  const [lo, hi] = e.ratioInterval95
  add(`${label} raw ratio in the table`, `| ${e.ratio}x |`)
  add(`${label} interval in the table`, `| ${lo.toFixed(2)} to ${hi.toFixed(2)} |`)
  // Two decimals always, so a column of figures lines up instead of showing
  // 5.1 next to 1.62 because one of them happened to round short.
  add(`${label} bytes per Greek token in the table`, `| ${e.lengthControlled.bytesPerToken.el.toFixed(2)} |`)
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

add('the corpus size', `Forty sentence pairs`)
add('the bootstrap size', `${(10000).toLocaleString('en-US')} resamples`)

// ---- run -------------------------------------------------------------------

// Markdown wraps prose, and line endings differ between a Windows checkout and a
// Linux one. A claim must not fail for either, so both sides are flattened to
// single spaced text before they are compared.
const flatten = (s: string) => s.replace(/\s+/g, ' ').trim()
const haystack = flatten(readme)

let failed = 0
for (const c2 of claims) {
  const want = flatten(c2.must)
  if (haystack.includes(want)) continue
  failed++
  console.error(`FAIL  ${c2.about}`)
  console.error(`      README.md must contain: ${JSON.stringify(want)}`)
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

console.log(`${claims.length} claims in README.md check out against findings.json`)
console.log(`corpus: ${corpus.pairs.length} pairs, measured ${f.generatedAt}`)
