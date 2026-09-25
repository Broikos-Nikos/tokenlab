/**
 * The encodings, in one place.
 *
 * There were four copies of this list: the registry here, a bare id array in
 * `tools/inputs-hash.ts`, a third list with its own labels in
 * `tools/measure.ts`, and a `USED_BY` map in `tools/check-claims.ts` whose
 * values duplicated the `models` strings verbatim. Only one of the four was
 * enforced by the compiler. Adding a fifth encoding to two of them left
 * `npm run build` green and the page quietly measuring something other than
 * what it drew.
 *
 * Everything derives from this array now. Add an entry and the type system
 * demands a loader, the measurement picks it up, the hash covers it, and the
 * README check fails until the table has a row for it.
 */

export interface EncodingMeta {
  id: string
  /** What a human calls it. */
  label: string
  /** The models that use this encoding, shortest useful list, for the button. */
  models: string
  /**
   * The model identifiers that claim stands on, and where the claim comes from.
   *
   * ME-F12: the button said "Codex, davinci-002" for p50k and "GPT-3, GPT-2"
   * for r50k, and the pinned tokenizer's own table disagrees with both.
   * `davinci-002` is cl100k_base, and `gpt-2` is the `gpt2` encoding. Prose on a
   * button is a claim like any other and nothing was holding these two.
   *
   * `sourcedBy` is `tokenizer` when `gpt-tokenizer`'s `modelToEncodingMap` knows
   * these ids, which is the strongest source available here because it is
   * pinned, in the repository and the thing actually doing the encoding. It is
   * `pricing` for o200k, whose models that table does not contain at all: 61
   * entries and not one of them o200k. Those rest on `data/pricing.json`, which
   * carries a date and a link, the same standing the prices themselves have.
   */
  modelIds: readonly string[]
  sourcedBy: 'tokenizer' | 'pricing'
  /** Year the encoding first shipped, for the timeline reading. */
  since: string
  /**
   * Hue used for this encoding everywhere in the interface.
   *
   * Every one of these is at least 110 degrees from the alarm hue of 45, which
   * is reserved for a character that cost more than one token. An encoding
   * tinted near the alarm hides the finding on the encoding where it is worst,
   * and `npm run check:measurement` enforces it rather than trusting this note:
   * it was written as a note first and two encodings broke it anyway, r50k at
   * 53 degrees being the worst, which is the encoding with the most red on
   * screen.
   *
   * They also run as a ramp, newest green through to oldest violet, so
   * switching encodings walks a gradient rather than jumping across the wheel.
   */
  hue: number
}

export const ENCODINGS = [
  {
    id: 'o200k_base',
    label: 'o200k',
    models: 'GPT-6, GPT-5.x, GPT-4.1, GPT-4o',
    // Not one of these is in the tokenizer's table, so they stand on the dated
    // price list instead, and `check:models` holds them to it.
    modelIds: ['gpt-6-astra', 'gpt-5.6-sol', 'gpt-4.1', 'gpt-4o'],
    sourcedBy: 'pricing',
    since: '2024',
    hue: 155,
  },
  {
    id: 'cl100k_base',
    label: 'cl100k',
    models: 'GPT-4, GPT-3.5 Turbo, text-embedding-3',
    modelIds: ['gpt-4', 'gpt-3.5-turbo', 'text-embedding-3-small'],
    sourcedBy: 'tokenizer',
    since: '2022',
    hue: 200,
  },
  {
    id: 'p50k_base',
    label: 'p50k',
    // "davinci-002" was here and belongs to cl100k_base. Codex is the honest
    // short name for what is left: code-davinci and the cushman models.
    models: 'Codex, text-davinci-003',
    modelIds: ['code-davinci-002', 'text-davinci-003', 'cushman-codex'],
    sourcedBy: 'tokenizer',
    since: '2021',
    hue: 250,
  },
  {
    id: 'r50k_base',
    label: 'r50k',
    // "GPT-2" was here and is the `gpt2` encoding, not this one. What this one
    // actually holds is the GPT-3 base family.
    models: 'GPT-3 base: davinci, curie, ada',
    modelIds: ['davinci', 'curie', 'ada', 'text-davinci-001'],
    sourcedBy: 'tokenizer',
    since: '2019',
    hue: 295,
  },
] as const satisfies readonly EncodingMeta[]

export type EncodingId = (typeof ENCODINGS)[number]['id']

export const ENCODING_IDS = ENCODINGS.map((e) => e.id) as readonly EncodingId[]

export function metaFor(id: EncodingId): EncodingMeta {
  const found = ENCODINGS.find((e) => e.id === id)
  if (!found) throw new Error(`unknown encoding: ${id}`)
  return found
}
