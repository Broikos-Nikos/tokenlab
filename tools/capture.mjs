/**
 * Record the shatter, for the top of the README.
 *
 *   npm run capture
 *
 * A project whose whole argument is "watch this happen" cannot lead with a still
 * image. This records the real page in a real browser doing the real thing: the
 * page opens on cl100k, where every Greek letter is its own token, heals to
 * o200k, where they collapse back into word pieces, and then goes back so the
 * loop reads as a comparison rather than as a one way animation.
 *
 * Playwright is not a dependency of this project. Installing a browser engine to
 * run a page that needs no backend would be a strange tax on anyone who just
 * wants to clone it, so this script resolves Playwright from wherever it already
 * exists and tells you how to get one if it does not.
 *
 *   PLAYWRIGHT_PATH=/path/to/node_modules/playwright node tools/capture.mjs
 *
 * ffmpeg does the encoding, with a generated palette, because the default GIF
 * palette turns a dark page into bands.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve, useShared } from './serve.mjs'
import { lookAt, PAIR, FINAL_ENCODING } from './capture-state.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/**
 * Pair 17 is the sentence in the two still images further down the README, and
 * the one whose counts `npm run measure` emits as `figureSentence`. Pinning it
 * is what makes the recording reproducible: a capture of a random sentence has
 * numbers in it that nothing can check.
 */
/*
 * The server is this tool's own, and it is proved byte for byte against
 * dist/index.html before a frame is recorded.
 *
 * It used to read TOKENLAB_URL or fall back to localhost:5173 and assume
 * somebody had already run `npm run dev` in another terminal. Nobody had, on
 * the afternoon this repository was published, and it died with
 * ERR_CONNECTION_REFUSED. A tool that only works when you remember something is
 * a tool that works on the day you write it.
 */
const server = process.env.TOKENLAB_URL ? await useShared(process.env.TOKENLAB_URL) : await serve()
const BASE = server.url
const URL_ = `${BASE}${BASE.includes('?') ? '&' : '?'}pair=${PAIR}`
const OUT = resolve(root, 'docs/shatter.gif')
const WORK = resolve(root, '.capture')

const SIZE = { width: 1340, height: 760 }
const FPS = 12
const WIDTH = 880
/** A little air before the first chip lands, so the loop does not start mid motion. */
const LEAD_IN = 0.45

async function loadPlaywright() {
  // Playwright ships both an ESM and a CJS entry point, and a path handed in
  // through an environment variable has to go through require to resolve the
  // way the package expects. Both are tried, in that order.
  const { createRequire } = await import('node:module')
  const req = createRequire(import.meta.url)
  const candidates = [
    process.env.PLAYWRIGHT_PATH,
    'playwright',
    resolve(root, 'node_modules/playwright'),
  ].filter(Boolean)
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

const { chromium } = await loadPlaywright()

rmSync(WORK, { recursive: true, force: true })
mkdirSync(WORK, { recursive: true })

/*
 * DR-F9. None of what follows used to be wrapped, and Playwright only finalises
 * a video when its context closes. Measured by making the wait time out, which
 * is what a slow vocabulary or a machine that prefers reduced motion produces on
 * its own: the run died with an unhandled TimeoutError, `.capture/` survived
 * with a **zero byte** webm in it, and the recording was gone.
 *
 * The browser itself did not leak, which the finding also claimed. Playwright
 * takes its own process down when node exits, and there were 0 chromium
 * processes afterwards. The video is the half that needed the `finally`.
 */
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: SIZE,
  deviceScaleFactor: 2,
  recordVideo: { dir: WORK, size: SIZE },
})

let shatterAt = 0
let looked = null
let failure = null

