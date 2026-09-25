/**
 * The comparison card's colour is its value.
 *
 *   npm run check:compare      (or npm run verify, which starts the server)
 *
 * DE-F11, filed by the design-eye pass on 2026-09-20: the card is permanently
 * alarm red whatever its value, so the red means nothing. Reproduced before the
 * fix by driving the page to the cheapest and dearest pair on both precomputed
 * encodings and reading the computed styles:
 *
 *   the cheapest pair  o200k_base   1.31x   border lab(31.83 30.19 23.22 / 0.6)
 *   the cheapest pair  cl100k_base  4.13x   border lab(31.83 30.19 23.22 / 0.6)
 *   the dearest pair   o200k_base   2.79x   border lab(31.83 30.19 23.22 / 0.6)
 *   the dearest pair   cl100k_base  7.36x   border lab(31.83 30.19 23.22 / 0.6)
 *
 *   distinct colour combinations across those four states: 1
 *
 * A gate that only asserted "the colours differ" would pass against a card that
 * picked a colour at random, so this asserts three things instead, and the
 * third is the one that matters.
 *
 * 1. **It varies.** More than one colour across the states the page can reach.
 * 2. **It is ordered.** A dearer ratio is never drawn quieter than a cheaper
 *    one. An inverted ramp leaves every figure on the page correct and reverses
 *    what the card says.
 * 3. **It is the value.** The chroma at each state is what `compareHeat()`
 *    computes for that exact ratio, through the same scale the page uses. This
 *    is what makes it a measurement rather than a mood.
 *
 * It reads the rendered page rather than the stylesheet because the defect was
 * invisible in both: the CSS looked deliberate and the figures were all
 * correct. Only the pixels were wrong.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { serve, useShared } from './serve.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const findings = JSON.parse(readFileSync(resolve(root, 'src/generated/findings.json'), 'utf8'))
const preview = JSON.parse(readFileSync(resolve(root, 'src/generated/preview.json'), 'utf8'))

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

/*
 * The same two ends the page uses. `PARITY` is a definition and the far end is
 * the worst pair the corpus produces on any encoding, read from the committed
 * measurement so a corpus change moves the gate with the page.
 */
const PARITY = 1
const WORST = Math.max(...Object.values(findings.encodings).map((e) => e.worstPair.ratio))
const heatOf = (ratio) => Math.max(0, Math.min(1, Number(((ratio - PARITY) / (WORST - PARITY)).toFixed(4))))

/** The chroma the stylesheet gives the border at a heat, as CSS computes it. */
const borderChroma = (heat) => 0.02 + 0.1 * heat

/*
 * The states to visit: for each precomputed encoding, the cheapest and dearest
 * pair it can show. Chosen from the committed preview rather than hardcoded, so
 * a corpus change moves them.
 */
const encodings = [...new Set(Object.keys(preview).map((k) => k.split(':')[2]))]
const pairCount = Math.max(...Object.keys(preview).map((k) => Number(k.split(':')[0]))) + 1

const states = []
for (const enc of encodings) {
  const ratios = []
  for (let i = 0; i < pairCount; i++) {
    const el = preview[`${i}:el:${enc}`]
    const en = preview[`${i}:en:${enc}`]
    if (el && en) ratios.push({ pair: i, ratio: el.tokens / en.tokens })
  }
  if (ratios.length === 0) continue
  ratios.sort((a, b) => a.ratio - b.ratio)
  states.push({ enc, ...ratios[0], end: 'cheapest' })
  states.push({ enc, ...ratios[ratios.length - 1], end: 'dearest' })
}

if (states.length < 4) {
  console.error(`FAIL  only ${states.length} states could be built from the committed preview, so this gate is not testing a range`)
  process.exit(1)
}

