/**
 * Turning a list of token ids into something you can look at.
 *
 * The interesting case is the one this whole project is about. On an encoding
 * that never learned Greek, a single Greek letter does not get a token. It gets
 * split into its raw UTF-8 bytes, and each byte is a token. So a segment is not
 * always one token. It is the smallest run of tokens whose bytes form whole
 * characters, and a segment with `ids.length > 1` is text the tokenizer had to
 * spell out, which is exactly the thing worth drawing.
 *
 * This works in bytes rather than in decoded strings, and that is not a
 * stylistic choice. An earlier version grew a run of ids and called
 * `encoder.decode` on it after every token, treating decode as a pure function
 * of its argument. It is not one. gpt-tokenizer 4.0.0 shares a single
 * `TextDecoder` across every call and feeds it `{ stream: true }` without ever
 * flushing, so decoding a prefix that ends mid character leaves those bytes
 * inside the decoder, and the next call anywhere on the page receives them
 * prepended to its own output.
 *
 * The visible result was that the first line of the Odyssey came back with
 * characters in it that nobody had typed, on a page whose entire job is to show
 * you what happened to your text. Assembling the bytes here, with a decoder this
 * file owns, makes the whole class of corruption impossible rather than
 * unlikely.
 */

import type { Encoder } from './tokenizers'

export interface Segment {
  /** The token ids that had to be taken together to form whole characters. */
  ids: number[]
  /** The text those ids decode to. */
  text: string
  /** True when it took more than one token to write one piece of text. */
  splitIntoBytes: boolean
  /** Index of the first token in the full sequence. */
  start: number
  /**
   * True when the run never formed whole characters, which happens only if the
   * id list itself ends mid character. Such a segment is a fact about the input,
   * not a measurement of the tokenizer, and nothing should charge for it.
   */
  incomplete?: boolean
}

/**
 * Strict, and stateless because nothing is ever streamed through it. Throws on
 * anything that is not complete, valid UTF-8, which is precisely the test this
 * file needs: it is how a run knows it has finished.
 */
const strict = new TextDecoder('utf-8', { fatal: true })
const lossy = new TextDecoder('utf-8')

function decodeComplete(bytes: Uint8Array): string | null {
  try {
    return strict.decode(bytes)
  } catch {
    return null
  }
}

export function segment(encoder: Encoder, ids: number[]): Segment[] {
  const out: Segment[] = []
  let pending: number[] = []
  let bytes: number[] = []
  let start = 0

  for (let i = 0; i < ids.length; i++) {
    if (pending.length === 0) start = i
    pending.push(ids[i])
    for (const b of encoder.tokenBytes(ids[i])) bytes.push(b)

    const text = decodeComplete(new Uint8Array(bytes))
    if (text !== null) {
      out.push({
        ids: pending,
        text,
        splitIntoBytes: pending.length > 1,
        start,
      })
      pending = []
      bytes = []
    }
  }

  // Only reachable when the id list itself ends part way through a character.
  if (pending.length > 0) {
    out.push({
      ids: pending,
      text: lossy.decode(new Uint8Array(bytes)),
      splitIntoBytes: false,
      start,
      incomplete: true,
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
