import './style.css'
import { ENCODINGS, loadEncoder, metaFor, type EncodingId, type Encoder } from './lib/tokenizers'
import { segment, statsFor, type Segment, type Stats } from './lib/segment'
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
  split: document.querySelector<HTMLElement>('[data-split]')!,
  fractureNote: document.querySelector<HTMLElement>('[data-fracture-note]')!,
  fractureCount: document.querySelector<HTMLElement>('[data-fracture-count]')!,
  fractureBody: document.querySelector<HTMLElement>('[data-fracture-body]')!,
  loadError: document.querySelector<HTMLElement>('[data-load-error]')!,
  loadErrorText: document.querySelector<HTMLElement>('[data-load-error-text]')!,
  retry: document.querySelector<HTMLButtonElement>('[data-retry]')!,
  findingsLede: document.querySelector<HTMLElement>('[data-findings-lede]')!,
  findingsBody: document.querySelector<HTMLElement>('[data-findings-table] tbody')!,
  bill: document.querySelector<HTMLElement>('.bill')!,
  announce: document.querySelector<HTMLElement>('[data-announce]')!,
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

/**
 * Encoding switches are races. The o200k vocabulary is twice the bytes of
 * cl100k and takes twice as long to compile, so clicking cl100k while o200k is
 * still loading resolves them in the wrong order and leaves the wrong encoder
 * behind a pressed button. A request id makes the last click win rather than the
 * last download.
 */
let encodingRequest = 0

/** Chips only fly in when the whole sequence is new, never while typing. */
let staggerNext = true

/** The opening move, cancelled the moment the visitor does anything. */
let healTimer: number | undefined

/** Set by any deliberate act, and never unset. The opening move is once only. */
let userActed = false

/** Which vocabulary failed, so the retry knows what to come back to. */
let failedEncoding: EncodingId | null = null

const RESUME_KEY = 'tokenlab:resume'

/**
 * Retrying a failed vocabulary means reloading the page, and that is not
 * laziness.
 *
 * A browser caches the result of a module load against its URL, failures
 * included, so importing the same specifier a second time never reaches the
 * network and returns the first rejection instead. An in page retry button
 * would look like a retry and do nothing, which is worse than no button. A
 * reload is a genuine second attempt, and since the only state worth keeping is
 * the text, the encoding and the sentence, it survives the trip.
 */
function resumeAndReload(encoding: EncodingId) {
  try {
    sessionStorage.setItem(
      RESUME_KEY,
      JSON.stringify({ text: el.input.value, encoding, custom: state.custom, pair: state.pairIndex }),
    )
  } catch {
    // Private mode, blocked storage. The reload is still worth doing.
  }
  location.reload()
}

function takeResume(): { text: string; encoding: EncodingId; custom: boolean; pair: number } | null {
  try {
    const raw = sessionStorage.getItem(RESUME_KEY)
    if (!raw) return null
    sessionStorage.removeItem(RESUME_KEY)
    const v = JSON.parse(raw)
    if (typeof v?.text !== 'string' || typeof v?.encoding !== 'string') return null
    if (!ENCODINGS.some((e) => e.id === v.encoding)) return null
    return v
  } catch {
    return null
  }
}

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
    b.addEventListener('click', () => {
      cancelHeal()
      void setEncoding(meta.id)
    })
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
    cancelHeal()
    state.model = el.model.value
    render()
  })
}

function setBusy(id: EncodingId, busy: boolean) {
  const b = el.encodings.querySelector<HTMLButtonElement>(`.enc[data-enc="${id}"]`)
  if (!b) return
  b.classList.toggle('is-loading', busy)
  b.setAttribute('aria-busy', String(busy))
}

/**
 * Returns true only if this call is the one that ended up applying. A caller
 * that arms a follow up needs to know the difference between "done" and
 * "superseded", because those look identical from the outside of an await.
 */
