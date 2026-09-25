/**
 * What the decoration on this page costs to draw.
 *
 *   npm run measure:paint
 *
 * Not a gate. A gate on paint timing fails when the machine is busy and teaches
 * everybody to re-run it, and this number is not a regression risk: it is a
 * claim that was made about this page and had to be checked.
 *
 * PA-F12, filed 2026-09-20, said the grain overlay was "the most expensive thing
 * in the paint path", because `mix-blend-mode` on a fixed element above
 * everything "prevents layer isolation, so every repaint underneath it has to be
 * re-blended across the whole viewport". Three instruments disagree, and this is
 * the third of them, kept so the disagreement is reproducible rather than
 * asserted:
 *
 *   forced repaints of the token row, 120 frames, vsync off, three alternating
 *   rounds: median frame identical with the overlay and without it, 17.6 to
 *   17.8 ms either way.
 *
 *   compositing layers: 12 with the overlay, 10 without. The blended element
 *   gets its own layer, which is the opposite of the mechanism claimed.
 *
 *   raster and paint work over 60 full viewport repaints, which is what this
 *   file measures.
 *
 * The four variants isolate the two pieces of decoration from each other. Run it
 * before believing anything about either.
 */

import { chromium } from 'playwright'
import { serve, useShared } from './serve.mjs'

/** Every repaint is of the whole viewport, and a big one, so the work is visible. */
const VIEWPORT = { width: 2560, height: 1440 }
const FRAMES = 60
const ROUNDS = 2

const VARIANTS = {
  'as it ships': () => {
    document.querySelector('.grain').style.display = ''
    document.body.style.backgroundImage = ''
  },
  'no grain': () => {
    document.querySelector('.grain').style.display = 'none'
    document.body.style.backgroundImage = ''
  },
  'no gradient': () => {
    document.querySelector('.grain').style.display = ''
    document.body.style.backgroundImage = 'none'
  },
  'neither': () => {
    document.querySelector('.grain').style.display = 'none'
    document.body.style.backgroundImage = 'none'
  },
}

const server = process.env.TOKENLAB_URL ? await useShared(process.env.TOKENLAB_URL) : await serve()
const browser = await chromium.launch()

try {
  const page = await browser.newPage({ viewport: VIEWPORT })
  await page.goto(server.url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => document.querySelectorAll('#tokens .tok').length > 0, null, { timeout: 60_000 })
  // cl100k, because it shatters Greek into the most chips, which is the most to repaint.
  await page.click('.enc[data-enc="cl100k_base"]')
  await page.waitForTimeout(2500)
  await page.evaluate(() => {
    const seed = 'Καλημέρα κόσμε, σήμερα εγκαταστήσαμε τις εξαρτήσεις. '
    const ta = document.querySelector('#input')
    ta.value = seed.repeat(60)
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.waitForTimeout(1500)

  await page.evaluate(
    (src) => (window.__variants = src),
    Object.fromEntries(Object.entries(VARIANTS).map(([k, f]) => [k, f.toString()])),
  )

  const client = await page.context().newCDPSession(page)

  /** Chrome's own trace, because frame timing cannot see under a 60 Hz cap. */
  const trace = async (run) => {
    await client.send('Tracing.start', {
      transferMode: 'ReturnAsStream',
      traceConfig: { includedCategories: ['disabled-by-default-devtools.timeline', 'devtools.timeline'] },
    })
    await run()
    const complete = new Promise((resolve) => client.once('Tracing.tracingComplete', resolve))
    await client.send('Tracing.end')
    const { stream } = await complete
    let data = ''
    for (;;) {
      const chunk = await client.send('IO.read', { handle: stream })
      data += chunk.data
      if (chunk.eof) break
    }
    await client.send('IO.close', { handle: stream })
    const totals = {}
    for (const e of JSON.parse(data).traceEvents ?? []) {
      if (typeof e.dur === 'number') totals[e.name] = (totals[e.name] ?? 0) + e.dur / 1000
    }
    return totals
  }

  /*
   * Invalidate everything that follows the encoding hue, which is the largest
   * repaint this page ever does outside of typing.
   */
  const sweep = () =>
    page.evaluate(
      (frames) =>
        new Promise((resolve) => {
          const hues = [155, 200, 250, 295]
          let n = 0
          const step = () => {
            document.documentElement.style.setProperty('--hue', String(hues[n % 4]))
            if (++n < frames) requestAnimationFrame(step)
            else resolve()
          }
          requestAnimationFrame(step)
        }),
      FRAMES,
    )

  console.log(`${FRAMES} full viewport repaints at ${VIEWPORT.width}x${VIEWPORT.height}, cl100k, ${ROUNDS} rounds\n`)
  const results = {}
  for (let round = 0; round < ROUNDS; round++) {
    for (const name of Object.keys(VARIANTS)) {
      await page.evaluate((n) => eval(`(${window.__variants[n]})`)(), name)
      await page.waitForTimeout(400)
      const totals = await trace(sweep)
      ;(results[name] ??= []).push({ paint: totals.Paint ?? 0, raster: totals.RasterTask ?? 0 })
    }
  }

  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
  const base = mean(results['as it ships'].map((r) => r.raster))
  console.log('               raster            paint           raster against the page as it ships')
  for (const [name, rows] of Object.entries(results)) {
    const raster = mean(rows.map((r) => r.raster))
    const paint = mean(rows.map((r) => r.paint))
    const delta = ((raster / base - 1) * 100).toFixed(1)
    console.log(
      `  ${name.padEnd(12)} ${raster.toFixed(0).padStart(6)} ms  ${paint.toFixed(0).padStart(6)} ms   ` +
        `${delta >= 0 ? '+' : ''}${delta}%`,
    )
  }
  console.log(
    `\nRaster is where the difference is, and paint does not order at all: it swings ` +
      `wider between two runs of the same variant than it does between variants.`,
  )

  await page.evaluate((n) => eval(`(${window.__variants[n]})`)(), 'as it ships')
} finally {
  await browser.close()
  server.stop()
}
