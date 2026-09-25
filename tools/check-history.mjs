/**
 * What the README says happened to the corpus is what git says happened.
 *
 *   npm run check:history
 *
 * HE-F4. The limits section said "Three formal pairs adapted from the Universal
 * Declaration of Human Rights **were removed** on 2026-09-21 ... Removing them
 * moved the headline from 2.09x to 2.06x". Measured against the commit:
 *
 *   before  40 pairs        after  40 pairs
 *   three formal pairs out, three formal pairs in, same commit, same author
 *
 * It was a swap, and the three that arrived were written after their author had
 * seen what the old number was. The commit's own body says so plainly and its
 * subject line does not, which is how the wrong word reached the README.
 *
 * The numbers were right, and that is the part this gate does not check: running
 * `measure.ts` over both blobs gave 2.09 then 2.06, and 3.6 percent then 2.9,
 * exactly as the paragraph claims. That takes two full measurements and half a
 * minute, so it was done by hand at tick 141 and written down here rather than
 * run on every build.
 *
 * What it does check is the shape of the change, which is cheap, decisive, and
 * the half that was wrong: a commit that takes pairs out **and** puts pairs in
 * may not be described as a removal.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readme = readFileSync(resolve(root, 'README.md'), 'utf8').replace(/\s+/g, ' ')

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

/**
 * Every change to the corpus the README tells a story about.
 *
 * Listed rather than parsed out of the prose, because a sentence can be reworded
 * and the commit it is about cannot. Each entry is the commit, the date the
 * README gives it, and the words the paragraph is allowed to use.
 */
const CHANGES = [
  {
    commit: '1d6a9e7',
    date: '2026-09-21',
    says: 'were replaced on 2026-09-21',
    mustNotSay: ['were removed on 2026-09-21', 'Removing them moved'],
  },
  {
    commit: 'efc19ad',
    date: '2026-09-25',
    says: 'were rewritten on 2026-09-25',
    mustNotSay: ['were removed on 2026-09-25'],
  },
]

const pairsAt = (ref) => {
  const raw = execFileSync('git', ['show', `${ref}:data/pairs.json`], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  return JSON.parse(raw).pairs
}

/*
 * A shallow clone has none of this, and `actions/checkout` fetches depth 1 by
 * default. The workflow asks for the whole history for exactly this gate, so a
 * shallow checkout in CI means that line went missing and the gate would
 * otherwise pass by being unable to look. Anywhere else, somebody cloned with
 * `--depth` and is owed a sentence rather than a failure.
 */
const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: root, encoding: 'utf8' }).trim() === 'true'
if (shallow) {
  const message =
    'this is a shallow clone, so the commits the README describes are not here to read'
  if (process.env.CI) {
    console.error(`FAIL  ${message}`)
    console.error('      The workflow sets fetch-depth: 0 for this gate. If that is gone, so is the gate.')
    process.exit(1)
  }
  console.log(`history: not checked, ${message}`)
  process.exit(0)
}

for (const change of CHANGES) {
  let before
  let after
  try {
    before = pairsAt(`${change.commit}^`)
    after = pairsAt(change.commit)
  } catch (err) {
    fail(
      `${change.commit} is not a commit this repository can read`,
      `${String(err.message).split('\n')[0]}\n      A history claim pinned to a commit nobody can fetch is a claim nobody can check.`,
    )
    continue
  }

  const beforeText = new Set(before.map((p) => p.el))
  const afterText = new Set(after.map((p) => p.el))
  const gone = before.filter((p) => !afterText.has(p.el)).length
  const arrived = after.filter((p) => !beforeText.has(p.el)).length

  /* 1. A swap is not a removal, whatever the commit subject called it. */
  if (gone > 0 && arrived > 0) {
    for (const phrase of change.mustNotSay) {
      if (readme.includes(phrase)) {
        fail(
          `the README calls ${change.commit} a removal and it is a swap`,
          `${gone} pairs out, ${arrived} in, ${before.length} before and ${after.length} after. ` +
            `It says ${JSON.stringify(phrase)}.\n      A replacement is a weaker claim than a removal: the sentences that arrived were written after their author saw the old number.`,
        )
      }
    }
  }

  /* 2. And the paragraph has to be there at all. */
  if (!readme.includes(change.says)) {
    fail(
      `the README does not describe the ${change.date} change in the words this gate holds`,
      `looked for ${JSON.stringify(change.says)}. If the story changed, this table changes with it rather than guarding nothing.`,
    )
    continue
  }

  console.log(
    `  ok      ${change.date}, ${change.commit}: ${gone} out and ${arrived} in of ${before.length}, ` +
      `and the README calls it what it was`,
  )
}

if (failed > 0) {
  console.error('\nThe limits section is the strongest thing in this README, and it is the one paragraph a reader cannot check without the repository.')
  process.exit(1)
}

console.log(`history: ${CHANGES.length} changes to the corpus, each described as what git says it was`)
