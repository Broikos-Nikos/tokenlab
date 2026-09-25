/**
 * How loud the comparison card should be, for a given ratio.
 *
 * The card shows what a sentence costs in Greek against the same sentence in
 * English. It shipped in a fixed alarm red, and the design-eye pass filed
 * DE-F11 against it: the red means nothing, because it is the same red at every
 * value. Measured on the committed corpus before this was written, the card can
 * display **1.31x to 7.36x** on the two encodings the page precomputes, and
 * driving the page to both extremes on both of them gave **one** colour
 * combination out of four states:
 *
 *   the cheapest pair  o200k_base   1.31x   border lab(31.83 30.19 23.22 / 0.6)
 *   the dearest pair   cl100k_base  7.36x   border lab(31.83 30.19 23.22 / 0.6)
 *
 * ## The two ends, and why they are these
 *
 * **Parity is 1.0 and it is a definition, not a measurement.** A ratio of 1
 * means the Greek sentence cost exactly what the English one did, which is the
 * thing this page exists to show does not happen. Anchoring the calm end
 * anywhere else would make the colour a statement about the corpus rather than
 * about the reader's sentence.
 *
 * **The loud end is the worst pair the corpus produces on any encoding**, which
 * is `max(findings.encodings[*].worstPair.ratio)`, 8.77 on p50k and r50k. It is
 * read from the committed measurement rather than typed, so a corpus change
 * moves the scale with it, and `check:claims` already holds those figures.
 *
 * ## Why intensity rather than hue
 *
 * This page reserves the alarm hue, 45, and `check:measurement` refuses any
 * encoding tinted within 100 degrees of it, because an encoding wearing the
 * alarm hides the finding on the encoding where the finding is worst. Rotating
 * this card's hue would either walk into the encoding hues at 155, 200, 250 and
 * 295 or invent a fifth meaning for colour on a page that already has four.
 *
 * So the hue never moves. The card is always the cost colour, and how loud it
 * is says how much. That also keeps the existing gate's rule untouched rather
 * than negotiating with it.
 */

/** A ratio of 1 means the two sentences cost the same. */
export const PARITY = 1

/**
 * 0 at parity, 1 at the worst ratio the corpus can produce, clamped.
 *
 * Clamped rather than extrapolated because the card only ever shows a corpus
 * pair: the page hides it the moment a visitor types their own text, since
 * there is no English counterpart to compare against. A value outside the range
 * therefore means the corpus changed and the scale did not, which
 * `check:compare` fails on rather than drawing off the end of the ramp.
 */
export function compareHeat(ratio: number, worst: number): number {
  if (!Number.isFinite(ratio) || !Number.isFinite(worst) || worst <= PARITY) return 0
  const t = (ratio - PARITY) / (worst - PARITY)
  return Math.max(0, Math.min(1, Number(t.toFixed(4))))
}
