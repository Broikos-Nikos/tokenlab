/**
 * The division a reader is invited to do, done against the running page.
 *
 *   npm run check:perword      (or npm run verify, which starts the server)
 *
 * ME-F13. The readout under the token count prints tokens per word for
 * whichever language is loaded. A visitor reads one figure, presses the other
 * language, reads the second, and divides. Measured on the built page before
 * this existed, on `o200k`:
 *
 *   pair 2   Greek 2.38 per word, English 1.18, divides to 2.02x, card says 1.46x
 *   pair 6   Greek 2.00 per word, English 1.09, divides to 1.83x, card says 1.33x
 *   pair 22  Greek 1.60 per word, English 1.17, divides to 1.37x, card says 1.71x
 *
 * Up 38 percent on one pair and down 20 on another, because Greek says the same
 * thing in fewer words: 474 against 500 over the corpus. Each figure on its own
 * is correct and correctly computed. Side by side in the same slot they are a
 * between language comparison of a unit that is not the same in the two
 * languages, and it happens to run in the flattering direction on average.
 *
 * So this is not a check that a sentence is present. It drives the page, reads
 * the two figures **the page itself printed**, does the reader's arithmetic, and
 * requires the page to have already said what that arithmetic gives and what the
 * sentence actually costs. Every number asserted here comes off the DOM, so the
 * gate cannot pass by agreeing with a stale corpus.
 */

import { chromium } from 'playwright'
import { serve, useShared } from './serve.mjs'

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

/*
 * The pairs that make the case, not a sample: the two where the division runs
 * hottest, one where it runs cold, one where the word counts happen to match so
 * the note has to say something true about a sentence that agrees, and pair 0
 * because it is what a visitor lands on.
 */
const PAIRS = [0, 2, 6, 21, 22]

/** Every number in a string, as printed. */
const numbers = (s) => s.match(/\d+(?:\.\d+)?/g) ?? []

const read = (page) =>
  page.evaluate(() => {
    const t = (sel) => document.querySelector(sel)?.textContent?.trim() ?? ''
    const note = document.querySelector('[data-unit-note]')
    return {
      words: t('[data-words]'),
      per: t('[data-tpw]'),
      unit: t('[data-word-unit]'),
      card: t('[data-compare-ratio]'),
      compareHidden: document.querySelector('[data-compare]').hidden,
      noteHidden: note.hidden,
      note: note.textContent.replace(/\s+/g, ' ').trim(),
    }
  })

const setLang = async (page, lang) => {
  await page.click(`[data-lang="${lang}"]`)
  await page.waitForTimeout(500)
}

const server = process.env.TOKENLAB_URL ? await useShared(process.env.TOKENLAB_URL) : await serve()
const browser = await chromium.launch()

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })

  for (const i of PAIRS) {
    await page.goto(`${server.url}?pair=${i}`, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => document.querySelectorAll('#tokens .tok').length > 0, null, { timeout: 60_000 })
    /*
     * Pinned, because the page opens on cl100k and heals to o200k 1.8 seconds
     * later. Every assertion below is made of what the page printed, so either
     * encoding would be self consistent, but a gate whose output depends on
     * which way that race fell is a gate nobody can read a number out of.
     */
    await page.click('.enc[data-enc="o200k_base"]')
    await page.waitForTimeout(1200)

    await setLang(page, 'el')
    const greek = await read(page)
    await setLang(page, 'en')
    const english = await read(page)

    /* 1. The unit says whose word it is. A bare "per word" is the invitation. */
    if (greek.unit !== 'Greek word') fail(`pair ${i}: the Greek readout says "per ${greek.unit}"`)
    if (english.unit !== 'English word') fail(`pair ${i}: the English readout says "per ${english.unit}"`)

    /* 2. The correction is there whenever the thing it corrects is. */
    if (greek.compareHidden || english.compareHidden) {
      fail(`pair ${i}: the comparison card is hidden on a corpus pair, so there is nothing to check`)
      continue
    }
    if (greek.noteHidden || english.noteHidden) {
      fail(
        `pair ${i}: the two per word figures are on screen and the note is hidden`,
        'This is ME-F13 exactly: two figures in one slot and nothing saying they do not divide.',
      )
      continue
    }

    /* 3. And it is the same correction whichever side you are reading from. */
    if (greek.note !== english.note) {
      fail(`pair ${i}: the note changes when the language does`, `Greek: ${greek.note}\n      English: ${english.note}`)
      continue
    }

    /*
     * 4. The arithmetic, done the way a reader does it: on the two figures the
     * page printed, to the two decimals it printed them at. Computing this from
     * the corpus instead would let the page print one pair of figures and the
     * note explain a different pair.
     */
    const divided = (Number(greek.per) / Number(english.per)).toFixed(2)
    // The card prints "1.46x", and Number("1.46x") is NaN, which compares
    // unequal to everything and would have made this assertion unfailable.
    const card = Number.parseFloat(greek.card).toFixed(2)
    if (greek.card !== english.card) {
      fail(`pair ${i}: the card says ${greek.card} in Greek and ${english.card} in English`)
      continue
    }

    const said = numbers(greek.note)
    const wanted = [
      ['the Greek per word figure', greek.per],
      ['the English per word figure', english.per],
      ['what they divide to', divided],
      ['what the sentence actually costs', card],
      ['the Greek word count', greek.words],
      ['the English word count', english.words],
    ]
    const missing = wanted.filter(([, v]) => !said.includes(v))
    if (missing.length > 0) {
      fail(
        `pair ${i}: the note is missing ${missing.map(([w]) => w).join(', ')}`,
        `The page prints ${greek.per} per Greek word and ${english.per} per English word, which divide to ` +
          `${divided}x against a measured ${card}x. The note says: ${greek.note}`,
      )
      continue
    }

    const gap = ((Number(divided) / Number(card) - 1) * 100).toFixed(1)
    console.log(
      `  ok      pair ${i}: ${greek.per} per Greek word and ${english.per} per English word divide to ` +
        `${divided}x against ${card}x, ${gap >= 0 ? '+' : ''}${gap} percent, and the page says so`,
    )
  }

  /*
   * 5. Their own text. There is no partner sentence, so there is no division to
   * disarm and no language to put on the unit: the note has to be gone rather
   * than explaining a comparison that is not on screen.
   */
  await page.goto(server.url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => document.querySelectorAll('#tokens .tok').length > 0, null, { timeout: 60_000 })
  await page.fill('#input', 'Καλημέρα κόσμε, this is my own text.')
  await page.waitForTimeout(900)
  const own = await read(page)
  if (!own.noteHidden) fail('typed text: the note explains a comparison that is not on screen')
  if (own.unit !== 'word') fail(`typed text: the unit says "${own.unit}" for text in no known language`)
  if (failed === 0) console.log('  ok      typed text: no comparison, no correction, and the unit is bare')
} finally {
  await browser.close()
  server.stop()
}

if (failed > 0) {
  console.error('\nTwo correct figures in one slot are a third figure nobody measured.')
  process.exit(1)
}

console.log('per word: the two readings divide to what the page says they divide to, and it says what the sentence costs')
