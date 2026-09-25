/**
 * The picture at the top is a comparison, not a wall of red and a freeze.
 *
 *   npm run check:loop            # or against any GIF: node tools/check-loop.mjs path.gif
 *
 * RC-F6, from the recruiter pass. Measured frame by frame on the recording that
 * shipped, motion per frame taken as the mean brightness of the difference
 * between consecutive frames:
 *
 *   4.91 s long, 59 frames
 *   the o200k state, the good news and the whole point, held 0.67 s of it
 *   the last 1.49 s, 30 percent of the loop, had no motion at all: a still
 *     photograph of the red wall
 *   the first frame, which is the one a streaming GIF paints first and the one
 *     a reader landing mid scroll sees, was a half drawn box with a red warning
 *     under it and "n/a" where the price goes
 *
 * "I get one or two loops. If both of them are mostly a blue wall and a frozen
 * frame, I have seen a mess, not a comparison, and the point of the project is
 * the comparison."
 *
 * ## What this reads
 *
 * The GIF itself, not the tool that made it. Each frame carries its own delay
 * and its own encoded size, and in an optimised GIF the size is a good proxy for
 * how much of the frame changed: a still frame compresses to a few dozen bytes
 * and the two moments the whole token box is redrawn are the largest frames in
 * the file. So the beats can be read straight out of what a reader downloads.
 *
 * Five assertions:
 *
 *   two redraws, not one, so the loop goes there and back and is a comparison
 *     rather than a one way animation with an ending
 *   three beats, each long enough to read and none of them a held photograph
 *   a total short enough that a reader who gives it ten seconds sees it twice
 *   the two calm beats together are a real share of the loop, which is the half
 *     the old recording gave 0.67 s to
 *   the recording opens and closes on the same state, so the cycle has no seam
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FINAL_ENCODING } from './capture-state.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const file = process.argv[2] ? resolve(process.argv[2]) : resolve(root, 'docs/shatter.gif')

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

if (!existsSync(file)) {
  console.error(`FAIL  ${file} is missing, and the README leads with it`)
  process.exit(1)
}

/**
 * Walk the GIF's blocks. A frame is an image descriptor plus its data blocks,
 * and the graphic control extension before it carries the delay in hundredths
 * of a second.
 */
function frames(buf) {
  let i = 13
  if (buf[10] & 0x80) i += 3 * (1 << ((buf[10] & 7) + 1))
  const out = []
  let delay = 0
  while (i < buf.length) {
    const block = buf[i]
    if (block === 0x21) {
      const label = buf[i + 1]
      i += 2
      if (label === 0xf9) delay = buf.readUInt16LE(i + 2)
      while (buf[i] !== 0) i += buf[i] + 1
      i++
    } else if (block === 0x2c) {
      const start = i
      const flags = buf[i + 9]
      i += 10
      if (flags & 0x80) i += 3 * (1 << ((flags & 7) + 1))
      i++
      while (buf[i] !== 0) i += buf[i] + 1
      i++
      out.push({ delayMs: delay * 10, bytes: i - start })
    } else if (block === 0x3b) {
      break
    } else {
      i++
    }
  }
  let at = 0
  return out.map((f) => {
    const frame = { at, ...f }
    at += f.delayMs
    return frame
  })
}

const all = frames(readFileSync(file))
if (all.length < 8) {
  fail(`${all.length} frames in ${file}, which is not a loop this gate can read`)
  process.exit(1)
}
const total = all.reduce((s, f) => s + f.delayMs, 0)

/*
 * The first frame is the whole picture arriving against nothing, so it is never
 * a redraw and it is left out of everything below.
 */
const rest = all.slice(1)
const peak = Math.max(...rest.map((f) => f.bytes))

/**
 * The longest stretch in which nothing changes, and where it starts. A still
 * frame in an optimised GIF is a few dozen bytes against a redraw's hundred
 * thousand, so "nothing changed" is readable straight off the file.
 */
let longestStill = { ms: 0, at: 0 }
let runFrom = null
for (const f of [...rest, { at: total, delayMs: 0, bytes: peak }]) {
  if (f.bytes < peak * 0.05) {
    if (runFrom === null) runFrom = f.at
  } else if (runFrom !== null) {
    if (f.at - runFrom > longestStill.ms) longestStill = { ms: f.at - runFrom, at: runFrom }
    runFrom = null
  }
}

/*
 * A redraw is measured against the largest change in the file rather than
 * against the median, and that is not a detail. The old recording moved
 * constantly, so its median frame was twice the size of this one's and no
 * multiple of it separated the two transitions from the animation around them.
 * The largest change in a loop like this is always one of the two.
 */
