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
/*
 * And the rest of the row, because MA-F6 is about this file rather than about
 * this field.
 *
 * `data/pricing.json` is the one file a maintainer is guaranteed to edit, the
 * note at the top of it invites the edit, and it is the least type checked thing
 * in the repository: `resolveJsonModule` widens its values and the page casts
 * them. Measured at tick 144, one mutation at a time, each through the whole
 * build and then onto the page:
 *
 *   an encoding that does not exist   stopped here, which is why the finding
 *                                     did not reproduce
 *   a price as a string               stopped by tsc
 *   a model with no label             stopped by tsc
 *   no checked date                   stopped here
 *   a price of -2                     reached the page, which showed $-0.064
 *   two models with the same id       reached the page, which showed eight
 *                                     options, two of them identical, and
 *                                     priced both as the first
 *
 * The last two are what this block is for. Neither throws, which is worse than
 * throwing: a negative price is a bill nobody questions until they do the
 * arithmetic, and a duplicated id is a picker where one of the choices silently
 * is not the thing it names.
 */
const seenIds = new Set<string>()
for (const m of pricing.models as { id: string; label: string; encoding: string; inputPerMillion: number; outputPerMillion: number }[]) {
  const inMap = map[m.id]
  if (inMap && inMap !== m.encoding) {
    fail(`data/pricing.json prices ${m.id} as ${m.encoding}, and gpt-tokenizer says ${inMap}`)
  }
  if (!ENCODINGS.some((e) => e.id === m.encoding)) {
    fail(`data/pricing.json prices ${m.id} against ${m.encoding}, which is not an encoding this page has`)
  }
  if (seenIds.has(m.id)) {
    fail(
      `data/pricing.json lists ${m.id} twice`,
      'The page finds a model by id, so the second one is a row nobody can reach and a choice that prices as something else.',
    )
  }
  seenIds.add(m.id)
  for (const field of ['inputPerMillion', 'outputPerMillion'] as const) {
    const value = m[field]
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      fail(
        `data/pricing.json gives ${m.id} ${field} of ${JSON.stringify(value)}`,
        'A price is a positive number of dollars. Anything else reaches the page as a bill that looks like one.',
      )
    }
  }
  if (typeof m.label !== 'string' || m.label.trim() === '') {
    fail(`data/pricing.json gives ${m.id} no label, and the label is what the picker shows`)
  }
}

/*
 * And which row the page opens on, which is the one thing about this file the
 * block above could not see.
 *
 * MA-F8. `src/main.ts` selected it as `pricing.models[1]`. Measured at tick 146
 * by adding one row at the top of the list, the natural place to add a newer
 * model: the page opened on GPT-6 Astra at $0.280 instead of GPT-5.6 Sol at
 * $0.132, and `npm run build` was green, this gate included. A row is now
 * chosen by name in this file, and a name that is not here is a page that opens
 * on something nobody picked.
 */
if (typeof pricing.opensOn !== 'string' || !seenIds.has(pricing.opensOn)) {
  fail(
    `data/pricing.json opensOn is ${JSON.stringify(pricing.opensOn)}, which is not one of the ${seenIds.size} models it lists`,
    'The page opens on that id. Without it the bill falls back to the first row, which is the positional choice this field replaced.',
  )
}

if (failed > 0) {
  console.error('\nA model attributed to the wrong vocabulary prices every token on this page wrongly.')
  process.exit(1)
}

console.log(
  `  ok      ${checkedByTokenizer} attributions checked against gpt-tokenizer's own map, ` +
    `${checkedByPricing} against data/pricing.json, checked ${pricing.checked}`,
)
console.log(
  `  ok      ${pricing.models.length} priced models: distinct ids, positive prices, a label each, ` +
    `and a vocabulary this page draws`,
)
console.log('models: every model this page attributes to an encoding is attributed correctly')
