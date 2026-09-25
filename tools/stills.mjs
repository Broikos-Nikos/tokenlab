/**
 * The two still images in the README, produced rather than remembered.
 *
 *   npm run stills
 *
 * They were made by hand on 21 September and nothing in the repository knew how
 * (MA-F5), which is half of why DR-F8 happened: the corpus was rewritten at tick
 * 128, the recording was re-made, the stills were not, and the captions under
 * them went on quoting a sentence that no longer exists.
 *
 * Both are the **pinned** pair, the same sentence `measure.ts` computes the
 * caption's counts from and `capture.mjs` films. One constant, three artefacts.
 *
 * `docs/stills.json` records what was on screen in each shot, so `check:claims`
 * can hold the captions to the pictures rather than to a memory of them.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { serve, useShared } from './serve.mjs'
import { PINNED_PAIR } from './capture-state.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHOTS = [
  { encoding: 'o200k_base', file: 'docs/shatter-o200k.png' },
  { encoding: 'cl100k_base', file: 'docs/shatter-cl100k.png' },
]

const server = process.env.TOKENLAB_URL ? await useShared(process.env.TOKENLAB_URL) : await serve()
const browser = await chromium.launch()
const recorded = { made: new Date().toISOString().slice(0, 10), pair: PINNED_PAIR, shots: [] }

try {
  for (const shot of SHOTS) {
    const page = await browser.newPage({ viewport: { width: 1340, height: 900 }, deviceScaleFactor: 2 })
    await page.goto(`${server.url}?pair=${PINNED_PAIR}`, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => document.querySelectorAll('#tokens .tok').length > 0, null, { timeout: 60_000 })
    await page.click(`.enc[data-enc="${shot.encoding}"]`)
    // The chips fly in on a 520 ms stagger and the counter eases for 420.
    await page.waitForTimeout(2500)

    const seen = await page.evaluate(() => ({
      encoding: document.querySelector('.enc[aria-pressed="true"]')?.dataset?.enc ?? '',
      tokens: document.querySelector('[data-token-count]').textContent.trim(),
      fractured: document.querySelector('[data-fracture-count]').textContent.trim(),
      chips: document.querySelectorAll('#tokens .tok').length,
      sentence: document.querySelector('#input').value,
    }))
    if (seen.encoding !== shot.encoding) throw new Error(`asked for ${shot.encoding} and the page is on ${seen.encoding}`)

    /*
     * The stage only: the box, the chips and the readout. A full page shot puts
     * the findings table in a picture whose caption is about a sentence.
     */
    const stage = await page.$('.stage')
    await page.evaluate(() => window.scrollTo(0, 0))
    mkdirSync(resolve(root, 'docs'), { recursive: true })
    await stage.screenshot({ path: resolve(root, shot.file) })
    recorded.shots.push({ ...shot, ...seen })
    console.log(`${shot.file}  ${seen.tokens} tokens, ${seen.fractured} fractured, ${seen.chips} chips`)
    await page.close()
  }

  writeFileSync(resolve(root, 'docs/stills.json'), JSON.stringify(recorded, null, 2) + '\n')
  console.log(`docs/stills.json records pair ${PINNED_PAIR}: ${JSON.stringify(recorded.shots[0].sentence.slice(0, 60))}`)
} finally {
  await browser.close()
  server.stop()
}
