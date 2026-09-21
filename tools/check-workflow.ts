/**
 * The CI workflow, against the promise written at the top of it.
 *
 *   npm run check:workflow
 *
 * The header of `pages.yml` says nothing deploys unless the gates pass. That
 * promise rested entirely on one `if:` and one `needs:`, while the two jobs that
 * run other people's code, `npm ci` with its postinstall hooks and
 * `playwright install --with-deps` as root, held `pages: write` and
 * `id-token: write` because the permissions block sat at workflow level.
 *
 * A guarantee enforced by a conditional and contradicted by the grant beside it
 * is exactly what this repository refuses everywhere else, so it is checked here
 * like everything else. No YAML parser: the file is short and the rules are
 * structural, and a dependency added to check a dependency risk would be funny
 * in the wrong way.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const path = resolve(root, '.github/workflows/pages.yml')
const text = readFileSync(path, 'utf8')
const lines = text.split(/\r?\n/)

let failed = 0
const fail = (msg: string, detail?: string) => {
  failed++
  console.error(`FAIL  ${msg}`)
  if (detail) console.error(`      ${detail}`)
}

/** The two that together create a Pages deployment. */
const DEPLOY_PERMISSIONS = ['pages: write', 'id-token: write']

/** The only job allowed to hold them. */
const DEPLOY_JOB = 'deploy'

/* --------------------------------------------- where the permissions live */

// Workflow level is column 0. Anything granted there reaches every job.
const topLevelPermissions = lines.findIndex((l) => /^permissions:\s*$/.test(l))
if (topLevelPermissions === -1) {
  fail('the workflow has no top level permissions block', 'it should be an explicit contents: read')
} else {
  for (let i = topLevelPermissions + 1; i < lines.length; i++) {
    const l = lines[i]
    if (!/^\s+\S/.test(l)) break
    const grant = l.trim()
    if (DEPLOY_PERMISSIONS.includes(grant)) {
      fail(
        `"${grant}" is granted at workflow level, so every job gets it`,
        `line ${i + 1}. Only the ${DEPLOY_JOB} job needs it.`,
      )
    }
  }
}

/* ------------------------------------------- which job holds what, per job */

interface Job {
  name: string
  start: number
  end: number
}

const jobs: Job[] = []
const jobsAt = lines.findIndex((l) => /^jobs:\s*$/.test(l))
if (jobsAt === -1) fail('no jobs block found')
for (let i = jobsAt + 1; i < lines.length; i++) {
  const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(lines[i])
  if (!m) continue
  if (jobs.length > 0) jobs[jobs.length - 1].end = i
  jobs.push({ name: m[1], start: i, end: lines.length })
}

for (const job of jobs) {
  const body = lines.slice(job.start, job.end)
  const held = DEPLOY_PERMISSIONS.filter((p) => body.some((l) => l.trim() === p))

  if (job.name === DEPLOY_JOB) {
    for (const p of DEPLOY_PERMISSIONS) {
      if (!held.includes(p)) fail(`the ${DEPLOY_JOB} job is missing "${p}", so it cannot publish`)
    }
  } else if (held.length > 0) {
    fail(
      `job "${job.name}" holds ${held.map((p) => JSON.stringify(p)).join(' and ')}`,
      `it runs npm ci and other people's code. Only ${DEPLOY_JOB} may deploy.`,
    )
  }

  // A checkout that keeps the token leaves it in .git/config for anything the
  // job later runs.
  const checkouts = body.filter((l) => l.includes('actions/checkout@'))
  if (checkouts.length > 0 && !body.some((l) => l.trim() === 'persist-credentials: false')) {
    fail(
      `job "${job.name}" checks out without persist-credentials: false`,
      'the job token is left in .git/config',
    )
  }
}

/* ----------------------------------------------- how the actions are pinned */

const uses = lines
  .map((l, i) => ({ line: i + 1, text: l.trim() }))
  .filter((l) => l.text.startsWith('- uses:') || l.text.startsWith('uses:'))

for (const u of uses) {
  const ref = u.text.split('uses:')[1]?.split('#')[0]?.trim() ?? ''
  const at = ref.split('@')[1] ?? ''
  if (!/^[0-9a-f]{40}$/.test(at)) {
    fail(
      `${ref} is not pinned to a commit`,
      `line ${u.line}. A tag is mutable: whoever controls it controls this workflow.`,
    )
  }
}

if (failed > 0) {
  console.error(`\n${failed} problems in .github/workflows/pages.yml.`)
  process.exit(1)
}

console.log(
  `the workflow grants deployment permissions to ${DEPLOY_JOB} alone, ` +
    `and all ${uses.length} actions are pinned to commits`,
)
