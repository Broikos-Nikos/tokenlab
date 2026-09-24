/**
 * The picture at the top of the README is a picture of this page.
 *
 *   npm run check:capture        # needs a server, so npm run verify runs it
 *
 * Every other gate here reads source, a measurement or the rendered DOM. Not one
 * of them can see that `docs/shatter.gif` has become a photograph of a page that
 * no longer exists, and the README underneath it says, in as many words, "That
 * is the real page in a real browser".
 *
 * How close that came on 21 September, from this repository's own history:
 *
 *   01:06  the recording is committed
 *   18:35  the palette is replaced wholesale. Hue 265, which is blue, becomes
 *          the warm ember of the rest of the work; the wash stops following the
 *          selected encoding; the wordmark stops changing colour with the data
 *   18:38  the recording is committed again
 *
 * Three minutes. Nothing in the repository connected those two commits, and
 * nothing would have complained about the version of that afternoon where the
 * second one did not happen. `watch-it-think` ran the same race and lost it: its
 * recording sat stale for two days and a recruiter audit found it in ten
 * seconds, which is all the time a picture at the top of a README ever gets.
 *
 * Three things are compared, and the third is the one people forget:
 *
 *   the paint, because a palette change makes it a picture of another site
 *   the words, because a headline change makes it a picture of another argument
 *   the counts, because this picture's content is a token count and a wall of
 *     broken chips, both printed large enough to check against the caption
 *
 * Not pixels. A screenshot diff would fail on font hinting and on every shuffle
 * of the sentence, and a gate that cries wolf is a gate that gets skipped.
 */

import { readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lookAt, PAIR, FINAL_ENCODING } from './capture-state.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const record = resolve(root, 'docs/capture.json')
const gif = resolve(root, 'docs/shatter.gif')

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

/**
 * Playwright is not a dependency of this project on purpose: installing a
 * browser engine to run a page that needs no backend is a strange tax on
 * somebody who just wants to clone it. Same resolution as the other browser
 * tools here.
 */
async function loadPlaywright() {
  const { createRequire } = await import('node:module')
  const req = createRequire(import.meta.url)
  const candidates = [process.env.PLAYWRIGHT_PATH, 'playwright', resolve(root, 'node_modules/playwright')].filter(Boolean)
  for (const c of candidates) {
    try {
      const mod = req(c)
      if (mod?.chromium) return mod
    } catch {
      // try the next one
    }
    try {
      const mod = await import(c)
      if (mod?.chromium) return mod
      if (mod?.default?.chromium) return mod.default
    } catch {
      // try the next one
    }
  }
  console.error(
    'Playwright not found. Either `npm i -D playwright && npx playwright install chromium`,\n' +
      'or point PLAYWRIGHT_PATH at an existing install.',
  )
  process.exit(1)
}

if (!existsSync(gif)) {
  console.error('FAIL  docs/shatter.gif is missing, and the README leads with it')
  process.exit(1)
}
if (!existsSync(record)) {
  console.error('FAIL  docs/capture.json is missing, so nothing records what the page looked like when it was filmed')
  console.error('      run npm run capture')
  process.exit(1)
}

const was = JSON.parse(readFileSync(record, 'utf8'))

/*
 * A record written by an older tool is refused, not partly believed. Comparing
 * whichever keys happen to be present means that the day the capture learns to
 * write down something new, this goes on passing without it.
 */
for (const part of ['paint', 'words', 'state']) {
  if (!was.looked || typeof was.looked[part] !== 'object') {
    fail(`docs/capture.json records no ${part}, so it was made before this gate read ${part}`, 'Run npm run capture.')
  }
}
if (failed > 0) process.exit(1)

if (was.pair !== PAIR) {
  fail(
    `the recording is of pair ${was.pair} and this run is checking pair ${PAIR}`,
    'The counts under the picture belong to one pinned sentence.',
  )
}

const { chromium } = await loadPlaywright()
const { serve, useShared } = await import('./serve.mjs')
const server = process.env.TOKENLAB_URL ? await useShared(process.env.TOKENLAB_URL) : await serve()

