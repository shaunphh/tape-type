// The family board (18 Oct 2026): every kind of page the AD tools make, side by side, drawn from the
// shared tokens. The tokens become --ad-* variables on the page and sliders in the panel; the tape and
// the tags are cut by Tape Type's own geometry (tape.js, bundled by scripts/board-sync.mjs) the way
// the site cuts them; the safe zones are overlays; the pages export as PNG at their real size and
// the tweaked tokens as a JSON to take back into src/ad-tokens.json.
import { buildShape, defaults } from './tape.js'

const W = 1080
const BARLOW = { ascent: 1, descent: 0.2, cap: 0.7 }
const $ = (selector, root = document) => root.querySelector(selector)
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]
const round = (value, places = 3) => Math.round(value * 10 ** places) / 10 ** places

// ---------------------------------------------------------------------------
// Tokens → variables and controls

/** One control per value in the token file, with the variable it drives. */
function controlsFrom(tokens) {
  const out = []
  tokens.color.tokens.forEach((t) => out.push({ group: 'Colours', label: t.name, name: `--ad-${t.name}`, kind: 'color', value: t.value, path: ['color', t.name, 'value'] }))
  tokens.type.groups.forEach((group) => group.styles.forEach((s) => {
    const size = parseFloat(s.fontSize)
    out.push({ group: group.name, label: `${s.name} · size`, name: `--ad-${s.name}-size`, kind: 'range', value: size, unit: 'px', min: Math.round(size * .5), max: Math.round(size * 1.6), step: 1, path: ['type', s.name, 'fontSize'] })
    const lineInPx = typeof s.lineHeight === 'string'
    out.push({ group: group.name, label: `${s.name} · line height`, name: `--ad-${s.name}-line-height`, kind: 'range', value: parseFloat(s.lineHeight), unit: lineInPx ? 'px' : '', min: lineInPx ? 20 : .75, max: lineInPx ? 64 : 1.6, step: lineInPx ? 1 : .01, path: ['type', s.name, 'lineHeight'] })
    if (s.letterSpacing !== undefined) out.push({ group: group.name, label: `${s.name} · tracking`, name: `--ad-${s.name}-letter-spacing`, kind: 'range', value: parseFloat(s.letterSpacing), unit: 'em', min: -.1, max: .1, step: .005, path: ['type', s.name, 'letterSpacing'] })
    out.push({ group: group.name, label: `${s.name} · weight`, name: `--ad-${s.name}-weight`, kind: 'range', value: s.fontWeight, unit: '', min: 22, max: 188, step: 1, path: ['type', s.name, 'fontWeight'] })
  }))
  tokens.spacing.tokens.forEach((t) => out.push({ group: 'Space', label: t.name, name: `--ad-${t.name}`, kind: 'range', value: parseFloat(t.value), unit: 'px', min: 0, max: Math.max(100, Math.round(parseFloat(t.value) * 2)), step: 1, path: ['spacing', t.name, 'value'] }))
  tokens.size.tokens.forEach((t) => out.push({ group: 'Sizes', label: t.name, name: `--ad-${t.name}`, kind: 'range', value: parseFloat(t.value), unit: 'px', min: 0, max: Math.max(100, Math.round(parseFloat(t.value) * 2)), step: 1, path: ['size', t.name, 'value'] }))
  tokens.opacity.tokens.forEach((t) => out.push({ group: 'Opacity', label: t.name, name: `--ad-${t.name}`, kind: 'range', value: parseFloat(t.value), unit: '', min: 0, max: 1, step: .01, path: ['opacity', t.name, 'value'] }))
  tokens.weight.tokens.forEach((t) => out.push({ group: 'Weights', label: t.name, name: `--ad-weight-${t.name}`, kind: 'range', value: parseFloat(t.value), unit: '', min: 22, max: 188, step: 1, path: ['weight', t.name, 'value'] }))
  return out.map((c) => ({ ...c, initial: c.value }))
}

const css = (control) => (control.kind === 'color' ? control.value : `${control.value}${control.unit}`)
function apply(control) { document.documentElement.style.setProperty(control.name, css(control)) }

let tokens, controls = []
let tapeTimer = 0
const scheduleTape = () => { clearTimeout(tapeTimer); tapeTimer = setTimeout(drawTape, 60) }

