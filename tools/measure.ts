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

    const byRegister = registers.map((r) => {
      const idx = corpus.pairs
        .map((p, i) => (p.register === r ? i : -1))
        .filter((i) => i >= 0)
      const el = idx.reduce((a, i) => a + elCounts[i], 0)
      const en = idx.reduce((a, i) => a + enCounts[i], 0)
      return { register: r, n: idx.length, el, en, ratio: round(el / en) }
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

    encodings[enc.id] = {
      label: enc.label,
      vocabularySize: mod.vocabularySize,
      totals: { elTokens: totalEl, enTokens: totalEn, elWords, enWords },
      ratio: round(totalEl / totalEn),
      ratioInterval95: [round(lo), round(hi)],
      tokensPerWord: { el: round(totalEl / elWords), en: round(totalEn / enWords) },
      byRegister,
      worstPair: worst,
    }
  }

  const o200k = encodings['o200k_base'] as { ratio: number }
  const cl100k = encodings['cl100k_base'] as { ratio: number }

  const findings = {
    generatedAt: new Date().toISOString().slice(0, 10),
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
    },
    encodings,
    pricing: { checked: pricing.checked, source: pricing.source },
  }

  const outDir = resolve(root, 'src/generated')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(resolve(outDir, 'findings.json'), JSON.stringify(findings, null, 2) + '\n')

  console.log(`corpus: ${corpus.pairs.length} pairs, ${registers.length} registers`)
  for (const enc of ENCODINGS) {
    const e = encodings[enc.id] as {
      ratio: number
      ratioInterval95: [number, number]
      totals: { elTokens: number; enTokens: number }
    }
    console.log(
      `${enc.label.padEnd(7)} Greek costs ${e.ratio}x English  ` +
        `(95% ${e.ratioInterval95[0]} to ${e.ratioInterval95[1]})  ` +
        `${e.totals.elTokens} vs ${e.totals.enTokens} tokens`,
    )
  }
  console.log('wrote src/generated/findings.json')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