try {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1340, height: 760 } })
  const base = server.url
  await page.goto(`${base}${base.includes('?') ? '&' : '?'}pair=${PAIR}`, { waitUntil: 'domcontentloaded' })

  /*
   * Drive the page to the state the camera was pointed at. The page opens on
   * cl100k and heals to o200k on its own after 1.8 seconds, and the recording
   * ends by clicking back, so comparing against whatever happens to be on
   * screen would be comparing against a stopwatch.
   */
  await page.waitForSelector('.tok--fractured', { timeout: 60_000 })
  await page.waitForTimeout(2600)
  await page.click(`button[data-enc='${FINAL_ENCODING}']`)

  /*
   * Wait for stillness, never for a value. A wait that waits for the expected
   * number is an assertion wearing a wait's clothes, and when it is wrong it
   * fails with a timeout naming nothing. chunkline's control proved that.
   *
   * And wait on the whole state, not on one part of it. The first version
   * watched the fractured chip count, which is final the instant the stage
   * redraws, and then read the token figure, which counts itself up. Measured:
   *
   *   250ms  tokens=79  fracturedChips=6
   *   500ms  tokens=82  fracturedChips=6
   *
   * So it settled on something that had never moved and read something that was
   * still moving, and reported a page that was correct as drifted. A gate that
   * cries wolf is a gate that gets skipped, which would have made this one
   * worse than nothing.
   */
  {
    const read = async () => JSON.stringify((await page.evaluate(lookAt)).state)
    const deadline = Date.now() + 30_000
    let last = await read()
    for (;;) {
      await page.waitForTimeout(300)
      const now = await read()
      if (now === last || Date.now() > deadline) break
      last = now
    }
  }

  const now = await page.evaluate(lookAt)

  const drifted = []
  for (const part of ['paint', 'words', 'state']) {
    for (const [k, v] of Object.entries(was.looked[part])) {
      if (now[part][k] !== v) {
        drifted.push(`${part}.${k}: filmed ${JSON.stringify(v)}, page is ${JSON.stringify(now[part][k])}`)
      }
    }
  }

  if (drifted.length > 0) {
    fail(
      `the page has changed in ${drifted.length} way${drifted.length === 1 ? '' : 's'} since the recording was made on ${was.recorded}`,
      drifted.join('\n      ') + '\n      Run npm run capture. The README calls this the real page.',
    )
  } else {
    console.log(
      `  ok      the recording of ${was.recorded} is of this page: ${was.looked.state.tokens} tokens and ` +
        `${was.looked.state.fracturedChips} fractured chips on ${was.looked.state.encoding}, pair ${was.pair}`,
    )
  }

  await browser.close()
} finally {
  server.stop()
}

/*
 * The README claims the picture is the real page. If that sentence goes, this
 * gate is guarding nothing and should say so rather than keep printing ok.
 * Matched with `includes` on a flattened README: the version of this in
 * `watch-it-think` used a regular expression and twice tested my memory of the
 * wording instead of the wording.
 */
const readme = readFileSync(resolve(root, 'README.md'), 'utf8').replace(/\s+/g, ' ')
const CLAIM = 'That is the real page in a real browser, recorded by `npm run capture`'
if (!readme.includes(CLAIM)) {
  fail('the README no longer claims the picture is the real page, so this gate is guarding nothing', `looked for: ${JSON.stringify(CLAIM)}`)
} else {
  console.log('  ok      the README makes the claim this gate exists to keep true')
}

const mb = statSync(gif).size / 1e6
if (mb > 4) {
  fail(`docs/shatter.gif is ${mb.toFixed(2)} MB`, 'fewer frames and a shorter run, not a better encoder')
} else {
  console.log(`  ok      docs/shatter.gif is ${mb.toFixed(2)} MB`)
}

if (failed > 0) {
  console.error('\nThe picture at the top is the only thing most people will look at.')
  process.exit(1)
}

console.log('capture: the picture shows the page that exists, and the README can say so')
