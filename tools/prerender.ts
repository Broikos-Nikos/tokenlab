/**
 * Draw the opening move without waiting for a megabyte of vocabulary.
 *
 *   npm run prerender
 *
 * The page opens on `cl100k` and heals to `o200k`, which is the whole argument
 * made in two seconds. Both of those need a vocabulary: 951 kB and 2 MB raw, 439
 * kB and 1,025 kB gzipped. Until the first one lands the stage is empty, so the
 * argument does not start until the download finishes.
 *
 * Every sentence the page can open with is known at build time, and so is every
 * encoding it can open in. This precomputes the segments for exactly that set,
 * so the opening is instant and the vocabulary is only needed when the visitor
 * types something of their own.
 *
 * It calls the same `segment()` the page calls, over the same `Encoder` shape,
 * which is the only reason this is safe: a precompute that drifts from the
 * runtime draws something the tokenizer never produced, which is the defect this
 * project has already shipped once in another form. `npm run check:prerender`
 * re-derives every entry and fails on a single differing character.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { textOf, segment } from '../src/lib/segment'
import { loadEncoder } from '../src/lib/tokenizers'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Only the two the page can open in. Precomputing all four would double the
 * file for encodings a visitor only reaches by clicking, at which point the
 * vocabulary is already downloading anyway.
 */
export const OPENING_ENCODINGS = ['cl100k_base', 'o200k_base'] as const

export interface PreviewSegment {
  /** The text of the segment, which is what the chip shows. */
  t: string
  /** How many tokens it cost. 1 unless the tokenizer spelled it out in bytes. */
  n: number
}

export interface Preview {
  /** Keyed `<pairIndex>:<lang>:<encoding>`. */
  [key: string]: { s: PreviewSegment[]; tokens: number }
}

export const previewKey = (pair: number, lang: 'el' | 'en', encoding: string) =>
  `${pair}:${lang}:${encoding}`

export async function buildPreview(): Promise<Preview> {
  const corpus = JSON.parse(readFileSync(resolve(root, 'data/pairs.json'), 'utf8')) as {
    pairs: { el: string; en: string }[]
  }

  const out: Preview = {}
  for (const id of OPENING_ENCODINGS) {
    const encoder = await loadEncoder(id)
    for (const [i, pair] of corpus.pairs.entries()) {
      for (const lang of ['el', 'en'] as const) {
        const ids = encoder.encode(pair[lang])
        const segs = segment(encoder, ids)
        out[previewKey(i, lang, id)] = {
          s: segs.map((x) => ({ t: textOf(x), n: x.ids.length })),
          tokens: ids.length,
        }
      }
    }
  }
  return out
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop() ?? '')) {
  const preview = await buildPreview()
  const dir = resolve(root, 'src/generated')
  mkdirSync(dir, { recursive: true })
  const json = JSON.stringify(preview)
  writeFileSync(resolve(dir, 'preview.json'), json + '\n')

  const entries = Object.keys(preview).length
  const segments = Object.values(preview).reduce((a, v) => a + v.s.length, 0)
  console.log(
    `wrote src/generated/preview.json: ${entries} openings, ${segments} segments, ` +
      `${(json.length / 1024).toFixed(1)} kB raw`,
  )
}
