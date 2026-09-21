/**
 * The measurement.
 *
 * Reads the aligned corpus, tokenizes every pair with every encoding, and
 * writes one file: src/generated/findings.json. The page reads that file. No
 * number shown anywhere in this project is typed by hand.
 *
 *   npm run measure
 *
 * The ratio is a ratio of totals, not a mean of per sentence ratios. A mean of
 * ratios lets a four word sentence weigh as much as a thirty word one, which
 * would be a way of choosing the answer in advance.
 *
 * Forty pairs is a small corpus, so the ratio comes with a paired bootstrap
 * interval. If the interval is wide, the honest thing is to show that it is
 * wide rather than to round the point estimate and move on.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashInputs, BOOTSTRAP_SAMPLES, SEED } from './inputs-hash'
import { ENCODINGS } from '../src/lib/encodings'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

interface Pair {
  register: string
  en: string
  el: string
}

interface Corpus {
  name: string
  built: string
  revised?: string
  method: string
  pairs: Pair[]
}


const WORD = /[\p{L}\p{N}][\p{L}\p{N}\p{M}'’-]*/gu
const countWords = (s: string) => (s.match(WORD) ?? []).length

/**
 * The length control, and the reason this file grew.
 *
 * Greek in UTF-8 is two bytes a letter where English is one. That alone makes a
 * Greek sentence roughly twice the bytes of the same sentence in English, before
 * any tokenizer is involved. A raw token ratio therefore measures two things at
 * once and credits both of them to the vocabulary.
 *
 * Tokens per byte separates them. If a tokenizer compresses Greek bytes as well
 * as it compresses English bytes, the ratio is 1.0 and the vocabulary is not the
 * problem: the script is. Anything above 1.0 is what the vocabulary actually
 * costs, and that is the number worth publishing.
 */
const utf8Bytes = (s: string) => Buffer.byteLength(s, 'utf8')

/** The sentence in the README's two screenshots, so its counts stop being typed by hand. */
const FIGURE_SENTENCE = {
  el: 'Εγκαταστήστε τις εξαρτήσεις, εκτελέστε το build και ανοίξτε τη σελίδα στη θύρα τρεις χιλιάδες.',
  en: 'Install the dependencies, run the build, and open the page on port three thousand.',
}


/** Deterministic PRNG so the interval is the same on every machine. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function bootstrapRatio(el: number[], en: number[], seed: number): [number, number] {
  const rand = mulberry32(seed)
  const n = el.length
  const ratios: number[] = new Array(BOOTSTRAP_SAMPLES)
  for (let s = 0; s < BOOTSTRAP_SAMPLES; s++) {
    let sumEl = 0
    let sumEn = 0
    for (let i = 0; i < n; i++) {
      const k = Math.floor(rand() * n)
      sumEl += el[k]
      sumEn += en[k]
    }
    ratios[s] = sumEn === 0 ? 0 : sumEl / sumEn
  }
  ratios.sort((a, b) => a - b)
  const lo = ratios[Math.floor(0.025 * BOOTSTRAP_SAMPLES)]
  const hi = ratios[Math.floor(0.975 * BOOTSTRAP_SAMPLES)]
  return [lo, hi]
}

/**
 * The same paired resampling, over the quantity the project actually leads with.
 *
 * This was missing, and its absence was the worst thing in the repository. The
 * vocabulary penalty is the number `measure.ts` argues is the one worth
 * publishing and the README says matters more than the headline, and it was the
 * only number here printed without an interval, sitting one column to the right
 * of an interval that does not cover it. The four per pair quantities are
 * resampled together, because a pair is the unit: its Greek tokens, its English
 * tokens, its Greek bytes and its English bytes move as one observation.
 */
function bootstrapPenalty(
  elTok: number[], enTok: number[], elByt: number[], enByt: number[], seed: number,
): [number, number] {
  const rand = mulberry32(seed)
  const n = elTok.length
  const out: number[] = new Array(BOOTSTRAP_SAMPLES)
  for (let s = 0; s < BOOTSTRAP_SAMPLES; s++) {
    let a = 0, b = 0, c = 0, d = 0
    for (let i = 0; i < n; i++) {
      const k = Math.floor(rand() * n)
      a += elTok[k]; b += elByt[k]; c += enTok[k]; d += enByt[k]
    }
    out[s] = b === 0 || c === 0 || d === 0 ? 0 : (a / b) / (c / d)
  }
  out.sort((x, y) => x - y)
  return [
    (out[Math.floor(0.025 * BOOTSTRAP_SAMPLES)] - 1) * 100,
    (out[Math.floor(0.975 * BOOTSTRAP_SAMPLES)] - 1) * 100,
  ]
}

const round = (n: number, places = 2) => Number(n.toFixed(places))


