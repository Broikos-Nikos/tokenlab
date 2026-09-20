import './style.css'
import { ENCODINGS, loadEncoder, metaFor, type EncodingId, type Encoder } from './lib/tokenizers'
import { segment, statsFor, type Segment } from './lib/segment'
import findings from './generated/findings.json'
import corpus from '../data/pairs.json'
import pricing from '../data/pricing.json'

/** Above this many tokens the chips stop being a picture and start being a wall. */
const MAX_CHIPS = 900

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const el = {
  input: document.querySelector<HTMLTextAreaElement>('#input')!,
  tokens: document.querySelector<HTMLElement>('#tokens')!,
  encodings: document.querySelector<HTMLElement>('.encodings')!,
  count: document.querySelector<HTMLElement>('[data-token-count]')!,
  words: document.querySelector<HTMLElement>('[data-words]')!,
  tpw: document.querySelector<HTMLElement>('[data-tpw]')!,
  compare: document.querySelector<HTMLElement>('[data-compare]')!,
  compareRatio: document.querySelector<HTMLElement>('[data-compare-ratio]')!,
  model: document.querySelector<HTMLSelectElement>('[data-model]')!,
  cost: document.querySelector<HTMLElement>('[data-cost]')!,
  priceNote: document.querySelector<HTMLElement>('[data-price-note]')!,
  headlineRatio: document.querySelector<HTMLElement>('[data-headline-ratio]')!,
  fractureNote: document.querySelector<HTMLElement>('[data-fracture-note]')!,
  fractureCount: document.querySelector<HTMLElement>('[data-fracture-count]')!,
  findingsLede: document.querySelector<HTMLElement>('[data-findings-lede]')!,
  findingsBody: document.querySelector<HTMLElement>('[data-findings-table] tbody')!,
  method: document.querySelector<HTMLElement>('[data-method]')!,
  shuffle: document.querySelector<HTMLButtonElement>('[data-shuffle]')!,
  langButtons: [...document.querySelectorAll<HTMLButtonElement>('[data-lang]')],
}

type Lang = 'el' | 'en'

const state = {
  encoding: 'o200k_base' as EncodingId,
  lang: 'el' as Lang,
  pairIndex: 0,
  custom: false,
  model: pricing.models[1]!.id,
}

let encoder: Encoder | null = null

/* ------------------------------------------------------------------ chrome */

function buildEncodingButtons() {
  for (const meta of ENCODINGS) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'enc'
    b.style.setProperty('--enc-hue', String(meta.hue))
    b.dataset.enc = meta.id
    b.setAttribute('aria-pressed', String(meta.id === state.encoding))
    b.innerHTML = `<span>${meta.label}</span><small></small>`
    b.querySelector('small')!.textContent = meta.models
    if (meta.id === state.encoding) b.classList.add('is-on')
    b.addEventListener('click', () => void setEncoding(meta.id))
    el.encodings.append(b)
  }
}

function buildModelSelect() {
  for (const m of pricing.models) {
    const o = document.createElement('option')
    o.value = m.id
    o.textContent = `${m.label}, $${m.inputPerMillion} per 1M in`
    if (m.id === state.model) o.selected = true
    el.model.append(o)
  }
  el.priceNote.textContent = `Input tokens only, standard tier, prices checked ${pricing.checked}.`
  el.model.addEventListener('change', () => {
    state.model = el.model.value
    render()
  })
}

async function setEncoding(id: EncodingId) {
  state.encoding = id
  const meta = metaFor(id)
  document.documentElement.style.setProperty('--hue', String(meta.hue))
  for (const b of el.encodings.querySelectorAll<HTMLButtonElement>('.enc')) {
    const on = b.dataset.enc === id
    b.classList.toggle('is-on', on)
    b.setAttribute('aria-pressed', String(on))
  }
  const f = findings.encodings as Record<string, { ratio: number }>
  el.headlineRatio.textContent = `${f[id]!.ratio}x more`
  encoder = await loadEncoder(id)
  render()
}

function setLang(lang: Lang) {
  state.lang = lang
  for (const b of el.langButtons) {
    const on = b.dataset.lang === lang
    b.classList.toggle('is-on', on)
    b.setAttribute('aria-pressed', String(on))
  }
  if (!state.custom) {
    loadPair(state.pairIndex)
  } else {
    render()
  }
}

function loadPair(i: number) {
  state.pairIndex = i
  state.custom = false
  const pair = corpus.pairs[i]!
  el.input.value = state.lang === 'el' ? pair.el : pair.en
  el.input.setAttribute('lang', state.lang)
  render()
}

/* ------------------------------------------------------------- the drawing */

function chipFor(seg: Segment, index: number): HTMLElement {
  const span = document.createElement('span')
  span.className = 'tok'
  span.style.setProperty('--shade', String(index % 4))
  if (!reduceMotion) {
    span.style.setProperty('--delay', `${Math.min(index, 60) * 9}ms`)
  }

  if (seg.splitIntoBytes) {
    span.classList.add('tok--fractured')
    span.append(document.createTextNode(seg.text))
    const cost = document.createElement('span')
    cost.className = 'cost'
    cost.textContent = String(seg.ids.length)
    span.append(cost)
    span.title = `${seg.ids.length} tokens for this one piece of text`
  } else {
    if (seg.text.trim() === '') span.classList.add('tok--space')
    span.textContent = seg.text
  }
  return span
}

