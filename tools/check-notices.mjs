/**
 * The licences of the code this site serves ship with the code.
 *
 *   npm run check:notices
 *
 * SC-F4. Measured on the built site at tick 154:
 *
 *   4,053,604 JS bytes in dist/assets
 *   3,936,139 of them gpt-tokenizer 4.0.0, 97.1 percent
 *   "Copyright (c)", "MIT License", "Bazyli", "niieani", "@license":
 *     zero hits anywhere in dist
 *
 * MIT asks that the notice travel with "all copies or substantial portions of
 * the Software", and a minifier removes exactly that. The root `LICENSE` being
 * MIT in this author's own name is what turns the omission into a claim: to
 * anybody redeploying `dist/`, all of that code reads as his.
 *
 * ## Three things, and the second is the one with teeth
 *
 * 1. Every runtime dependency has an entry in the shipped notices, with its
 *    version and its own licence text.
 * 2. The shipped file is exactly what `tools/third-party.mjs` produces from
 *    `node_modules` **today**. A notices file is only worth anything while it
 *    describes what is installed, and the way it rots is an upgrade: a new
 *    version, a new copyright year, a dependency added or dropped. Regenerating
 *    it here and comparing byte for byte is what makes that impossible to miss.
 * 3. The README says what is in the bundle rather than "Code MIT", which was
 *    true of `src/` and false of the site.
 *
 * ## Two halves, and they cannot run at the same moment
 *
 * The banner and the copied file live in `dist/`, and `npm run check` runs
 * *before* `vite build`, so a dist check there reads the previous build. It
 * measured exactly that on the run that added it: 6 of 6 chunks with no banner,
 * from a dist built before the banner existed, and a green build would have
 * followed the moment the stale directory was deleted.
 *
 * So `--built` is the second half, run by `npm run verify` after the build, and
 * the source half runs in `npm run check`.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { notices } from './third-party.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

const shippedPath = resolve(root, 'public/THIRD-PARTY-NOTICES.txt')
if (!existsSync(shippedPath)) {
  fail('public/THIRD-PARTY-NOTICES.txt is missing', 'It is what the footer links to and what the bundle points at, and only public/ is copied onto the site.')
  console.error('\nThe site serves somebody else\'s code, and their licence has to travel with it.')
  process.exit(1)
}

const shipped = readFileSync(shippedPath, 'utf8').replace(/\r\n/g, '\n')
const fresh = notices() + '\n'

if (shipped !== fresh) {
  const a = shipped.split('\n')
  const b = fresh.split('\n')
  const at = a.findIndex((line, i) => line !== b[i])
  fail(
    'the shipped notices are not what node_modules produces today',
    `first difference at line ${at + 1}:\n      shipped:  ${JSON.stringify(a[at] ?? '(end of file)')}\n      produced: ${JSON.stringify(b[at] ?? '(end of file)')}\n      Run npm run notices. An upgrade is what makes this file wrong, and it is wrong silently.`,
  )
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
  if (!shipped.includes(`${name} ${version}`)) {
    fail(`the notices do not carry ${name} ${version}`, 'Every runtime dependency is inside the bundle this site serves.')
  }
}

/*
 * ---- and every version written in prose anywhere -------------------------
 *
 * Swept here from `watch-it-think` WM2-F8, where two source comments quoted
 * four latency figures out of `meta.json` and three of them were from a
 * different measurement run. Measured in this project at tick 209:
 * `gpt-tokenizer 4.0.0` appears in six places, two gate headers, three source
 * comments and the shipped notices, and nothing anywhere derives any of them
 * from `package.json`.
 *
 * They all agree today. The day somebody bumps the dependency, five of them go
 * stale at once and the sixth is the file a licence reader checks. That is the
 * same defect as the latency comments, one bump away.
 */
const sources = []
for (const dir of ['src', 'tools']) {
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = resolve(d, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (/\.(ts|mjs|js)$/.test(entry.name)) {
        sources.push([relative(root, p).split(sep).join('/'), readFileSync(p, 'utf8')])
      }
    }
  }
  walk(resolve(root, dir))
}
sources.push(['public/THIRD-PARTY-NOTICES.txt', shipped])
sources.push(['README.md', readFileSync(resolve(root, 'README.md'), 'utf8')])