async function setEncoding(id: EncodingId): Promise<boolean> {
  const request = ++encodingRequest

  // Nothing about the page moves until the vocabulary is actually here. A
  // pressed button, a recoloured page and a headline number are all assertions
  // about which encoding is producing the tokens on screen, and for as long as
  // a megabyte of vocabulary is still in flight none of them would be true.
  // While it loads the button says so instead.
  setBusy(id, true)
  el.loadError.hidden = true

  let next: Encoder
  try {
    next = await loadEncoder(id)
  } catch {
    setBusy(id, false)
    // Only the newest request gets to speak. An older one that failed while the
    // visitor has already moved on is not news.
    if (request === encodingRequest) {
      const meta = metaFor(id)
      el.loadErrorText.textContent =
        `The ${meta.label} vocabulary did not arrive, so nothing below is ` +
        `${meta.label}. Check the connection, then try again.`
      el.loadError.hidden = false
      failedEncoding = id
    }
    return false
  }

  // A slower vocabulary asked for first must not overwrite a faster one asked
  // for second.
  if (request !== encodingRequest) {
    setBusy(id, false)
    return false
  }

  state.encoding = id
  encoder = next

  const meta = metaFor(id)
  document.documentElement.style.setProperty('--hue', String(meta.hue))
  for (const b of el.encodings.querySelectorAll<HTMLButtonElement>('.enc')) {
    const on = b.dataset.enc === id
    b.classList.toggle('is-on', on)
    b.setAttribute('aria-pressed', String(on))
  }
  setBusy(id, false)
  const f = findings.encodings as unknown as Record<string, EncodingFinding>
  el.headlineRatio.textContent = `${f[id]!.ratio}x more`

  // Say which part of that is the alphabet and which part is this vocabulary,
  // because the ratio on its own credits all of it to the vocabulary.
  const lc = f[id]!.lengthControlled
  const add = lc.vocabularyPenaltyPercent
  el.split.innerHTML =
    `Most of that is the alphabet. Greek is ` +
    `<strong>${findings.headline.scriptCost}x</strong> the bytes of English before any ` +
    `tokenizer runs, and ${meta.label} adds ` +
    `<strong>${add < 10 ? add.toFixed(1) : Math.round(add)}%</strong> on top.`

  staggerNext = true
  render()
  return true
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
    staggerNext = true
    render()
  }
}

function loadPair(i: number) {
  state.pairIndex = i
  state.custom = false
  const pair = corpus.pairs[i]!
  el.input.value = state.lang === 'el' ? pair.el : pair.en
  el.input.setAttribute('lang', state.lang)
  staggerNext = true
  render()
}

/* ------------------------------------------------------------- the drawing */

