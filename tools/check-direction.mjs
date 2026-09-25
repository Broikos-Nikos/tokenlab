/**
 * The token row is read from the end a reader of that script starts at.
 *
 *   npm run check:direction      (or npm run verify, which starts the server)
 *
 * HS-F11. Measured on the built page before the fix, with a trailing full stop
 * so the bidi is visible:
 *
 *   Greek    first chip leftmost   textarea ltr
 *   Hebrew   first chip leftmost   textarea ltr
 *   Arabic   first chip leftmost   textarea ltr
 *
 * Two defects. The box declared no direction, so "الثمن 1290 ريال." rendered
 * with its full stop on the left. And the chips were laid out left to right
 * whatever the script, so a reader of Hebrew or Arabic began at the wrong end
 * of their own sentence while the box beside it read the other way.
 *
 * The workspace gate `tools/check-direction.mjs` covers the markup: every free
 * text element in every project declares a direction. It cannot cover this,
 * because where the chips are drawn is behaviour. `watch-it-think` is the proof
 * that the two are different questions: its token row carries `dir="auto"` and
 * still resolved to `ltr`, because the first thing it draws is the model's own
 * `cls` marker and that is the first strong character the browser sees.
 *
 * So this drives the page and asks where things landed.
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
 * Each case carries a trailing full stop on purpose. A neutral character at the
 * end of an RTL run is where an undeclared direction shows itself first, and it
 * is the thing a reader of that script notices before anything else.
 */
const CASES = [
  { label: 'Greek', text: 'Καλημέρα κόσμε 1290 σήμερα.', dir: 'ltr', digits: '1290' },
  { label: 'Hebrew', text: 'שלום עולם 42 היום.', dir: 'rtl', digits: '42' },
  { label: 'Arabic', text: 'الثمن 1290 ريال.', dir: 'rtl', digits: '1290' },
  /*
   * Long enough to wrap at 390, which the three above are not. The row wrapping
   * is where the first version of this gate was wrong: it compared the first
   * chip against the whole row rather than against its own line and called a
   * correct layout reversed.
   */
  {
    label: 'Arabic, wrapping',
    text: 'الثمن 1290 ريال. مرحبا بالعالم اليوم. اضبط مؤقتا لعشر دقائق من فضلك.',
    dir: 'rtl',
    digits: '1290',
  },
]

const server = process.env.TOKENLAB_URL ? await useShared(process.env.TOKENLAB_URL) : await serve()
const browser = await chromium.launch()

