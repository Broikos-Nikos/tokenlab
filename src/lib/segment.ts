/**
 * Turning a list of token ids into something you can look at.
 *
 * The interesting case is the one this whole project is about. On an encoding
 * that never learned Greek, a single Greek letter does not get a token. It gets
 * split into its raw UTF-8 bytes, and each byte is a token. Decoding one of
 * those ids on its own gives you nothing, or a replacement character, because
 * half a character is not a character.
 *
 * So a segment is not always one token. It is the smallest run of tokens that
 * decodes to real text. A segment with `ids.length > 1` is a character the
 * tokenizer had to spell out in bytes, and that is exactly the thing worth
 * drawing.
 */

import type { Encoder } from './tokenizers'

export interface Segment {
  /** The token ids that had to be taken together to get readable text. */
  ids: number[]
  /** The text those ids decode to. */
  text: string
  /** True when it took more than one token to write one piece of text. */
  splitIntoBytes: boolean
  /** Index of the first token in the full sequence. */
  start: number
}

const REPLACEMENT = '�'

function isReadable(s: string): boolean {
  return s.length > 0 && !s.includes(REPLACEMENT)
}

export function segment(encoder: Encoder, ids: number[]): Segment[] {
  const out: Segment[] = []
  let pending: number[] = []
  let start = 0

  for (let i = 0; i < ids.length; i++) {
    if (pending.length === 0) start = i
    pending.push(ids[i])
    const text = encoder.decode(pending)
    if (isReadable(text)) {
      out.push({
        ids: pending,
        text,
        splitIntoBytes: pending.length > 1,
        start,
      })
      pending = []
    }
  }

  // Anything still pending never resolved into readable text. Emit it as is so
  // the token count stays truthful, which matters more than the display.
  if (pending.length > 0) {
    out.push({
      ids: pending,
      text: encoder.decode(pending),
      splitIntoBytes: pending.length > 1,
      start,
    })
  }

  return out
}

export interface Stats {
  chars: number
  /** Unicode code points, not UTF-16 units. Greek is BMP but emoji are not. */
  codepoints: number
  words: number
  tokens: number
  tokensPerWord: number
  /** Share of segments that needed more than one token to spell one thing. */
  byteSplitShare: number
}

const WORD = /[\p{L}\p{N}][\p{L}\p{N}\p{M}'’-]*/gu

export function countWords(text: string): number {
  const m = text.match(WORD)
  return m ? m.length : 0
}

export function statsFor(text: string, ids: number[], segments: Segment[]): Stats {
  const words = countWords(text)
  const split = segments.filter((s) => s.splitIntoBytes).length
  return {
    chars: text.length,
    codepoints: [...text].length,
    words,
    tokens: ids.length,
    tokensPerWord: words === 0 ? 0 : ids.length / words,
    byteSplitShare: segments.length === 0 ? 0 : split / segments.length,
  }
}
