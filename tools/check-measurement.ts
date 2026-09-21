/**
 * Re-run the measurement and check that the committed file is what it produces.
 *
 *   npm run check:measurement
 *
 * Until this existed, every gate in the project read `src/generated/findings.json`
 * and trusted it. The inputs hash caught an edited corpus, but nothing caught an
 * edited `tools/measure.ts`: break the bootstrap, break the byte counting, change
 * the seed, and `findings.json` on disk would not move, so all 26 claims would go
 * on passing against numbers the code no longer produces.
 *
 * The measurement is deterministic, so the check is exact. It runs the real
 * script into a scratch directory and compares byte for byte.
 *
 * It also greps the page for the one thing a diff cannot see: a number spelled
 * into `src/main.ts` or `index.html` rather than read from the measurement. The
 * page carried three of those under a footer promising it carried none, and
 * this found a fourth on its first run.
 *
 * Comments are checked too, deliberately. A comment that says "forty pairs"
 * goes stale exactly like a sentence that says it, and it is read by the person
 * most likely to act on it.
 */

import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ENCODINGS } from '../src/lib/encodings'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const committed = resolve(root, 'src/generated/findings.json')

/* ---------------------------------------------- the file against the code */

const scratch = mkdtempSync(resolve(tmpdir(), 'tokenlab-measure-'))
let failed = false

try {
  // The script writes to <root>/src/generated, so it runs against a copy of the
  // tree rather than against the working one. Nothing here can touch the file it
  // is checking.
  for (const dir of ['data', 'tools', 'src/lib', 'src/generated']) {
    cpSync(resolve(root, dir), resolve(scratch, dir), { recursive: true })
  }
  cpSync(resolve(root, 'node_modules'), resolve(scratch, 'node_modules'), {
    recursive: true,
    dereference: false,
  })
  cpSync(resolve(root, 'package.json'), resolve(scratch, 'package.json'))

  execFileSync(process.execPath, [resolve(scratch, 'node_modules/tsx/dist/cli.mjs'), resolve(scratch, 'tools/measure.ts')], {
    cwd: scratch,
    stdio: 'pipe',
  })

  const fresh = readFileSync(resolve(scratch, 'src/generated/findings.json'), 'utf8')
  const onDisk = readFileSync(committed, 'utf8')

  if (fresh !== onDisk) {
    failed = true
    console.error('FAIL  src/generated/findings.json is not what tools/measure.ts produces.')
    const a = onDisk.split('\n')
    const b = fresh.split('\n')
    let shown = 0
    for (let i = 0; i < Math.max(a.length, b.length) && shown < 6; i++) {
      if (a[i] !== b[i]) {
        console.error(`      line ${i + 1}`)
        console.error(`        committed: ${(a[i] ?? '<missing>').trim()}`)
        console.error(`        produced:  ${(b[i] ?? '<missing>').trim()}`)
        shown++
      }
    }
    console.error('      Run "npm run measure".')
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

/* ------------------------------------- the page against the same promise */

/**
 * Numbers that must never be spelled into the page, because the measurement
 * already carries them. Each is a phrase, not a bare digit, so this does not
 * fire on a CSS value or an array index.
 */
const f = JSON.parse(readFileSync(committed, 'utf8'))
const WORDS = ['zero', 'ten', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const corpusWord = WORDS[Math.floor(f.corpus.pairs / 10)] ?? String(f.corpus.pairs)

const banned: { pattern: RegExp; why: string }[] = [
  {
    pattern: new RegExp(`${corpusWord}\\s+(sentence\\s+)?(aligned\\s+)?pairs?`, 'i'),
    why: `the corpus size is findings.corpus.pairs`,
  },
  {
    pattern: new RegExp(`${f.method.bootstrapSamples.toLocaleString('en-US')}\\s+resamples`),
    why: 'the bootstrap count is findings.method.bootstrapSamples',
  },
  {
    pattern: /\b(four|4)\s+encodings\b/i,
    why: 'the number of encodings is the length of the registry',
  },
]

for (const file of ['src/main.ts', 'index.html']) {
  const text = readFileSync(resolve(root, file), 'utf8')
  for (const { pattern, why } of banned) {
    const hit = text.match(pattern)
    if (!hit) continue
    failed = true
    console.error(`FAIL  ${file} spells out a number the measurement already carries`)
    console.error(`      found: ${JSON.stringify(hit[0])}`)
    console.error(`      ${why}`)
  }
}

/* ------------------------------------------------- the registry itself */

/**
 * The alarm hue, reserved for a character that cost more than one token. An
 * encoding tinted near it hides the finding on the encoding where the finding
 * is worst, which happened once: cl100k shipped at hue 28 against an alarm at
 * 32 and the red chips were invisible on it.
 */
const ALARM_HUE = 45
const MIN_SEPARATION = 100

const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

const seen = new Set<number>()
for (const e of ENCODINGS) {
  if (seen.has(e.hue)) {
    failed = true
    console.error(`FAIL  two encodings share hue ${e.hue}, so the page cannot tell them apart`)
  }
  seen.add(e.hue)

  const d = hueDistance(e.hue, ALARM_HUE)
  if (d < MIN_SEPARATION) {
    failed = true
    console.error(
      `FAIL  ${e.id} is hue ${e.hue}, ${d} degrees from the alarm hue ${ALARM_HUE}`,
    )
    console.error(
      `      an encoding within ${MIN_SEPARATION} degrees of the alarm hides the ` +
        `fractured chips, which is the whole finding`,
    )
  }
}

if (failed) process.exit(1)

console.log(
  `findings.json reproduces from tools/measure.ts, the page spells out none of its ` +
    `numbers, and ${ENCODINGS.length} encodings each have a hue clear of the alarm`,
)
