/**
 * Record the shatter, for the top of the README.
 *
 *   npm run capture
 *
 * A project whose whole argument is "watch this happen" cannot lead with a still
 * image. This records the real page in a real browser doing the real thing.
 *
 * The loop is three beats: o200k, where Greek is word pieces and the bill has a
 * price in it, then cl100k, where every letter is its own token and the box goes
 * red, then back. It starts and ends on the same state, so the cycle has no seam
 * and a reader who lands on it mid scroll lands on the comparison rather than on
 * the alarm. Until tick 151 it ran the other way round and spent its last 1.49
 * seconds frozen on the red wall, which is RC-F6 and the measurement is below.
 *
 * Playwright **is** a dependency, pinned exactly in devDependencies, and this
 * header said the opposite until tick 145. Eighteen tools in this repository
 * import it. The pin is not an accident either: a floating `^1.61.1` resolved to
 * 1.63.0, whose chromium nobody had installed, and the workspace gate
 * `check-pins.mjs` exists to keep every instrument on an exact version.
 *
 * What is **not** a dependency is the browser binary. It is not in the lockfile
 * and not in the repository: `npx playwright install chromium` puts it in a
 * cache in your home directory, which is why nothing a visitor downloads is
 * affected by any of this, and why a clone that never runs a gate never needs
 * it.
 *
 * The resolution below stays, as an escape hatch for a machine that already has
 * Playwright somewhere else:
 *
 *   PLAYWRIGHT_PATH=/path/to/node_modules/playwright node tools/capture.mjs
 *
 * ffmpeg does the encoding, with a generated palette, because the default GIF
 * palette turns a dark page into bands.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve, useShared } from './serve.mjs'
import { requireFfmpeg } from './ffmpeg.mjs'
import { lookAt, PAIR, FINAL_ENCODING, SHATTER_ENCODING } from './capture-state.mjs'

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

/*
 * A seam for the failure path. DR-F9 was measured here by making the wait time
 * out by hand; `CAPTURE_FAIL_AT=start` is that, repeatably, and
 * `check-capture-exit.mjs` at the workspace drives it against all seven
 * projects that film themselves. Added at tick 199 with the sweep that gave the
 * other six this project's `finally`.
 */
const FAIL_AT = process.env.CAPTURE_FAIL_AT ?? ''
const FPS = 12
const WIDTH = 880
/*
 * The viewport is taller than the part worth watching, so the frame is cut down
 * to the stage and the readout beside it. Everything else is prose that belongs
 * in the README rather than in a loop that plays forever.
 *
 * The measurement below uses the same crop, and that is not tidiness. Measuring
 * the whole viewport found a redraw the finished GIF does not contain, because
 * it happened in the part that gets cropped away, and the cut was computed from
 * an event no reader would ever see.
 */
const CROP = 'crop=1340:502:0:0'

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
 * ffmpeg before the browser.
 *
 * The encoder is 150 to 180 lines below this, after a browser launch and the
 * whole recording, and without ffmpeg it threw `spawnSync ffmpeg ENOENT` at
 * the end of all of it. WS-F6, ported from watch-it-think at tick 226 along
 * with tools/ffmpeg.mjs. FFMPEG overrides PATH; the version is kept for
 * docs/capture.json.
 */
const FFMPEG = requireFfmpeg()
console.log(`ffmpeg ${FFMPEG.version}${process.env.FFMPEG ? ` (FFMPEG=${FFMPEG.path})` : ''}`)
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

/**
 * The three beats of the loop, in milliseconds.
 *
 * Measured out of the old recording rather than chosen: the o200k state held
 * 0.67 s of a 4.91 s loop and the last 1.49 s did not move at all. These give
 * the calm state a beat at each end and put the alarm between them, and
 * `check:loop` holds the finished GIF to them.
 */
const BEATS = { calm: 1300, alarm: 1400, back: 1100 }

let shatterAt = 0
let calmAt = 0
let looked = null
let failure = null

