/**
 * The page talks to nobody, and it never sends your text anywhere.
 *
 *   npm run check:network      (or npm run verify, which starts the server)
 *
 * PA-F13 was filed because the README said "No backend, no API key, no network
 * at runtime" one line above the sentence describing the megabyte of vocabulary
 * it fetches. The first half of that was the intended claim and true, the second
 * was false, and the proof was in the next paragraph.
 *
 * The sentence has since been rewritten and the contradiction is gone, which is
 * why this file exists instead of a fix: the claim it now makes is checkable,
 * and nothing was checking it. Measured at tick 137:
 *
 *   on load                 8 requests, all to its own origin: the document,
 *                           two self hosted fonts, the entry script, the
 *                           stylesheet, cl100k, GptEncoding and o200k
 *   after a secret was
 *   typed and every
 *   control was used        2 requests, both its own, both vocabularies
 *   carrying that text      0
 *
 * The second assertion is not the first one again. A page can keep every request
 * on its own origin and still put what you typed in a query string, and for a
 * page whose selling point is that your text never leaves the browser, that is
 * the one that matters.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { serve, useShared } from './serve.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

/* 1. The claim this gate exists to keep true. */
const readme = readFileSync(resolve(root, 'README.md'), 'utf8').replace(/\s+/g, ' ')
const CLAIM = 'no request leaves for a third party, and your text never goes anywhere'
if (!readme.includes(CLAIM)) {
  fail(
    'the README no longer makes the claim this gate holds',
    `looked for ${JSON.stringify(CLAIM)}. If the promise changed, this file has to change with it rather than quietly guarding nothing.`,
  )
}

const server = process.env.TOKENLAB_URL ? await useShared(process.env.TOKENLAB_URL) : await serve()
const browser = await chromium.launch()

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const origin = new URL(server.url).origin
  const requests = []
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), type: r.resourceType(), body: r.postData() ?? '' }))

  await page.goto(server.url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => document.querySelectorAll('#tokens [data-tok]').length > 0, null, { timeout: 60_000 })
  await page.waitForTimeout(2500)
  const onLoad = requests.length

  /*
   * Then everything a visitor can do. A beacon usually fires on an action rather
   * than on load, so a gate that only measures the load is a gate that would
   * have missed the thing it is looking for.
   */
  const secret = `ΜΥΣΤΙΚΟ-${Math.random().toString(36).slice(2, 10)}`
  await page.evaluate((text) => {
    const box = document.querySelector('#input')
    box.value = text
    box.dispatchEvent(new Event('input', { bubbles: true }))
  }, secret)
  await page.waitForTimeout(1200)
  for (const id of ['cl100k_base', 'p50k_base', 'r50k_base', 'o200k_base']) {
    await page.click(`.enc[data-enc="${id}"]`)
    await page.waitForTimeout(900)
  }
  await page.selectOption('.bill select', { index: 2 })
  await page.click('[data-shuffle]')
  await page.click('[data-lang="en"]')
  await page.waitForTimeout(1500)

  /* 2. Everything it asked for, it asked of itself. */
  const foreign = requests.filter((r) => new URL(r.url).origin !== origin)
  if (foreign.length > 0) {
    fail(
      `${foreign.length} of ${requests.length} requests went to somebody else`,
      foreign.map((r) => `${r.method} ${r.type} ${r.url}`).join('\n      '),
    )
  } else {
    console.log(
      `  ok      ${requests.length} requests, every one to its own origin: ${onLoad} on load and ` +
        `${requests.length - onLoad} while the page was used`,
    )
  }

  /* 3. And none of them carried what was typed. */
  const carrying = requests.filter((r) => r.url.includes(secret) || r.body.includes(secret) || decodeURIComponent(r.url).includes(secret))
  if (carrying.length > 0) {
    fail(
      `${carrying.length} requests carried the text from the box`,
      carrying.map((r) => `${r.method} ${r.url.slice(0, 120)}`).join('\n      ') +
        '\n      Same origin or not, this page promises the text never goes anywhere.',
    )
  } else {
    console.log(`  ok      nothing carried the ${secret.length} characters typed into the box`)
  }
} finally {
  await browser.close()
  server.stop()
}

if (failed > 0) {
  console.error('\nA page that promises your text stays with you has to be held to it by something that watches the wire.')
  process.exit(1)
}

console.log('network: every request is the page asking itself for something, and your text is never one of them')