try {
  /*
   * Both widths, because the row wraps at 390 and a wrapped bidi paragraph is
   * where this goes wrong: the layout was right and the first version of this
   * gate was not.
   */
  for (const width of [1280, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  await page.goto(server.url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => document.querySelectorAll('#tokens .tok').length > 0, null, { timeout: 60_000 })
  await page.waitForTimeout(2500)

  for (const { label: base, text, dir: want, digits } of CASES) {
    const label = `${base} at ${width}`
    await page.evaluate((t) => {
      const ta = document.querySelector('#input')
      ta.value = t
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    }, text)
    await page.waitForTimeout(700)

    const r = await page.evaluate(() => {
      const chips = [...document.querySelectorAll('#tokens .tok')]
      const xs = chips.map((c) => c.getBoundingClientRect().x)
      /*
       * Per line, not across the row. A wrapped right to left paragraph puts
       * the first token rightmost on *its* line, and a chip three lines down
       * can sit further right than that, so comparing against the whole row
       * reports a correct layout as broken. Found at 390, where the Arabic
       * sentence wraps and the first version of this gate called it reversed.
       */
      const ys = chips.map((c) => Math.round(c.getBoundingClientRect().y))
      const firstLine = xs.filter((_, i) => ys[i] === ys[0])
      const lastLine = xs.filter((_, i) => ys[i] === ys[ys.length - 1])
      return {
        chips: chips.length,
        lines: new Set(ys).size,
        firstX: xs[0],
        lastX: xs[xs.length - 1],
        minX: Math.min(...firstLine),
        maxX: Math.max(...firstLine),
        lastMinX: Math.min(...lastLine),
        lastMaxX: Math.max(...lastLine),
        // The chips of the number, in token order, with where each was drawn.
        digitXs: chips.map((c, i) => [c.textContent, xs[i]]).filter(([t]) => /^\d+$/.test(t)).map(([, x]) => x),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        // A chip that wraps internally draws in more than one rectangle.
        splitChips: chips.filter((c) => c.getClientRects().length > 1).length,
        boxDir: getComputedStyle(document.querySelector('#input')).direction,
        spelled: chips.map((c) => c.textContent).join(''),
        typed: document.querySelector('#input').value,
      }
    })

    if (r.chips < 3) {
      fail(`${label}: only ${r.chips} chips, so there is no order to check`)
      continue
    }

    /* 1. The box reads the way the script does. */
    if (r.boxDir !== want) fail(`${label}: the box computes ${r.boxDir} and this script is ${want}`)

    /*
     * 2. Which end the row starts at, which is the finding itself. Not a
     * comparison against the typed string: for a right to left sentence the
     * visual order is meant to differ from the logical one, and an assertion
     * that they match is an assertion that the fix is absent.
     */
    const startsRight = r.firstX === r.maxX && r.lastX === r.lastMinX
    const startsLeft = r.firstX === r.minX && r.lastX === r.lastMaxX
    const ok = want === 'rtl' ? startsRight : startsLeft
    if (!ok) {
      fail(
        `${label}: the first token is at x ${Math.round(r.firstX)} and the last at ${Math.round(r.lastX)}, in a row from ${Math.round(r.minX)} to ${Math.round(r.maxX)}`,
        `${want} reading starts at the ${want === 'rtl' ? 'right' : 'left'}. This is HS-F11: the row laid out in reverse reading order.`,
      )
      continue
    }

    /*
     * 3. And a number keeps its digits in order. Digits read left to right even
     * inside a right to left sentence, and the tokenizer splits them across
     * chips, so this is the assertion that caught the first attempt at the fix:
     * a flex row with dir="auto" starts at the right correctly and renders 1290
     * as 0129.
     */
    if (r.digitXs.length > 1) {
      const rising = r.digitXs.every((x, i) => i === 0 || x > r.digitXs[i - 1])
      if (!rising) {
        fail(
          `${label}: the digits of ${digits} are drawn at x ${r.digitXs.map(Math.round).join(', ')}`,
          'A number reads left to right in every script. Those are the chips of one number, in reverse.',
        )
        continue
      }
    }

    /*
     * 4. The row stays inside the page, and no chip is broken across two lines.
     *
     * This assertion exists because nothing here had it. Making the chips plain
     * inlines, which is what fixed the reading order, removed the flex wrap that
     * used to break the row for free, and inline boxes with nothing between them
     * give a line no place to break: the row ran **413px** off the side of a
     * 390 wide page and `npm run verify` exited 0. Six browser gates and 46
     * assertions, and not one of them asked whether the page fits.
     */
    if (r.overflow > 0) {
      fail(`${label}: the page scrolls sideways by ${r.overflow}px`, 'A row of inline boxes with nothing between them has no place to break.')
      continue
    }
    if (r.splitChips > 0) {
      fail(
        `${label}: ${r.splitChips} chips are broken across two lines`,
        'A token drawn in two pieces is a token the tokenizer never produced. `white-space: pre` on the chip is what prevents it.',
      )
      continue
    }

    /* 5. And the chips still spell the sentence in token order. */
    if (r.spelled !== r.typed) {
      fail(`${label}: the chips spell ${JSON.stringify(r.spelled)} and the box holds ${JSON.stringify(r.typed)}`)
      continue
    }

    console.log(
      `  ok      ${label}: box ${want}, ${r.chips} chips starting at the ${want === 'rtl' ? 'right' : 'left'}` +
        (r.digitXs.length > 1 ? `, and the ${r.digitXs.length} chips of ${digits} run left to right` : ''),
    )
  }

  await page.close()
  }
} finally {
  await browser.close()
  server.stop()
}

if (failed > 0) {
  console.error('\nA page that shows a visitor their own words has to show them the right way round.')
  process.exit(1)
}

console.log('direction: the box and the token row both follow the script, and the row starts where a reader does')
