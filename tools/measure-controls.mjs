/**
 * Every control in the workspace, and whether you can see where it is.
 *
 *   npm run measure:controls
 *
 * Not a gate, and it lives here rather than in `tools/` at the workspace root
 * for one dull reason: playwright is installed per project and node resolves it
 * from the script's own directory. It walks every project that has a
 * `tools/serve.mjs`, serves its build, and measures every control the same way
 * `check:contrast` measures this one.
 *
 * Written for PA-F10, which was tokenlab's text box, model picker, shuffle
 * button and idle encoding buttons all bounded by a 1.36:1 line. The sweep it
 * was written for found the same shape in five other projects, and the numbers
 * it printed are the ones filed against them.
 *
 * The rule is the one in `check:contrast`: a control is told apart from what is
 * behind it by its border or by its fill, and 3:1 on either is enough. A
 * borderless, unfilled button inside a bordered group is not a defect, which is
 * why the language toggle here shows up in the list and is not counted.
 */

import { chromium } from 'playwright'
import { readdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const projects = readdirSync(resolve(root, 'projects')).filter((p) =>
  existsSync(resolve(root, 'projects', p, 'tools/serve.mjs')),
)

const browser = await chromium.launch()

for (const project of projects) {
  const dir = resolve(root, 'projects', project)
  let server
  try {
    const { serve } = await import(pathToFileURL(resolve(dir, 'tools/serve.mjs')).href)
    server = await serve()
  } catch (err) {
    console.log(`${project.padEnd(16)} no server: ${String(err.message).slice(0, 60)}`)
    continue
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  try {
    await page.goto(server.url, { waitUntil: 'networkidle' })
    await page.waitForTimeout(3000)
    const found = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      const px = (v) => {
        ctx.fillStyle = '#000000'
        ctx.fillStyle = String(v)
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillRect(0, 0, 1, 1)
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
        return { r, g, b, a: a / 255 }
      }
      const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 })
      const lum = (c) => {
        const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
      }
      const ratio = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05) }
      const behind = (el) => {
        const stack = []
        for (let n = el.parentElement; n; n = n.parentElement) {
          const bg = px(getComputedStyle(n).backgroundColor)
          if (bg.a > 0) stack.push(bg)
        }
        let acc = px(getComputedStyle(document.body).backgroundColor)
        if (acc.a === 0) acc = px('#ffffff')
        for (const bg of stack.reverse()) acc = over(bg, acc)
        return acc
      }

      const out = []
      for (const el of document.querySelectorAll('input, select, textarea, button, [role="button"], [role="slider"]')) {
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden') continue
        const back = behind(el)
        const own = px(cs.backgroundColor)
        const surface = own.a > 0 ? over(own, back) : back
        const width = Number.parseFloat(cs.borderTopWidth)
        const border = px(cs.borderTopColor)
        const inside = width > 0 ? ratio(over(border, surface), surface) : null
        const outside = width > 0 ? ratio(over(border, back), back) : null
        // A control with no border at all is only a defect if it also has no fill
        // to distinguish it from the page.
        const fill = own.a > 0 ? ratio(surface, back) : 1
        out.push({
          what: `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}`,
          width,
          inside: inside === null ? null : Number(inside.toFixed(2)),
          outside: outside === null ? null : Number(outside.toFixed(2)),
          fill: Number(fill.toFixed(2)),
          appearance: cs.appearance,
          arrow: cs.backgroundImage !== 'none',
          tag: el.tagName.toLowerCase(),
        })
      }
      return out
    })

    /*
     * Only a border that exists and cannot be seen. A control with no border at
     * all is identified by its label, which is a different argument and not the
     * one tokenlab's PA-F10 was about.
     */
    const weak = found.filter((c) => Math.max(c.width > 0 ? c.outside : 0, c.fill) < 3)
    const blindSelects = found.filter((c) => c.tag === 'select' && c.appearance === 'none' && !c.arrow)
    console.log(
      `${project.padEnd(16)} ${String(found.length).padStart(2)} controls, ${weak.length} under 3:1` +
        (blindSelects.length ? `, ${blindSelects.length} select with no arrow` : ''),
    )
    const seen = new Map()
    for (const c of weak) {
      const key = `${c.what} ${c.width}px, best ${Math.max(c.width > 0 ? c.outside : 0, c.fill)}:1`
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    for (const [key, n] of [...seen].slice(0, 5)) console.log(`    ${key}${n > 1 ? ` (x${n})` : ''}`)
  } catch (err) {
    console.log(`${project.padEnd(16)} failed: ${String(err.message).slice(0, 70)}`)
  } finally {
    await page.close()
    server.stop()
  }
}

await browser.close()
