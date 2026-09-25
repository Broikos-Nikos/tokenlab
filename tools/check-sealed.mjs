/**
 * The page talks to nothing, and the browser is told so.
 *
 *   npm run check:sealed          # source and, after a build, dist too
 *
 * SC-F7. `README.md:70` says "no request leaves for a third party, and your
 * text never goes anywhere". It was the one security claim in the repository
 * and the only claim in it with no gate.
 *
 * Measured on the built site at tick 156, and the contrast is the measurement:
 *
 *   naive grep, cl100k chunk     fetch 5, WebSocket 2, Worker 2, eval 5
 *   the same chunk, strings out  nothing at all
 *   the app chunk                one fetch, Vite's modulepreload polyfill
 *   absolute URLs in src or href none
 *   absolute url() in the CSS    none
 *
 * Every one of those greps is a BPE vocabulary entry: the token ` fetch` is in
 * the vocabulary because English contains the word. A gate that greps the
 * built output without dropping string data would have failed forever and been
 * switched off, which is why this one strips strings first.
 *
 * ## What is checked
 *
 * 1. The Content-Security-Policy is in `index.html` and carries the directives
 *    that make the claim true in the browser rather than in prose.
 * 2. Nothing in the built output fetches an absolute URL: no `src`, no `href`
 *    on a link or script, no `url()` in the CSS. Metadata is not a fetch, so
 *    `og:image` and the rest are left alone: a crawler reads them, the page
 *    never asks for them.
 * 3. No network or eval API in the built chunks outside string data, except the
 *    one `fetch` the bundler puts in the app chunk. The number is pinned: a
 *    second one is a question, not a detail.
 * 4. The README still makes the claim, because a gate guarding a sentence
 *    nobody says any more is a gate guarding nothing.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

const REQUIRED = [
  ["default-src 'self'", 'everything not named below comes from this origin'],
  ["connect-src 'self'", 'this is the one the claim is about: no fetch, no WebSocket, no beacon to anywhere else'],
  ["script-src 'self'", 'no third party script, and no unsafe-eval'],
  ["base-uri 'none'", 'so an injected <base> cannot repoint every relative URL on the page'],
  ["form-action 'none'", 'there is no form, and this is what keeps it that way'],
]

/** The policy, read out of whichever copy of the page is being checked. */
function policyIn(html) {
  const m = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i.exec(html.replace(/\s+/g, ' '))
  return m ? m[1] : null
}

const source = readFileSync(resolve(root, 'index.html'), 'utf8')
const policy = policyIn(source)
if (!policy) {
  fail('index.html carries no Content-Security-Policy', 'The claim in the README is then enforced by nothing but the author remembering it.')
} else {
  for (const [directive, why] of REQUIRED) {
    if (!policy.includes(directive)) fail(`the policy does not carry ${directive}`, why)
  }
  if (/unsafe-eval/.test(policy)) fail("the policy allows 'unsafe-eval'", 'Nothing here evaluates a string, and the built output has no eval in it at all.')
  if (/script-src[^;]*unsafe-inline/.test(policy)) fail("the policy allows inline scripts", 'An inline script is the shape an injected one takes.')
}

const claim = 'no request\nleaves for a third party, and your text never goes anywhere'
const readme = readFileSync(resolve(root, 'README.md'), 'utf8')
if (!readme.replace(/\r\n/g, '\n').includes(claim)) {
  fail('README.md no longer makes the claim this gate exists to keep true', `looked for: ${JSON.stringify(claim)}`)
}

/**
 * Quoted strings removed, so vocabulary data cannot look like code. Written out
 * rather than done with a regular expression because a regular expression that
 * tries to match a JavaScript string literal is how this kind of check gets its
 * first false positive.
 */
function stripStrings(src) {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      i++
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i++
        i++
      }
      i++
      out += '""'
      continue
    }
    out += c
    i++
  }
  return out
}

/*
 * The built half runs behind `--built`, from `npm run verify`, for the reason
 * check:notices learned at tick 154: `npm run check` runs before `vite build`,
 * so a gate that reads dist/ from there is judging the previous build. This one
 * proved it on its first run, failing with `built: "null"` against a dist made
 * before the policy existed.
 */
const BUILT = process.argv.includes('--built')
const dist = resolve(root, 'dist')
if (!BUILT) {
  if (failed === 0) console.log('  ok      the policy is in index.html and the README still makes the claim')
} else if (!existsSync(dist)) {
  fail('dist/ does not exist and this is the half that reads it', 'Run npm run build first, or drop --built.')
} else {
  const built = readFileSync(resolve(dist, 'index.html'), 'utf8')
  if (policyIn(built) !== policy) {
    fail('the built page carries a different policy from the source', `built: ${JSON.stringify(String(policyIn(built)).slice(0, 80))}`)
  }

  /*
   * Fetching positions only. An absolute URL in a meta tag is metadata a
   * crawler reads, and this page carries three of them: og:url, og:image and
   * twitter:image, all pointing at itself. A gate that refused every absolute
   * URL in the output would have failed on the link preview added four ticks
   * ago and on the font licence text files, which are documents rather than
   * requests.
   */
  const fetched = [...built.matchAll(/<(?:script|link|img|iframe|source)\b[^>]*?(?:src|href)\s*=\s*"([^"]+)"/gi)].map((m) => m[1])
  const offsite = fetched.filter((u) => /^https?:/i.test(u))
  if (offsite.length > 0) {
    fail(`the built page asks for ${offsite.length} absolute URL${offsite.length === 1 ? '' : 's'}`, offsite.join('\n      '))
  }

  const assets = resolve(dist, 'assets')
  for (const f of readdirSync(assets).filter((x) => x.endsWith('.css'))) {
    const text = readFileSync(resolve(assets, f), 'utf8')
    const urls = [...text.matchAll(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/g)].map((m) => m[2]).filter((u) => /^https?:/i.test(u))
    if (urls.length > 0) fail(`${f} loads ${urls.length} absolute url()`, urls.join('\n      '))
  }

  const API = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'importScripts', 'eval']
  let totalFetch = 0
  for (const f of readdirSync(assets).filter((x) => x.endsWith('.js'))) {
    const code = stripStrings(readFileSync(resolve(assets, f), 'utf8'))
    for (const name of API) {
      const n = (code.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length
      if (n === 0) continue
      if (name === 'fetch') {
        totalFetch += n
        continue
      }
      fail(`${f} uses ${name} ${n} time${n === 1 ? '' : 's'} outside string data`, 'The claim is that this page talks to nothing. This is code, not vocabulary.')
    }
  }
  /*
   * One, and it is the bundler's: Vite's modulepreload polyfill reads this
   * page's own `link[rel=modulepreload]` hrefs, which are relative because
   * vite.config.ts sets base to './'. Pinned at one so that a second arrival
   * has to be looked at rather than absorbed.
   */
  if (totalFetch !== 1) {
    fail(`the built output calls fetch ${totalFetch} times outside string data, and the polyfill accounts for one`, 'Every other fetch on this page would be a request the README says does not happen.')
  } else {
    console.log('  ok      one fetch in the built output, the bundler\'s own preload polyfill')
  }
}

if (failed > 0) {
  console.error('\nThe one sentence a reader is most likely to act on is the one with the most to lose.')
  process.exit(1)
}

console.log('sealed: the page asks for nothing off this origin, and the browser is told so')
