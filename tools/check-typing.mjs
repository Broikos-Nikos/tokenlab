/**
 * Typing into something large re-measures once, not once a keystroke.
 *
 *   npm run check:typing      (or npm run verify, which starts the server)
 *
 * PA-F7. `MAX_CHIPS` capped what was drawn and nothing capped what was done, and
 * the input handler was coalesced by `requestAnimationFrame`, which does nothing
 * at all once one pass is longer than a frame: each keystroke simply queues
 * another. Measured on the built page with a megabyte of Greek in the box,
 * cl100k, before any of this:
 *
 *   ten keystrokes, 40 ms apart   37.6 seconds, 10 renders
 *   long tasks                    10, totalling 37.4 s, the worst 4,089 ms
 *
 * This counts renders rather than milliseconds, because a gate that fails when
 * a machine is busy teaches everybody to re-run it. A render rebuilds the chip
 * row, so the mutations of `#tokens` are the count, observed from outside the
 * page rather than reported by it.
 *
 * Both directions are checked. A page that waits for a pause on everything is
 * the opposite defect, and a cheaper one to ship by accident: the counter stops
 * following the keys on a short sentence, which is the whole feel of the thing.
 */

import { chromium } from 'playwright'
import { serve, useShared } from './serve.mjs'

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

/* Above the threshold in main.ts, and small enough that a render is quick. */
const BIG = 200_000
const SMALL = 'Καλημέρα κόσμε, σήμερα.'
const KEYSTROKES = 8

const server = process.env.TOKENLAB_URL ? await useShared(process.env.TOKENLAB_URL) : await serve()
const browser = await chromium.launch()

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.addInitScript(() => {
    window.__renders = 0
    addEventListener('DOMContentLoaded', () => {
      new MutationObserver((records) => {
        for (const r of records) if (r.type === 'childList' && r.addedNodes.length > 0) window.__renders++
      }).observe(document.querySelector('#tokens'), { childList: true })
    })
  })

  await page.goto(server.url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => document.querySelectorAll('#tokens .tok').length > 0, null, { timeout: 60_000 })
  // cl100k, because it shatters Greek and is the expensive one to walk.
  await page.click('.enc[data-enc="cl100k_base"]')
  await page.waitForTimeout(2500)

  const type = (n) =>
    page.evaluate(async (count) => {
      const ta = document.querySelector('#input')
      for (let i = 0; i < count; i++) {
        ta.value += 'α'
        ta.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 40))
      }
    }, n)

  /* 1. Large: one pass, after they stop. */
  await page.evaluate((n) => {
    const seed = 'Καλημέρα κόσμε, σήμερα εγκαταστήσαμε τις εξαρτήσεις και ανοίξαμε τη σελίδα. '
    let s = ''
    while (s.length < n) s += seed
    const ta = document.querySelector('#input')
    ta.value = s.slice(0, n)
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  }, BIG)
  await page.waitForFunction(() => window.__renders > 0, null, { timeout: 120_000 })
  await page.waitForTimeout(1500)

  await page.evaluate(() => (window.__renders = 0))
  await type(KEYSTROKES)
  await page.waitForTimeout(2000)
  const big = await page.evaluate(() => ({
    renders: window.__renders,
    chars: document.querySelector('#input').value.length,
    count: document.querySelector('[data-token-count]').textContent,
  }))

  if (big.renders > 2) {
    fail(
      `${KEYSTROKES} keystrokes into ${big.chars.toLocaleString('en-US')} characters re-measured ${big.renders} times`,
      'This is PA-F7: one pass of the tokenizer over everything in the box, per keystroke, on the thread the page is drawn on.',
    )
  } else if (big.renders === 0) {
    fail(`${KEYSTROKES} keystrokes into ${big.chars.toLocaleString('en-US')} characters never re-measured at all`, 'Waiting for a pause is not the same as never arriving.')
  } else {
    console.log(`  ok      ${KEYSTROKES} keystrokes into ${big.chars.toLocaleString('en-US')} characters: ${big.renders} pass, and the count reads ${big.count}`)
  }

  /*
   * 2. And the count that lands is the count for what is in the box, because a
   * debounce that drops the last keystroke is a wrong number rather than a slow
   * one.
   */
  const settled = await page.evaluate(() => {
    const ta = document.querySelector('#input')
    return { chars: ta.value.length, shown: document.querySelector('[data-words]').textContent }
  })
  if (settled.chars !== big.chars) fail('the box changed under the gate, so the reading below means nothing')

  /* 3. Small: every keystroke, because waiting would be the slower page. */
  await page.evaluate((t) => {
    const ta = document.querySelector('#input')
    ta.value = t
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  }, SMALL)
  await page.waitForTimeout(800)
  await page.evaluate(() => (window.__renders = 0))
  await type(KEYSTROKES)
  await page.waitForTimeout(800)
  const small = await page.evaluate(() => ({ renders: window.__renders, chars: document.querySelector('#input').value.length }))

  if (small.renders < KEYSTROKES / 2) {
    fail(
      `${KEYSTROKES} keystrokes into ${small.chars} characters re-measured only ${small.renders} times`,
      'A short sentence is measured in a millisecond. Making the visitor wait for a pause there is the opposite defect: the number stops following the keys.',
    )
  } else {
    console.log(`  ok      ${KEYSTROKES} keystrokes into ${small.chars} characters: ${small.renders} passes, one for each`)
  }
} finally {
  await browser.close()
  server.stop()
}

if (failed > 0) {
  console.error('\nThe cap protects the chip row. The thread is what the visitor is typing on.')
  process.exit(1)
}

console.log('typing: a big box re-measures once the keys stop, a small one keeps up with them')
