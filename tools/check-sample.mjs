/**
 * The number never travels without the size of the thing it was measured on.
 *
 *   npm run check:sample      (or npm run verify, which starts the server)
 *
 * HE-F5. The headline is the sentence this project gets quoted by, and an
 * unattributed ratio from forty sentences is the exact shape of number that gets
 * repeated until somebody builds a cost model on it.
 *
 * Measured on the built page before this, at 1440x900 with the fold at 900:
 *
 *   o200k    the corpus size at y=391, in the line under the headline
 *   cl100k   the first mention at y=1,227, below the fold
 *   p50k     the same, y=1,227
 *   phone    390x844, cl100k: y=1,557 against a fold at 844
 *
 * The size was only ever printed inside the clause for a penalty that cannot be
 * told from zero, which is `o200k` and nothing else, so on three of the four
 * encodings the first screen carried 4.68x or 5.84x with nothing to say what it
 * was measured on. It leads the line now, on every encoding.
 *
 * The README had the same shape more gently: the ratio in the blockquote, the
 * corpus four lines below it and attached to the null result rather than to the
 * ratio. Both sentences carry it now, and both halves are checked here.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { serve, useShared } from './serve.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const findings = JSON.parse(readFileSync(resolve(root, 'src/generated/findings.json'), 'utf8'))
const PAIRS = findings.corpus.pairs
const WORDS = ['zero', 'ten', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const SPELLED = WORDS[Math.floor(PAIRS / 10)] ?? String(PAIRS)

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

/* 1. The README, in one sentence. */
{
  const readme = readFileSync(resolve(root, 'README.md'), 'utf8').replace(/\s+/g, ' ')
  const ratio = String(findings.encodings.o200k_base.ratio)
  /*
   * The sentence the ratio is in, not the paragraph. "Four lines below" was the
   * defect, so the assertion has to be about the same sentence or it asserts
   * nothing that was not already true.
   */
  const sentences = readme.split(/(?<=[.!?])\s+/)
  const leading = sentences.find((s) => s.includes(`costs ${ratio} times the tokens`))
  if (!leading) {
    fail(`the README no longer states the headline as "costs ${ratio} times the tokens"`, 'If the sentence changed, this gate changes with it rather than guarding nothing.')
  } else if (!new RegExp(`\\b(${PAIRS}|${SPELLED})\\b`, 'i').test(leading)) {
    fail(
      'the README states the ratio in a sentence that does not say what it was measured on',
      `${JSON.stringify(leading.trim().slice(0, 150))}\n      An unattributed ratio is the shape of number that gets repeated until somebody builds a cost model on it.`,
    )
  } else {
    console.log(`  ok      the README states the ratio and its ${PAIRS} pairs in one sentence`)
  }
}

/* 2. The page, on every encoding, at two widths. */
const server = process.env.TOKENLAB_URL ? await useShared(process.env.TOKENLAB_URL) : await serve()
const browser = await chromium.launch()

try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport })
    await page.goto(server.url, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => document.querySelectorAll('#tokens .tok').length > 0, null, { timeout: 60_000 })
    await page.waitForTimeout(2000)

    for (const id of ['o200k_base', 'cl100k_base', 'p50k_base', 'r50k_base']) {
      await page.click(`.enc[data-enc="${id}"]`)
      await page.waitForTimeout(1200)
      const seen = await page.evaluate(
        ({ pairs, spelled }) => {
          const named = [...document.querySelectorAll('body *')]
            .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && new RegExp(`\\b(${pairs}|${spelled})\\b`, 'i').test(n.textContent)))
            .map((el) => ({
              what: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : ''),
              y: Math.round(el.getBoundingClientRect().top + window.scrollY),
              text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 56),
            }))
            .sort((a, b) => a.y - b.y)
          return { fold: window.innerHeight, first: named[0] ?? null, count: named.length }
        },
        { pairs: PAIRS, spelled: SPELLED },
      )

      if (!seen.first) {
        fail(`${id} at ${viewport.width}x${viewport.height}: the page never says what it measured`)
      } else if (seen.first.y >= seen.fold) {
        fail(
          `${id} at ${viewport.width}x${viewport.height}: the first mention of ${PAIRS} pairs is at y=${seen.first.y}, below the fold at ${seen.fold}`,
          `in ${seen.first.what}: ${JSON.stringify(seen.first.text)}\n      The ratio is the first thing on the screen and the size of the corpus is not on the screen at all.`,
        )
      } else {
        console.log(
          `  ok      ${id.padEnd(12)} ${String(viewport.width).padStart(4)}px: the corpus size at y=${String(seen.first.y).padStart(4)}, ` +
            `fold ${seen.fold}, in ${seen.first.what}`,
        )
      }
    }
    await page.close()
  }
} finally {
  await browser.close()
  server.stop()
}

if (failed > 0) {
  console.error('\nA ratio with no n beside it is a number somebody else will quote without one.')
  process.exit(1)
}

console.log(`sample: the ${PAIRS} pairs are beside the number in the README and on the first screen of every encoding`)
