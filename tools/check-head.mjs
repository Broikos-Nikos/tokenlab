/**
 * A forwarded link unfurls into something, and the tab has an icon.
 *
 *   npm run check:head
 *
 * RC-F11, from the recruiter pass: "the last question this perspective asks is
 * whether I would forward it, and forwarding means pasting a link into a
 * message. A link that unfurls into nothing gets ignored by the colleague I sent
 * it to, so the one action I was willing to take produces nothing."
 *
 * Measured against the live page at tick 153, four days after it was filed:
 *
 *   og:            ABSENT
 *   twitter:       ABSENT
 *   icon           ABSENT
 *   theme-color    ABSENT
 *   title          present
 *   description    present
 *   /favicon.ico   404, asked for on every load
 *
 * ## What is checked, and why each one
 *
 *   the five og tags a card is built from, because a preview with no image is
 *     a grey box with a domain in it
 *   `og:image` and `og:url` absolute, because a service resolves a relative URL
 *     against its own domain and fetches its own 404
 *   the image is in `public/`, because `docs/` is in the repository and not on
 *     the site: this is the mistake the finding's own suggested fix would have
 *     made, and it is invisible until somebody pastes the link
 *   the image is at least 600 by 315 and under a megabyte, which is what the
 *     services crop to and what they will refetch on every paste
 *   `rel="icon"`, which is both the tab picture and the thing that stops the
 *     browser asking for /favicon.ico
 *
 * This reads `index.html`, the authored file, because that is where the head is
 * written, and `public/`, because that is what the build copies onto the site.
 */

import { readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const html = readFileSync(resolve(root, 'index.html'), 'utf8')
const head = html.slice(0, html.indexOf('</head>'))

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

/** Attributes are wrapped across lines in this file, so the whole head is flattened first. */
const flat = head.replace(/\s+/g, ' ')
const metaContent = (attr, name) => {
  const m = new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`, 'i').exec(flat)
  return m ? m[1] : null
}

const SITE = 'https://broikos-nikos.github.io/tokenlab/'

const required = [
  ['property', 'og:type'],
  ['property', 'og:url'],
  ['property', 'og:title'],
  ['property', 'og:description'],
  ['property', 'og:image'],
  ['name', 'twitter:card'],
  ['name', 'theme-color'],
  ['name', 'description'],
]

for (const [attr, name] of required) {
  const value = metaContent(attr, name)
  if (!value || value.trim() === '') {
    fail(`the head carries no ${name}`, name.startsWith('og:') ? 'A paste into Slack or a mail client unfurls into a bare link.' : undefined)
  }
}

for (const name of ['og:url', 'og:image']) {
  const value = metaContent('property', name)
  if (!value) continue
  if (!value.startsWith('https://')) {
    fail(`${name} is ${JSON.stringify(value)}`, 'A service resolves a relative URL against its own domain and fetches its own 404.')
  } else if (!value.startsWith(SITE)) {
    fail(`${name} is ${JSON.stringify(value)}, which is not this site`, `expected it to start with ${SITE}`)
  }
}

/*
 * And the image itself, on disk, in the directory the build copies onto the
 * site. The finding suggested pointing at docs/shatter-cl100k.png, which is in
 * the repository and not on the site: the tag would have been there, the gate
 * would have been satisfied by a string, and the card would still have been
 * blank.
 */
const image = metaContent('property', 'og:image')
if (image && image.startsWith(SITE)) {
  const rel = image.slice(SITE.length)
  const onDisk = resolve(root, 'public', rel)
  if (!existsSync(onDisk)) {
    fail(`og:image points at ${rel} and public/${rel} does not exist`, 'Only what is in public/ is copied onto the site, so this link unfurls into a 404.')
  } else {
    const bytes = statSync(onDisk).size
    const buf = readFileSync(onDisk)
    const width = buf.readUInt32BE(16)
    const height = buf.readUInt32BE(20)
    if (width < 600 || height < 315) {
      fail(`the card is ${width} by ${height}`, 'Below 600 by 315 the services fall back to a small square, which is the picture nobody can read.')
    }
    if (bytes > 1_000_000) {
      fail(`the card is ${(bytes / 1024).toFixed(0)} KB`, 'Every paste refetches it, and an unfurl shows it about 500 pixels wide.')
    }
    if (failed === 0) console.log(`  ok      the card is public/${rel}, ${width} by ${height}, ${(bytes / 1024).toFixed(0)} KB`)
  }
}

if (!/<link[^>]+rel="icon"/i.test(flat)) {
  fail('the head has no rel="icon"', 'The tab shows a blank page, and the browser asks for /favicon.ico and gets a 404 on every load.')
}

if (failed > 0) {
  console.error('\nThe last thing a recruiter does is forward the link.')
  process.exit(1)
}

console.log('head: a forwarded link unfurls into a card that exists, and the tab has an icon')
