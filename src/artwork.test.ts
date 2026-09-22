import { describe, expect, it } from 'vitest'
import { BRAND, buildLayers, getPlacement, layersToSvg, svgMarkup } from './artwork'
import { buildShape } from './geometry'
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH, SAFE_MARGIN, defaults, sanitizeSettings } from './settings'
import type { GeneratorSettings, Point } from './types'

const settings: GeneratorSettings = { ...defaults, seed: 11 }
const labels = ['How to Make the', 'Most of a Weekend', 'Visit to Dublin']
const widths = [520, 560, 470]
const bounds = { ascent: 62, descent: 17 }
const eyebrow = { text: 'BREAKING', fontSize: 36, width: 170, originOffset: -2, capHeight: 25, descent: 0 }

function inside(point: Point, polygon: Point[]) {
  let hit = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]
    const b = polygon[j]
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}

describe('placement', () => {
  it('keeps text ink and the eyebrow inside the 80px safe area wherever the artwork is dragged', () => {
    const shape = buildShape({ ...settings, fontSize: 80 }, labels, widths, [], bounds, { eyebrow })
    for (const position of [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 100, y: 0 }, { x: 50, y: 50 }]) {
      const { x, y } = getPlacement(shape, position)
      const left = Math.min(...shape.lines.map((line) => line.inkX ?? line.x), shape.eyebrow!.box.x) + x
      const right = Math.max(...shape.lines.map((line) => (line.inkX ?? line.x) + line.width), shape.eyebrow!.box.x + shape.eyebrow!.box.width) + x
      expect(left).toBeGreaterThanOrEqual(SAFE_MARGIN - 0.01)
      expect(right).toBeLessThanOrEqual(ARTBOARD_WIDTH - SAFE_MARGIN + 0.01)
      expect(shape.inkBounds!.top + y).toBeGreaterThanOrEqual(SAFE_MARGIN - 0.01)
      expect(shape.inkBounds!.bottom + y).toBeLessThanOrEqual(ARTBOARD_HEIGHT - SAFE_MARGIN + 0.01)
      expect(shape.inkBounds!.top).toBeLessThanOrEqual(shape.eyebrow!.box.y)
    }
  })
})

describe('layers and SVG', () => {
  it('draws no tape for None, and flips the eyebrow to white on a yellow headline', () => {
    const shape = buildShape(settings, labels, widths, [], bounds, { eyebrow })
    const none = buildLayers(shape, { tone: 'none' }, 80)
    expect(none.filter((layer) => layer.kind === 'path')).toHaveLength(1)
    expect(none.filter((layer) => layer.kind === 'text' && layer.text !== 'BREAKING').every((layer) => layer.fill === BRAND.white)).toBe(true)
    const yellow = buildLayers(shape, { tone: 'yellow' }, 80)
    expect(yellow.find((layer) => layer.kind === 'path' && layer.d === shape.eyebrow!.path)?.fill).toBe(BRAND.white)
    expect(yellow.find((layer) => layer.kind === 'path' && layer.d === shape.path)?.fill).toBe(BRAND.yellow)
  })

  it('paints tape before any text so strips never cover letters', () => {
    const shape = buildShape({ ...settings, perLine: true }, labels, widths, [], bounds, { eyebrow })
    const kinds = buildLayers(shape, { tone: 'light' }, 80).map((layer) => layer.kind)
    expect(kinds.lastIndexOf('path')).toBeLessThan(kinds.indexOf('text'))
  })

  it('draws nothing for an empty headline instead of a stub of tape', () => {
    const shape = buildShape({ ...settings, perLine: true }, [' '], [12], [], bounds)
    expect(buildLayers(shape, { tone: 'light' }, 80)).toHaveLength(0)
  })

  it('escapes markup and drops control characters so exports stay valid XML', () => {
    const bell = String.fromCharCode(7)
    const svg = layersToSvg([{ kind: 'text', text: `Fish & <Chips> "5${bell}"`, x: 0, y: 0, size: 80, fill: '#111', angle: 0, cx: 0, cy: 0 }])
    expect(svg).toContain('Fish &amp; &lt;Chips&gt; "5"</text>')
    expect([...svg].every((character) => character.charCodeAt(0) >= 32)).toBe(true)
  })

  it('writes both href forms for photos and embeds font CSS when given', () => {
    const shape = buildShape(settings, labels, widths, [], bounds)
    const layers = buildLayers(shape, { tone: 'light' }, 80)
    const svg = svgMarkup(layers, shape, { background: 'photo', photo: 'data:image/jpeg;base64,AAA', fontCss: '@font-face{}' })
    expect(svg).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"')
    expect(svg).toContain('href="data:image/jpeg;base64,AAA" xlink:href="data:image/jpeg;base64,AAA"')
    expect(svg).toContain('<defs><style>@font-face{}</style></defs>')
  })
})

describe('settings', () => {
  it('replaces invalid or out-of-range stored values instead of trusting them', () => {
    const cleaned = sanitizeSettings({ style: 'poster', tone: 'red', fontSize: 200, hugStrength: 0.2, seed: -5, headline: 42, lineGap: Number.NaN, column: 'huge' })
    expect(cleaned.style).toBe(defaults.style)
    expect(cleaned.tone).toBe(defaults.tone)
    expect(cleaned.fontSize).toBe(90)
    expect(cleaned.hugStrength).toBe(0.82)
    expect(cleaned.seed).toBe(1)
    expect(cleaned.headline).toBe(defaults.headline)
    expect(cleaned.lineGap).toBe(defaults.lineGap)
    expect(cleaned.column).toBe(defaults.column)
  })
})

describe('connected joins', () => {
  it('never bend into the letters of the line that reaches further', () => {
    const cases = [
      { labels: ['A Long First Line Here', 'Short'], widths: [600, 220] },
      { labels: ['Short', 'A Long Second Line Here'], widths: [220, 600] },
      { labels: ['Medium Line', 'The Longest Line Of All', 'Tiny'], widths: [380, 620, 150] },
    ]
    for (const align of ['left', 'center', 'right'] as const) {
      for (const layout of cases) {
        for (let seed = 1; seed <= 30; seed += 1) {
          const shape = buildShape({ ...settings, mode: 'cling', align, perLine: false, fontSize: 80, seed }, layout.labels, layout.widths, [], bounds)
          shape.lines.forEach((line, index) => {
            const inkX = line.inkX ?? line.x
            const bands = []
            if (index < shape.lines.length - 1) bands.push(line.baseline + bounds.descent * 0.85)
            if (index > 0) bands.push(line.baseline - bounds.ascent * 0.85)
            for (const y of bands) {
              for (let x = inkX + 3; x <= inkX + line.width - 3; x += 6) {
                expect(inside({ x, y }, shape.points), `${align} seed ${seed} line ${index} at ${x},${y}`).toBe(true)
              }
            }
          })
        }
      }
    }
  })
})
