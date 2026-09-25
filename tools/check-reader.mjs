/**
 * What a screen reader is handed, counted.
 *
 *   npm run check:reader      (or npm run verify, which starts the server)
 *
 * PA-F8. The chip row is the argument this page makes, and to anything that
 * reads rather than looks it was a wall. Measured on the built page before this,
 * with Greek at the cap on p50k, through Chrome's own accessibility tree:
 *
 *   901 chips, 324 cost badges
 *   2,779 nodes under the row, 2,452 of them carrying a name
 *   3,144 nodes on the whole page, so 88 percent of it was the row
 *   and it read back as "Ο Ο 2 2 ι ι  ε  ε 2 2 ρ ρ"
 *
 * Every chip announces itself twice, once as the span and once as its text, and
 * every fractured chip puts a bare number between the letters: that is the "2"s.
 *
 * `role="img"` on the row alone does not fix it, which is worth knowing before
 * writing it somewhere else. Chrome drops the chip **elements** from the tree
 * and keeps their **text**: the count went from 2,779 to 2,779. The chips
 * themselves have to say they are decoration.
 *
 * So the assertions are about the tree, not about the markup: one named node for
 * the row, and it says what the picture shows. A visitor who cannot see it is
 * told there is a picture and what is in it, rather than being walked through it
 * or having it hidden from them entirely.
 */

import { chromium } from 'playwright'
import { serve, useShared } from './serve.mjs'

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

