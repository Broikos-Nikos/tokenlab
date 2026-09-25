/**
 * The audit list adds up, and the README's claim about it is true.
 *
 *   npm run check:audits
 *
 * MA-F10. `docs/AUDITS.md` carries nine hand maintained counts over tables that
 * change every time a finding closes: one per section, plus the total in the
 * header. Closing a finding means editing three things that have to move
 * together, and nothing checked any of them.
 *
 * What the audit expected was drift in the arithmetic. Measured at tick 148,
 * four days and forty ticks after it was filed, the arithmetic was **exactly
 * right**: 102 rows, 49 beginning "fixed", and all nine stated counts agreeing.
 *
 * The rot was somewhere better hidden. The table had stopped moving at all:
 *
 *   34 of 102 rows said open for findings closed days earlier
 *   2 of the 9 audit passes were missing from the file completely, 28 findings
 *   README.md says nine agents audited this project, and the file that is
 *     supposed to resolve the identifiers held seven
 *
 * The last one is the visible half. This document exists so that a commit
 * message citing `MA-F7` can be resolved by the person reading the log, and the
 * three commits before this one cite `MA-F7`, `MA-F8` and `MA-F9`, none of
 * which were in it.
 *
 * ## What is checked here
 *
 * Only what this repository can see by itself, because this runs in CI:
 *
 *   every section's stated count is the count of the rows beneath it
 *   the header total is the sum of the sections
 *   every id appears once
 *   every status is one of the three this project uses
 *   the README's claim about how many perspectives audited this project
 *     matches the number of perspective sections here
 *
 * Whether a row agrees with the workspace queue is checked one level up, by
 * `tools/check-audit-status.mjs`, which is the only place both files exist.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const doc = readFileSync(resolve(root, 'docs/AUDITS.md'), 'utf8')
const readme = readFileSync(resolve(root, 'README.md'), 'utf8')

let failed = 0
const fail = (what: string, detail?: string) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

const CLOSED = (status: string) => status.startsWith('fixed') || status.startsWith('not reproduced')
const STATUS_OK = (status: string) => CLOSED(status) || status === 'open'

interface Section {
  key: string
  line: number
  stated?: { findings: number; closed: number; line: number }
  rows: { id: string; severity: string; status: string }[]
}

const sections: Section[] = []
const lines = doc.split('\n')
let current: Section | null = null

for (const [i, line] of lines.entries()) {
  const head = /^## `([A-Za-z0-9]+)`/.exec(line)
  if (head) {
    current = { key: head[1]!, line: i + 1, rows: [] }
    sections.push(current)
    continue
  }
  const count = /^(\d+) findings?, (\d+) closed\.$/.exec(line.trim())
  if (count && current) {
    current.stated = { findings: Number(count[1]), closed: Number(count[2]), line: i + 1 }
    continue
  }
  const row = /^\| `([A-Za-z0-9-]+)` \| (\w+) \| ([^|]+)\|/.exec(line)
  if (row && current) {
    current.rows.push({ id: row[1]!, severity: row[2]!, status: row[3]!.trim() })
  }
}

if (sections.length === 0) {
  fail('docs/AUDITS.md has no sections, so either the file or this gate has stopped being about the same document')
  process.exit(1)
}

let total = 0
let closedTotal = 0
const seen = new Map<string, string>()

for (const section of sections) {
  const closed = section.rows.filter((r) => CLOSED(r.status)).length
  total += section.rows.length
  closedTotal += closed

  if (!section.stated) {
    fail(`section \`${section.key}\` at line ${section.line} states no count`, 'Every section carries one, and it is the line this gate exists to hold.')
  } else if (section.stated.findings !== section.rows.length || section.stated.closed !== closed) {
    fail(
      `docs/AUDITS.md:${section.stated.line} says ${section.stated.findings} findings, ${section.stated.closed} closed, and \`${section.key}\` has ${section.rows.length} rows with ${closed} closed`,
      'A number that is the sum of the table directly beneath it is worth nothing unless something adds the table up.',
    )
  }

  for (const row of section.rows) {
    if (!STATUS_OK(row.status)) {
      fail(`\`${row.id}\` has status ${JSON.stringify(row.status)}`, 'open, fixed, or not reproduced, and the closed two carry the tick that did it.')
    }
    const already = seen.get(row.id)
    if (already) fail(`\`${row.id}\` appears twice, in \`${already}\` and in \`${section.key}\``)
    seen.set(row.id, section.key)
  }
}

const header = /\*\*(\d+) findings, (\d+) closed, (\d+) open\*\*, across the (\d+) perspectives/.exec(doc)
if (!header) {
  fail('the header line no longer states the totals in the form this gate reads', 'It is the first number a reader meets, and it is the sum of everything below it.')
} else {
  const [, findings, closed, open, perspectives] = header.map(String) as string[]
  if (Number(findings) !== total || Number(closed) !== closedTotal || Number(open) !== total - closedTotal) {
    fail(
      `the header says ${findings} findings, ${closed} closed, ${open} open, and the tables hold ${total}, ${closedTotal} and ${total - closedTotal}`,
    )
  }
  /*
   * `self` is this project's own class sweeps rather than an audit pass, so it
   * has a table and is not one of the perspectives the header counts. It was
   * keyed `TCAP` until tick 165, after the capture sweep that filled it, which
   * meant the next sweep to land here had nowhere to go that was not either a
   * lie about the prefix or a tenth perspective. The other three lists in this
   * workspace key it `self`, and now so does this one.
   */
  const passes = sections.filter((s) => s.key !== 'self').length
  if (Number(perspectives) !== passes) {
    fail(`the header claims ${perspectives} perspectives and the file carries ${passes} of them`)
  }

  const claim = /\*\*(\w+) independent agents have audited this project\*\*/.exec(readme)
  if (!claim) {
    fail('README.md no longer claims a number of audits in the form this gate reads', 'The claim and the file that backs it have to move together.')
  } else {
    const WORDS: Record<string, number> = { seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 }
    const claimed = WORDS[claim[1]!.toLowerCase()]
    if (claimed === undefined) {
      fail(`README.md says ${JSON.stringify(claim[1])} agents, which this gate cannot turn into a number`)
    } else if (claimed !== passes) {
      fail(
        `README.md says ${claim[1]} agents audited this project, and docs/AUDITS.md carries ${passes} perspectives`,
        'The README was right and the file was two passes short for four days, which is how a reader finds out that a commit message cites something the repository cannot resolve.',
      )
    }
  }
}

if (failed > 0) {
  console.error('\nThe list of what is still wrong is the one document a reader has no way to check.')
  process.exit(1)
}

console.log(
  `  ok      docs/AUDITS.md: ${total} findings in ${sections.length} tables, ${closedTotal} closed, every stated count the sum of its own rows`,
)
console.log('audits: the audit list adds up, and the README agrees with it about how many passes there were')
