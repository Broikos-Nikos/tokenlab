/**
 * Every boundary you can use, and every word you can read, measured.
 *
 *   npm run check:contrast      (or npm run verify, which starts the server)
 *
 * PA-F10. `--edge` was the only line around the text box, the model picker, the
 * shuffle button and the idle encoding buttons, and on the built page it
 * measured **1.36:1 against the page, 1.27 against a lifted surface, 1.24
 * against the box's own fill and 1.12 against the picker's**. WCAG 1.4.11 asks
 * 3:1 for the visual boundary of a control. At 1.2 there is no boundary: the box
 * ends where the visitor guesses it ends.
 *
 * The picker was worse than the rest. `appearance: none` took the native arrow
 * away and nothing replaced it, so the only control that changes the price
 * rendered as a rounded box with a word in it.
 *
 * ## Why this is a browser gate and not a stylesheet grep
 *
 * The palette is written in `oklch`, the page composites `color-mix` and alpha
 * over three different surfaces, and Chrome hands back `lab()` for some of it.
 * A number worked out from the source is a number about the source. This asks
 * the page what it drew, and converts through a 1x1 canvas, which is the only
 * parser here that knows every notation the stylesheet uses.
 */

import { chromium } from 'playwright'
import { serve, useShared } from './serve.mjs'

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

/** 1.4.11, the visual boundary of a user interface component. */
const CONTROL_MIN = 3
/** 1.4.3, body text. Large text is allowed 3:1 and is handled below. */
const TEXT_MIN = 4.5

const CONTROLS = [
  ['the text box', '#input'],
  ['the model picker', '.bill select'],
  ['another sentence', '.shuffle'],
  ['an idle encoding button', '.enc:not(.is-on)'],
  ['the selected encoding button', '.enc.is-on'],
]

