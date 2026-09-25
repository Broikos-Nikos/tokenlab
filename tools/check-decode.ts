/**
 * Capping the decode changes nothing any number is made of.
 *
 *   npm run check:decode
 *
 * HS-F5 was filed as "every keystroke re-tokenizes everything, so a large paste
 * drops the page to about 3 fps". Measured, the tokenizer is not where the time
 * goes. On 400,000 characters of Greek one keystroke cost 202 ms and it split
 * encode 29 ms, segment 151 ms, stats 23 ms: one `TextDecoder` call for each of
 * 140,353 tokens, to draw the 901 chips `MAX_CHIPS` allows.
 *
 * So `segment()` now takes a `decodeFirst` and `render()` passes `MAX_CHIPS`.
 * That is a real risk and this gate is the answer to it: **every count on the
 * page is made of segment boundaries**, the fracture count, the split share,
 * the "and N more" chip, and if capping the decode moved a boundary, every one
 * of those would be wrong while the page looked fine.
 *
 * `check:segments` does not cover this. Its 92 cases call `segment()` with no
 * cap, which is the path the page no longer takes.
 *
 * Three assertions:
 *
 * 1. **Capped and uncapped agree on everything except the text past the cap.**
 *    Same number of segments, same `start`, same ids, same `splitIntoBytes`,
 *    and the same `text` for every segment inside the cap.
 * 2. **Nothing past the cap is decoded.** The saving is the whole point, so it
 *    is asserted rather than assumed: a cap that quietly decodes everything
 *    would pass assertion 1 perfectly.
 * 3. **The page passes a cap at all.** Assertions 1 and 2 hold whether or not
 *    `render()` uses one, so without this the fix could be reverted in one line
 *    and every gate here would stay green.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ENCODINGS, loadEncoder } from '../src/lib/tokenizers'
import { segment, statsFor } from '../src/lib/segment'
import { CASES } from './check-segments'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let failed = 0
const fail = (what: string, detail?: string) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

const encoders = await Promise.all(ENCODINGS.map((e) => loadEncoder(e.id)))

/*
 * Long inputs as well as the 92 short ones, because the cap only bites past it
 * and every case in `check:segments` is a sentence. Repeating a case to length
 * keeps the interesting characters in it: polytonic Greek and emoji are where
 * the multi-token runs are, and a boundary bug would hide in exactly those.
 */
const LONG = CASES.slice(0, 8).map(([name, text]) => [
  `${name}, repeated to 20,000 characters`,
  text.repeat(Math.ceil(20000 / text.length)).slice(0, 20000),
] as [string, string])

const CAPS = [0, 1, 7, 64, 900]
let compared = 0

for (const [i, meta] of ENCODINGS.entries()) {
  const enc = encoders[i]
  for (const [name, text] of [...CASES, ...LONG]) {
    const ids = enc.encode(text)
    const full = segment(enc, ids)
    for (const cap of CAPS) {
      const capped = segment(enc, ids, cap)
      compared++

      if (capped.length !== full.length) {
        fail(
          `${meta.id}, ${name}, cap ${cap}: ${capped.length} segments against ${full.length} uncapped`,
          'Capping the decode moved a boundary, so every count on the page is now wrong.',
        )
        continue
      }

      let drift: string | null = null
      for (let k = 0; k < full.length && drift === null; k++) {
        const a = full[k]
        const b = capped[k]
        if (a.start !== b.start) drift = `segment ${k} starts at ${b.start}, uncapped says ${a.start}`
        else if (a.ids.length !== b.ids.length) drift = `segment ${k} holds ${b.ids.length} ids, uncapped says ${a.ids.length}`
        else if (a.splitIntoBytes !== b.splitIntoBytes) drift = `segment ${k} splitIntoBytes is ${b.splitIntoBytes}, uncapped says ${a.splitIntoBytes}`
        else if (k < cap && a.text !== b.text) drift = `segment ${k} decoded to ${JSON.stringify(b.text)}, uncapped says ${JSON.stringify(a.text)}`
      }
      if (drift) {
        fail(`${meta.id}, ${name}, cap ${cap}`, drift)
        continue
      }

      /* 2. And the saving is real rather than assumed. */
      const decoded = capped.filter((s) => s.text !== null).length
      if (decoded > cap) {
        fail(
          `${meta.id}, ${name}, cap ${cap}: ${decoded} segments were decoded`,
          'The cap is being ignored, so the work it exists to avoid is still being done.',
        )
      }

      /* And the numbers the page prints, which are made of boundaries. */
      const a = statsFor(text, ids, full)
      const b = statsFor(text, ids, capped)
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        fail(`${meta.id}, ${name}, cap ${cap}: the statistics differ`, `uncapped ${JSON.stringify(a)}\n      capped   ${JSON.stringify(b)}`)
      }
      const fa = full.filter((s) => s.splitIntoBytes).length
      const fb = capped.filter((s) => s.splitIntoBytes).length
      if (fa !== fb) fail(`${meta.id}, ${name}, cap ${cap}: the fracture count is ${fb}, uncapped says ${fa}`)
    }
  }
}

if (failed === 0) {
  console.log(`  ok      ${compared} capped segmentations agree with their uncapped twin on every boundary, id and count`)
  console.log(`  ok      nothing past the cap is decoded, across ${CAPS.length} caps and ${ENCODINGS.length} encodings`)
}

/*
 * 3. The page actually uses a cap. Read out of the source, because both
 * assertions above hold perfectly against a page that passes no cap at all, and
 * the whole fix is one argument long.
 */
const main = readFileSync(resolve(root, 'src/main.ts'), 'utf8')
const call = main.match(/const segments = segment\(encoder, ids([^)]*)\)/)
if (!call) {
  fail('render() does not call segment(encoder, ids, ...) in the shape this gate knows', 'If the call moved, this assertion is measuring nothing and has to be rewritten.')
} else if (call[1].trim() === '') {
  fail(
    'render() calls segment() with no decode cap',
    'Every token in the paste is decoded to draw at most MAX_CHIPS chips, which is HS-F5: 151 ms of a 202 ms keystroke at 400,000 characters.',
  )
} else {
  console.log(`  ok      render() caps the decode: segment(encoder, ids${call[1]})`)
}

if (failed > 0) {
  console.error('\nEvery count on this page is made of segment boundaries. A cap that moves one is wrong everywhere at once.')
  process.exit(1)
}

console.log('decode: capping what is decoded changes nothing that is counted, and the page does cap it')
