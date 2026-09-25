/**
 * Every control that reports a state change has made one.
 *
 *   npm run check:controls      (or npm run verify, which starts the server)
 *
 * HS-F4, from the hostile-stranger pass of 2026-09-20: typing kills the
 * language toggle and deletes the comparison. Reproduced on the built page by
 * typing four characters and pressing English, then diffing six observable
 * things before and after:
 *
 *   after typing    text "Θα είμαι εκεί...", lang el, el:true en:false, compare hidden, 24 tokens
 *   after English   text "Θα είμαι εκεί...", lang el, el:false en:true, compare hidden, 24 tokens
 *
 *   pressing English changed 1 of 6 observable things: pressed
 *
 * The button said English, marked itself pressed, and changed nothing else. A
 * control that reports a state change it did not make is worse than a disabled
 * one, because a disabled control tells the truth.
 *
 * ## What this asserts, and why it is behaviour rather than structure
 *
 * The structural version, "no click handler may set its own pressed state",
 * would pass the moment somebody moved one line, and it would not notice a
 * handler that sets the state and then fails to apply it for a different
 * reason. So this presses the control and counts what moved.
 *
 * 1. **A language press changes the text, its `lang`, and the pressed state**,
 *    from a page holding the visitor's own text. One of three is the defect.
 * 2. **It brings the comparison back**, because vanishing with no explanation
 *    is the other half of HS-F4.
 * 3. **It does not destroy what they wrote.** `put my text back` appears and
 *    returns the text exactly. This project has already shipped one silent
 *    discard of typed text, PA-F2, and does not get to ship a second.
 * 4. **And nothing is announced that is not shown**: while the visitor's own
 *    text is in the box, the comparison is either drawn or explained, never
 *    simply absent.
 */

import { chromium } from 'playwright'
import { serve, useShared } from './serve.mjs'

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}
const ok = (what) => console.log(`  ok      ${what}`)

/** The six things a visitor can see change, read in one go. */
const LOOK = () => ({
  text: document.querySelector('#input').value,
  textLang: document.querySelector('#input').getAttribute('lang'),
  pressed: [...document.querySelectorAll('[data-lang]')].map((n) => `${n.dataset.lang}:${n.getAttribute('aria-pressed')}`).join(' '),
  compareHidden: document.querySelector('[data-compare]').hidden,
  noteHidden: document.querySelector('[data-compare-note]').hidden,
  tokens: document.querySelector('[data-token-count]').textContent.trim(),
  restoreHidden: document.querySelector('[data-restore]').hidden,
})

const TYPED = ' και όχι μόνο'

const server = process.env.TOKENLAB_URL ? await useShared(process.env.TOKENLAB_URL) : await serve()
const browser = await chromium.launch()

try {
  for (const press of ['en', 'el']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.goto(`${server.url}?pair=0`, { waitUntil: 'networkidle' })
    // The opening move heals the page a moment after load; let it finish so
    // this measures a settled page rather than a racing one.
    await page.waitForTimeout(2200)

    await page.click('#input')
    await page.keyboard.press('End')
    await page.keyboard.type(TYPED)
    await page.waitForTimeout(500)
    const typed = await page.evaluate(LOOK)

    if (!typed.compareHidden) {
      fail(`${press}: the comparison is still shown over the visitor's own text`, 'There is no other language for it to compare against.')
    } else if (typed.noteHidden) {
      fail(
        `${press}: the comparison vanished with nothing in its place`,
        'A measurement that does not apply has to say so. Disappearing reads as a page that broke.',
      )
    } else {
      ok(`${press}: over the visitor's own text the comparison is replaced by its reason, not by nothing`)
    }

    await page.click(`[data-lang="${press}"]`)
    await page.waitForTimeout(600)
    const after = await page.evaluate(LOOK)

    const moved = Object.keys(typed).filter((k) => JSON.stringify(typed[k]) !== JSON.stringify(after[k]))
    if (moved.length <= 1) {
      fail(
        `pressing ${press} changed ${moved.length} of ${Object.keys(typed).length} observable things: ${moved.join(', ') || 'nothing'}`,
        `the text is still ${JSON.stringify(after.text.slice(0, 44))}. This is HS-F4 exactly: the control reports a change it did not make.`,
      )
      await page.close()
      continue
    }

    for (const [what, wrong] of [
      ['the text', after.text === typed.text],
      ['the textarea lang', after.textLang !== press],
      ['which button is pressed', !after.pressed.includes(`${press}:true`)],
      ['the comparison', after.compareHidden],
    ]) {
      if (wrong) fail(`pressing ${press} did not change ${what}`, `before ${JSON.stringify(typed)}\n      after  ${JSON.stringify(after)}`)
    }
    if (failed === 0) ok(`pressing ${press} moved ${moved.length} of ${Object.keys(typed).length} things: ${moved.join(', ')}`)

    /* 3. And it did not destroy what they wrote. */
    if (after.restoreHidden) {
      fail(`pressing ${press} replaced the visitor's text with no way back`, 'PA-F2 was this, and it was filed as a high.')
    } else {
      await page.click('[data-restore]')
      await page.waitForTimeout(500)
      const back = await page.evaluate(LOOK)
      if (back.text !== typed.text) {
        fail(
          'put my text back did not return the text exactly',
          `wanted ${JSON.stringify(typed.text.slice(0, 50))}\n      got    ${JSON.stringify(back.text.slice(0, 50))}`,
        )
      } else if (!back.restoreHidden) {
        fail('put my text back is still offered after it has been taken', 'It would overwrite the thing it just restored.')
      } else {
        ok(`${press}: the typed text came back exactly, ${back.text.length} characters, and the offer withdrew itself`)
      }
    }
    await page.close()
  }
} finally {
  await browser.close()
  server.stop()
}

if (failed > 0) {
  console.error('\nA control that reports a state change it did not make is worse than a disabled one.')
  process.exit(1)
}

console.log('controls: the language toggle does what its label says, and takes nothing away without offering it back')
