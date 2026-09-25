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
 * Four assertions:
 *
 * 1. **Capped and uncapped agree on everything except the text past the cap.**
 *    Same number of segments, same `start`, same ids, same `splitIntoBytes`,
 *    and the same `text` for every segment inside the cap.
 * 2. **Nothing past the cap is decoded, and nothing past it is built.** The
 *    saving is the whole point, so it is asserted rather than assumed: a cap
 *    that quietly decodes everything would pass assertion 1 perfectly. The
 *    second half is PA-F7, added at tick 133: the cap reached the decoder and
 *    stopped, while the walk went on building a segment object with its own ids
 *    array for every boundary in the input.
 * 3. **Past the cap the vocabulary is asked once per distinct token id**, not
 *    once per token. Counted, not timed.
 * 4. **The page passes a cap at all.** The assertions above hold whether or not
 *    `render()` uses one, so without this the fix could be reverted in one line
 *    and every gate here would stay green.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ENCODINGS, loadEncoder } from '../src/lib/tokenizers'
import { segment } from '../src/lib/segment'
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

      if (capped.total !== full.total) {
        fail(
          `${meta.id}, ${name}, cap ${cap}: ${capped.total} segments against ${full.total} uncapped`,
          'Capping the decode moved a boundary, so every count on the page is now wrong.',
        )
        continue
      }

      /*
       * Asserted before the drift walk, because it is the more specific
       * failure: an uncapped `drawn` also drifts, on the text of the first
       * segment past the cap, and a reader of that message would go looking for
       * a boundary bug instead of an allocation.
       */
      if (capped.drawn.length > cap) {
        fail(
          `${meta.id}, ${name}, cap ${cap}: ${capped.drawn.length} segment objects were built`,
          'Past the cap a segment is counted, not built. Building it is the allocation PA-F7 is about: 798,281 objects on a megabyte of Greek, per keystroke.',
        )
        continue
      }

      let drift: string | null = null
      for (let k = 0; k < capped.drawn.length && drift === null; k++) {
        const a = full.drawn[k]
        const b = capped.drawn[k]
        if (a.start !== b.start) drift = `segment ${k} starts at ${b.start}, uncapped says ${a.start}`
        else if (a.ids.length !== b.ids.length) drift = `segment ${k} holds ${b.ids.length} ids, uncapped says ${a.ids.length}`
        else if (a.splitIntoBytes !== b.splitIntoBytes) drift = `segment ${k} splitIntoBytes is ${b.splitIntoBytes}, uncapped says ${a.splitIntoBytes}`
        else if (a.text !== b.text) drift = `segment ${k} decoded to ${JSON.stringify(b.text)}, uncapped says ${JSON.stringify(a.text)}`
      }
      if (drift) {
        fail(`${meta.id}, ${name}, cap ${cap}`, drift)
        continue
      }

      /*
       * 2. And the saving is real rather than assumed, in both of its halves:
       * nothing past the cap is decoded, and nothing past the cap is built. The
       * second half is PA-F7. The cap reached the decoder and stopped there,
       * while the walk went on allocating a segment object with its own ids
       * array for every boundary in the input: 798,281 of them on a megabyte of
       * Greek, 233 MB of heap, thrown away and rebuilt on the next keystroke.
       */
      const decoded = capped.drawn.filter((s) => s.text !== null).length
      if (decoded > cap) {
        fail(
          `${meta.id}, ${name}, cap ${cap}: ${decoded} segments were decoded`,
          'The cap is being ignored, so the work it exists to avoid is still being done.',
        )
      }

      /*
       * And the number the page prints under the chips. The fracture count is
       * the one that moved: it used to be counted by filtering the array of
       * every segment, so capping what that array holds would have quietly
       * changed a sentence a visitor reads. It is counted in the walk now, and
       * this is what holds the capped walk to the uncapped one.
       *
       * The statistics used to be compared here too. They no longer take the
       * segments at all, so the comparison was `statsFor(text, ids)` against
       * itself: an assertion that cannot fail, which is worse than no assertion
       * because it reads like coverage.
       */
      if (full.fractured !== capped.fractured) {
        fail(`${meta.id}, ${name}, cap ${cap}: the fracture count is ${capped.fractured}, uncapped says ${full.fractured}`)
      }
    }
  }
}

if (failed === 0) {
  console.log(`  ok      ${compared} capped segmentations agree with their uncapped twin on every boundary, id and count`)
  console.log(`  ok      nothing past the cap is decoded, and nothing past it is built, across ${CAPS.length} caps and ${ENCODINGS.length} encodings`)
}

/*
 * 2b. And the walk past the cap asks the vocabulary once per distinct token,
 * not once per token.
 *
 * This is the other half of PA-F7 and it is invisible to every assertion above:
 * the boundaries come out identical either way, and the difference is only in
 * how much work it took. Counted rather than timed, so it fails the same on a
 * busy machine. Measured on a megabyte of Greek, cl100k: 279 ms in 851,174
 * calls before, 10 ms in 114 after.
 */
{
  const enc = encoders[ENCODINGS.findIndex((e) => e.id === 'cl100k_base')]
  const text = CASES.slice(0, 8)
    .map(([, t]) => t)
    .join(' ')
    .repeat(40)
  const ids = enc.encode(text)
  let calls = 0
  const counting = { ...enc, tokenBytes: (id: number) => { calls++; return enc.tokenBytes(id) } }
  const cap = 900
  const out = segment(counting, ids, cap)
  const distinct = new Set(ids.slice(cap)).size
  /*
   * Inside the cap the bytes are genuinely needed, once per token, and a drawn
   * segment can hold several: four is comfortably above what these encodings do
   * to this text and comfortably below one call per token, which is the state
   * this is here to catch.
   */
  const ceiling = cap * 4 + distinct

  if (out.total < cap * 2) {
    fail(`the input is only ${out.total} segments, so nothing is being measured past a cap of ${cap}`)
  } else if (calls > ceiling) {
    fail(
      `${calls.toLocaleString('en-US')} tokenBytes calls for ${ids.length.toLocaleString('en-US')} tokens of ${distinct.toLocaleString('en-US')} distinct ids`,
      'Past the cap the bytes of a token are only needed to place a boundary, which depends on the id alone. Asking once per token is the walk PA-F7 is about.',
    )
  } else {
    console.log(
      `  ok      past the cap the vocabulary is asked ${calls.toLocaleString('en-US')} times for ` +
        `${ids.length.toLocaleString('en-US')} tokens, ${distinct.toLocaleString('en-US')} of them distinct`,
    )
  }
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