const server = process.env.TOKENLAB_URL ? await useShared(process.env.TOKENLAB_URL) : await serve()
const browser = await chromium.launch()
let client

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(server.url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => document.querySelectorAll('#tokens .tok').length > 0, null, { timeout: 60_000 })

  client = await page.context().newCDPSession(page)
  await client.send('Accessibility.enable')

  /** The accessibility subtree of the chip row, as Chrome builds it. */
  const rowTree = async () => {
    const { root } = await client.send('DOM.getDocument', { depth: -1 })
    const findDom = (node) => {
      const attrs = node.attributes ?? []
      for (let i = 0; i < attrs.length; i += 2) if (attrs[i] === 'id' && attrs[i + 1] === 'tokens') return node
      for (const child of node.children ?? []) {
        const hit = findDom(child)
        if (hit) return hit
      }
      return null
    }
    const dom = findDom(root)
    const { nodes } = await client.send('Accessibility.getFullAXTree')
    const byId = new Map(nodes.map((n) => [n.nodeId, n]))
    const rowAx = nodes.find((n) => n.backendDOMNodeId === dom?.backendNodeId)
    const names = []
    let under = 0
    const walk = (ax) => {
      under++
      if (ax.name?.value) names.push(ax.name.value)
      for (const id of ax.childIds ?? []) {
        const child = byId.get(id)
        if (child) walk(child)
      }
    }
    if (rowAx) walk(rowAx)
    return { present: Boolean(rowAx), role: rowAx?.role?.value, under, names, whole: nodes.length }
  }

  const check = async (label) => {
    const seen = await page.evaluate(() => ({
      chips: document.querySelectorAll('#tokens .tok').length,
      fractured: document.querySelector('[data-fracture-count]').textContent,
      truncated: document.querySelector('#tokens .tok--space:last-child')?.textContent ?? '',
    }))
    const tree = await rowTree()

    if (!tree.present) {
      fail(`${label}: the row is not in the accessibility tree at all`, 'Hiding the picture is not the same as describing it. A visitor who cannot see it should be told it is there.')
      return
    }
    /*
     * Announced as a picture, not as a status message.
     *
     * This assertion exists because the control for it passed. Taking
     * `role="img"` off the row left the tree exactly as it should be, one named
     * node, because the label is set from script and the chips hide themselves:
     * the shape was right and the row was being handed to a reader as an
     * `<output>`, which is a live region by default and is not a thing anybody
     * goes looking for in a list of images. A gate that could not tell those two
     * apart was measuring the half of the fix that the other half already did.
     */
    if (tree.role !== 'image') {
      fail(
        `${label}: the row is exposed as ${JSON.stringify(tree.role)}, not as an image`,
        'It is a picture of the tokens. A reader should meet it as one, and be able to find it among the images on the page.',
      )
      return
    }

    if (tree.names.length !== 1) {
      fail(
        `${label}: the row puts ${tree.names.length} named nodes into the tree, out of ${tree.under} under it and ${tree.whole} on the page`,
        `It reads back as ${JSON.stringify(tree.names.slice(0, 16).join(' '))}${tree.names.length > 16 ? ' ...' : ''}\n` +
          '      This is PA-F8: a chip at a time, each one twice, with the cost badges as bare numbers between them.',
      )
      return
    }

    /*
     * And the one sentence is about this picture rather than a fixed label: the
     * fracture count it states is the one the page prints under the chips, and
     * when the row is truncated it says so with the same number the last chip
     * does.
     */
    const [name] = tree.names

    /*
     * Zero is spoken rather than printed, "none of them spelled out in bytes",
     * so the zero case checks for the word. Everywhere else the figure has to be
     * the figure the page prints under the chips.
     */
    if (seen.fractured === '0' && !name.includes('none')) {
      fail(`${label}: nothing is fractured and the label does not say so`, `label: ${JSON.stringify(name)}`)
      return
    }
    const wants = seen.fractured === '0' ? [] : [['the fracture count', seen.fractured]]
    const more = seen.truncated.match(/and ([\d,]+) more/)
    if (more) wants.push(['the number of pieces not drawn', String(Number(more[1].replace(/,/g, '')) + seen.chips - 1)])

    const numbers = (name.match(/[\d,]+/g) ?? []).map((n) => n.replace(/,/g, ''))
    const missing = wants.filter(([, v]) => !numbers.includes(v.replace(/,/g, '')))
    if (missing.length > 0) {
      fail(
        `${label}: the label is missing ${missing.map(([w]) => w).join(', ')}`,
        `label: ${JSON.stringify(name)}\n      the page shows ${seen.chips} chips, ${seen.fractured} fractured${more ? `, and "${seen.truncated}"` : ''}`,
      )
      return
    }

    console.log(`  ok      ${label}: ${seen.chips} chips, one named node, ${JSON.stringify(name)}`)
  }

  await page.click('.enc[data-enc="o200k_base"]')
  await page.waitForTimeout(2000)
  await check('the opening sentence, o200k')

  await page.click('.enc[data-enc="p50k_base"]')
  await page.waitForTimeout(2000)
  await page.evaluate(() => {
    const ta = document.querySelector('#input')
    ta.value = 'Οι ερευνητές δημοσίευσαν τα ευρήματα σήμερα. '.repeat(40)
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.waitForTimeout(2500)
  await check('at the cap, p50k')

  /*
   * And the counts still reach a reader some other way, because the fix for a
   * wall of noise cannot be silence. The live region is where they go.
   */
  await page.waitForTimeout(1200)
  const spoken = await page.evaluate(() => document.querySelector('[data-announce]').textContent.trim())
  const count = await page.evaluate(() => document.querySelector('[data-token-count]').textContent.replace(/,/g, ''))
  if (!spoken.replace(/,/g, '').includes(count)) {
    fail(
      `the live region does not carry the token count`,
      `it says ${JSON.stringify(spoken)} and the page shows ${count} tokens`,
    )
  } else {
    console.log(`  ok      the live region still says it: ${JSON.stringify(spoken)}`)
  }
} finally {
  /*
   * Detached before the browser closes. A CDP session left attached keeps a
   * handle open and this gate sat there with no browser and nothing to do, which
   * in `npm run verify` is not a failure, it is a hang, and in CI it is a job
   * that runs until the runner gives up.
   */
  await client?.detach().catch(() => {})
  await browser.close()
  server.stop()
}

if (failed > 0) {
  console.error('\nThe one region a screen reader cannot avoid should not be the one that tells them least.')
  process.exit(1)
}

console.log('reader: the chip row is one named picture, and the numbers still arrive in words')
