/**
 * What the page does when the network misbehaves.
 *
 *   npm run dev
 *   node tools/check-loading.mjs
 *
 * These two failures do not show up in any normal use and both were shipped.
 * One failed fetch turned the page into a styled empty box that never said
 * anything was wrong, and the retry a visitor would obviously try was a no-op
 * because the rejected promise was cached. Separately, choosing an encoding
 * while the first vocabulary was still downloading was silently undone 1.8
 * seconds later by the opening animation.
 *
 * Neither is reachable without controlling the network, so this drives a real
 * browser with the requests intercepted. Playwright is resolved the same way
 * tools/capture.mjs resolves it, and is not a dependency of the project.
 */

import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.TOKENLAB_URL ?? 'http://localhost:5173/'

async function loadPlaywright() {
  const { createRequire } = await import('node:module')
  const req = createRequire(import.meta.url)
  for (const c of [process.env.PLAYWRIGHT_PATH, 'playwright', resolve(root, 'node_modules/playwright')].filter(Boolean)) {
    try {
      const mod = req(c)
      if (mod?.chromium) return mod
    } catch {
      /* next */
    }
  }
  console.error('Playwright not found. Set PLAYWRIGHT_PATH or npm i -D playwright.')
  process.exit(1)
}

const { chromium } = await loadPlaywright()
const failures = []
const check = (name, ok, detail) => {
  if (ok) console.log(`  ok    ${name}`)
  else {
    console.error(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`)
    failures.push(name)
  }
}

const isCl100k = (url) => url.includes('cl100k')

// Either section can be run alone, which is what makes a negative control
// possible: revert one fix, run only the section that covers it.
const ONLY = process.env.TOKENLAB_ONLY ?? ''
const wants = (name) => ONLY === '' || ONLY === name

const browser = await chromium.launch()

// ---------------------------------------------------------------- failure
if (wants('healthy')) {
  // The state every visitor actually sees. This section exists because the page
  // shipped a release with a permanent empty red error bar on it: an author
  // `display: flex` had quietly defeated the `hidden` attribute, and nothing
  // looked at the healthy page, only at the broken one.
  console.log('a normal load, nothing wrong')
  const page = await browser.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)

  const alertBox = await page.locator('[data-load-error]').boundingBox()
  check('no error bar is on screen when nothing has failed', alertBox === null, JSON.stringify(alertBox))

  for (const sel of ['[data-load-error]', '[data-fracture-note]', '[data-compare]']) {
    const el = page.locator(sel)
    const hiddenAttr = await el.getAttribute('hidden')
    if (hiddenAttr === null) continue
    const box = await el.boundingBox()
    check(`${sel} marked hidden actually takes no space`, box === null, JSON.stringify(box))
  }

  check('tokens are drawn', (await page.locator('.tok').count()) > 0)
  await page.close()
}

if (wants('failure')) {
  console.log('a vocabulary that never arrives')
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  let cl100kRequests = 0
  let blocking = true

  await page.route('**/*', async (route) => {
    const url = route.request().url()
    if (isCl100k(url)) {
      cl100kRequests++
      if (blocking) return route.fulfill({ status: 503, body: 'nope' })
    }
    return route.continue()
  })

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)

  const alert = page.locator('[data-load-error]')
  check('the page says the vocabulary did not arrive', await alert.isVisible())
  check(
    'the button it was asked for is no longer marked busy',
    (await page.getAttribute("button[data-enc='cl100k_base']", 'aria-busy')) === 'false',
  )
  check('nothing was thrown out of the page', errors.length === 0, errors[0])

  // A browser caches a failed module load against its URL, so importing the
  // same specifier again never reaches the network. The retry therefore reloads,
  // and the test is whether the network is touched again and the text survives.
  await page.fill('#input', 'Θα είμαι εκεί σε δέκα λεπτά')
  const before = cl100kRequests
  blocking = false
  await page.click('[data-retry]')
  await page.waitForTimeout(4000)
  check(
    'the retry reaches the network again rather than replaying the rejection',
    cl100kRequests > before,
    `requests before ${before}, after ${cl100kRequests}`,
  )
  check('the page recovers and draws tokens', (await page.locator('.tok').count()) > 0)
  check('the error message is gone once it works', !(await alert.isVisible()))
  check(
    'the text survives the retry',
    (await page.inputValue('#input')) === 'Θα είμαι εκεί σε δέκα λεπτά',
    await page.inputValue('#input'),
  )
  check(
    'it comes back on the encoding that had failed',
    (await page.getAttribute("button[data-enc='cl100k_base']", 'aria-pressed')) === 'true',
  )

  await page.close()
}

// ------------------------------------------------------------------ race
if (wants('race')) {
  console.log('choosing an encoding while the first one is still loading')
  const page = await browser.newPage()
  await page.route('**/*', async (route) => {
    if (isCl100k(route.request().url())) {
      await new Promise((r) => setTimeout(r, 2500))
    }
    return route.continue()
  })

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  // While cl100k is still in flight, the visitor picks something else.
  await page.waitForTimeout(400)
  await page.click("button[data-enc='p50k_base']")

  // Long enough for the slow cl100k to land and for the opening move to have
  // fired if it was armed.
  await page.waitForTimeout(5000)

  const pressed = await page.getAttribute("button[data-enc='p50k_base']", 'aria-pressed')
  check('the encoding the visitor chose is still the one selected', pressed === 'true')

  const onCount = await page.locator('.enc.is-on').count()
  check('exactly one encoding is marked selected', onCount === 1, `found ${onCount}`)

  const headline = (await page.textContent('[data-headline-ratio]')) ?? ''
  check('the headline is not the literal placeholder', headline.trim() !== 'more', headline)

  await page.close()
}

await browser.close()

if (failures.length > 0) {
  console.error(`\n${failures.length} loading checks failed.`)
  process.exit(1)
}
console.log('\nloading behaviour holds under a failed fetch and under a slow one')