const clusters = []
for (const f of rest) {
  if (f.bytes < peak * 0.6) continue
  const last = clusters.at(-1)
  if (last && f.at - last.endsAt <= 300) {
    last.endsAt = f.at + f.delayMs
    last.bytes = Math.max(last.bytes, f.bytes)
  } else {
    clusters.push({ at: f.at, endsAt: f.at + f.delayMs, bytes: f.bytes })
  }
}

if (clusters.length !== 2) {
  fail(
    `the loop has ${clusters.length} whole box redraw${clusters.length === 1 ? '' : 's'} and a comparison has two`,
    clusters.length < 2
      ? 'One redraw is a one way animation: it shows the repair and stops, or the damage and stops.'
      : `at ${clusters.map((c) => `${(c.at / 1000).toFixed(2)}s`).join(', ')}. More than two and the loop never holds a state long enough to be one.`,
  )
  console.error(
    `      it is ${(total / 1000).toFixed(2)}s long and its longest motionless stretch is ` +
      `${(longestStill.ms / 1000).toFixed(2)}s, from ${(longestStill.at / 1000).toFixed(2)}s`,
  )
  console.error(`\n${failed} things wrong with the picture at the top of the README.`)
  process.exit(1)
}

const beats = [
  { name: 'the calm state it opens on', ms: clusters[0].at },
  { name: 'the red wall in the middle', ms: clusters[1].at - clusters[0].at },
  { name: 'the calm state it closes on', ms: total - clusters[1].at },
]

for (const b of beats) {
  if (b.ms < 900) {
    fail(
      `${b.name} lasts ${(b.ms / 1000).toFixed(2)}s`,
      'Under nine tenths of a second a state is a flicker. The recruiter pass measured the old one at 0.67s and could not tell you what it had seen.',
    )
  }
  if (b.ms > 2500) {
    fail(
      `${b.name} lasts ${(b.ms / 1000).toFixed(2)}s`,
      'Past two and a half seconds a held state reads as a frozen picture, which is what 30 percent of the old loop was.',
    )
  }
}

/*
 * And the freeze, which is what the finding was called: 30 percent of the old
 * loop was a still photograph of the red wall, at the end, where a reader who
 * gives the picture one cycle sees it last and longest.
 */
if (longestStill.ms > 900) {
  fail(
    `nothing moves for ${(longestStill.ms / 1000).toFixed(2)}s, from ${(longestStill.at / 1000).toFixed(2)}s`,
    'A held photograph inside a loop reads as a page that has stopped working. The old recording held one for 1.49s.',
  )
}

if (total < 3000 || total > 5500) {
  fail(
    `the loop is ${(total / 1000).toFixed(2)}s long`,
    'A recruiter gives the picture ten seconds. Under three it cannot hold three beats; over five and a half they see it once.',
  )
}

const calmShare = (beats[0].ms + beats[2].ms) / total
if (calmShare < 0.4) {
  fail(
    `the two calm beats are ${(100 * calmShare).toFixed(0)} percent of the loop`,
    'The old recording gave the state this project is arguing for 14 percent and the damage the rest.',
  )
}

/*
 * And the seam. The recording ends on FINAL_ENCODING, which `capture.mjs`
 * asserts, and `docs/capture.json` records the state it opens on. The same
 * state at both ends is what makes the loop a cycle rather than a film with a
 * cut in it.
 */
const record = resolve(root, 'docs/capture.json')
if (!existsSync(record)) {
  fail('docs/capture.json is missing, so nothing records which state the recording opens on')
} else {
  const was = JSON.parse(readFileSync(record, 'utf8'))
  if (was.opensOn !== FINAL_ENCODING) {
    fail(
      `the recording opens on ${JSON.stringify(was.opensOn)} and ends on ${FINAL_ENCODING}`,
      'A loop with different states at its ends has a jump cut in it, once per cycle, for ever.',
    )
  }
}

if (failed > 0) {
  console.error(`\n${failed} things wrong with the picture at the top of the README.`)
  process.exit(1)
}

console.log(
  `  ok      ${all.length} frames, ${(total / 1000).toFixed(2)}s: ${beats
    .map((b) => `${(b.ms / 1000).toFixed(2)}s`)
    .join(' then ')}, and ${(100 * calmShare).toFixed(0)} percent of it is the state this page argues for`,
)
console.log('loop: the picture is a comparison, both states hold long enough to read, and the cycle has no seam')
