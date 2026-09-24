/**
 * What the recording is a recording of, in one place.
 *
 * `capture.mjs` films the page and writes this down; `check-capture.mjs` drives
 * the page to the same state and compares. One function, used by both, so the
 * gate can never end up checking that two descriptions agree about a mistake.
 *
 * The reason this exists at all is a near miss. On 21 September the palette of
 * this page was replaced wholesale: hue 265, which is blue, became the warm
 * ember of the rest of the work, and the wash stopped following the selected
 * encoding. `docs/shatter.gif` had been recorded twenty minutes earlier. It was
 * re-recorded three minutes after the palette landed, so the picture in the
 * README is a picture of this page, and that is luck rather than a process:
 * nothing in the repository would have said a word if it had not been.
 *
 * `watch-it-think` had the same near miss and lost it. Its recording went stale
 * for two days under a README sentence calling it the real page, and a
 * recruiter audit found it in ten seconds.
 *
 * So this records the paint, the words and the numbers on screen. The numbers
 * are the point: this picture's content is a token count and a count of
 * fractured chips, and both are printed large enough for a reader to check
 * against the sentence under the image.
 */

/** The pinned sentence, the one the README quotes counts for. */
export const PAIR = process.env.TOKENLAB_PAIR ?? '17'

/**
 * The state the recording ends on.
 *
 * The loop closes by clicking back to cl100k, so the last thing on screen is
 * the damage rather than the repair. That is deliberate: the page heals to
 * o200k on its own 1.8 seconds after it opens, and a loop that ended there
 * would read as a one way animation with a happy ending rather than as a
 * comparison a reader is invited to make.
 */
export const FINAL_ENCODING = 'cl100k_base'

/**
 * Read the page. Runs inside the browser, in both tools.
 *
 * Deliberately wider than a palette. The first gate of this kind anywhere in
 * this workspace recorded eight colours and a typeface, and then passed over a
 * recording showing a headline that had since been rewritten, which was the one
 * thing the complaint behind it had been about.
 */
export function lookAt() {
  const s = getComputedStyle(document.documentElement)
  const paint = {}
  for (const k of ['--ink', '--ink-lift', '--edge', '--text', '--text-dim', '--text-faint', '--alarm', '--hue']) {
    paint[k] = s.getPropertyValue(k).trim()
  }
  paint.bodyFont = getComputedStyle(document.body).fontFamily
  paint.wash = getComputedStyle(document.body).backgroundColor

  const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? ''

  const words = {
    headline: text('h1'),
    wordmark: text('.wordmark'),
    split: text('[data-split]'),
  }

  const state = {
    encoding: document.querySelector('.enc[aria-pressed="true"]')?.dataset?.enc ?? '',
    tokens: text('[data-token-count]'),
    fractured: text('[data-fracture-count]'),
    ratio: text('[data-compare-ratio]'),
    // How many chips are actually drawn broken, which is the thing the picture
    // is a picture of. The readout beside it could be right while the stage is
    // wrong, and that is the failure a count in prose cannot see.
    fracturedChips: document.querySelectorAll('.tok--fractured').length,
  }

  return { paint, words, state }
}
