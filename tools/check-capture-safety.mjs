/**
 * The tool that writes the committed picture cannot destroy it.
 *
 *   npm run check:capture-safety
 *
 * DR-F9, measured before the fix, on the real asset:
 *
 *   ffmpeg -y ... -lavfi "<a filtergraph with one wrong index>" docs/shatter.gif
 *   before: 2,832,450 bytes      after: 0 bytes, git says modified
 *
 * ffmpeg opens its output and truncates it before it knows whether the filters
 * are valid, so a failed second pass leaves the first thing in the README empty
 * in the working tree. The same run wrote nothing else: the failure is silent
 * unless somebody looks at the file.
 *
 * Two more, measured the same day by making the wait for the first fractured
 * chip time out, which is what a slow vocabulary or a machine that prefers
 * reduced motion produces on its own:
 *
 *   the run died with an unhandled TimeoutError
 *   .capture/ survived with a zero byte webm in it: the recording was lost
 *   0 chromium processes were left behind, so the browser did not leak
 *
 * and a machine without ffmpeg got `Error: spawnSync ffmpeg ENOENT` with six
 * lines of node internals, while the same file's Playwright branch ends with
 * two lines telling you what to install.
 *
 * ## Why this reads the source
 *
 * Every assertion here is about what the tool does when something fails, and
 * provoking those failures for real means a broken ffmpeg, a slow network or a
 * timing race, none of which a gate can arrange honestly on demand. So this
 * checks the three shapes that make the failures survivable, the same way
 * `check:decode` checks that `render()` passes a cap: the behaviour was measured
 * once, by hand, and written down above.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tools = ['capture.mjs', 'stills.mjs']

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

for (const name of tools) {
  const src = readFileSync(resolve(root, 'tools', name), 'utf8')
  const flat = src.replace(/\s+/g, ' ')

  /*
   * 1. Nothing hands a committed path to a process that truncates first.
   *
   * The committed paths in this project are under `docs/`. A tool may compute
   * one, and it may rename onto one, and it may not give one to ffmpeg.
   */
  const ffmpegCalls = [...src.matchAll(/^ff\(\[([\s\S]*?)\]\)/gm)].map((m) => m[1])
  for (const args of ffmpegCalls) {
    if (/\bOUT\b/.test(args) || /docs\//.test(args)) {
      fail(
        `${name} passes a committed path to ffmpeg`,
        `ffmpeg truncates its output before it validates its filters, so a failed pass empties the file.\n      ${args.replace(/\s+/g, ' ').trim().slice(0, 120)}`,
      )
    }
  }
  if (ffmpegCalls.length > 0 && !/renameSync\(draft, OUT\)/.test(flat)) {
    fail(`${name} never moves its draft onto the committed path`, 'Encode beside the video, rename when both passes have succeeded.')
  }

  /* 2. The browser is closed even when the page never gets where it was going. */
  if (/chromium\.launch\(/.test(src)) {
    const hasFinally = /\}\s*finally\s*\{[\s\S]*?(context|browser)\.close\(\)/.test(src)
    if (!hasFinally) {
      fail(
        `${name} closes its browser outside a finally`,
        'Playwright only finalises a video when the context closes, so a timeout loses the recording as well as the run.',
      )
    }
    /*
     * Scoped to the protected block, which is the region between the last
     * `try {` and the `} finally {` that closes the browser. The first version
     * of this assertion searched the whole file and failed on the ffmpeg probe,
     * which calls `process.exit` inside a `catch` of its own and is exactly
     * right to do so. A gate that cannot say which block it means is a gate
     * that stops people writing correct code.
     */
    const end = src.indexOf('\n} finally {')
    const start = src.lastIndexOf('\ntry {', end)
    const protectedBlock = start >= 0 && end > start ? src.slice(start, end) : ''
    if (protectedBlock.includes('process.exit(')) {
      fail(
        `${name} calls process.exit inside the block its finally protects`,
        'process.exit skips the finally, so the checks that exist to catch a bad recording would throw the recording away.',
      )
    }
  }

  /*
   * 3. And a missing requirement is named rather than thrown.
   *
   * Two shapes count. The original was `execFileSync('ffmpeg', ['-version'])`
   * in `capture.mjs` itself. Since tick 226 the probe lives in
   * `tools/ffmpeg.mjs`, which resolves `FFMPEG` or the bare name, runs
   * `-version`, and exits with the install line, and `capture.mjs` calls
   * `requireFfmpeg()` before it launches a browser.
   *
   * This gate failed the moment that landed, with "capture.mjs runs ffmpeg
   * without asking for it first", because it was looking for the literal the
   * fix had just removed. That is the third time in this workspace a gate has
   * gone red at a fix for the thing it gates, after `check:tools` and
   * `check-binaries` at tick 217, and the lesson is the same: a scan for a
   * string is a scan for one spelling of a property.
   */
  if (ffmpegCalls.length > 0) {
    const probes =
      /execFileSync\('ffmpeg', \['-version'\]/.test(flat) || /requireFfmpeg\(\)/.test(flat)
    if (!probes) {
      fail(
        `${name} runs ffmpeg without asking for it first`,
        'Without a probe the message is "Error: spawnSync ffmpeg ENOENT" and six lines of node internals, next to a Playwright branch that tells you what to install.',
      )
    }
  }
}

if (failed > 0) {
  console.error('\nThe one script that writes a committed binary is the one that has to survive its own failures.')
  process.exit(1)
}

console.log(`capture safety: ${tools.length} tools that make committed artefacts, none of them able to destroy one`)
