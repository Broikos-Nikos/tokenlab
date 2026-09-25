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
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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

async function reachable(url, timeoutMs) {
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
    const GATES = ['check:loading', 'check:capture', 'check:compare', 'check:controls']
    let bad = 0
    for (const gate of GATES) {
      const r = spawnSync(npm, ['run', gate], {
        cwd: root,
        stdio: 'inherit',
        shell: useShell,
        env: { ...process.env, TOKENLAB_URL: url },
      })
      if ((r.status ?? 1) !== 0) bad++
    }
    code = bad === 0 ? 0 : 1
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
