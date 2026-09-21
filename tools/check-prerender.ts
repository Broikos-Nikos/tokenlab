/**
 * The precomputed opening, against what the tokenizer actually produces.
 *
 *   npm run check:prerender
 *
 * `src/generated/preview.json` is what the page draws before any vocabulary has
 * arrived. It is therefore a set of claims about what four encodings do to forty
 * sentences, shipped as data, drawn as chips, and believed by the visitor.
 *
 * This project has already shipped a page that drew text nobody typed once, when
 * a shared decoder corrupted polytonic Greek. A stale precompute is the same
 * defect with a different cause: edit the corpus or change `segment()`, forget
 * to re-run `npm run prerender`, and the opening animation shows the previous
 * version of the truth with nothing to indicate it.
 *
 * So this re-derives every entry from the real encoders and the real
 * `segment()`, and fails on a single differing character.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPreview, previewKey, OPENING_ENCODINGS } from './prerender'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const committedPath = resolve(root, 'src/generated/preview.json')

const committed = JSON.parse(readFileSync(committedPath, 'utf8')) as Record<
  string,
  { s: { t: string; n: number }[]; tokens: number }
>
const fresh = await buildPreview()

let failed = 0
const fail = (msg: string, detail?: string) => {
  failed++
  if (failed > 6) return
  console.error(`FAIL  ${msg}`)
  if (detail) console.error(`      ${detail}`)
}

const committedKeys = Object.keys(committed).sort()
const freshKeys = Object.keys(fresh).sort()

if (committedKeys.length !== freshKeys.length) {
  fail(
    `preview.json has ${committedKeys.length} openings, the corpus and encodings produce ${freshKeys.length}`,
    'run "npm run prerender"',
  )
}

for (const key of freshKeys) {
  const want = fresh[key]
  const have = committed[key]
  if (!have) {
    fail(`preview.json is missing the opening ${key}`, 'run "npm run prerender"')
    continue
  }
  if (have.tokens !== want.tokens) {
    fail(`${key} claims ${have.tokens} tokens, the tokenizer produces ${want.tokens}`)
    continue
  }
  if (have.s.length !== want.s.length) {
    fail(`${key} has ${have.s.length} segments, the tokenizer produces ${want.s.length}`)
    continue
  }
  for (const [i, seg] of want.s.entries()) {
    const got = have.s[i]
    if (got.t !== seg.t || got.n !== seg.n) {
      fail(
        `${key} segment ${i} differs`,
        `committed ${JSON.stringify(got)}, produced ${JSON.stringify(seg)}`,
      )
      break
    }
  }
}

// An opening the page can reach but the precompute does not cover falls back to
// an empty stage, which is the thing this exists to prevent.
const corpus = JSON.parse(readFileSync(resolve(root, 'data/pairs.json'), 'utf8')) as {
  pairs: unknown[]
}
for (const id of OPENING_ENCODINGS) {
  for (let i = 0; i < corpus.pairs.length; i++) {
    for (const lang of ['el', 'en'] as const) {
      if (!committed[previewKey(i, lang, id)]) {
        fail(`no precomputed opening for pair ${i}, ${lang}, ${id}`)
      }
    }
  }
}

if (failed > 0) {
  if (failed > 6) console.error(`      ... and ${failed - 6} more`)
  console.error(
    `\n${failed} differences between src/generated/preview.json and what the ` +
      `tokenizer produces. The page would open by drawing the wrong thing.`,
  )
  process.exit(1)
}

const segments = Object.values(committed).reduce((a, v) => a + v.s.length, 0)
console.log(
  `${committedKeys.length} precomputed openings, ${segments} segments, ` +
    `all identical to what the tokenizer produces`,
)
