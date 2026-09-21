/**
 * The tokenizer registry.
 *
 * Every encoding is imported lazily so the page pays only for what the visitor
 * actually switches on. gpt-tokenizer ships one module per encoding, which is
 * why this file exists at all: a single top level import would pull every
 * vocabulary into the first paint.
 */

export { ENCODINGS, metaFor, type EncodingId, type EncodingMeta } from './encodings'
import type { EncodingId } from './encodings'

export interface Encoder {
  id: EncodingId
  encode(text: string): number[]
  decode(ids: number[]): string
  /**
   * The raw UTF-8 bytes of one token.
   *
   * This exists because `decode` cannot be used to answer the question. In
   * gpt-tokenizer 4.0.0 there is one module level `TextDecoder` shared by every
   * call, fed with `{ stream: true }` and never flushed, so decoding anything
   * that ends mid character leaves those bytes inside the decoder and the next
   * call anywhere in the page picks them up. Drawing tokens means asking about
   * incomplete pieces constantly, which is exactly the thing that poisons it.
   *
   * Bytes have no such problem. Given bytes, this project does its own UTF-8
   * assembly with its own decoder and the whole class of corruption goes away.
   */
  tokenBytes(id: number): Uint8Array
  vocabularySize: number
}

type EncodingModule = {
  encode: (text: string) => number[]
  decode: (ids: Iterable<number>) => string
  vocabularySize: number
  /** The GptEncoding instance. Typed loosely here and narrowed at runtime. */
  default?: unknown
}

/** The one piece of gpt-tokenizer internals this project depends on. */
interface ByteSource {
  tryDecodeToken(id: number): string | Uint8Array | undefined
}

const utf8 = new TextEncoder()

/*
 * The one place that has to repeat the list, because a dynamic import has to be
 * a literal for the bundler to see it and split the chunk. Typed against the
 * registry, so a new entry there fails to compile until it is added here, which
 * makes this the copy the compiler keeps honest rather than the one it ignores.
 */
const loaders: Record<EncodingId, () => Promise<EncodingModule>> = {
  o200k_base: () => import('gpt-tokenizer/encoding/o200k_base'),
  cl100k_base: () => import('gpt-tokenizer/encoding/cl100k_base'),
  p50k_base: () => import('gpt-tokenizer/encoding/p50k_base'),
  r50k_base: () => import('gpt-tokenizer/encoding/r50k_base'),
}

const cache = new Map<EncodingId, Promise<Encoder>>()

/**
 * The promise goes into the cache before it settles, which is what makes
 * concurrent callers share one download. It has to come back out again if it
 * rejects, or a single failed fetch is cached for the life of the page and
 * every retry returns the same rejection without touching the network. That is
 * not a retry, it is a replay.
 */
export function loadEncoder(id: EncodingId): Promise<Encoder> {
  let pending = cache.get(id)
  if (!pending) {
    pending = loaders[id]().then((mod) => {
      const core = (mod.default as { bytePairEncodingCoreProcessor?: ByteSource } | undefined)
        ?.bytePairEncodingCoreProcessor
      if (typeof core?.tryDecodeToken !== 'function') {
        // Pinned to gpt-tokenizer 4.0.0 in package.json, and npm run check
        // round trips every encoding over a set of inputs that catch this. If
        // the shape ever changes, fail loudly here rather than drawing text
        // nobody typed.
        throw new Error(
          `gpt-tokenizer no longer exposes per token bytes for ${id}. ` +
            `See the note on Encoder.tokenBytes: decode() cannot substitute for it.`,
        )
      }
      return {
        id,
        encode: (text: string) => mod.encode(text),
        decode: (ids: number[]) => mod.decode(ids),
        tokenBytes: (tokenId: number) => {
          const raw = core.tryDecodeToken(tokenId)
          if (raw === undefined) return new Uint8Array()
          return typeof raw === 'string' ? utf8.encode(raw) : raw
        },
        vocabularySize: mod.vocabularySize,
      }
    })
    pending.catch(() => cache.delete(id))
    cache.set(id, pending)
  }
  return pending
}