function chipFor(seg: Segment, index: number, total: number, stagger: boolean): HTMLElement {
  const span = document.createElement('span')
  span.className = 'tok'
  span.style.setProperty('--shade', String(index % 4))
  if (stagger && !reduceMotion) {
    // A compressing curve, so a long sentence still lands on one clock instead
    // of every chip past the sixtieth detonating together.
    span.style.setProperty('--delay', `${Math.round(520 * Math.pow(index / total, 0.7))}ms`)
  } else {
    // While typing, the chip is feedback for a keystroke. Feedback that fades in
    // over 340ms reads as a rendering fault, so it does not animate at all.
    span.style.animation = 'none'
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

function drawTokens(segments: Segment[], stagger: boolean) {
  const frag = document.createDocumentFragment()
  const shown = segments.slice(0, MAX_CHIPS)
  shown.forEach((seg, i) => frag.append(chipFor(seg, i, shown.length, stagger)))
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

/* ------------------------------------------------------------ the speaking */

/**
 * The chip list is deliberately not a live region: read aloud it is a wall of
 * single letters. But something has to be, or a screen reader visitor can type
 * Greek into this page all day and be told nothing. This is that something, and
 * it waits for a pause in typing so it does not fire per keystroke.
 */
let announceTimer: number | undefined

function announce(stats: Stats, fractured: number, cost: string | null, model: string) {
  clearTimeout(announceTimer)
  announceTimer = window.setTimeout(() => {
    const parts = [
      `${stats.tokens} tokens`,
      `${stats.words} words`,
      `${stats.tokensPerWord.toFixed(2)} tokens per word`,
    ]
    if (fractured > 0) {
      parts.push(`${fractured} ${fractured === 1 ? 'piece' : 'pieces'} cost more than one token`)
    }
    if (cost) parts.push(`$${cost} per thousand requests on ${model}`)
    el.announce.textContent = parts.join(', ')
  }, 750)
}

/* -------------------------------------------------------------- the render */

function render() {
  if (!encoder) return
  const text = el.input.value
  const ids = encoder.encode(text)
  const segments = segment(encoder, ids)
  const stats = statsFor(text, ids, segments)

  const stagger = staggerNext
  staggerNext = false
  drawTokens(segments, stagger)
  tickTo(el.count, stats.tokens, (n) => n.toLocaleString('en-US'))
  el.words.textContent = String(stats.words)
  el.tpw.textContent = stats.tokensPerWord.toFixed(2)

  const fractured = segments.filter((s) => s.splitIntoBytes).length
  el.fractureCount.textContent = String(fractured)
  el.fractureBody.textContent =
    fractured === 1
      ? 'piece of this text cost more than one token. The tokenizer had no token for it, so it spelled it out in raw bytes and charged for every byte.'
      : 'pieces of this text cost more than one token each. The tokenizer had no token for them, so it spelled them out in raw bytes and charged for every byte.'
  el.fractureNote.hidden = fractured === 0

  // A price is only true for the encoding its model actually uses. Every model
  // in pricing.json records that, so the page refuses rather than guesses.
  const model = pricing.models.find((m) => m.id === state.model)!
  const priceable = model.encoding === state.encoding
  el.bill.classList.toggle('is-unpriceable', !priceable)
  if (priceable) {
    const per1k = (stats.tokens * model.inputPerMillion) / 1000
    el.cost.textContent = per1k.toFixed(per1k < 1 ? 3 : 2)
    el.priceNote.textContent =
      `Input tokens only, standard tier, prices checked ${pricing.checked}.`
  } else {
    el.cost.textContent = 'n/a'
    el.priceNote.textContent =
      `${model.label} runs on ${metaFor(model.encoding as EncodingId).label}, ` +
      `not ${metaFor(state.encoding).label}, so this count is not its bill. ` +
      `Switch the encoding to price it.`
  }

  announce(stats, fractured, priceable ? el.cost.textContent : null, model.label)

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

interface EncodingFinding {
  ratio: number
  ratioInterval95: [number, number]
  tokensPerWord: { el: number; en: number }
  lengthControlled: {
    bytesPerToken: { el: number; en: number }
    vocabularyPenaltyPercent: number
  }
}

function renderFindings() {
  const f = findings as typeof findings
  el.findingsLede.textContent =
    `Across ${f.corpus.pairs} aligned sentence pairs in ${f.corpus.registers.length} registers, ` +
    `Greek costs ${f.encodings.o200k_base.ratio} times the tokens of English on the newest ` +
    `OpenAI vocabulary and ${f.encodings.cl100k_base.ratio} times on the one before it. ` +
    `But Greek is ${f.headline.scriptCost} times the UTF-8 bytes of English before any ` +
    `tokenizer is involved, so the last column is the part that is actually the ` +
    `vocabulary: the newest one has all but closed the gap, and the one still under ` +
    `most cost models built for GPT-4 has not.`

  const rows: string[] = []
  for (const meta of ENCODINGS) {
    const e = (f.encodings as unknown as Record<string, EncodingFinding>)[meta.id]
    if (!e) continue
    const add = e.lengthControlled.vocabularyPenaltyPercent
    rows.push(
      `<tr style="--row-hue:${meta.hue}">` +
        `<td>${meta.label}</td>` +
        `<td class="dim">${meta.models}</td>` +
        `<td data-ratio style="color:oklch(0.85 0.13 ${meta.hue})">${e.ratio}x</td>` +
        `<td class="dim">${e.ratioInterval95[0].toFixed(2)} to ${e.ratioInterval95[1].toFixed(2)}</td>` +
        `<td class="dim">${e.lengthControlled.bytesPerToken.el.toFixed(2)}</td>` +
        `<td data-ratio style="color:oklch(0.85 0.13 ${meta.hue})">+${add.toFixed(1)}%</td>` +
        `</tr>`,
    )
  }
  el.findingsBody.innerHTML = rows.join('')
  el.method.textContent =
    `${f.corpus.method} Ratios are totals over totals, not a mean of per sentence ratios. ` +
    `The interval is a paired bootstrap over the ${f.corpus.pairs} pairs, ` +
    `10,000 resamples, fixed seed. Corpus dated ${f.corpusDated}, inputs ${f.inputsHash}. ` +
    `Re-running the measurement on the same corpus reproduces this file byte for byte.`
}

/* ----------------------------------------------------------------- wire up */

/** `?pair=N`, clamped, or null when it is absent or not a number. */
function pinnedPair(): number | null {
  const raw = new URLSearchParams(location.search).get('pair')
  if (raw === null) return null
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return null
  return Math.min(Math.max(n, 0), corpus.pairs.length - 1)
}

/**
 * Any deliberate act by the visitor cancels the opening move, and that has to
 * be remembered rather than only acted on.
 *
 * `boot` awaits its first `setEncoding` and then arms the heal. A click during
 * that await supersedes the request, which makes `setEncoding` return early and
 * resolve normally, so `boot` carried on and armed the heal anyway. Clearing the
 * timer in the click handler could not help: at that moment there was no timer
 * to clear, and one was armed a second later. The visitor's choice was undone
 * 1.8 seconds after they made it, with no way to tell why.
 */
function cancelHeal() {
  userActed = true
  if (healTimer !== undefined) {
    clearTimeout(healTimer)
    healTimer = undefined
  }
}

function wire() {
  let queued = 0
  el.input.addEventListener('input', () => {
    cancelHeal()
    state.custom = true
    cancelAnimationFrame(queued)
    queued = requestAnimationFrame(render)
  })

  for (const b of el.langButtons) {
    b.addEventListener('click', () => {
      cancelHeal()
      setLang(b.dataset.lang as Lang)
    })
  }

  el.retry.addEventListener('click', () => {
    resumeAndReload(failedEncoding ?? state.encoding)
  })

  el.shuffle.addEventListener('click', () => {
    cancelHeal()
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

  // Seed the textarea before anything is awaited, so the page is never a
  // focusable empty box that silently discards what is typed into it, and so
  // the sentence is on screen while the vocabulary is still arriving.
  //
  // ?pair=N pins the sentence. It is what makes a link to this page point at a
  // particular example rather than at a shuffle, and it is what lets the
  // recording in the README be reproducible: a capture of a random sentence
  // cannot have its numbers checked against anything.
  const resume = takeResume()
  state.pairIndex = resume?.pair ?? pinnedPair() ?? Math.floor(Math.random() * corpus.pairs.length)
  const pair = corpus.pairs[state.pairIndex]!
  el.input.value = resume ? resume.text : state.lang === 'el' ? pair.el : pair.en
  el.input.setAttribute('lang', state.lang)
  if (resume) state.custom = resume.custom

  // Open on the damage, then heal it. cl100k shatters this sentence into single
  // letters; o200k puts it back together. Watching that happen is the argument
  // the page exists to make, and it costs the visitor nothing to see it.
  // A page that came back from a failed load resumes where it was, and the
  // opening move does not play over the top of that.
  const opensOnShatter = !reduceMotion && !resume
  const applied = await setEncoding(resume ? resume.encoding : opensOnShatter ? 'cl100k_base' : 'o200k_base')

  // Three conditions, and all of them matter. The opening move only makes sense
  // if this page is the one that opened on the shatter, if that request is the
  // one that actually applied rather than one a click overtook, and if the
  // visitor has not already made a choice of their own.
  if (opensOnShatter && applied && !userActed) {
    healTimer = window.setTimeout(() => {
      healTimer = undefined
      if (!userActed) void setEncoding('o200k_base')
    }, 1800)
  }
}

void boot().catch((err) => {
  // boot has its own error paths for a vocabulary that will not load. Anything
  // that reaches here is a bug, and a silent unhandled rejection is the worst
  // way to find out about one.
  console.error('tokenlab failed to start', err)
  el.loadErrorText.textContent =
    'The page failed to start. Reloading is worth a try; if it keeps happening the console has the detail.'
  el.loadError.hidden = false
})