function buildPanel() {
  const host = $('#controls')
  host.innerHTML = ''
  const groups = [...new Set(controls.map((c) => c.group))]
  for (const group of groups) {
    const details = document.createElement('details')
    details.className = 'group'
    details.open = group === 'Colours' || group === 'Pages'
    const list = controls.filter((c) => c.group === group)
    details.innerHTML = `<summary><span>${group}</span><span class="count">${list.length}</span></summary>`
    for (const control of list) {
      const row = document.createElement('div')
      row.className = 'control'
      row.dataset.name = control.name
      const id = `c-${control.name.slice(2)}`
      row.innerHTML = control.kind === 'color'
        ? `<label class="control__label" for="${id}"><span>${control.label}</span><small>${control.value}</small></label><input id="${id}" type="color" value="${control.value}"><button class="undo" type="button" title="Back to the token's value">reset</button>`
        : `<label class="control__label" for="${id}"><span>${control.label}</span><small>${control.value}${control.unit}</small></label><input id="${id}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${control.value}"><button class="undo" type="button" title="Back to the token's value">reset</button>`
      const input = $('input', row), readout = $('small', row)
      input.addEventListener('input', () => {
        control.value = control.kind === 'color' ? input.value : Number(input.value)
        readout.textContent = control.kind === 'color' ? control.value : `${control.value}${control.unit}`
        row.classList.toggle('changed', control.value !== control.initial)
        apply(control); scheduleTape()
      })
      $('.undo', row).addEventListener('click', () => { control.value = control.initial; input.value = control.value; input.dispatchEvent(new Event('input')) })
      details.appendChild(row)
    }
    host.appendChild(details)
  }
}

function resetAll() {
  for (const control of controls) { control.value = control.initial; apply(control) }
  $$('.control').forEach((row) => { const control = controls.find((c) => c.name === row.dataset.name); const input = $('input', row); input.value = control.value; $('small', row).textContent = control.kind === 'color' ? control.value : `${control.value}${control.unit}`; row.classList.remove('changed') })
  scheduleTape(); say('Tokens back to the file.')
}

// ---------------------------------------------------------------------------
// Tape and tags, cut by Tape Type's geometry

/** The scale the page is shown at: measurements come back scaled, the geometry works in page pixels. */
const scaleOf = (node) => (node.closest('.wrap')?.getBoundingClientRect().width ?? W) / W

function seedFor(key) {
  if (typeof key === 'number') return key
  let hash = 2166136261
  for (const character of String(key)) { hash ^= character.codePointAt(0) ?? 0; hash = Math.imul(hash, 16777619) }
  return ((hash >>> 0) % 4294967294) + 1
}

