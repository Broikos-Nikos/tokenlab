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
  /**
   * The text those ids decode to, or `null` for a segment past `decodeFirst`.
   *
   * `null` rather than an empty string, because an empty string is a value a
   * real token could have and would be drawn as an empty chip by anything that
   * forgot to check. The type makes the compiler ask.
   */
  text: string | null
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

/**
 * How many continuation bytes a UTF-8 lead byte is still owed after this one.
 *
 * This is the whole reason the boundaries can be found without a decoder. A
 * run of tokens forms whole characters exactly when nothing is still owed, and
 * that is four integer comparisons rather than a `TextDecoder` call.
 */
function owedAfter(owed: number, b: number): number {
  if (b < 0x80) return 0
  if (b < 0xc0) return owed > 0 ? owed - 1 : 0
  if (b < 0xe0) return 1
  if (b < 0xf0) return 2
  return 3
}

/**
 * The smallest runs of tokens whose bytes form whole characters.
 *
 * `decodeFirst` caps how many of them are actually decoded. Past it a segment
 * still carries its ids, its start and whether it was spelled out in bytes,
 * which is everything the counts are made of, and its `text` is `null`.
 *
 * **Both halves of that were measured rather than guessed**, because HS-F5
 * blamed the tokenizer and the tokenizer is not where the time goes. On 400,000
 * characters of Greek, one keystroke cost 202 ms, and it split:
 *
 *   encode    29 ms
 *   segment  151 ms
 *   stats     23 ms
 *
 * Inside that 151 ms, one `TextDecoder` call per token, 140,353 of them, to
 * draw the 901 chips `MAX_CHIPS` allows. Deciding boundaries from the bytes and
 * decoding only what is drawn takes the same work to 63 ms on that input, and
 * from 42 ms to 3 ms on text with emoji and polytonic Greek in it, where the
 * old version re-decoded a growing prefix and caught a throw for every byte of
 * every multi-token character.
 *
 * One thing that was tried first and was worse: reusing a single buffer instead
 * of allocating a view per token. It took **five times as long**, 825 ms against
 * 168 ms, and it disagreed with this function's own output. The allocation was
 * never the cost. The decoder calls were.
 */
export function segment(encoder: Encoder, ids: number[], decodeFirst = Number.POSITIVE_INFINITY): Segment[] {
  const out: Segment[] = []
  let pending: number[] = []
  let bytes: number[] = []
  let owed = 0
  let start = 0

  for (let i = 0; i < ids.length; i++) {
    if (pending.length === 0) start = i
    pending.push(ids[i])
    const decoding = out.length < decodeFirst
    for (const b of encoder.tokenBytes(ids[i])) {
      if (decoding) bytes.push(b)
      owed = owedAfter(owed, b)
    }
    // Still part way through a character. No decoder can say anything useful
    // about these bytes yet, and the old version asked it anyway, once a token.
    if (owed !== 0) continue

    let text: string | null = null
    if (decoding) {
      text = decodeComplete(new Uint8Array(bytes))
      /*
       * Nothing is owed and it still will not decode, so the bytes are invalid
       * rather than incomplete: an unexpected continuation byte, an overlong
       * form, a surrogate. The counter cannot see those and the decoder can, so
       * the old behaviour stands and the run keeps growing.
       */
      if (text === null) continue
    }

    out.push({
      ids: pending,
      text,
      splitIntoBytes: pending.length > 1,
      start,
    })
    pending = []
    bytes = []
  }

  // Only reachable when the id list itself ends part way through a character.
  if (pending.length > 0) {
    out.push({
      ids: pending,
      text: out.length < decodeFirst ? lossy.decode(new Uint8Array(bytes)) : null,
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

/**
 * The text of a segment that is supposed to have been decoded.
 *
 * Throws rather than returning an empty string, because a caller reaching past
 * `decodeFirst` has a cap that does not match what it draws, and the two
 * quietly disagreeing is precisely the bug the `null` exists to prevent.
 */
export function textOf(seg: Segment): string {
  if (seg.text === null) {
    throw new Error(`segment at token ${seg.start} was never decoded: the decode cap is smaller than what is being drawn`)
  }
  return seg.text
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
