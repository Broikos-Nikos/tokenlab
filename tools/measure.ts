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
  method: string
  pairs: Pair[]
}

const ENCODINGS = [
  { id: 'o200k_base', label: 'o200k' },
  { id: 'cl100k_base', label: 'cl100k' },
  { id: 'p50k_base', label: 'p50k' },
  { id: 'r50k_base', label: 'r50k' },
] as const

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

const BOOTSTRAP_SAMPLES = 10_000

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

    const [lo, hi] = bootstrapRatio(elCounts, enCounts, 20260920)

    const elBytes = corpus.pairs.reduce((a, p) => a + utf8Bytes(p.el), 0)
    const enBytes = corpus.pairs.reduce((a, p) => a + utf8Bytes(p.en), 0)
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

  // p50k and r50k are different vocabularies that happen to tokenize this corpus
  // identically. Saying so is the difference between one result and two.
  const p50k = encodings['p50k_base'] as Enc
  const r50k = encodings['r50k_base'] as Enc
  const olderPairIdentical = p50k.ratio === r50k.ratio

  const findings = {
    generatedAt: new Date().toISOString().slice(0, 10),
    olderPairIdentical,
    corpus: {
      name: corpus.name,
      pairs: corpus.pairs.length,
      registers,
      built: corpus.built,
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
      vocabularyCost: {
        o200k: o200k.lengthControlled.tokensPerByteRatio,
        cl100k: cl100k.lengthControlled.tokensPerByteRatio,
        p50k: p50k.lengthControlled.tokensPerByteRatio,
        r50k: r50k.lengthControlled.tokensPerByteRatio,
      },
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
  console.log('encoding  raw ratio   95% interval    vocabulary cost beyond the script')
  for (const enc of ENCODINGS) {
    const e = encodings[enc.id] as {
      ratio: number
      ratioInterval95: [number, number]
      lengthControlled: { tokensPerByteRatio: number; vocabularyPenaltyPercent: number }
    }
    const pct = e.lengthControlled.vocabularyPenaltyPercent
    console.log(
      `${enc.label.padEnd(9)} ${String(e.ratio).padEnd(11)}` +
        `${e.ratioInterval95[0]} to ${String(e.ratioInterval95[1]).padEnd(8)} ` +
        `${e.lengthControlled.tokensPerByteRatio}x  (${pct > 0 ? '+' : ''}${pct}%)`,
    )
  }
  if (olderPairIdentical) {
    console.log('\np50k and r50k tokenize this corpus identically. One result, not two.')
  }
  console.log('wrote src/generated/findings.json')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
