import { describe, expect, it } from 'vitest'
import { buildShape, hasSelfIntersection, wrapText } from './geometry'
import type { GeneratorSettings } from './types'

const base: GeneratorSettings = {
  headline: '', uppercase: false, font: 'Barlow Condensed', weight: 800, fontSize: 76, lineHeight: 0.9,
  maxWidth: 570, align: 'left', autoWrap: true, perLine: false, rotationVariance: 0, lineGap: 2, horizontalPadding: 14,
  verticalPadding: 8, irregularity: 46, angleSize: 26, hugStrength: 1,
  joinStyle: 'angled', preferredEdge: 'auto', mode: 'cling', shapeColor: '#FFF418',
  textColor: '#202020', seed: 1, seedLocked: false,
}

const layouts = [
  { labels: ['DUBLIN GETS A NEW', 'NIGHT MARKET'], widths: [390, 270] },
  { labels: ['A MASSIVE NIGHT MARKET', 'IS COMING TO SMITHFIELD', 'THIS WEEKEND'], widths: [520, 500, 280] },
  { labels: ['HOW TO MAKE THE MOST', 'OF A WEEKEND VISIT', 'TO DUBLIN'], widths: [490, 430, 220] },
  { labels: ['ONE OF DUBLIN’S BEST-KNOWN', 'INDEPENDENT CINEMAS HAS', 'ANNOUNCED IT’S CLOSING'], widths: [610, 550, 490] },
]

describe('shape geometry', () => {
  it('generates 80 controlled variations without clipping or self-intersection', () => {
    for (const mode of ['clean', 'tape', 'cling', 'rough'] as const) {
      for (const layout of layouts) {
        for (let seed = 1; seed <= 20; seed += 1) {
          const shape = buildShape({ ...base, mode, seed }, layout.labels, layout.widths)
          expect(hasSelfIntersection(shape.points), `${mode} seed ${seed}`).toBe(false)
          for (const point of shape.points) {
            expect(point.x).toBeGreaterThanOrEqual(shape.viewBox.x)
            expect(point.x).toBeLessThanOrEqual(shape.viewBox.x + shape.viewBox.width)
            expect(point.y).toBeGreaterThanOrEqual(shape.viewBox.y)
            expect(point.y).toBeLessThanOrEqual(shape.viewBox.y + shape.viewBox.height)
          }
          expect(shape.path).toMatch(/^M .+ Z$/)
          expect(shape.lines).toHaveLength(layout.labels.length)
        }
      }
    }
  })

  it('wraps on words while preserving manual paragraph breaks', () => {
    const measure = (text: string) => text.length * 10
    expect(wrapText('ONE TWO THREE\nFOUR', 75, measure, true)).toEqual(['ONE TWO', 'THREE', 'FOUR'])
    expect(wrapText('ONE TWO\nTHREE', 20, measure, false)).toEqual(['ONE TWO', 'THREE'])
  })

  it('uses seeds to produce structurally different compositions', () => {
    const layout = layouts[2]
    const shapes = Array.from({ length: 30 }, (_, index) => {
      return buildShape({ ...base, seed: index + 100 }, layout.labels, layout.widths)
    })
    expect(new Set(shapes.map((shape) => shape.personality)).size).toBeGreaterThanOrEqual(10)
    expect(new Set(shapes.map((shape) => shape.path)).size).toBe(30)
    expect(new Set(shapes.map((shape) => shape.personality.match(/line (\d+)/)?.[1])).size).toBeGreaterThanOrEqual(2)
    expect(new Set(shapes.map((shape) => shape.personality.match(/(square|angled|stepped|tucked) join/)?.[1])).size).toBe(4)
  })

  it('builds independent, restrained tape strips per line', () => {
    const layout = layouts[2]
    const shape = buildShape({ ...base, perLine: true, rotationVariance: 1.4, seed: 92831 }, layout.labels, layout.widths)
    expect(shape.strips).toHaveLength(layout.labels.length)
    expect(shape.strips?.every((strip) => !hasSelfIntersection(strip.points))).toBe(true)
    expect(shape.strips?.every((strip) => Math.abs(strip.angle) <= 1.4)).toBe(true)
    expect(new Set(shape.strips?.map((strip) => strip.angle)).size).toBeGreaterThan(1)
    expect(shape.viewBox.width).toBeGreaterThan(0)
    expect(shape.viewBox.height).toBeGreaterThan(0)
  })
})
