/**
 * Record the shatter, for the top of the README.
 *
 *   npm run dev            # in one terminal
 *   node tools/capture.mjs # in another
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
import { mkdirSync, readdirSync, rmSync, renameSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/**
 * Pair 17 is the sentence in the two still images further down the README, and
 * the one whose counts `npm run measure` emits as `figureSentence`. Pinning it
 * is what makes the recording reproducible: a capture of a random sentence has
 * numbers in it that nothing can check.
 */
const PAIR = process.env.TOKENLAB_PAIR ?? '17'
const BASE = process.env.TOKENLAB_URL ?? 'http://localhost:5173/'
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

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: SIZE,
  deviceScaleFactor: 2,
  recordVideo: { dir: WORK, size: SIZE },
})
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
const shatterAt = (Date.now() - started) / 1000

// The page heals to o200k 1.8s after it opens, on its own. This waits that out
// and lets the collapse settle.
await page.waitForTimeout(2600)

// Then back to the damage, so the loop reads as a comparison rather than as a
// one way animation.
await page.click("button[data-enc='cl100k_base']")
await page.waitForTimeout(2300)

await context.close()
await browser.close()

const video = readdirSync(WORK).find((f) => f.endsWith('.webm'))
if (!video) {
  console.error('no video was recorded')
  process.exit(1)
}
const webm = resolve(WORK, video)

const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' })
const palette = resolve(WORK, 'palette.png')
// The viewport is taller than the part worth watching, so the frame is cut
// down to the stage and the readout beside it. Everything else is prose that
// belongs in the README, not in a loop that plays forever.
const CROP = 'crop=1340:502:0:0'
const filters = `${CROP},fps=${FPS},scale=${WIDTH}:-1:flags=lanczos`
const trim = ['-ss', String(Math.max(0, shatterAt - LEAD_IN))]

ff([...trim, '-i', webm, '-vf', `${filters},palettegen=stats_mode=diff`, palette])
ff([
  ...trim, '-i', webm,
  '-i', palette,
  '-lavfi', `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`,
  '-loop', '0',
  OUT,
])
console.log(`trimmed ${(shatterAt - LEAD_IN).toFixed(2)}s of vocabulary load off the front`)

renameSync(webm, resolve(root, 'docs/shatter.webm'))
rmSync(WORK, { recursive: true, force: true })

const { size } = await import('node:fs').then((m) => m.promises.stat(OUT))
console.log(`docs/shatter.gif  ${(size / 1e6).toFixed(2)} MB at ${FPS} fps, ${WIDTH}px wide`)
console.log('docs/shatter.webm kept alongside it, for anywhere that takes video')
