/**
 * Write the notices that have to travel with the bundle.
 *
 *   npm run notices          (and `npm run build` runs it first)
 *
 * SC-F4. 97 percent of the JavaScript this site serves is somebody else's, and
 * until tick 154 none of it carried his name. Measured on the built site:
 *
 *   4,053,604 JS bytes in dist/assets
 *   3,936,139 of them gpt-tokenizer 4.0.0, which is 97.1 percent
 *   "Copyright (c)", "MIT License", "Bazyli", "niieani", "@license"   zero hits
 *     anywhere in dist
 *
 * The only hits for any of those words were the literal BPE tokens ` Copyright`
 * and `SPDX` inside the vocabulary arrays, which are data rather than a notice.
 *
 * MIT asks that the notice travel with "all copies or substantial portions of
 * the Software", and a minifier removes exactly that. It is the standard gap in
 * a bundled front end, it is invisible from the source tree, and the root
 * `LICENSE` being MIT in this author's own name is what makes it read, to
 * anyone redeploying `dist/`, as though all of the code is his.
 *
 * ## Generated, not copied
 *
 * The file is built from `node_modules` at build time, so it cannot drift from
 * what is installed: a dependency added, removed or upgraded changes this file
 * on the next build, and `check:notices` fails if the committed one disagrees.
 * A notices file typed by hand is a licence claim written from memory, which is
 * the sentence the audit used about the rest of that section.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Every runtime dependency, which is what ends up inside the bundle. */
export function notices() {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  const names = Object.keys(pkg.dependencies ?? {})
  const parts = [
    'THIRD PARTY NOTICES',
    '',
    'This site bundles the code below. Each package keeps its own licence and its',
    "own copyright holder; the repository's own LICENSE covers src/ and tools/ only.",
    '',
    'Written by tools/third-party.mjs from what is installed, and held to it by',
    'npm run check:notices, so this file cannot drift from the bundle.',
    '',
  ]

  for (const name of names) {
    const dir = resolve(root, 'node_modules', name)
    const meta = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8'))
    const licenceFile = ['LICENSE', 'LICENSE.md', 'LICENCE', 'license'].map((f) => resolve(dir, f)).find((f) => existsSync(f))
    if (!licenceFile) {
      throw new Error(`${name} ships no licence file, and this site would be serving its code without one`)
    }
    const text = readFileSync(licenceFile, 'utf8').replace(/\r\n/g, '\n').trim()
    parts.push(
      '='.repeat(72),
      `${name} ${meta.version}`,
      `${meta.license ?? 'licence not declared'}${meta.author ? `, ${typeof meta.author === 'string' ? meta.author : meta.author.name}` : ''}`,
      `https://www.npmjs.com/package/${name}`,
      '='.repeat(72),
      '',
      text,
      '',
    )
  }
  return parts.join('\n')
}

// Run directly rather than imported by the gate. Compared as paths, because a
// file:// URL of a Windows path does not round trip through string equality.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(root, 'public/THIRD-PARTY-NOTICES.txt')
  writeFileSync(out, notices() + '\n')
  console.log(`public/THIRD-PARTY-NOTICES.txt written from node_modules`)
}
