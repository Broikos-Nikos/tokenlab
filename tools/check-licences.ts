/**
 * Every font this page serves, against the licence it claims.
 *
 *   npm run check:licences
 *
 * The repository shipped a licence file that named neither the font it sat next
 * to nor any copyright holder, with the Apache template still reading
 * `[yyyy] [name of copyright owner]`, under a README saying both fonts were
 * under a different licence entirely. Neither licence was satisfied. It is the
 * ninety second check a reviewer runs on a public repository and it is the one
 * check this project did not have.
 *
 * The binary is the authority here, not the prose. Each font carries its own
 * copyright in name ID 0 and its own licence description in name ID 13, so the
 * check reads those and requires the repository to agree with them.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fontsDir = resolve(root, 'public/fonts')

interface Expected {
  /** Substring that must appear in the font's own name ID 13. */
  licenceInBinary: string
  /** The file that must hold the full text. */
  licenceFile: string
  /** Substring that must appear in that file, proving it is the right text. */
  licenceFileContains: string
  /** What the fonts README must say about it. */
  statedAs: string
}

const EXPECTED: Record<string, Expected> = {
  'manrope-var.woff2': {
    licenceInBinary: 'SIL Open Font License',
    licenceFile: 'Manrope-OFL.txt',
    licenceFileContains: 'SIL OPEN FONT LICENSE',
    statedAs: 'SIL Open Font License 1.1',
  },
  'robotomono-var.woff2': {
    licenceInBinary: 'Apache License',
    licenceFile: 'RobotoMono-LICENSE.txt',
    licenceFileContains: 'Apache License',
    statedAs: 'Apache License 2.0',
  },
}

let failed = 0
const fail = (msg: string, detail?: string) => {
  failed++
  console.error(`FAIL  ${msg}`)
  if (detail) console.error(`      ${detail}`)
}

/** name IDs 0 and 13 out of a font, via fontTools. */
function nameRecords(file: string): { copyright: string; licence: string } {
  const script =
    'from fontTools.ttLib import TTFont;import sys,json;' +
    "n={r.nameID:str(r) for r in TTFont(sys.argv[1])['name'].names if r.platformID==3};" +
    "print(json.dumps({'copyright':n.get(0,''),'licence':n.get(13,'')}))"
  const out = execFileSync('python', ['-c', script, resolve(fontsDir, file)], {
    encoding: 'utf8',
  })
  return JSON.parse(out)
}

const fontsReadme = resolve(fontsDir, 'README.md')
if (!existsSync(fontsReadme)) {
  fail('public/fonts/README.md is missing', 'it is where the attribution lives')
}
const readme = existsSync(fontsReadme) ? readFileSync(fontsReadme, 'utf8') : ''
const projectReadme = readFileSync(resolve(root, 'README.md'), 'utf8')

const shipped = readdirSync(fontsDir).filter((f) => f.endsWith('.woff2'))

// A font nobody wrote an expectation for is a font nobody checked the licence of.
for (const file of shipped) {
  if (!EXPECTED[file]) {
    fail(`${file} is served but has no licence expectation in this file`)
  }
}

for (const [file, want] of Object.entries(EXPECTED)) {
  if (!shipped.includes(file)) {
    fail(`${file} is expected but not present in public/fonts`)
    continue
  }

  let records: { copyright: string; licence: string }
  try {
    records = nameRecords(file)
  } catch (err) {
    fail(`could not read the name table of ${file}`, String(err).slice(0, 120))
    continue
  }

  if (!records.copyright.toLowerCase().includes('copyright')) {
    fail(
      `${file} carries no copyright in name ID 0`,
      'pyftsubset drops the name table unless --name-IDs is passed',
    )
  }
  if (!records.licence.includes(want.licenceInBinary)) {
    fail(
      `${file} says its licence is not what this repository expects`,
      `binary: ${JSON.stringify(records.licence.slice(0, 70))}, expected to contain ` +
        JSON.stringify(want.licenceInBinary),
    )
  }

  const licencePath = resolve(fontsDir, want.licenceFile)
  if (!existsSync(licencePath)) {
    fail(`${want.licenceFile} is missing, so ${file} ships with no licence text`)
  } else {
    const text = readFileSync(licencePath, 'utf8')
    if (!text.includes(want.licenceFileContains)) {
      fail(
        `${want.licenceFile} is not the licence it is named for`,
        `expected it to contain ${JSON.stringify(want.licenceFileContains)}`,
      )
    }
    // The exact defect that started this: an unfilled Apache template.
    if (text.includes('[name of copyright owner]') && !readme.includes(records.copyright.split('(')[0].trim())) {
      fail(
        `${want.licenceFile} leaves the copyright owner as a template`,
        `and nothing else names the holder. The binary says: ${records.copyright.slice(0, 60)}`,
      )
    }
  }

  // The holder has to be named somewhere a human will find it.
  const holder = records.copyright.split('(')[0].trim()
  if (holder && !readme.includes(holder)) {
    fail(`public/fonts/README.md does not name the copyright holder of ${file}`, holder)
  }
  if (!readme.includes(want.statedAs)) {
    fail(`public/fonts/README.md does not state ${file} as ${want.statedAs}`)
  }
  if (!projectReadme.includes(want.statedAs)) {
    fail(`the project README does not state ${want.statedAs}`)
  }
}

if (failed > 0) {
  console.error(`\n${failed} licence problems. Do not publish a repository in this state.`)
  process.exit(1)
}

console.log(
  `${shipped.length} fonts, each naming its own licence and copyright, ` +
    `matching the text shipped beside it and the prose about it`,
)