function drawTokens(segments: Segment[]) {
  const frag = document.createDocumentFragment()
  const shown = segments.slice(0, MAX_CHIPS)
  shown.forEach((seg, i) => frag.append(chipFor(seg, i)))
  if (segments.length > MAX_CHIPS) {
    const more = document.createElement('span')
    more.className = 'tok tok--space'
    more.textContent = `and ${segments.length - MAX_CHIPS} more`
    frag.append(more)
  }
  el.tokens.replaceChildren(frag)
}

/* ------------------------------------------------------------ the counting */

let countFrom = 0

function tickTo(node: HTMLElement, to: number, format: (n: number) => string) {
  const from = countFrom
  countFrom = to
  if (reduceMotion || from === to) {
    node.textContent = format(to)
    return
  }
  const started = performance.now()
  const dur = 420
  const step = (now: number) => {
    const t = Math.min(1, (now - started) / dur)
    const eased = 1 - Math.pow(1 - t, 3)
    node.textContent = format(Math.round(from + (to - from) * eased))
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

/* -------------------------------------------------------------- the render */

function render() {
  if (!encoder) return
  const text = el.input.value
  const ids = encoder.encode(text)
  const segments = segment(encoder, ids)
  const stats = statsFor(text, ids, segments)

  drawTokens(segments)
  tickTo(el.count, stats.tokens, (n) => n.toLocaleString('en-US'))
  el.words.textContent = String(stats.words)
  el.tpw.textContent = stats.tokensPerWord.toFixed(2)

  const fractured = segments.filter((s) => s.splitIntoBytes).length
  el.fractureCount.textContent = String(fractured)
  el.fractureNote.hidden = fractured === 0

  const model = pricing.models.find((m) => m.id === state.model)!
  const per1k = (stats.tokens * model.inputPerMillion) / 1000
  el.cost.textContent = per1k.toFixed(per1k < 1 ? 3 : 2)

  // The comparison only means something when both sides say the same thing.
  if (!state.custom) {
    const pair = corpus.pairs[state.pairIndex]!
    const elTokens = encoder.encode(pair.el).length
    const enTokens = encoder.encode(pair.en).length
    el.compare.hidden = false
    el.compareRatio.textContent = `${(elTokens / enTokens).toFixed(2)}x`
  } else {
    el.compare.hidden = true
  }
}

/* ------------------------------------------------------------ the findings */

function renderFindings() {
  const f = findings as typeof findings
  el.findingsLede.textContent =
    `Across ${f.corpus.pairs} aligned sentence pairs in ${f.corpus.registers.length} registers, ` +
    `Greek costs ${f.encodings.o200k_base.ratio} times the tokens of English on the newest ` +
    `OpenAI vocabulary and ${f.encodings.cl100k_base.ratio} times on the one before it. ` +
    `The newer vocabulary cut the Greek penalty by ${f.headline.improvement} times.`

  const rows: string[] = []
  for (const meta of ENCODINGS) {
    const e = (f.encodings as Record<string, typeof f.encodings.o200k_base>)[meta.id]
    if (!e) continue
    rows.push(
      `<tr style="--row-hue:${meta.hue}">` +
        `<td>${meta.label}</td>` +
        `<td class="dim">${meta.models}</td>` +
        `<td data-ratio style="color:oklch(0.85 0.13 ${meta.hue})">${e.ratio}x</td>` +
        `<td class="dim">${e.ratioInterval95[0]} to ${e.ratioInterval95[1]}</td>` +
        `<td class="dim">${e.tokensPerWord.el} against ${e.tokensPerWord.en} in English</td>` +
        `</tr>`,
    )
  }
  el.findingsBody.innerHTML = rows.join('')
  el.method.textContent =
    `${f.corpus.method} Ratios are totals over totals, not a mean of per sentence ratios. ` +
    `The interval is a paired bootstrap over the ${f.corpus.pairs} pairs, ` +
    `10,000 resamples, fixed seed. Measured ${f.generatedAt}.`
}

/* ----------------------------------------------------------------- wire up */

function wire() {
  let queued = 0
  el.input.addEventListener('input', () => {
    state.custom = true
    cancelAnimationFrame(queued)
    queued = requestAnimationFrame(render)
  })

  for (const b of el.langButtons) {
    b.addEventListener('click', () => setLang(b.dataset.lang as Lang))
  }

  el.shuffle.addEventListener('click', () => {
    let next = state.pairIndex
    while (next === state.pairIndex && corpus.pairs.length > 1) {
      next = Math.floor(Math.random() * corpus.pairs.length)
    }
    loadPair(next)
  })
}

async function boot() {
  buildEncodingButtons()
  buildModelSelect()
  renderFindings()
  wire()
  encoder = await loadEncoder(state.encoding)
  document.documentElement.style.setProperty('--hue', String(metaFor(state.encoding).hue))
  loadPair(Math.floor(Math.random() * corpus.pairs.length))
}

void boot()