try {
const page = await context.newPage()

const started = Date.now()
await page.goto(URL_, { waitUntil: 'domcontentloaded' })

// The headline is the argument but the token box is the evidence, and the
// evidence has to be in frame. Scroll before anything animates.
await page.evaluate(() => window.scrollTo(0, 384))

// The cl100k vocabulary is roughly a megabyte and how long it takes is not
// something to guess at. Wait for the first fractured chip, which is the moment
// the red wall is actually on screen, and remember when that was so the dead
// air before it can be trimmed off the front.
await page.waitForSelector('.tok--fractured', { timeout: 30_000 })
shatterAt = (Date.now() - started) / 1000

// The page heals to o200k 1.8s after it opens, on its own. This waits that out
// and lets the collapse settle.
await page.waitForTimeout(2600)

// Then back to the damage, so the loop reads as a comparison rather than as a
// one way animation.
await page.click(`button[data-enc='${FINAL_ENCODING}']`)
await page.waitForTimeout(2300)

/*
 * What the page looked like while this was being filmed.
 *
 * A GIF cannot go stale loudly. This page's palette was replaced wholesale
 * twenty minutes after the previous recording was made, and the only reason the
 * README is not sitting over a picture of a blue site today is that the capture
 * happened to be re-run three minutes later. `check:capture` is what makes that
 * a process instead of a coincidence.
 */
looked = await page.evaluate(lookAt)
/*
 * Thrown rather than exited. `process.exit` inside this block would skip the
 * `finally` below, which is the thing that writes the video, so the two checks
 * that exist to catch a bad recording used to throw the recording away as well.
 */
if (looked.state.encoding !== FINAL_ENCODING) {
  throw new Error(`the recording ends on ${looked.state.encoding}, not ${FINAL_ENCODING}`)
}
if (looked.state.fracturedChips === 0) {
  throw new Error('the recording ends with no fractured chips, which is the thing it is a recording of')
}
} catch (err) {
  failure = err
} finally {
  /*
   * Closed even when something above threw, because this is what writes the
   * video file. A failed run that keeps its recording can be looked at; one
   * that loses it leaves a stack trace and an empty directory.
   */
  await context.close().catch(() => {})
  await browser.close().catch(() => {})
}

if (failure) {
  console.error(`FAIL  ${failure.message}`)
  console.error(`      the recording is in ${WORK}, finished and kept, for looking at`)
  process.exit(1)
}

const video = readdirSync(WORK).find((f) => f.endsWith('.webm'))
if (!video) {
  console.error('no video was recorded')
  process.exit(1)
}
const webm = resolve(WORK, video)

/*
 * ffmpeg, asked for by name before anything depends on it.
 *
 * The file header calls it a hard requirement and the failure without it was
 * `Error: spawnSync ffmpeg ENOENT` and a node stack, six lines of internals,
 * while `loadPlaywright` above ends with two lines telling you exactly what to
 * install. Two requirements, two voices, and the one that reads as a crash is
 * the one that is not this project's fault.
 */
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
} catch {
  console.error(
    'ffmpeg not found, and this script encodes the GIF with it. Install it from\n' +
      'https://ffmpeg.org/download.html, or on Windows `winget install ffmpeg`.',
  )
  process.exit(1)
}

const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' })
const palette = resolve(WORK, 'palette.png')
// The viewport is taller than the part worth watching, so the frame is cut
// down to the stage and the readout beside it. Everything else is prose that
// belongs in the README, not in a loop that plays forever.
const CROP = 'crop=1340:502:0:0'
const filters = `${CROP},fps=${FPS},scale=${WIDTH}:-1:flags=lanczos`
const offset = Math.max(0, shatterAt - LEAD_IN)
const trim = ['-ss', String(offset)]

/*
 * Encoded beside the video and moved over the committed file only once both
 * passes have succeeded.
 *
 * `ff` runs ffmpeg with `-y`, and ffmpeg truncates its output the moment it
 * opens it, before it knows whether the filtergraph is valid. Measured on the
 * real asset: one bad `paletteuse` took `docs/shatter.gif` from **2,832,450
 * bytes to 0**, in the working tree, with git reporting it modified. That is
 * the one script here that writes a committed binary, and it was writing it in
 * place.
 */
const draft = resolve(WORK, 'shatter.gif')
ff([...trim, '-i', webm, '-vf', `${filters},palettegen=stats_mode=diff`, palette])
ff([
  ...trim, '-i', webm,
  '-i', palette,
  '-lavfi', `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`,
  '-loop', '0',
  draft,
])
renameSync(draft, OUT)
console.log(`trimmed ${offset.toFixed(2)}s of vocabulary load off the front`)

renameSync(webm, resolve(root, 'docs/shatter.webm'))
rmSync(WORK, { recursive: true, force: true })

writeFileSync(
  resolve(root, 'docs/capture.json'),
  JSON.stringify({ recorded: new Date().toISOString().slice(0, 10), pair: PAIR, looked }, null, 2) + '\n',
)

server.stop()

const { size } = await import('node:fs').then((m) => m.promises.stat(OUT))
console.log(`docs/shatter.gif  ${(size / 1e6).toFixed(2)} MB at ${FPS} fps, ${WIDTH}px wide`)
console.log('docs/shatter.webm kept alongside it, for anywhere that takes video')
console.log(
  `ends on ${looked.state.encoding}: ${looked.state.tokens} tokens, ` +
    `${looked.state.fracturedChips} fractured chips, pair ${PAIR}`,
)
