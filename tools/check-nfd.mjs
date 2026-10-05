/**
 * The page says so when the text is not in NFC, and says what it costs.
 *
 *   npm run check:nfd      (or npm run verify, which starts the server)
 *
 * ME-F11: the measurement assumes NFC and said so nowhere, and a visitor
 * pasting Greek with combining accents, which is what comes off some macOS
 * pipelines, was charged for it silently. It is the same text on screen and a
 * different string to a tokenizer. Measured on this corpus:
 *
 *   o200k    1093 tokens NFC, 1508 NFD, +38%, and the ratio a reader is
 *            looking at moves from 1.92x to 2.65x
 *   cl100k   +9%    p50k and r50k   +11.6%
 *
 * `check:claims` holds the table in the README and asserts the corpus is NFC.
 * Neither can see the page, and the page is where a visitor meets this, so this
 * pastes both forms and reads what comes back.
 *
 * Three assertions, and the third is the one that stops the note being
 * decoration: the figures in it have to be the figures the encoder produces for
 * that exact text, not a sentence about normalisation in general.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { serve, useShared } from './serve.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const findings = JSON.parse(readFileSync(resolve(root, 'src/generated/findings.json'), 'utf8'))
/* Pinned, because the page heals to this one on its own and a gate should not race it. */
const ENCODING = 'o200k_base'

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

const GREEK = 'Καλημέρα κόσμε σήμερα, τιμή 1290 ευρώ'

const server = process.env.TOKENLAB_URL ? await useShared(process.env.TOKENLAB_URL) : await serve()
const browser = await chromium.launch()

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(server.url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => document.querySelectorAll('#tokens [data-tok]').length > 0, null, { timeout: 60_000 })
  await page.waitForTimeout(2500)
  await page.click(`.enc[data-enc="${ENCODING}"]`)
  await page.waitForTimeout(1200)

  const look = async (text) => {
    await page.evaluate((t) => {
      const ta = document.querySelector('#input')
      ta.value = t
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    }, text)
    await page.waitForTimeout(600)
    return page.evaluate(() => ({
      shown: !document.querySelector('[data-nfd-note]').hidden,
      body: document.querySelector('[data-nfd-body]').textContent.trim(),
      tokens: Number(document.querySelector('[data-token-count]').textContent.replace(/[^0-9]/g, '')),
    }))
  }

  /* 1. It is quiet when there is nothing to say. */
  for (const [label, text] of [
    ['NFC Greek', GREEK.normalize('NFC')],
    ['English', 'Good morning world, price 1290 euros'],
  ]) {
    const r = await look(text)
    if (r.shown) fail(`${label}: the note is shown over text that is already NFC`, JSON.stringify(r.body.slice(0, 90)))
    else console.log(`  ok      ${label}: no note, ${r.tokens} tokens`)
  }

  /* 2. And it speaks when there is. */
  const nfd = await look(GREEK.normalize('NFD'))
  if (!nfd.shown) {
    fail('NFD Greek: the page says nothing', 'The visitor is being charged 38 percent more with no explanation, which is ME-F11.')
  } else {
    console.log(`  ok      NFD Greek: the note appears, ${nfd.tokens} tokens`)
  }

  /*
   * 3. And the numbers in it are this text's numbers. A note that always says
   * the same thing is a sentence about normalisation rather than a measurement
   * of what was pasted.
   */
  const nfc = await look(GREEK.normalize('NFC'))
  if (nfd.shown) {
    const want = `${nfd.tokens.toLocaleString('en-US')} tokens where the same text in NFC is ${nfc.tokens.toLocaleString('en-US')}`
    if (!nfd.body.includes(want)) {
      fail('the note does not carry this text’s own counts', `wanted ${JSON.stringify(want)}\n      note said ${JSON.stringify(nfd.body.slice(0, 140))}`)
    } else if (nfd.tokens <= nfc.tokens) {
      fail(`NFD came out at ${nfd.tokens} tokens and NFC at ${nfc.tokens}`, 'On this corpus NFD is dearer on every encoding. If it is not here, the note is measuring the wrong thing.')
    } else {
      const extra = Math.round(100 * (nfd.tokens / nfc.tokens - 1))
      if (!nfd.body.includes(`${extra}% more`)) {
        fail(`the note does not say ${extra}% more`, JSON.stringify(nfd.body.slice(0, 140)))
      } else {
        console.log(`  ok      the note carries this text's own counts: ${nfd.tokens} against ${nfc.tokens}, ${extra}% more`)
      }
    }
  }

  /*
   * 4. And what it does to the claim at the top of the page, not only to the
   * count. HE-F6: the note said how many more tokens and stopped, while the line
   * under the headline went on saying this vocabulary adds almost nothing beyond
   * the alphabet. On the corpus in NFD that figure is more than twenty times
   * larger, so for NFD text the headline is the wrong way round and the note is
   * the only place a visitor could learn it.
   */
  if (nfd.shown) {
    const n = findings.encodings[ENCODING].nfd
    const signed = (x) => `${x >= 0 ? '+' : ''}${x}%`
    const want = `from ${signed(n.penaltyPercentNfc)} to ${signed(n.penaltyPercentNfd)}`
    if (!nfd.body.includes(want)) {
      fail(
        'the note says what NFD costs in tokens and not what it does to the vocabulary penalty',
        `wanted ${JSON.stringify(want)}
      note said ${JSON.stringify(nfd.body.slice(0, 200))}`,
      )
    } else {
      console.log(`  ok      the note says the penalty moves ${want}, which is the headline turning over`)
    }
  }

  await page.close()
} finally {
  await browser.close()
  server.stop()
}

if (failed > 0) {
  console.error('\nA page that charges you 38 percent more for invisible characters has to say which characters.')
  process.exit(1)
}

console.log('nfd: the page notices combining accents and prices them against the same text precomposed')