for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
  const wrong = []
  for (const [file, text] of sources) {
    /* String.raw, because `\s` and `\d` inside a template literal are the bare
       letters: the first version of this built `gpt-tokenizers+(d+.d+.d+)`,
       matched nothing anywhere, and printed "written 0 times" as a pass. */
    for (const m of text.matchAll(new RegExp(String.raw`${name}\s+(\d+\.\d+\.\d+)`, 'g'))) {
      if (m[1] !== version) wrong.push(`${file} says ${m[1]}`)
    }
  }
  if (wrong.length > 0) {
    fail(
      `${wrong.length} ${wrong.length === 1 ? 'place writes' : 'places write'} a different ${name} version from the pin of ${version}`,
      `${wrong.slice(0, 3).join('; ')}. A comment that quotes a pin and disagrees with it teaches a reader to stop trusting the comments.`,
    )
  } else {
    const mentions = sources.reduce(
      (n, [, text]) => n + [...text.matchAll(new RegExp(String.raw`${name}\s+\d+\.\d+\.\d+`, 'g'))].length,
      0,
    )
    /* A gate that counts nothing passes everything: this said "written 0 times"
       and called it ok until the regex was fixed. */
    if (mentions === 0) {
      fail(`${name} ${version} is never written in prose anywhere, so this measured nothing`)
      continue
    }
    console.log(`  ok      ${name} ${version} is written ${mentions} times and every one of them is the pin`)
  }
}

/*
 * The claim in the README. "Code MIT" was true of what is in src/ and false of
 * what the site serves, which is the sentence a reviewer reads next to the font
 * licences and concludes was written from memory.
 */
const readme = readFileSync(resolve(root, 'README.md'), 'utf8')
if (/^Code MIT\./m.test(readme)) {
  fail('README.md still says "Code MIT." on its own', 'It covers src/ and tools/. The site is 97 percent gpt-tokenizer, under somebody else\'s copyright.')
}
if (!readme.includes('THIRD-PARTY-NOTICES.txt')) {
  fail('README.md does not name THIRD-PARTY-NOTICES.txt', 'The licence section is where a reviewer looks for this, and a file nobody is pointed at is a file nobody reads.')
}

/*
 * And the built output, when there is one. The banner is the only trace a
 * person who redeploys dist/ on its own would ever have.
 */
const BUILT = process.argv.includes('--built')
const assets = resolve(root, 'dist/assets')
if (BUILT) {
  if (!existsSync(assets)) {
    fail('dist/assets does not exist and this is the half that reads it', 'Run npm run build first, or drop --built.')
  }
}
if (BUILT && existsSync(assets)) {
  const js = readdirSync(assets).filter((f) => f.endsWith('.js'))
  const missing = js.filter((f) => !readFileSync(resolve(assets, f), 'utf8').includes('THIRD-PARTY-NOTICES.txt'))
  if (missing.length > 0) {
    fail(
      `${missing.length} of ${js.length} built chunks carry no pointer to the notices`,
      `${missing.slice(0, 3).join(', ')}\n      The banner is what a redeployer of dist/ alone would have to go on.`,
    )
  } else {
    console.log(`  ok      all ${js.length} built chunks point at the notices`)
  }
  if (!existsSync(resolve(root, 'dist/THIRD-PARTY-NOTICES.txt'))) {
    fail('dist/ does not contain THIRD-PARTY-NOTICES.txt', 'The banner points at a file the build did not copy.')
  }
}

if (failed > 0) {
  console.error('\nThe site serves somebody else\'s code, and their licence has to travel with it.')
  process.exit(1)
}

const deps = Object.keys(pkg.dependencies ?? {}).length
console.log(`notices: ${deps} bundled ${deps === 1 ? 'dependency' : 'dependencies'}, its licence shipped and regenerated from node_modules to prove it`)
