/**
 * What the page draws must be what was typed.
 *
 *   npm run check
 *
 * This is the gate that was missing. The page once redrew polytonic Greek with
 * characters nobody had entered, and Coptic, Linear B, Korean and some emoji
 * with them, because `segment()` leaned on a `decode` that carries state
 * between calls. Nothing noticed, because nothing compared the output to the
 * input.
 *
 * So: for every encoding, over inputs chosen to break UTF-8 assembly, the
 * concatenation of the drawn segments must equal the text exactly, the ids must
 * add up, and no segment may be marked incomplete on input that is whole. Typing
 * is simulated too, one character at a time, because a page is used mid sentence
 * far more often than it is used on a finished one.
 *
 * And then the opposite failure, which is subtler and was live for twenty two
 * ticks. Everything above passes if `splitIntoBytes` is hardcoded to false: the
 * text still round trips, the ids still add up, and every red chip on the page
 * silently disappears along with the cost badges and the note under them. That
 * is the entire argument of the project, deleted, with four gates green. The
 * fracture table below is the assertion that was missing.
 */

import { segment } from '../src/lib/segment'
import { ENCODINGS, loadEncoder, type Encoder } from '../src/lib/tokenizers'

export const CASES: [string, string][] = [
  ['modern Greek', 'Θα είμαι εκεί σε δέκα λεπτά, έχει απαίσια κίνηση σήμερα.'],
  ['polytonic Greek', 'Ἄνδρα μοι ἔννεπε, Μοῦσα, πολύτροπον, ὃς μάλα πολλὰ πλάγχθη'],
  ['Greek with ano teleia', 'Καλημέρα· τιμή 1.290,50 €· τελικό σίγμα ς'],
  ['NFD Greek', 'Καλημέρα κόσμε'.normalize('NFD')],
  ['Greek capitals with accents', 'Ά Έ Ή Ί Ό Ύ Ώ Ϊ Ϋ ΐ ΰ'],
  ['Coptic', 'Καλημέρα Ⲁ κόσμε'],
  ['Linear B', '𐀀𐀁𐀂 and some English'],
  ['emoji, grinning', 'a 😀 b'],
  ['emoji, surfer', 'a 🏄 b'],
  ['emoji, zwj family', 'family 👨‍👩‍👧‍👦 done'],
  ['flag', 'a 🇬🇷 b'],
  ['Korean', '안녕하세요 세계'],
  ['musical symbol', 'a 𝄞 b'],
  ['bold math', 'a 𝐀𝐁𝐂 b'],
  ['replacement character in the input', 'before � after, all of it English'],
  ['mixed scripts', 'Greek Ελληνικά English 中文 العربية עברית'],
  ['control characters', 'tab\there\nnewline\r\nand back'],
  ['plain English', 'The quick brown fox jumps over the lazy dog.'],
  ['digits and symbols', '1234567890 !@#$%^&*() +=-_[]{}|;:",.<>/?'],
  ['empty', ''],
  ['one space', ' '],
  ['long Greek', 'Η επεξεργασία των δεδομένων προσωπικού χαρακτήρα διενεργείται σύμφωνα με τον ισχύοντα κανονισμό. '.repeat(4)],
]

/**
 * How many pieces of each sentence each encoding has to spell out in raw bytes.
 *
 * Exact counts, not "at least one", because the counts are the finding. `o200k`
 * covers modern Greek and fractures none of it; `cl100k` fractures two pieces of
 * the same sentence; the two oldest fracture nineteen. Polytonic Greek fractures
 * on all four, the newest included, which is worth knowing: the vocabulary that
 * closed the gap on the Greek people write did not close it on the Greek they
 * read at school. English fractures on none.
 *
 * A fifth encoding has to be added here, which is deliberate: an encoding whose
 * fracture behaviour nobody wrote down is an encoding nobody looked at.
 */
