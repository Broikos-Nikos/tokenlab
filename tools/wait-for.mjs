/**
 * Wait for a URL to answer.
 *
 *   node tools/wait-for.mjs http://localhost:4173/ 60000
 *
 * SC-F5. This was `wait-on`, one line in the CI workflow, and it cost more than
 * everything else in the tree put together. Measured at tick 155 against the
 * committed lockfile:
 *
 *   117 entries, 63 of them not platform optional
 *   40 of those 63 are wait-on and its closure, 10.6 MB on disk
 *   the non optional tails of everything else: vite 12, tsx 3, playwright 1,
 *     typescript 0
 *
 * None of those 40 is shared with anything else here. Each one is an account
 * that can publish a new version into a repository whose argument is rigour,
 * and two of them, `lodash` and `minimist`, have prior art in exactly that
 * failure mode.
 *
 * The whole job is to poll a URL until it answers, which `tools/verify.mjs` had
 * already been doing in thirteen lines since the day `npm run verify` stopped
 * assuming somebody else had a server running. So the thirteen lines moved here,
 * `verify.mjs` imports them, and the workflow runs this file: one implementation,
 * used by both, and nothing installed for it.
 */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * True when the URL answers with a 2xx before the deadline.
 *
 * `AbortSignal.timeout` per attempt rather than one timeout over the whole
 * loop: a server that accepts a connection and then hangs would otherwise eat
 * the entire budget in a single fetch.
 */
export async function reachable(url, timeoutMs) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (res.ok) return true
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  return false
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [url, ms] = process.argv.slice(2)
  if (!url) {
    console.error('usage: node tools/wait-for.mjs <url> [timeout ms]')
    process.exit(2)
  }
  const timeout = Number(ms ?? 60_000)
  const started = Date.now()
  if (await reachable(url, timeout)) {
    console.log(`${url} answered after ${Date.now() - started} ms`)
  } else {
    console.error(`FAIL  ${url} did not answer within ${timeout} ms`)
    process.exit(1)
  }
}