const server = process.env.TOKENLAB_URL ? await useShared(process.env.TOKENLAB_URL) : await serve()
const browser = await chromium.launch()
const seen = []

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  for (const s of states) {
    await page.goto(`${server.url}?pair=${s.pair}`, { waitUntil: 'networkidle' })
    await page.click(`.enc[data-enc="${s.enc}"]`)
    await page.waitForFunction(
      (want) => document.querySelector('[data-compare-ratio]')?.textContent?.trim() === want,
      `${s.ratio.toFixed(2)}x`,
      { timeout: 20_000 },
    )
    const got = await page.evaluate(() => {
      const card = document.querySelector('[data-compare]')
      const cs = getComputedStyle(card)
      return {
        hidden: card.hidden,
        /* `shown`, not `ratio`: the numeric ratio comes from the committed
           preview and a string of the same name silently replaced it when the
           two objects were spread together, which made every toFixed() below a
           TypeError. Two names for one thing in one object is a bug waiting. */
        shown: document.querySelector('[data-compare-ratio]').textContent.trim(),
        heat: cs.getPropertyValue('--heat').trim(),
        border: cs.borderTopColor,
        background: cs.backgroundColor,
        figure: getComputedStyle(document.querySelector('.compare-figure')).color,
      }
    })
    if (got.hidden) {
      fail(`${s.enc} ${s.end}: the card is hidden on a corpus pair`, 'It is only meant to hide when the visitor types their own text.')
      continue
    }
    if (got.shown !== `${s.ratio.toFixed(2)}x`) {
      fail(`${s.enc} ${s.end}: the card shows ${got.shown} and the committed preview says ${s.ratio.toFixed(2)}x`)
      continue
    }
    seen.push({ ...s, ...got })
  }

  /* 1. It varies. */
  const combos = new Set(seen.map((x) => `${x.border}|${x.background}|${x.figure}`))
  if (combos.size < 2) {
    fail(
      `the card is the same colour at every value, ${[...combos][0]}`,
      `visited ${seen.length} states from ${seen[0]?.shown} to ${seen[seen.length - 1]?.shown}. This is DE-F11 exactly.`,
    )
  } else {
    console.log(`  ok      ${combos.size} distinct colours across ${seen.length} states, ${seen.map((x) => x.shown).join(', ')}`)
  }

  /* 2 and 3. Ordered, and the value. */
  const byRatio = [...seen].sort((a, b) => a.ratio - b.ratio)
  let wrong = 0
  for (const x of byRatio) {
    const want = heatOf(x.ratio)
    const declared = Number(x.heat)
    if (!Number.isFinite(declared) || Math.abs(declared - want) > 0.0002) {
      wrong++
      fail(`at ${x.ratio.toFixed(2)}x the card declares --heat ${JSON.stringify(x.heat)} and compareHeat says ${want}`)
      continue
    }
    const chroma = chromaOf(x.border)
    if (chroma === null) {
      wrong++
      continue
    }
    const wantChroma = borderChroma(want)
    if (Math.abs(chroma - wantChroma) > 0.002) {
      wrong++
      fail(
        `at ${x.ratio.toFixed(2)}x the border chroma is ${chroma.toFixed(4)} and the stylesheet's ramp says ${wantChroma.toFixed(4)}`,
        `--heat was ${x.heat}, so the property is set and the rule is not reading it.`,
      )
    }
  }
  if (wrong === 0) console.log(`  ok      every state's colour is what compareHeat() computes for its ratio, scale ${PARITY} to ${WORST}`)

  for (let i = 1; i < byRatio.length; i++) {
    const lo = chromaOf(byRatio[i - 1].border)
    const hi = chromaOf(byRatio[i].border)
    if (lo === null || hi === null) break
    if (hi < lo - 0.0005) {
      fail(
        `${byRatio[i].ratio.toFixed(2)}x is drawn quieter than ${byRatio[i - 1].ratio.toFixed(2)}x`,
        `chroma ${hi.toFixed(4)} against ${lo.toFixed(4)}. An inverted ramp leaves every figure on the page correct.`,
      )
      break
    }
  }
  if (failed === 0) {
    console.log(
      `  ok      the ramp is ordered: chroma rises ${chromaOf(byRatio[0].border)?.toFixed(3)} to ` +
        `${chromaOf(byRatio[byRatio.length - 1].border)?.toFixed(3)} with the ratio`,
    )
  }
} finally {
  await browser.close()
  server.stop()
}

/**
 * The chroma out of a computed `oklch()` colour.
 *
 * No fallback. A format this cannot read is a measurement that did not happen,
 * and a gate that returns a number anyway compares that number against itself
 * and reports everything correct. `promptcost`'s page gate did exactly that and
 * survived only because its fallback happened to be 0 on both sides.
 */
function chromaOf(value) {
  const m = String(value).match(/^oklch\(\s*[\d.eE+-]+%?\s+([\d.eE+-]+%?)\s+[\d.eE+-]+/)
  if (!m) {
    /*
     * Not a throw, and not a number either. Throwing here killed the run after
     * the first control had already printed the failure it was written to
     * prove, so the summary never appeared and the gate looked like a crash
     * rather than a verdict. Returning a number would be worse: it would be
     * compared against itself and report everything correct.
     */
    fail(`the card's colour is ${value}, which is not an oklch() ramp`, 'A colour this cannot read is a colour that is not coming from --heat.')
    return null
  }
  return m[1].endsWith('%') ? Number(m[1].slice(0, -1)) / 250 : Number(m[1])
}

if (failed > 0) {
  console.error('\nA colour that never changes is a judgement the page never made.')
  process.exit(1)
}

console.log('compare: the card is louder when the sentence costs more, by exactly the amount it costs more')
