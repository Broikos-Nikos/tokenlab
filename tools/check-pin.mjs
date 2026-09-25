/**
 * A link that says it points at a sentence points at that sentence, or says it
 * cannot.
 *
 *   npm run check:pin      (or npm run verify, which starts the server)
 *
 * DR-F10. `?pair=N` was `parseInt` and a clamp, so anything that started with a
 * digit was accepted and anything out of range was quietly repaired. Measured on
 * the built page with 40 pairs committed:
 *
 *   ?pair=3abc  loaded pair 3       ?pair=999  loaded pair 39
 *   ?pair=1e9   loaded pair 1       ?pair=42   loaded pair 39
 *   ?pair=3.9   loaded pair 3       ?pair=-5   loaded pair 0
 *
 * The corpus lost three pairs on 21 September, so every link written at 40, 41
 * or 42 became a link to 39 and went on looking exactly as pinned as one that
 * worked. The recording in the README is pinned the same way, which is what
 * makes its numbers checkable, so this parameter is load bearing rather than a
 * convenience.
 *
 * The same shape one door over, found by sweeping for values that come from
 * outside: the resume record in `sessionStorage`, written when a vocabulary
 * fails and the visitor presses Try again, carries a pair index that nothing
 * validated. Measured by writing `pair: 999` into it and pressing a language
 * button: **TypeError: Cannot read properties of undefined (reading 'en')**, and
 * the page is dead from there.
 *
 * So both are checked here, and a fallback has to be visible: a page that
 * silently shows a different sentence is the defect with better manners.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { serve, useShared } from './serve.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pairs = JSON.parse(readFileSync(resolve(root, 'data/pairs.json'), 'utf8')).pairs
const indexOf = (text) => pairs.findIndex((p) => p.el === text || p.en === text)

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

/**
 * Each case: what the link says, and what the page may not do with it.
 *
 * `wouldHaveLoaded` is the pair the old clamp produced, and it is the assertion
 * that matters: a fallback that happens to land there once in forty times is
 * fine, a fallback that lands there every time is the clamp still running.
 */
const BAD = [
  { raw: '3abc', wouldHaveLoaded: 3 },
  { raw: '1e9', wouldHaveLoaded: 1 },
  { raw: '3.9', wouldHaveLoaded: 3 },
  { raw: '-5', wouldHaveLoaded: 0 },
  { raw: '42', wouldHaveLoaded: pairs.length - 1 },
  { raw: '999', wouldHaveLoaded: pairs.length - 1 },
  { raw: 'seventeen', wouldHaveLoaded: null },
]
/* Three loads of each, because the fallback is random and one is an anecdote. */
const TRIES = 3

const server = process.env.TOKENLAB_URL ? await useShared(process.env.TOKENLAB_URL) : await serve()
const browser = await chromium.launch()

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

  const load = async (query) => {
    await page.goto(`${server.url}${query}`, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => document.querySelector('#input').value.length > 0, null, { timeout: 30_000 })
    return page.evaluate(() => ({
      box: document.querySelector('#input').value,
      note: document.querySelector('[data-pin-note]').hidden ? null : document.querySelector('[data-pin-note]').textContent.trim(),
    }))
  }

  /* 1. A link that works, works, and says nothing. */
  const pinned = await load('?pair=17')
  if (indexOf(pinned.box) !== 17) fail(`?pair=17 loaded pair ${indexOf(pinned.box)}`)
  else if (pinned.note !== null) fail('?pair=17 works and the page apologised for it anyway', pinned.note)
  else console.log('  ok      ?pair=17 loads pair 17, with nothing to say about it')

  /* 2. And no parameter is not a rejected parameter. */
  const bare = await load('')
  if (bare.note !== null) fail('a page opened with no ?pair= says a link was rejected', bare.note)
  else console.log('  ok      no ?pair= at all: no note')

  /* 3. Everything else falls back, visibly, and not to the clamp. */
  for (const { raw, wouldHaveLoaded } of BAD) {
    const landed = []
    let notes = 0
    for (let i = 0; i < TRIES; i++) {
      const seen = await load(`?pair=${encodeURIComponent(raw)}`)
      landed.push(indexOf(seen.box))
      if (seen.note !== null && seen.note.includes(raw)) notes++
    }
    if (notes !== TRIES) {
      fail(
        `?pair=${raw} was rejected ${notes} times out of ${TRIES} in words`,
        'A link that quietly shows a different sentence looks exactly as pinned as one that works.',
      )
      continue
    }
    if (wouldHaveLoaded !== null && landed.every((i) => i === wouldHaveLoaded)) {
      fail(
        `?pair=${raw} landed on pair ${wouldHaveLoaded} all ${TRIES} times`,
        'That is the pair the old clamp produced. A fallback is the page picking for itself, not the parameter repaired.',
      )
      continue
    }
    console.log(`  ok      ?pair=${raw}: said so ${notes} times, landed on ${landed.join(', ')}`)
  }

  /*
   * 4. The resume record, which is the same value arriving by another door.
   */
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]))
  await page.goto(server.url, { waitUntil: 'networkidle' })
  await page.evaluate((n) => {
    sessionStorage.setItem(
      'tokenlab:resume',
      JSON.stringify({ text: 'x', encoding: 'o200k_base', custom: false, pair: n }),
    )
  }, pairs.length + 959)
  errors.length = 0
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  await page.click('[data-lang="en"]')
  await page.waitForTimeout(1500)
  if (errors.length > 0) {
    fail(
      `a resume record naming a pair the corpus does not have broke the page: ${errors[0]}`,
      'The record outlives the corpus it was written against, and nothing asked whether the index is still there.',
    )
  } else {
    const after = await page.evaluate(() => document.querySelector('#input').value)
    console.log(`  ok      a resume record out of range is dropped, and the page carries on: ${JSON.stringify(after.slice(0, 32))}`)
  }
} finally {
  await browser.close()
  server.stop()
}

if (failed > 0) {
  console.error('\nA pinned link is a promise about which sentence you are looking at.')
  process.exit(1)
}

console.log('pin: a link points where it says, or the page says it could not')
