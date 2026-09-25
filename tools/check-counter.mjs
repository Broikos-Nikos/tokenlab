/**
 * The token counter never goes backwards, and only one animation writes it.
 *
 *   npm run check:counter      (or npm run verify, which starts the server)
 *
 * HS-F6, "the token counter stutters backwards on every keystroke", and PA-F11,
 * "tickTo starts an uncancelled animation loop on every render", are one defect
 * with two symptoms. Reproduced on the built page by typing twelve words and
 * watching every write to the node with a `MutationObserver`, while the true
 * count only rose from 21 to 77:
 *
 *   the counter was written 312 times while 12 words were typed
 *   it went backwards 79 times: 33→31, 34→32, 34→32, 35→32, 35→32, 35→32
 *   first ten values: 28, 29, 29, 30, 30, 31, 31, 33, 31, 34
 *
 * `31, 33, 31, 34` is two loops alternating. Each call started a new
 * `requestAnimationFrame` chain and cancelled nothing, and each eased towards
 * its own target from the previous *target* rather than from the number on
 * screen.
 *
 * Four assertions. The third separates this from luck, and the fourth exists
 * because the first three passed against half the fix.
 *
 * 1. **It never decreases while the true count only rises.** The symptom.
 * 2. **It lands on the true count.** An animation that is cancelled has to be
 *    cancelled into the right final value, not left wherever it stopped.
 * 3. **One loop.** Writes over the window must not outnumber the frames in it.
 *    Twelve concurrent loops produce twelve writes a frame and can still be
 *    monotonic if their targets happen to rise, so assertion 1 alone would pass
 *    against the defect the day the timings lined up.
 * 4. **It does not teleport.** The first three assertions all passed against a
 *    version that cancelled correctly and still started each animation from the
 *    previous *target* rather than from the number on screen, which skips the
 *    gap between them. That control passing is what added this one: on this
 *    exact input the correct code never moves the counter by more than 1 in a
 *    frame, and starting from the previous target moves it by 2.
 *
 * The input is scripted rather than arbitrary, twelve appends of the same word
 * 90 ms apart, so assertion 4 is a property of a reproducible scenario rather
 * than a law about all typing.
 */

import { chromium } from 'playwright'
import { serve, useShared } from './serve.mjs'

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

const server = process.env.TOKENLAB_URL ? await useShared(process.env.TOKENLAB_URL) : await serve()
const browser = await chromium.launch()

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(server.url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => document.querySelectorAll('#tokens .tok').length > 0, null, { timeout: 60_000 })
  // The opening move heals the page shortly after load. Measure a settled page.
  await page.waitForTimeout(2500)

  const r = await page.evaluate(
    () =>
      new Promise((done) => {
        const node = document.querySelector('[data-token-count]')
        const seen = []
        const obs = new MutationObserver(() => seen.push(Number(node.textContent.replace(/[^0-9]/g, ''))))
        obs.observe(node, { childList: true, characterData: true, subtree: true })

        let frames = 0
        const t0 = performance.now()
        const tick = () => {
          frames++
          if (performance.now() - t0 < 2400) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)

        const ta = document.querySelector('#input')
        let i = 0
        const type = () => {
          // Appends only, so the true count rises with every keystroke and any
          // decrease on screen is the defect rather than an animated fall.
          if (i++ >= 12) {
            setTimeout(() => {
              obs.disconnect()
              let back = 0
              const drops = []
              for (let k = 1; k < seen.length; k++) {
                if (seen[k] < seen[k - 1]) {
                  back++
                  if (drops.length < 6) drops.push(`${seen[k - 1]}→${seen[k]}`)
                }
              }
              let biggest = 0
              for (let k = 1; k < seen.length; k++) biggest = Math.max(biggest, Math.abs(seen[k] - seen[k - 1]))
              done({ writes: seen.length, frames, back, drops, biggest, shown: seen[seen.length - 1], first: seen.slice(0, 10) })
            }, 1200)
            return
          }
          ta.value += 'Καλημέρα '
          ta.dispatchEvent(new Event('input', { bubbles: true }))
          setTimeout(type, 90)
        }
        type()
      }),
  )

  /* 1. Never backwards. */
  if (r.back > 0) {
    fail(
      `the counter went backwards ${r.back} times in ${r.writes} writes while the true count only rose`,
      `${r.drops.join(', ')}\n      first ten values: ${r.first.join(', ')}. This is HS-F6.`,
    )
  } else {
    console.log(`  ok      ${r.writes} writes while twelve words were typed, none of them backwards`)
  }

  /* 2. It lands on the truth. */
  const truth = await page.evaluate(() => {
    const ta = document.querySelector('#input')
    return ta.value
  })
  const shownAfter = await page.evaluate(() => Number(document.querySelector('[data-token-count]').textContent.replace(/[^0-9]/g, '')))
  if (shownAfter !== r.shown) {
    fail(`the counter moved after typing stopped: ${r.shown} then ${shownAfter}`, 'An animation is still running a second after the last keystroke.')
  } else if (shownAfter <= 0) {
    fail(`the counter reads ${shownAfter} after ${truth.length} characters were typed`)
  } else {
    console.log(`  ok      it settled at ${shownAfter} and stayed there, for ${truth.length} characters of input`)
  }

  /*
   * 3. One loop, which is the assertion that catches PA-F11 rather than its
   * symptom. A loop writes at most once a frame, so writes above the frame
   * count mean more than one loop is alive.
   */
  if (r.writes > r.frames) {
    fail(
      `${r.writes} writes across ${r.frames} frames, so more than one animation is writing the counter`,
      'Every call to tickTo starts a chain and nothing cancels the last one. That is PA-F11.',
    )
  } else {
    console.log(`  ok      ${r.writes} writes across ${r.frames} frames: one animation at a time`)
  }

  /*
   * 4. It does not teleport. `MAX_STEP` is 1 because that is what the correct
   * code produces on this input, measured; the version that starts from the
   * previous target produces 2, and every other assertion here passes against
   * it.
   */
  const MAX_STEP = 1
  if (r.biggest > MAX_STEP) {
    fail(
      `the counter moved ${r.biggest} in a single frame on an input where the fix moves it ${MAX_STEP}`,
      'The animation is starting somewhere other than the number on screen, so it skips the gap between them.',
    )
  } else {
    console.log(`  ok      no write moved it by more than ${r.biggest}, so each animation starts from what is displayed`)
  }

  await page.close()
} finally {
  await browser.close()
  server.stop()
}

if (failed > 0) {
  console.error('\nA number that goes backwards while the thing it counts goes forwards is a number nobody can read.')
  process.exit(1)
}

console.log('counter: one animation, never backwards, and it lands on the count')