/** A rough-cut (or tape-cut) strip under a block of lines, measured where the browser broke them: the site's tapeHeadline. */
function drawHeadline(node) {
  const text = $('.tape__text', node)
  const scale = scaleOf(node)
  const box = node.getBoundingClientRect()
  if (!box.width) return
  const style = getComputedStyle(text)
  const size = parseFloat(style.fontSize)
  const range = document.createRange(); range.selectNodeContents(text)
  const rows = []
  for (const r of range.getClientRects()) {
    if (!r.width) continue
    const row = rows.find((l) => Math.abs(l.top - r.top) < size * scale * .3)
    if (row) { row.left = Math.min(row.left, r.left); row.right = Math.max(row.right, r.right) } else rows.push({ left: r.left, right: r.right, top: r.top })
  }
  if (!rows.length) return
  rows.sort((a, b) => a.top - b.top)
  const lines = rows.map((r) => ({ left: (r.left - box.left) / scale, width: Math.max(1, (r.right - r.left) / scale), baseline: (r.top - box.top) / scale + BARLOW.ascent * size }))
  const ascent = size * .72, descent = size * .18
  const step = lines.length > 1 ? lines[1].baseline - lines[0].baseline : size * .94
  const mode = node.dataset.mode || 'rough'
  const settings = { ...defaults, headline: lines.map((_, i) => `line ${i}`).join('\n'), style: 'headline', perLine: false, align: 'left', mode, seed: seedFor(node.dataset.seed || 'tape'), fontSize: size, hugStrength: 1, rotationVariance: 0, lineGap: step - ascent - descent }
  const widths = lines.map((l) => l.width), labels = lines.map((_, i) => `line ${i}`), bounds = { ascent, descent }
  let svg = $('.tape__svg', node)
  if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'tape__svg'); svg.setAttribute('aria-hidden', 'true'); svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'path')); node.prepend(svg) }
  if (node.dataset.stretch) {
    // Guide Studio's cover: one block around the widest line, its cut stretched to the padded box
    // (Picks 82 / 59 / 64, as in render.ts) and turned over so the wider strip runs under the last line.
    // Exactly Guide Studio's call (render.ts drawCover), so the cut lands where it does there.
    const maxWidth = Math.max(...widths)
    const shape = buildShape({ ...defaults, fontSize: size, align: 'left', mode: 'rough', lineGap: step - ascent - descent, hugStrength: 1, seed: 18473562 }, labels, labels.map(() => maxWidth), [], bounds)
    const box = shape.viewBox
    svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`)
    svg.setAttribute('preserveAspectRatio', 'none')
    svg.firstElementChild.setAttribute('d', shape.path)
    svg.firstElementChild.setAttribute('transform', node.dataset.flip ? `translate(0 ${2 * box.y + box.height}) scale(1 -1)` : '')
    node.classList.add('tape--drawn')
    return
  }
  let points, anchorX, anchorBaseline
  if (node.dataset.flip) {
    const shape = buildShape(settings, [...labels].reverse(), [...widths].reverse(), widths.map(() => 0), bounds)
    const ys = shape.points.map((p) => p.y), top = Math.min(...ys), bottom = Math.max(...ys)
    points = shape.points.map((p) => ({ x: p.x, y: top + bottom - p.y }))
    const first = shape.lines[shape.lines.length - 1]
    anchorX = first.inkX; anchorBaseline = top + bottom - first.baseline - descent + ascent
  } else {
    const shape = buildShape(settings, labels, widths, widths.map(() => 0), bounds)
    points = shape.points; anchorX = shape.lines[0].inkX; anchorBaseline = shape.lines[0].baseline
  }
  const dx = lines[0].left - anchorX, dy = lines[0].baseline - anchorBaseline
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${(p.x + dx).toFixed(1)} ${(p.y + dy).toFixed(1)}`).join(' ') + 'Z'
  svg.removeAttribute('viewBox'); svg.removeAttribute('preserveAspectRatio'); svg.firstElementChild.removeAttribute('transform')
  svg.firstElementChild.setAttribute('d', d)
  node.classList.add('tape--drawn')
}

const cuts = new Map()
/** The clean cut of a tag as CSS, in ems of its size, the cut on its free right end: the site's tagCut. */
function tagCut(seed) {
  if (cuts.has(seed)) return cuts.get(seed)
  const size = 100, width = 400, capHeight = BARLOW.cap * size
  const shape = buildShape({ ...defaults, headline: 'TAG', style: 'feature', perLine: false, align: 'left', mode: 'clean', preferredEdge: 'right', seed: seedFor(seed), fontSize: size, hugStrength: 1, rotationVariance: 0 }, ['TAG'], [width], [0], { ascent: capHeight, descent: size * .02 })
  const xs = shape.points.map((p) => p.x), ys = shape.points.map((p) => p.y)
  const left = Math.min(...xs), top = Math.min(...ys), w = Math.max(...xs) - left, h = Math.max(...ys) - top
  const em = (v) => `${round(v / size)}em`
  const points = shape.points.map((p) => { const x = p.x - left, y = p.y - top; return `${x <= w / 2 ? em(x) : `calc(100% - ${em(w - x)})`} ${y <= h / 2 ? em(y) : `calc(100% - ${em(h - y)})`}` })
  const textX = shape.lines[0].x - left, baseline = shape.lines[0].baseline - top
  const baselineInLine = (1 - BARLOW.ascent - BARLOW.descent) / 2 + BARLOW.ascent
  const padTop = baseline / size - baselineInLine, padBottom = h / size - 1 - padTop, padRight = (w - textX - width) / size
  const cut = { clipPath: `polygon(${points.join(', ')})`, padding: `${round(padTop)}em ${round(padRight)}em ${round(padBottom)}em ${round(textX / size)}em` }
  cuts.set(seed, cut)
  return cut
}

function drawTape() {
  $$('.tag').forEach((tag) => { const cut = tagCut(tag.dataset.seed || tag.textContent); tag.style.clipPath = cut.clipPath; tag.style.padding = cut.padding })
  $$('.tape').forEach(drawHeadline)
}

// ---------------------------------------------------------------------------
// Marks: the SVG files inlined so their colour follows the page

