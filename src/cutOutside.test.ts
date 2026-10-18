import { describe, expect, it } from 'vitest'
import { buildShape } from './geometry'
import { defaults } from './settings'
import type { GeneratorSettings, Point } from './types'

// Cuts that only add (18 Oct 2026): with `cutOutside` a tag's tape keeps its padding whole on every seed,
// whatever the cut. Feature padding is 0.3em at the sides and 0.2em above and below (geometry.ts).
const PAD = { x: 0.3, y: 0.2 }

function inside(point: Point, polygon: Point[]) {
  let hit = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j]
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}

/** Every point a hair inside the box's outline lies in the polygon. */
function keeps(box: { left: number; right: number; top: number; bottom: number }, polygon: Point[]) {
  const inset = 0.05
  for (let x = box.left + inset; x <= box.right - inset; x += 0.5) {
    if (!inside({ x, y: box.top + inset }, polygon) || !inside({ x, y: box.bottom - inset }, polygon)) return false
  }
  for (let y = box.top + inset; y <= box.bottom - inset; y += 0.5) {
    if (!inside({ x: box.left + inset, y }, polygon) || !inside({ x: box.right - inset, y }, polygon)) return false
  }
  return true
}

function paddedBoxes(settings: GeneratorSettings, shape: ReturnType<typeof buildShape>, ascent: number, descent: number) {
  const size = settings.fontSize
  const lines = shape.lines
  return lines.map((line, index) => {
    const inkX = line.inkX ?? line.x
    const box = { left: inkX - PAD.x * size, right: inkX + line.width + PAD.x * size, top: line.baseline - ascent - PAD.y * size, bottom: line.baseline + descent + PAD.y * size }
    if (shape.strips) return box
    // In a block the lines' tape meets halfway between them: each line's box is checked within its own band.
    const above = lines[index - 1], below = lines[index + 1]
    return {
      ...box,
      top: above ? (above.baseline + descent + line.baseline - ascent) / 2 : box.top,
      bottom: below ? (line.baseline + descent + below.baseline - ascent) / 2 : box.bottom,
    }
  })
}

const tag = (seed: number, extra: Partial<GeneratorSettings> = {}): GeneratorSettings => ({ ...defaults, headline: 'BREAKING', style: 'feature', perLine: false, align: 'left', mode: 'clean', preferredEdge: 'right', seed, fontSize: 44, hugStrength: 1, rotationVariance: 0, cutOutside: true, ...extra })

function count(settingsFor: (seed: number) => GeneratorSettings, labels: string[], widths: number[], seeds = 500) {
  const ascent = 31, descent = 0.9
  let kept = 0
  for (let n = 1; n <= seeds; n += 1) {
    const settings = settingsFor((n * 2654435761) % 4294967295 || 1)
    const shape = buildShape(settings, labels, widths, [], { ascent, descent })
    const boxes = paddedBoxes(settings, shape, ascent, descent)
    const polygons = shape.strips ? shape.strips.map((strip) => strip.points) : boxes.map(() => shape.points)
    if (boxes.every((box, index) => keeps(box, polygons[index]))) kept += 1
  }
  return kept
}

describe('cuts that only add', () => {
  it('a tag keeps its padding whole on every seed, where the plain clean cut bites in on many', () => {
    expect(count((seed) => tag(seed), ['BREAKING'], [300])).toBe(500)
    expect(count((seed) => tag(seed, { cutOutside: false }), ['BREAKING'], [300])).toBeLessThan(400)
  })

  it('holds with the cut left to land on any side, as a page number has it', () => {
    expect(count((seed) => tag(seed, { preferredEdge: 'auto' }), ['02'], [60])).toBe(500)
  })

  it('holds on separate strips and on a block of lines', () => {
    expect(count((seed) => tag(seed, { perLine: true, lineGap: 12 }), ['MEET THE', 'ARTISTS'], [220, 190])).toBe(500)
    expect(count((seed) => tag(seed, { preferredEdge: 'auto' }), ['MEET THE', 'ARTISTS'], [220, 190])).toBe(500)
  })
})