const FRACTURES: Record<string, Record<string, number>> = {
  o200k_base: { 'modern Greek': 0, 'polytonic Greek': 3, 'plain English': 0 },
  cl100k_base: { 'modern Greek': 2, 'polytonic Greek': 7, 'plain English': 0 },
  p50k_base: { 'modern Greek': 19, 'polytonic Greek': 16, 'plain English': 0 },
  r50k_base: { 'modern Greek': 19, 'polytonic Greek': 16, 'plain English': 0 },
}

interface Failure {
  encoding: string
  label: string
  detail: string
}

const failures: Failure[] = []

function check(encoder: Encoder, label: string, text: string) {
  const ids = encoder.encode(text)
  const segs = segment(encoder, ids)
  const drawn = segs.map((s) => s.text).join('')

  if (drawn !== text) {
    const at = [...text].findIndex((c, i) => [...drawn][i] !== c)
    failures.push({
      encoding: encoder.id,
      label,
      detail:
        `drawn text differs from the input at character ${at}\n` +
        `        typed: ${JSON.stringify(text.slice(Math.max(0, at - 10), at + 14))}\n` +
        `        drawn: ${JSON.stringify(drawn.slice(Math.max(0, at - 10), at + 14))}`,
    })
  }

  const covered = segs.reduce((a, s) => a + s.ids.length, 0)
  if (covered !== ids.length) {
    failures.push({
      encoding: encoder.id,
      label,
      detail: `segments cover ${covered} ids, the text encodes to ${ids.length}`,
    })
  }

  // The red chips, and the number on each of them.
  const expected = FRACTURES[encoder.id]?.[label]
  if (expected !== undefined) {
    const fractured = segs.filter((s) => s.splitIntoBytes)
    if (fractured.length !== expected) {
      failures.push({
        encoding: encoder.id,
        label,
        detail:
          `${fractured.length} pieces marked as split into bytes, expected ${expected}. ` +
          `Those are the red chips. If this is zero where it should not be, the page ` +
          `has stopped showing the thing it exists to show.`,
      })
    }
    for (const f of fractured) {
      if (f.ids.length < 2) {
        failures.push({
          encoding: encoder.id,
          label,
          detail: `a segment is marked split into bytes but carries ${f.ids.length} token, ` +
            `so its cost badge would read ${f.ids.length}`,
        })
      }
    }
  }

  for (const [i, s] of segs.entries()) {
    if (s.incomplete) {
      failures.push({
        encoding: encoder.id,
        label,
        detail: `segment ${i} is marked incomplete on input that is whole text`,
      })
    }
  }
}

const encoders = await Promise.all(ENCODINGS.map((e) => loadEncoder(e.id)))

for (const encoder of encoders) {
  for (const [label, text] of CASES) {
    check(encoder, label, text)
  }

  // A page is used mid sentence. Every prefix of a real Greek line has to draw
  // correctly too, and a prefix that ends inside a character is the one case
  // where a segment may legitimately be incomplete, so that is allowed here.
  const typed = 'Ἄνδρα μοι ἔννεπε, Μοῦσα, πολύτροπον'
  const chars = [...typed]
  for (let n = 1; n <= chars.length; n++) {
    const prefix = chars.slice(0, n).join('')
    const ids = encoder.encode(prefix)
    const drawn = segment(encoder, ids)
      .map((s) => s.text)
      .join('')
    if (drawn !== prefix) {
      failures.push({
        encoding: encoder.id,
        label: `typing, after ${n} characters`,
        detail: `typed ${JSON.stringify(prefix)}\n        drawn ${JSON.stringify(drawn)}`,
      })
      break // one report per encoding is enough to fail the build
    }
  }
}

if (failures.length > 0) {
  for (const f of failures) {
    console.error(`FAIL  ${f.encoding}  ${f.label}\n        ${f.detail}`)
  }
  console.error(
    `\n${failures.length} segmentation failures. The page would draw text that was ` +
      `never typed.`,
  )
  process.exit(1)
}

const total = encoders.length * (CASES.length + 1)
const asserted = Object.values(FRACTURES).reduce((a, m) => a + Object.keys(m).length, 0)
console.log(
  `${total} segmentation cases round trip exactly across ${encoders.length} encodings, ` +
    `and ${asserted} fracture counts are what they should be`,
)