async function main() {
  const corpus: Corpus = JSON.parse(
    readFileSync(resolve(root, 'data/pairs.json'), 'utf8'),
  )
  const pricing = JSON.parse(readFileSync(resolve(root, 'data/pricing.json'), 'utf8'))

  const registers = [...new Set(corpus.pairs.map((p) => p.register))]
  const encodings: Record<string, unknown> = {}

  for (const enc of ENCODINGS) {
    const mod = await import(`gpt-tokenizer/encoding/${enc.id}`)
    const encode = (s: string) => mod.encode(s) as number[]

    const elCounts = corpus.pairs.map((p) => encode(p.el).length)
    const enCounts = corpus.pairs.map((p) => encode(p.en).length)
    const elWords = corpus.pairs.reduce((a, p) => a + countWords(p.el), 0)
    const enWords = corpus.pairs.reduce((a, p) => a + countWords(p.en), 0)
    const totalEl = elCounts.reduce((a, b) => a + b, 0)
    const totalEn = enCounts.reduce((a, b) => a + b, 0)

    const [lo, hi] = bootstrapRatio(elCounts, enCounts, SEED)

    const elByteCounts = corpus.pairs.map((p) => utf8Bytes(p.el))
    const enByteCounts = corpus.pairs.map((p) => utf8Bytes(p.en))
    const elBytes = elByteCounts.reduce((a, b) => a + b, 0)
    const enBytes = enByteCounts.reduce((a, b) => a + b, 0)
    const elChars = corpus.pairs.reduce((a, p) => a + [...p.el].length, 0)
    const enChars = corpus.pairs.reduce((a, p) => a + [...p.en].length, 0)

    const byRegister = registers.map((r) => {
      const idx = corpus.pairs
        .map((p, i) => (p.register === r ? i : -1))
        .filter((i) => i >= 0)
      const el = idx.reduce((a, i) => a + elCounts[i], 0)
      const en = idx.reduce((a, i) => a + enCounts[i], 0)
      const elW = idx.reduce((a, i) => a + countWords(corpus.pairs[i].el), 0)
      const enW = idx.reduce((a, i) => a + countWords(corpus.pairs[i].en), 0)
      return {
        register: r,
        n: idx.length,
        el,
        en,
        ratio: round(el / en),
        // The ratio above moves with how long the author wrote each side. These
        // two do not, and they are what a cost model for Greek actually uses.
        elTokensPerWord: round(el / elW),
        enTokensPerWord: round(en / enW),
        wordRatio: round(elW / enW, 3),
      }
    })

    // Worst single pair, because the average hides the sentence that hurts.
    let worst = { ratio: 0, en: '', el: '', enTokens: 0, elTokens: 0 }
    corpus.pairs.forEach((p, i) => {
      const r = elCounts[i] / enCounts[i]
      if (r > worst.ratio) {
        worst = {
          ratio: round(r),
          en: p.en,
          el: p.el,
          enTokens: enCounts[i],
          elTokens: elCounts[i],
        }
      }
    })

    const elPerByte = totalEl / elBytes
    const enPerByte = totalEn / enBytes
    const [penaltyLo, penaltyHi] = bootstrapPenalty(
      elCounts, enCounts, elByteCounts, enByteCounts, SEED,
    )

    encodings[enc.id] = {
      label: enc.label,
      vocabularySize: mod.vocabularySize,
      totals: {
        elTokens: totalEl,
        enTokens: totalEn,
        elWords,
        enWords,
        elChars,
        enChars,
        elBytes,
        enBytes,
      },
      ratio: round(totalEl / totalEn),
      ratioInterval95: [round(lo), round(hi)],
      tokensPerWord: { el: round(totalEl / elWords), en: round(totalEn / enWords) },
      /** The length control. See the note on utf8Bytes above. */
      lengthControlled: {
        byteRatio: round(elBytes / enBytes, 3),
        charRatio: round(elChars / enChars, 3),
        bytesPerToken: { el: round(elBytes / totalEl), en: round(enBytes / totalEn) },
        /** Above 1.0 is what this vocabulary costs Greek beyond the script itself. */
        tokensPerByteRatio: round(elPerByte / enPerByte, 3),
        vocabularyPenaltyPercent: round((elPerByte / enPerByte - 1) * 100, 1),
        vocabularyPenaltyInterval95: [round(penaltyLo, 1), round(penaltyHi, 1)],
        /** True when this corpus cannot tell this vocabulary's penalty from none. */
        penaltyIndistinguishableFromZero: penaltyLo <= 0 && penaltyHi >= 0,
      },
      byRegister,
      worstPair: worst,
      figureSentence: {
        el: encode(FIGURE_SENTENCE.el).length,
        en: encode(FIGURE_SENTENCE.en).length,
        elWords: countWords(FIGURE_SENTENCE.el),
        elChars: [...FIGURE_SENTENCE.el].length,
      },
    }
  }

  type Enc = {
    ratio: number
    lengthControlled: { byteRatio: number; tokensPerByteRatio: number; vocabularyPenaltyPercent: number }
  }
  const o200k = encodings['o200k_base'] as Enc
  const cl100k = encodings['cl100k_base'] as Enc

  /*
   * Which encodings tokenize this corpus identically, whichever they turn out
   * to be. This was a hardcoded p50k against r50k comparison, so a fifth
   * encoding that matched one of them would have gone unmentioned, and a
   * corpus that separated those two would have left the sentence saying they
   * agree.
   */
  const identicalGroups: string[][] = []
  for (const e of ENCODINGS) {
    const mine = (encodings[e.id] as { totals: { elTokens: number; enTokens: number } }).totals
    const group = identicalGroups.find((g) => {
      const other = (encodings[g[0]] as { totals: { elTokens: number; enTokens: number } }).totals
      return other.elTokens === mine.elTokens && other.enTokens === mine.enTokens
    })
    if (group) group.push(e.id)
    else identicalGroups.push([e.id])
  }
  const identical = identicalGroups.filter((g) => g.length > 1)

  /*
   * No wall clock anywhere in this file.
   *
   * `generatedAt` used to be `new Date()` in UTC, and the corpus dates itself in
   * local time, so the page reported a measurement dated the day before the
   * corpus it had just measured. It also meant re-running `npm run measure` on
   * an unchanged corpus produced a diff every day, which trains a reader to
   * ignore diffs in the one file that must never drift unnoticed.
   *
   * The measurement is a pure function of its inputs, so it is dated by its
   * inputs. Same corpus, same numbers, byte identical file, and the date shown
   * is the corpus date, which cannot precede itself.
   */
  // Deliberately only over things another script can see without loading a
  // vocabulary, so `npm run check` can recompute it and catch a findings.json
  // that is stale against the corpus beside it.
  const inputsHash = hashInputs(corpus.pairs)

  const findings = {
    corpusDated: corpus.revised ?? corpus.built,
    inputsHash,
    // The page quoted these as literals in its own source, under a footer
    // saying every number on it comes from this file. They come from this file
    // now.
    method: { bootstrapSamples: BOOTSTRAP_SAMPLES, seed: SEED },
    identicalEncodings: identical,
    corpus: {
      name: corpus.name,
      pairs: corpus.pairs.length,
      registers,
      built: corpus.built,
      revised: corpus.revised ?? null,
      method: corpus.method,
    },
    headline: {
      o200kRatio: o200k.ratio,
      cl100kRatio: cl100k.ratio,
      /** How much the newer vocabulary saved Greek. */
      improvement: round(cl100k.ratio / o200k.ratio),
      /**
       * The honest split. The raw ratio is the script times the vocabulary, and
       * on o200k the vocabulary has all but stopped contributing.
       */
      scriptCost: o200k.lengthControlled.byteRatio,
      // Keyed by label, built from the registry, so a fifth encoding appears
      // here without anyone remembering to add it.
      vocabularyCost: Object.fromEntries(
        ENCODINGS.map((e) => [
          e.label,
          (encodings[e.id] as Enc).lengthControlled.tokensPerByteRatio,
        ]),
      ),
    },
    encodings,
    pricing: { checked: pricing.checked, source: pricing.source },
  }

  const outDir = resolve(root, 'src/generated')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(resolve(outDir, 'findings.json'), JSON.stringify(findings, null, 2) + '\n')

  console.log(`corpus: ${corpus.pairs.length} pairs, ${registers.length} registers`)
  console.log(
    `Greek is ${o200k.lengthControlled.byteRatio}x the UTF-8 bytes of English before any tokenizer runs.\n`,
  )
  console.log('encoding  raw ratio   95% interval    vocabulary cost beyond the script, with its own interval')
  for (const enc of ENCODINGS) {
    const e = encodings[enc.id] as {
      ratio: number
      ratioInterval95: [number, number]
      lengthControlled: {
        tokensPerByteRatio: number
        vocabularyPenaltyPercent: number
        vocabularyPenaltyInterval95: [number, number]
        penaltyIndistinguishableFromZero: boolean
      }
    }
    const L = e.lengthControlled
    const pct = L.vocabularyPenaltyPercent
    const [plo, phi] = L.vocabularyPenaltyInterval95
    const flag = L.penaltyIndistinguishableFromZero ? '  <- includes zero' : ''
    console.log(
      `${enc.label.padEnd(9)} ${String(e.ratio).padEnd(11)}` +
        `${e.ratioInterval95[0]} to ${String(e.ratioInterval95[1]).padEnd(8)} ` +
        `${(pct > 0 ? '+' : '') + pct}%  (${plo}% to ${phi}%)${flag}`,
    )
  }
  for (const g of identical) {
    const labels = g.map((id) => ENCODINGS.find((e) => e.id === id)!.label)
    console.log(
      `\n${labels.slice(0, -1).join(', ')} and ${labels.at(-1)} tokenize this corpus ` +
        `identically. ${labels.length} vocabularies, one result.`,
    )
  }
  console.log(`
corpus dated ${findings.corpusDated}, inputs ${inputsHash}`)
  console.log('wrote src/generated/findings.json')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