async function placeMarks() {
  const files = { 'logo-right': 'marks/logo-right.svg', 'logo-left': 'marks/logo-left.svg', 'swipe-arrow': 'marks/swipe-arrow.svg', dublin: 'marks/dublin.svg' }
  const svgs = {}
  await Promise.all(Object.entries(files).map(async ([name, file]) => { try { svgs[name] = (await (await fetch(file)).text()).replace(/<\?xml[^>]*>/, '').replace(/\sfill="[^"]*"/g, '').replace(/\sstyle="[^"]*"/g, '') } catch { svgs[name] = '' } }))
  $$('.mark').forEach((mark) => { mark.innerHTML = svgs[mark.dataset.mark] || '' })
}

// ---------------------------------------------------------------------------
// Export: the pages as PNG at their real size, the tokens as the file they came from

async function pagePng(sheet) {
  const page = $('.page', sheet)
  const height = page.classList.contains('ttv') ? 1920 : 1350
  return htmlToImage.toPng(page, { width: W, height, pixelRatio: 1, cacheBust: false, style: { transform: 'none' } })
}

async function exportPages() {
  const button = $('#export-pages'); button.disabled = true
  try {
    await document.fonts.ready
    const sheets = $$('.sheet')
    for (const [i, sheet] of sheets.entries()) {
      button.textContent = `Exporting ${i + 1} / ${sheets.length}…`
      const url = await pagePng(sheet)
      const a = document.createElement('a'); a.href = url; a.download = `board-${sheet.dataset.name}.png`; a.click()
      await new Promise((r) => setTimeout(r, 400))
    }
    say(`${sheets.length} pages exported at 1080 wide.`)
  } catch (error) { say(`Export failed: ${error.message}. Chrome exports most reliably.`) }
  finally { button.disabled = false; button.textContent = 'Export pages' }
}

/** The token file with the sliders' values written back. */
function tokensNow() {
  const out = structuredClone(tokens)
  const style = (name) => { for (const group of out.type.groups) for (const s of group.styles) if (s.name === name) return s }
  for (const control of controls) {
    const [kind, name, key] = control.path
    if (kind === 'type') {
      const s = style(name)
      if (key === 'fontSize') s.fontSize = `${control.value}px`
      else if (key === 'lineHeight') s.lineHeight = control.unit === 'px' ? `${control.value}px` : control.value
      else if (key === 'letterSpacing') s.letterSpacing = `${control.value}em`
      else if (key === 'fontWeight') s.fontWeight = control.value
    } else {
      const token = out[kind].tokens.find((t) => t.name === name)
      token.value = control.kind === 'color' ? control.value : kind === 'opacity' || kind === 'weight' ? String(control.value) : `${control.value}px`
    }
  }
  return out
}

function cssNow() { return `:root {\n${controls.map((c) => `  ${c.name}: ${css(c)};`).join('\n')}\n}\n` }

function download(text, filename, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000) }

let statusTimer = 0
function say(message) { const el = $('#status'); el.textContent = message; el.classList.add('on'); clearTimeout(statusTimer); statusTimer = setTimeout(() => el.classList.remove('on'), 4000) }

// ---------------------------------------------------------------------------

async function boot() {
  tokens = await (await fetch('ad-tokens.json')).json()
  $('#synced').textContent = `Every page kind, from ad-tokens.json (synced ${tokens.meta?.synced ?? '?'})`
  controls = controlsFrom(tokens)
  controls.forEach(apply)
  buildPanel()
  await placeMarks()
  await document.fonts.ready
  drawTape()
  $('#scale').addEventListener('input', (e) => document.documentElement.style.setProperty('--scale', e.target.value))
  $$('[data-skin]').forEach((box) => box.addEventListener('change', () => document.body.classList.toggle(`show-${box.dataset.skin}`, box.checked)))
  $('#reset-all').addEventListener('click', resetAll)
  $('#copy-css').addEventListener('click', async () => { try { await navigator.clipboard.writeText(cssNow()); say('The variables are on the clipboard.') } catch { say('Couldn’t reach the clipboard.') } })
  $('#download-tokens').addEventListener('click', () => { download(JSON.stringify(tokensNow(), null, 2) + '\n', 'ad-tokens.json', 'application/json'); say('ad-tokens.json downloaded: diff it against src/ad-tokens.json.') })
  $('#export-pages').addEventListener('click', exportPages)
  window.addEventListener('resize', scheduleTape)
  window.board = { drawTape, tokensNow, cssNow, pagePng, controls: () => controls }
}

boot().catch((error) => { say(`The board couldn’t start: ${error.message}`); console.error(error) })