const server = process.env.TOKENLAB_URL ? await useShared(process.env.TOKENLAB_URL) : await serve()
const browser = await chromium.launch()

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(server.url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => document.querySelectorAll('#tokens .tok').length > 0, null, { timeout: 60_000 })
  await page.waitForTimeout(2000)

  const measured = await page.evaluate((controls) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const px = (value) => {
      ctx.fillStyle = '#000000'
      ctx.fillStyle = String(value)
      const taken = ctx.fillStyle
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      if (taken === '#000000' && !/^(#000000|black|rgba?\(0, 0, 0)/.test(String(value))) {
        throw new Error(`the canvas would not take ${JSON.stringify(String(value))}, so this gate is not measuring it`)
      }
      return { r, g, b, a: a / 255 }
    }
    const over = (fg, bg) => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    })
    const lum = (c) => {
      const f = (v) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
    }
    const ratio = (a, b) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    }
    /** Everything painted behind an element, composited in paint order. */
    const behind = (el) => {
      const stack = []
      for (let node = el.parentElement; node; node = node.parentElement) {
        const bg = px(getComputedStyle(node).backgroundColor)
        if (bg.a > 0) stack.push(bg)
      }
      let acc = px('#080604')
      for (const bg of stack.reverse()) acc = over(bg, acc)
      return acc
    }

    const boundaries = []
    for (const [label, selector] of controls) {
      const el = document.querySelector(selector)
      if (!el) {
        boundaries.push({ label, selector, missing: true })
        continue
      }
      const cs = getComputedStyle(el)
      const back = behind(el)
      const own = px(cs.backgroundColor)
      const onSurface = own.a > 0 ? over(own, back) : back
      const border = px(cs.borderTopColor)
      boundaries.push({
        label,
        selector,
        width: Number.parseFloat(cs.borderTopWidth),
        inside: Number(ratio(over(border, onSurface), onSurface).toFixed(2)),
        /*
         * Zero when there is no border to paint. Reading the colour of a border
         * nobody drew would let a control pass on a line that is not there,
         * which is the same defect as a line nobody can see.
         */
        outside: Number.parseFloat(cs.borderTopWidth) > 0 ? Number(ratio(over(border, back), back).toFixed(2)) : 0,
        /*
         * A filled control is told apart by its fill, and a bordered one by its
         * border. Either is enough, and asking for both would mean putting a
         * visible outline on every filled button in the house.
         */
        fill: own.a > 0 ? Number(ratio(onSurface, back).toFixed(2)) : 0,
        appearance: cs.appearance,
        backgroundImage: cs.backgroundImage,
      })
    }

    /*
     * And the words. Every element with its own text, against what is behind it.
     * Walked rather than listed, because a list only ever covers the colours
     * somebody remembered to put in it.
     */
    const text = []
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('.sr-only, [aria-hidden="true"], noscript')) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '')
      if (!own) continue
      const back = behind(el)
      const bg = px(cs.backgroundColor)
      const surface = bg.a > 0 ? over(bg, back) : back
      const colour = over(px(cs.color), surface)
      const size = Number.parseFloat(cs.fontSize)
      const bold = Number(cs.fontWeight) >= 700
      const large = size >= 24 || (bold && size >= 18.66)
      text.push({
        what: `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}`,
        sample: (el.textContent ?? '').trim().slice(0, 34),
        size: Math.round(size),
        large,
        ratio: Number(ratio(colour, surface).toFixed(2)),
      })
    }
    return { boundaries, text }
  }, CONTROLS)

  /* 1. The boundary of anything you can use. */
  for (const b of measured.boundaries) {
    if (b.missing) {
      fail(`${b.label} (${b.selector}) is not on the page, so this gate is checking nothing`)
      continue
    }
    const best = Math.max(b.outside, b.fill)
    if (best < CONTROL_MIN) {
      fail(
        `${b.label}: nothing tells it apart from the page by more than ${best}:1, and a control needs ${CONTROL_MIN}:1`,
        `its border is ${b.outside}:1 against what is behind it and ${b.inside}:1 against its own fill, and its fill is ${b.fill}:1. ` +
          'This is PA-F10: at 1.2 the box ends where the visitor guesses.',
      )
    } else {
      console.log(
        `  ok      ${b.label}: ${best}:1 against the page, by its ${b.outside >= b.fill ? 'border' : 'fill'}`,
      )
    }
  }

  /* 2. And the one control whose native affordance was taken away. */
  const picker = measured.boundaries.find((b) => b.selector === '.bill select')
  if (picker && !picker.missing && picker.appearance === 'none' && picker.backgroundImage === 'none') {
    fail(
      'the model picker has appearance: none and nothing drawn in place of the arrow',
      'It is the only control that changes the price, and it renders as a rounded box with a word in it.',
    )
  } else if (picker && !picker.missing) {
    console.log(`  ok      the model picker says it opens: appearance ${picker.appearance}, an arrow drawn in`)
  }

  /* 3. The words. */
  const bad = measured.text.filter((t) => t.ratio < (t.large ? 3 : TEXT_MIN))
  if (bad.length > 0) {
    fail(
      `${bad.length} of ${measured.text.length} pieces of text are under their threshold`,
      bad
        .slice(0, 8)
        .map((t) => `${t.what} at ${t.size}px: ${t.ratio}:1, needs ${t.large ? 3 : TEXT_MIN}  ${JSON.stringify(t.sample)}`)
        .join('\n      '),
    )
  } else {
    const lowest = measured.text.reduce((a, t) => (t.ratio < a.ratio ? t : a), measured.text[0])
    console.log(
      `  ok      ${measured.text.length} pieces of text clear their threshold, the closest being ` +
        `${lowest.what} at ${lowest.ratio}:1`,
    )
  }
} finally {
  await browser.close()
  server.stop()
}

if (failed > 0) {
  console.error('\nA boundary nobody can see is not a boundary, and a colour nobody measured is a guess.')
  process.exit(1)
}

console.log('contrast: every control has a boundary a visitor can see, and every word clears its threshold')
