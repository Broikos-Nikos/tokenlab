/**
 * The one box that speaks money always has money in it.
 *
 *   npm run check:bill          (or npm run verify, which starts the server)
 *
 * RC-F8, from the recruiter pass, ten seconds and not technical: "the price
 * panel is the only element on the page that speaks my language: a dollar sign
 * and a number. On arrival it reads n/a, with 'GPT-5.6 Sol runs on o200k, not
 * cl100k, so this count is not its bill. Switch the encoding to price it.' I do
 * not know what o200k or cl100k are, so that explanation is not an explanation,
 * it is two more codes."
 *
 * Measured on the live page at tick 152, four days after the finding was filed:
 *
 *   0.03 s   $0.00, the prerendered opening
 *   0.72 s   n/a, and the note about o200k and cl100k
 *   3.24 s   $0.096, once the page heals itself to o200k
 *
 * Two and a half seconds of every first visit, on the one element a
 * non technical reader can use.
 *
 * ## What is checked
 *
 * Every encoding the page offers, against the model the page opens on:
 *
 *   the price is a number, never n/a and never blank
 *   the note under it is in words, with no vocabulary codes in it, whenever the
 *     model and the encoding disagree
 *   the note names both counts, because a price counted on one vocabulary under
 *     a token count from another is the thing the old refusal existed to
 *     prevent, and saying both numbers is what replaces it
 *   the screen reader line carries the same price, since "n/a" was worse for
 *     the reader who cannot see the box
 *
 * The codes are the point of the third assertion. `metaFor(...).label` prints
 * `o200k` and `cl100k`, which are names for people who already know what they
 * are, and the note must not contain them.
 */

import { chromium } from 'playwright'
import { serve, useShared } from './serve.mjs'

const CODES = ['o200k', 'cl100k', 'p50k', 'r50k']
const ENCODINGS = ['o200k_base', 'cl100k_base', 'p50k_base', 'r50k_base']

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

const server = process.env.TOKENLAB_URL ? await useShared(process.env.TOKENLAB_URL) : await serve()
const browser = await chromium.launch()

try {
  const page = await browser.newPage()
  const base = server.url
  await page.goto(`${base}${base.includes('?') ? '&' : '?'}pair=17`, { waitUntil: 'domcontentloaded' })

  /*
   * The opening state first, before anything is clicked, because that is the
   * state the finding is about: the page opens on cl100k and heals to o200k
   * 1.8 seconds later, and the bill has to hold a number the whole way.
   */
  await page.waitForFunction(() => document.querySelectorAll('[data-tok]').length > 0, { timeout: 30_000 })
  const arrival = []
  for (let i = 0; i < 16; i++) {
    arrival.push(
      await page.evaluate(() => ({
        cost: document.querySelector('[data-cost]')?.textContent ?? '',
        enc: document.querySelector('[data-enc][data-on]')?.getAttribute('data-enc') ?? '',
      })),
    )
    await page.waitForTimeout(200)
  }
  const blank = arrival.filter((s) => !/^[\d.]+$/.test(s.cost))
  if (blank.length > 0) {
    fail(
      `the bill was not a number in ${blank.length} of the first ${arrival.length} readings of a visit`,
      `${JSON.stringify(blank.slice(0, 3))}\n      This is the arrival the recruiter measured: two and a half seconds of "n/a" on the only element they could read.`,
    )
  } else {
    console.log(`  ok      the bill is a number in all ${arrival.length} readings of the first three seconds`)
  }

  for (const enc of ENCODINGS) {
    await page.click(`button[data-enc='${enc}']`)
    await page.waitForFunction(
      (want) => document.querySelector('[data-enc][data-on]')?.getAttribute('data-enc') === want,
      enc,
      { timeout: 20_000 },
    )
    await page.waitForTimeout(900)

    const seen = await page.evaluate(() => ({
      cost: document.querySelector('[data-cost]')?.textContent ?? '',
      note: document.querySelector('[data-price-note]')?.textContent ?? '',
      announce: document.querySelector('[data-announce]')?.textContent ?? '',
      count: document.querySelector('[data-token-count]')?.textContent ?? '',
      model: document.querySelector('#model')?.value ?? '',
    }))

    if (!/^[\d.]+$/.test(seen.cost)) {
      fail(`on ${enc} the bill reads ${JSON.stringify(seen.cost)}`, 'A dollar sign with nothing after it is the one thing this panel must never be.')
      continue
    }

    const priceable = enc === 'o200k_base'
    if (priceable) {
      console.log(`  ok      ${enc.padEnd(11)} $${seen.cost}, the model's own vocabulary`)
      continue
    }

    const codes = CODES.filter((c) => seen.note.includes(c))
    if (codes.length > 0) {
      fail(
        `on ${enc} the note under the price says ${codes.join(' and ')}`,
        `${JSON.stringify(seen.note.slice(0, 110))}\n      Those are names for somebody who already knows what they are. The reader this panel is for does not.`,
      )
    }

    /*
     * Both counts, because this is the one place a price from one vocabulary
     * sits under a token count from another, and the sentence has to say so.
     */
    const shown = seen.count.replace(/[^\d]/g, '')
    if (shown && !seen.note.includes(shown)) {
      fail(
        `on ${enc} the note does not name the ${shown} tokens on screen`,
        `${JSON.stringify(seen.note.slice(0, 110))}\n      The price is counted on a different vocabulary, so the sentence has to hold both numbers or it is a price for the wrong count.`,
      )
    }

    if (!seen.announce.includes(seen.cost)) {
      fail(
        `on ${enc} the screen reader line does not carry the price`,
        `${JSON.stringify(seen.announce.slice(0, 110))}\n      It used to be dropped whenever the model and the encoding disagreed, which is "n/a" for the reader who cannot see the box.`,
      )
    }

    if (failed === 0) console.log(`  ok      ${enc.padEnd(11)} $${seen.cost}, in words, both counts named`)
  }
} finally {
  await browser.close().catch(() => {})
  server.stop()
}

if (failed > 0) {
  console.error('\nMoney is the bridge between a tokenizer and a person who does not care about tokenizers.')
  process.exit(1)
}

console.log('bill: the price panel holds a number on every vocabulary, and explains itself without codes')
