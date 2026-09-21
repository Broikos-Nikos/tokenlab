/**
 * One hash over the inputs of the measurement, imported by both the script that
 * writes findings.json and the script that checks it.
 *
 * It covers only things a checker can see without loading a two megabyte
 * vocabulary, which is the point: `npm run check` recomputes it and fails when
 * findings.json is stale against the corpus sitting next to it. Editing
 * data/pairs.json and forgetting to re-run the measurement is otherwise silent,
 * and every number in the README would then be checked against the wrong file.
 */

import { createHash } from 'node:crypto'

export interface HashablePair {
  register: string
  en: string
  el: string
}

export const ENCODING_IDS = ['o200k_base', 'cl100k_base', 'p50k_base', 'r50k_base'] as const
export const BOOTSTRAP_SAMPLES = 10_000
export const SEED = 20260920

export function hashInputs(pairs: readonly HashablePair[]): string {
  const canonical = JSON.stringify({
    pairs: pairs.map((p) => [p.register, p.en, p.el]),
    encodings: ENCODING_IDS,
    bootstrapSamples: BOOTSTRAP_SAMPLES,
    seed: SEED,
  })
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16)
}