try {
const page = await context.newPage()

const started = Date.now()
await page.goto(URL_, { waitUntil: 'domcontentloaded' })

/* Not a line earlier: a context with no page in it has no video to finalise,
   so throwing sooner tests the message and not the thing it is about. */
if (FAIL_AT === 'start') {
  await page.waitForTimeout(500)
  throw new Error('CAPTURE_FAIL_AT=start, the seam the failure path is tested through')
}

// The headline is the argument but the token box is the evidence, and the
// evidence has to be in frame. Scroll before anything animates.
await page.evaluate(() => window.scrollTo(0, 384))

/*
 * RC-F6. The recruiter measured the old loop frame by frame and the numbers are
 * why this section was rewritten:
 *
 *   4.91 s long, and the o200k state, the good news, held 0.67 s of it
 *   the last 1.49 s, 30 percent, had no motion in it at all
 *   the first frame was a half empty box with a red warning and "n/a" for the
 *     price, which is where a reader landing mid scroll lands
 *
 * So the loop now opens where the eye is comfortable and moves to the alarm.
 * The page still opens on cl100k and heals to o200k on its own 1.8 seconds
 * later, which is what the first two waits below are for: the recording starts
 * from the state the page rests in rather than from the state it passes
 * through.
 */
await page.waitForSelector('.tok--fractured', { timeout: 30_000 })
shatterAt = (Date.now() - started) / 1000

/**
 * Wait for the page to stop moving, never for a value.
 *
 * Each beat of the loop is a still state, and the cut points are found by
 * looking for the two moments the whole box redraws. Both of those depend on
 * the page being genuinely finished before the next thing happens: the first
 * version held for 450 ms after the heal, the chips were still landing, and the
 * recording opened on an animation instead of on the state it was supposed to
 * open on.
 */
const settle = async () => {
  let last = ''
  for (let i = 0; i < 60; i++) {
    const now = await page.evaluate(() => {
      const chips = document.querySelectorAll('.tok').length
      const red = document.querySelectorAll('.tok--fractured').length
      const count = document.querySelector('#tokens')?.textContent ?? ''
      return `${chips}|${red}|${count}`
    })
    if (now === last) return
    last = now
    await page.waitForTimeout(250)
  }
}

// The heal, on its own, and then stillness. This is the state the recording
// opens on: real numbers on screen and a price in the bill rather than "n/a".
await page.waitForFunction(() => document.querySelectorAll('.tok--fractured').length === 0, { timeout: 30_000 })
await settle()
calmAt = (Date.now() - started) / 1000

await page.waitForTimeout(BEATS.calm)

// Into the damage.
await page.click(`button[data-enc='${SHATTER_ENCODING}']`)
await settle()
await page.waitForTimeout(BEATS.alarm)
/*
 * The middle of the loop, asserted below. The old version asserted that the
 * recording ended with fractured chips on screen, which was the same thing
 * while the loop ended on cl100k. It ends on the repair now, so the thing this
 * is a recording of has to be checked where it happens.
 */
const midway = await page.evaluate(lookAt)

// And back, which is also where the loop restarts: the last frame and the first
// are the same state, so the cycle has no seam and no freeze in it.
await page.click(`button[data-enc='${FINAL_ENCODING}']`)
await settle()
await page.waitForTimeout(BEATS.back)

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
if (looked.state.fracturedChips !== 0) {
  throw new Error(
    `the recording ends on ${FINAL_ENCODING} with ${looked.state.fracturedChips} fractured chips, and the point of ending there is that there are none`,
  )
}
if (midway.state.encoding !== SHATTER_ENCODING || midway.state.fracturedChips === 0) {
  throw new Error(
    `the middle of the recording is ${midway.state.fracturedChips} fractured chips on ${midway.state.encoding}, and it is supposed to be the wall of them on ${SHATTER_ENCODING}`,
  )
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
  const kept = existsSync(WORK) ? readdirSync(WORK).filter((f) => f.endsWith('.webm')) : []
  const bytes = kept.reduce((n, f) => n + statSync(resolve(WORK, f)).size, 0)
  if (kept.length > 0) {
    console.error(`      the recording is in ${WORK}, ${bytes} bytes, finished and kept, for looking at`)
    console.error('      .capture is in .gitignore, so it cannot reach a commit. Delete it when you are done.')
  } else {
    console.error(`      nothing was recorded, and ${WORK} is empty`)
  }
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
  execFileSync(FFMPEG.path, ['-version'], { stdio: 'ignore' })
} catch {
  console.error(
    'ffmpeg not found, and this script encodes the GIF with it. Install it from\n' +
      'https://ffmpeg.org/download.html, or on Windows `winget install ffmpeg`.',
  )
  process.exit(1)
}

const ff = (args) => execFileSync(FFMPEG.path, ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' })
const palette = resolve(WORK, 'palette.png')
// The viewport is taller than the part worth watching, so the frame is cut
// down to the stage and the readout beside it. Everything else is prose that
// belongs in the README, not in a loop that plays forever.
const filters = `${CROP},fps=${FPS},scale=${WIDTH}:-1:flags=lanczos`

/**
 * Where the beats actually are, read out of the recording rather than off the
 * clock that drove it.
 *
 * The first version of this cut at a wall clock time taken while driving the
 * page, and it does not map onto the video: Playwright's screencast timestamps
 * its frames as it captures them, so a heavy repaint stretches the recording's
 * timeline against real time. Measured on this project's own footage, the click
 * that shatters the text happened at 3.80 s by the clock and at 5.48 s in the
 * file.
 *
 * The second version looked for the two redraws instead, as the two largest
 * changes in the footage. That failed differently and twice: a redraw lasts
 * several frames, so "the last two large changes" picked two frames of the same
 * heal and cut a 2.48 second loop with one transition in it.
 *
 * So this keys on the **still** periods, which are the thing being driven.
 * `settle()` above holds the page until it stops moving and then waits a beat,
 * three times, so the footage ends with three long stretches of no motion with
 * the two animations between them. Those are unambiguous, and the cut is
 * `BEATS.calm` before the first one ends and `BEATS.back` after the last one
 * starts.
 *
 * `tblend=difference` makes each frame the change since the one before it and
 * `signalstats` reports the mean brightness of that difference, which is motion
 * per frame in one number.
 */
function motionIn(file) {
  const out = execFileSync(
    /* The resolved path, not the bare name. This second call was missed when
       the encoder was routed through the resolver at tick 226, and the
       workspace gate found it: one file, two ways of starting the same program,
       and only one of them honouring FFMPEG. */
    FFMPEG.path,
    ['-v', 'error', '-i', file, '-vf', `${CROP},tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-`, '-f', 'null', '-'],
    { encoding: 'utf8' },
  )
  const rows = []
  let at = 0
  for (const line of out.split(/\r?\n/)) {
    const t = /pts_time:([\d.]+)/.exec(line)
    if (t) at = Number(t[1])
    const y = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(line)
    if (y) rows.push({ at, motion: Number(y[1]) })
  }
  return rows
}

/**
 * The three moments the whole box is redrawn, clustered, because each one takes
 * more than a frame: the page's own heal at 1.8 seconds, then the two clicks.
 *
 * The heal is dropped. It happens before the recording is supposed to start and
 * it is the loudest thing in the footage, so the two beats that matter are the
 * two clusters after it.
 */
function redraws(rows) {
  const out = []
  for (const r of rows) {
    if (r.at < 0.5 || r.motion < 6) continue
    if (out.length && r.at - out.at(-1) <= 1.0) continue
    out.push(r.at)
  }
  return out
}

const marks = redraws(motionIn(webm))
if (marks.length < 3) {
  console.error(`FAIL  ${marks.length} whole box redraws in the footage, and the loop needs the heal plus two clicks`)
  console.error(`      found at ${marks.map((m) => m.toFixed(2)).join(', ')}s`)
  process.exit(1)
}
const [, shatterT, backT] = marks
const offset = Math.max(0, shatterT - BEATS.calm / 1000)
const trim = ['-ss', String(offset.toFixed(3))]

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
/*
 * The second seam, at the encoder.
 *
 * `start` proves what a dying run leaves behind. It proves nothing about the
 * run that works, and tick 199 wrapped this recorder in a try that scoped a
 * `const` the trim arithmetic below reads, so `npm run capture` died on a
 * ReferenceError every time it got this far, with the gate written in the same
 * tick green. This one throws after everything the recorder and the arithmetic
 * do and before the first frame is encoded, so the whole success path runs and
 * nothing in docs/ is rewritten.
 */
if (FAIL_AT === 'encode') {
  /* Reported here rather than thrown: by this line the recorder's try is
     closed, in two of these seven, and an uncaught throw would print a node
     stack instead of saying where the recording is. */
  const kept = existsSync(WORK) ? readdirSync(WORK).filter((f) => f.endsWith('.webm')) : []
  const bytes = kept.reduce((n, f) => n + statSync(resolve(WORK, f)).size, 0)
  console.error('FAIL  CAPTURE_FAIL_AT=encode, the seam that proves the success path runs')
  console.error(`      the recording is in ${WORK}, ${bytes} bytes, finished and kept, for looking at`)
  console.error('      .capture is in .gitignore, so it cannot reach a commit. Delete it when you are done.')
  process.exit(1)
}

/*
 * `-ss` after `-i`, not before it.
 *
 * Before the input it is a seek: ffmpeg jumps to the nearest keyframe at or
 * before the time asked for, and in a screencast webm those are seconds apart.
 * Measured while this was being written: a cut computed at 2.26s put the first
 * redraw 2.83s into the finished GIF instead of 1.30s, and three rewrites of
 * the cut logic chased a number that was right all along. After the input it
 * decodes and discards, which is slower and exact.
 */
/*
 * The palette is taken over the whole recording, uncut. `palettegen` emits one
 * frame stamped at the start of the stream, and an exact output seek throws it
 * away: "Output file is empty, nothing was encoded". The extra footage is the
 * same page in the same two states, so the colours are the same either way.
 */
ff(['-i', webm, '-vf', `${filters},palettegen=stats_mode=diff`, palette])
/*
 * The seek sits after both inputs, which is what makes it an output option and
 * therefore exact. Between them it is an input option for the palette PNG, and
 * ffmpeg answers that with "Internal bug, should not have happened".
 */
ff([
  '-i', webm,
  '-i', palette,
  ...trim,
  '-lavfi', `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`,
  '-loop', '0',
  draft,
])
renameSync(draft, OUT)
console.log(`redraws at ${marks.map((m) => m.toFixed(2)).join(', ')}s in the footage; cut from ${offset.toFixed(2)}s`)

renameSync(webm, resolve(root, 'docs/shatter.webm'))
rmSync(WORK, { recursive: true, force: true })

writeFileSync(
  resolve(root, 'docs/capture.json'),
  JSON.stringify({
    recorded: new Date().toISOString().slice(0, 10),
    ffmpeg: FFMPEG.version,
    pair: PAIR,
    opensOn: FINAL_ENCODING,
    // Where the two redraws land inside the finished GIF, in seconds. This is
    // what check:loop holds the file to, and it is derived from the footage
    // rather than from the clock that drove it.
    redrawsAt: [Number((shatterT - offset).toFixed(2)), Number((backT - offset).toFixed(2))],
    beats: BEATS,
    looked,
  }, null, 2) + '\n',
)

server.stop()

const { size } = await import('node:fs').then((m) => m.promises.stat(OUT))
console.log(`docs/shatter.gif  ${(size / 1e6).toFixed(2)} MB at ${FPS} fps, ${WIDTH}px wide`)
console.log('docs/shatter.webm kept alongside it, for anywhere that takes video')
console.log(
  `ends on ${looked.state.encoding}: ${looked.state.tokens} tokens, ` +
    `${looked.state.fracturedChips} fractured chips, pair ${PAIR}`,
)
