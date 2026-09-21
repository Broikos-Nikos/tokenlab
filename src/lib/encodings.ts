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
  /** The models that use this encoding, shortest useful list. */
  models: string
  /** Year the encoding first shipped, for the timeline reading. */
  since: string
  /**
   * Hue used for this encoding everywhere in the interface.
   *
   * Every one of these is at least 100 degrees from the alarm hue of 32, which
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
    since: '2024',
    hue: 145,
  },
  {
    id: 'cl100k_base',
    label: 'cl100k',
    models: 'GPT-4, GPT-3.5 Turbo, text-embedding-3',
    since: '2022',
    hue: 195,
  },
  {
    id: 'p50k_base',
    label: 'p50k',
    models: 'Codex, davinci-002',
    since: '2021',
    hue: 245,
  },
  {
    id: 'r50k_base',
    label: 'r50k',
    models: 'GPT-3, GPT-2',
    since: '2019',
    hue: 290,
  },
] as const satisfies readonly EncodingMeta[]

export type EncodingId = (typeof ENCODINGS)[number]['id']

export const ENCODING_IDS = ENCODINGS.map((e) => e.id) as readonly EncodingId[]

export function metaFor(id: EncodingId): EncodingMeta {
  const found = ENCODINGS.find((e) => e.id === id)
  if (!found) throw new Error(`unknown encoding: ${id}`)
  return found
}
