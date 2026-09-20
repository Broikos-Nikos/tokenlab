/**
 * The tokenizer registry.
 *
 * Every encoding is imported lazily so the page pays only for what the visitor
 * actually switches on. gpt-tokenizer ships one module per encoding, which is
 * why this file exists at all: a single top level import would pull every
 * vocabulary into the first paint.
 */

export type EncodingId = 'o200k_base' | 'cl100k_base' | 'p50k_base' | 'r50k_base'

export interface EncodingMeta {
  id: EncodingId
  /** What a human calls it. */
  label: string
  /** The models that use this encoding, shortest useful list. */
  models: string
  /** Year the encoding first shipped, for the timeline reading. */
  since: string
  /** Hue used for this encoding everywhere in the interface. */
  hue: number
}

export const ENCODINGS: readonly EncodingMeta[] = [
  {
    id: 'o200k_base',
    label: 'o200k',
    models: 'GPT-6, GPT-5.x, GPT-4.1, GPT-4o',
    since: '2024',
    hue: 168,
  },
  {
    id: 'cl100k_base',
    label: 'cl100k',
    models: 'GPT-4, GPT-3.5 Turbo, text-embedding-3',
    since: '2022',
    hue: 250,
  },
  {
    id: 'p50k_base',
    label: 'p50k',
    models: 'Codex, davinci-002',
    since: '2021',
    hue: 315,
  },
  {
    id: 'r50k_base',
    label: 'r50k',
    models: 'GPT-3, GPT-2',
    since: '2019',
    hue: 85,
  },
]

export interface Encoder {
  id: EncodingId
  encode(text: string): number[]
  decode(ids: number[]): string
  vocabularySize: number
}

type EncodingModule = {
  encode: (text: string) => number[]
  decode: (ids: Iterable<number>) => string
  vocabularySize: number
}

const loaders: Record<EncodingId, () => Promise<EncodingModule>> = {
  o200k_base: () => import('gpt-tokenizer/encoding/o200k_base'),
  cl100k_base: () => import('gpt-tokenizer/encoding/cl100k_base'),
  p50k_base: () => import('gpt-tokenizer/encoding/p50k_base'),
  r50k_base: () => import('gpt-tokenizer/encoding/r50k_base'),
}

const cache = new Map<EncodingId, Promise<Encoder>>()

export function loadEncoder(id: EncodingId): Promise<Encoder> {
  let pending = cache.get(id)
  if (!pending) {
    pending = loaders[id]().then((mod) => ({
      id,
      encode: (text: string) => mod.encode(text),
      decode: (ids: number[]) => mod.decode(ids),
      vocabularySize: mod.vocabularySize,
    }))
    cache.set(id, pending)
  }
  return pending
}

export function metaFor(id: EncodingId): EncodingMeta {
  const found = ENCODINGS.find((e) => e.id === id)
  if (!found) throw new Error(`unknown encoding: ${id}`)
  return found
}
