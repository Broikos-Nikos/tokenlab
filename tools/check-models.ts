/**
 * Every model this page attributes to an encoding is attributed correctly.
 *
 *   npm run check:models
 *
 * ME-F12: `davinci-002` was attributed to the wrong encoding, and the GPT-5.x
 * and GPT-6 attributions were unsourced. Both halves reproduce against the
 * tokenizer this repository already pins and already encodes with:
 *
 *   davinci-002        cl100k_base    the p50k button said "Codex, davinci-002"
 *   gpt-2              gpt2           the r50k button said "GPT-3, GPT-2"
 *   gpt-4o             (absent)       61 entries in the map, none of them o200k
 *   gpt-4.1            (absent)
 *
 * The button is prose, and prose on a page is a claim like any other. Nothing
 * was holding these, so two of the four were wrong and the third rested on
 * nothing a reader could check.
 *
 * `gpt-tokenizer`'s `modelToEncodingMap` is the strongest source available here
 * and better than the web page the finding suggests: it is pinned at 4.0.0,
 * `check:pins` refuses it to float, it is in the repository, and it is the
 * table the encoder itself consults. A documentation page can be edited after
 * this is published; this cannot.
 *
 * Two rules, and the second is what makes the first honest:
 *
 * 1. **An id the map knows must map to the encoding claiming it.** No
 *    exceptions, no allowlist.
 * 2. **An id the map does not know must be on an encoding marked
 *    `sourcedBy: 'pricing'`,** must appear in `data/pricing.json` against the
 *    same encoding, and that file must carry a date and a link. Otherwise
 *    "unsourced" is just a claim with better manners.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { modelToEncodingMap } from 'gpt-tokenizer/mapping'
import { ENCODINGS, type EncodingMeta } from '../src/lib/encodings'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pricing = JSON.parse(readFileSync(resolve(root, 'data/pricing.json'), 'utf8'))

let failed = 0
const fail = (what: string, detail?: string) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

const map = modelToEncodingMap as unknown as Record<string, string>
const known = Object.keys(map).length
if (known < 40) {
  fail(`the tokenizer's model map has only ${known} entries`, 'This gate is reading the wrong thing, and a gate reading nothing passes everything.')
}

let checkedByTokenizer = 0
let checkedByPricing = 0

/*
 * Widened on purpose. `ENCODINGS` is `as const`, so `modelIds.length` is a
 * literal and `=== 0` is a comparison the compiler can prove impossible: it
 * said so, and a check the compiler calls dead is a check that cannot fire for
 * the data it was written to catch.
 */
const registry: readonly EncodingMeta[] = ENCODINGS

for (const enc of registry) {
  if (enc.modelIds.length === 0) {
    fail(`${enc.id} names models on its button and lists no ids to check them against`)
    continue
  }

  for (const id of enc.modelIds) {
    const inMap = map[id]

    if (inMap) {
      checkedByTokenizer++
      if (inMap !== enc.id) {
        fail(
          `${enc.id} claims ${id}, and gpt-tokenizer says ${id} is ${inMap}`,
          `The button reads "${enc.models}". This is ME-F12: davinci-002 was claimed by p50k and belongs to cl100k.`,
        )
      }
      continue
    }

    /* 2. Not in the map, so it has to be sourced somewhere a reader can go. */
    if (enc.sourcedBy !== 'pricing') {
      fail(
        `${enc.id} claims ${id}, the tokenizer's map does not know it, and this encoding is marked sourcedBy "${enc.sourcedBy}"`,
        'Either the id is wrong or the source is. An attribution with neither is the finding.',
      )
      continue
    }
    const priced = pricing.models.find((m: { id: string }) => m.id === id)
    if (!priced) {
      fail(`${enc.id} claims ${id} on the price list, and data/pricing.json has no such model`)
    } else if (priced.encoding !== enc.id) {
      fail(`${enc.id} claims ${id}, and data/pricing.json says ${id} is ${priced.encoding}`)
    } else {
      checkedByPricing++
    }
  }
}

/* And the price list has to be the kind of source a reader can date. */
if (!pricing.checked || !/^\d{4}-\d{2}-\d{2}$/.test(pricing.checked)) {
  fail(`data/pricing.json has no checked date, and ${checkedByPricing} attributions rest on it`)
}
if (!pricing.source || !pricing.source.startsWith('http')) {
  fail(`data/pricing.json has no source link, and ${checkedByPricing} attributions rest on it`)
}

/*
 * And the other direction: every priced model's encoding is one an encoding in
 * the registry actually claims, so a model cannot be priced against a
 * vocabulary the page never draws.
 */
for (const m of pricing.models as { id: string; encoding: string }[]) {
  const inMap = map[m.id]
  if (inMap && inMap !== m.encoding) {
    fail(`data/pricing.json prices ${m.id} as ${m.encoding}, and gpt-tokenizer says ${inMap}`)
  }
  if (!ENCODINGS.some((e) => e.id === m.encoding)) {
    fail(`data/pricing.json prices ${m.id} against ${m.encoding}, which is not an encoding this page has`)
  }
}

if (failed > 0) {
  console.error('\nA model attributed to the wrong vocabulary prices every token on this page wrongly.')
  process.exit(1)
}

console.log(
  `  ok      ${checkedByTokenizer} attributions checked against gpt-tokenizer's own map, ` +
    `${checkedByPricing} against data/pricing.json, checked ${pricing.checked}`,
)
console.log(`  ok      ${pricing.models.length} priced models are each priced against a vocabulary this page draws`)
console.log('models: every model this page attributes to an encoding is attributed correctly')
