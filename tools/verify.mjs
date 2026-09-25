/**
 * Everything, against the page a visitor actually gets.
 *
 *   npm run verify
 *
 * Builds, which runs the claim and segmentation gates, then serves `dist/` and
 * drives it in a real browser for the loading gate. It starts and stops its own
 * server, because the version that did not do that quietly depended on whoever
 * ran it having a dev server up on the default port. It failed for me on the
 * commit where I was fixing the fact that nothing ran it, which is the kind of
 * joke a tool only gets to make once.
 */

import { spawn, spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { reachable } from './wait-for.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/*
 * Node 20 refuses to spawn a .cmd without a shell, and on Windows npm and npx
 * are .cmd files, so the only portable spelling is the bare name plus a shell
 * there. Every argument below is a literal in this file, so there is nothing for
 * a shell to interpret that is not already written here.
 */
const useShell = process.platform === 'win32'
const npx = 'npx'
const npm = 'npm'

function freePort() {
  return new Promise((ok, no) => {
    const s = createServer()
    s.once('error', no)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => ok(port))
    })
  })
}


function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: useShell })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

run(npm, ['run', 'build'])

const port = await freePort()
const url = `http://localhost:${port}/`
console.log(`\nserving dist on ${url}`)

const server = spawn(npx, ['vite', 'preview', '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
  shell: useShell,
  detached: !useShell,
})

let code = 1
try {
  if (!(await reachable(url, 30_000))) {
    console.error(`the preview server never answered on ${url}`)
  } else {
    /*
     * Every gate that needs a browser, against this one server.
     *
     * check:capture joined on 2026-09-24. It is here rather than in `npm run
     * check` because it drives a browser, and browser gates are not a tax on
     * somebody who cloned this to read it.
     */
    const GATES = ['check:loading', 'check:capture', 'check:compare', 'check:controls', 'check:counter', 'check:direction', 'check:nfd', 'check:perword', 'check:typing', 'check:reader', 'check:contrast', 'check:network', 'check:pin', 'check:sample', 'check:bill', 'check:notices:built', 'check:sealed:built']
    let bad = 0
    const results = []
    for (const gate of GATES) {
      const started = Date.now()
      const r = spawnSync(npm, ['run', gate], {
        cwd: root,
        stdio: 'inherit',
        shell: useShell,
        env: { ...process.env, TOKENLAB_URL: url },
      })
      const status = r.status ?? 1
      results.push(`${status === 0 ? 'ok  ' : 'FAIL'} ${gate.padEnd(16)} ${String(Date.now() - started).padStart(6)} ms`)
      if (status !== 0) bad++
    }
    code = bad === 0 ? 0 : 1

    /*
     * Which gate, written down, because at tick 138 one of them failed once in
     * four runs and the run's output had been discarded. A failure nobody can
     * name is a failure nobody can chase, and the three runs afterwards all
     * passed, which is the worst possible evidence.
     *
     * Not committed: it is a record of this machine's last run.
     */
    const log = [new Date().toISOString(), ...results, bad === 0 ? 'all green' : `${bad} failed`]
    writeFileSync(resolve(root, '.verify.log'), log.join('\n') + '\n')
    if (bad > 0) console.error(`which one: ${results.filter((l) => l.startsWith('FAIL')).join(', ')}`)
  }
} finally {
  // Through a shell, kill() reaches the shell rather than vite, so on Windows the
  // process tree is taken down by pid.
  if (useShell && server.pid) {
    spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    server.kill()
  }
}

process.exit(code)
