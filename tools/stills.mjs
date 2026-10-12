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

import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { serve, useShared } from './serve.mjs'
import { PINNED_PAIR } from './capture-state.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHOTS = [
  { encoding: 'o200k_base', file: 'docs/shatter-o200k.png' },
  { encoding: 'cl100k_base', file: 'docs/shatter-cl100k.png' },
  /*
   * RC-F11. The card a link unfurls into, in `public/` because that is what
   * ships: `docs/` is in the repository and not on the site, so an og:image
   * pointing there is a link to a 404 and a preview that stays blank.
   *
   * 1200 by 630 is what Slack, LinkedIn and the rest crop to, and it is taken of
   * the viewport rather than of the stage element so the picture is that shape
   * exactly rather than whatever the stage happens to be.
   */
  { encoding: 'cl100k_base', file: 'public/card.png', viewport: { width: 1200, height: 630 }, whole: true, scale: 1 },
]

const server = process.env.TOKENLAB_URL ? await useShared(process.env.TOKENLAB_URL) : await serve()
const browser = await chromium.launch()
const recorded = { made: new Date().toISOString().slice(0, 10), pair: PINNED_PAIR, shots: [] }
let card = null

try {
  for (const shot of SHOTS) {
    const page = await browser.newPage({ viewport: shot.viewport ?? { width: 1340, height: 900 }, deviceScaleFactor: shot.scale ?? 2 })
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
    await page.evaluate(() => window.scrollTo(0, 0))
    mkdirSync(resolve(root, 'docs'), { recursive: true })
    if (shot.whole) {
      /*
       * The card is the frame itself, cropped by nothing, and at 1 rather than
       * 2 device pixels per CSS pixel: an unfurl shows it about 500 pixels wide
       * and every service refetches it on every paste, so 2400 across is 1.8 MB
       * nobody sees.
       */
      await page.evaluate(() => window.scrollTo(0, 240))
      await page.screenshot({ path: resolve(root, shot.file) })

      /*
       * And what the page said while the card was being taken, in the shape
       * the workspace's `tools/check-head.mjs` reads from every project: the
       * colour the browser composited, the headline, and every number the
       * rendered page shows. The head is prose and prose carries numbers
       * nobody recomputes, which cost three of the other seven projects a
       * wrong number in their own description, found at tick 229.
       */
      card = await page.evaluate(() => {
        const rgb = getComputedStyle(document.body).backgroundColor
        const hex = rgb.match(/\d+/g)?.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('') ?? ''
        return {
          title: document.title,
          background: hex ? `#${hex}` : rgb,
          headline: (document.querySelector('[data-headline]') ?? document.querySelector('h1'))?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          numbers: [...new Set(document.body.innerText.match(/\d[\d,]*(?:\.\d+)?/g) ?? [])].sort(),
        }
      })
    } else {
      const stage = await page.$('.stage')
      await stage.screenshot({ path: resolve(root, shot.file) })
    }
    recorded.shots.push({ ...shot, ...seen })
    console.log(`${shot.file}  ${seen.tokens} tokens, ${seen.fractured} fractured, ${seen.chips} chips`)
    await page.close()
  }

  writeFileSync(resolve(root, 'docs/stills.json'), JSON.stringify(recorded, null, 2) + '\n')

  if (!card) throw new Error('no card shot ran, so docs/card.json would describe nothing')
  writeFileSync(
    resolve(root, 'docs/card.json'),
    `${JSON.stringify(
      {
        why: "What was on screen when public/card.png was taken. The workspace gate tools/check-head.mjs holds this page's head to it: theme-color to the colour the browser composited, og:title to the title or the headline, and every number in the description to a number the page shows.",
        made: new Date().toISOString().slice(0, 10),
        viewport: { width: 1200, height: 630 },
        deviceScaleFactor: 1,
        bytes: statSync(resolve(root, 'public/card.png')).size,
        seen: card,
      },
      null,
      2,
    )}\n`,
  )
  console.log(`docs/stills.json records pair ${PINNED_PAIR}: ${JSON.stringify(recorded.shots[0].sentence.slice(0, 60))}`)
} finally {
  await browser.close()
  server.stop()
}
