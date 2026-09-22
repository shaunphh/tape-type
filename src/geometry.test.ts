import { describe, expect, it } from 'vitest'
import { buildShape, coverSizeFromCharacters, hasSelfIntersection, wrapText } from './geometry'
import type { GeneratorSettings } from './types'

const base: GeneratorSettings = {
  headline: '', style: 'headline', titleCase: true, tone: 'light', eyebrowEnabled: false, eyebrow: '',
  coverFormat: 'regular', column: 'narrow', autoSize: true, fontSize: 76, align: 'left', autoWrap: true, perLine: false,
  rotationVariance: 0, lineGap: 2, hugStrength: 1, preferredEdge: 'auto', mode: 'cling', seed: 1, seedLocked: false,
}

const layouts = [
  { labels: ['DUBLIN GETS A NEW', 'NIGHT MARKET'], widths: [390, 270] },
  { labels: ['A MASSIVE NIGHT MARKET', 'IS COMING TO SMITHFIELD', 'THIS WEEKEND'], widths: [520, 500, 280] },
  { labels: ['HOW TO MAKE THE MOST', 'OF A WEEKEND VISIT', 'TO DUBLIN'], widths: [490, 430, 220] },
  { labels: ['ONE OF DUBLIN’S BEST-KNOWN', 'INDEPENDENT CINEMAS HAS', 'ANNOUNCED IT’S CLOSING'], widths: [610, 550, 490] },
]

describe('shape geometry', () => {
  it('generates 80 controlled variations without clipping or self-intersection', () => {
    for (const mode of ['clean', 'tape', 'cling', 'rough', 'torn'] as const) {
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

  it('balances lines instead of stranding the last word', () => {
    const measure = (text: string) => text.length * 10
    const text = 'YAMAMORI IZAKAYA HAS HELD ITS FINAL CLUB NIGHT'
    const greedy = wrapText(text, 200, measure, true)
    const balanced = wrapText(text, 200, measure, true, true)
    expect(greedy).toEqual(['YAMAMORI IZAKAYA HAS', 'HELD ITS FINAL CLUB', 'NIGHT'])
    expect(balanced).toHaveLength(greedy.length)
    expect(Math.max(...balanced.map((line) => line.length)) - Math.min(...balanced.map((line) => line.length))).toBeLessThanOrEqual(4)
    expect(balanced.join(' ')).toBe(text)
    expect(wrapText('HOW TO MAKE THE MOST OF A WEEKEND VISIT TO DUBLIN', 130, measure, true, true))
      .not.toContain('WEEKEND')
  })

  it('maps cover character counts into the approved 72–90px range', () => {
    expect(coverSizeFromCharacters('A'.repeat(30))).toBe(90)
    expect(coverSizeFromCharacters('A'.repeat(45))).toBe(81)
    expect(coverSizeFromCharacters('A'.repeat(60))).toBe(72)
    expect(coverSizeFromCharacters('A'.repeat(90))).toBe(72)
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

  it('supports over-cling that reaches into the measured glyph bounds', () => {
    const layout = layouts[2]
    const standard = buildShape({ ...base, perLine: true, hugStrength: 1, seed: 92831 }, layout.labels, layout.widths)
    const cropped = buildShape({ ...base, perLine: true, hugStrength: 1.16, seed: 92831 }, layout.labels, layout.widths)
    expect(cropped.viewBox.width).toBeLessThan(standard.viewBox.width)
    expect(cropped.viewBox.height).toBeLessThan(standard.viewBox.height)
    expect(cropped.strips?.every((strip) => !hasSelfIntersection(strip.points))).toBe(true)
  })

  it('tears feature strip ends without self-intersection and keeps text inside each strip', () => {
    for (const layout of layouts) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const shape = buildShape({ ...base, style: 'feature', mode: 'torn', perLine: true, align: 'center', seed }, layout.labels, layout.widths)
        shape.strips?.forEach((strip) => {
          expect(hasSelfIntersection(strip.points), `seed ${seed}`).toBe(false)
          const xs = strip.points.map((point) => point.x)
          expect(Math.min(...xs)).toBeLessThan(strip.line.inkX ?? strip.line.x)
          expect(Math.max(...xs)).toBeGreaterThan((strip.line.inkX ?? strip.line.x) + strip.line.width)
        })
      }
    }
  })

  it('gives feature strips roomier padding than headline strips', () => {
    const layout = layouts[1]
    const headline = buildShape({ ...base, perLine: true, mode: 'clean', seed: 7 }, layout.labels, layout.widths)
    const feature = buildShape({ ...base, style: 'feature', perLine: true, mode: 'clean', seed: 7 }, layout.labels, layout.widths)
    expect(feature.viewBox.width).toBeGreaterThan(headline.viewBox.width + 10)
    expect(feature.viewBox.height).toBeGreaterThan(headline.viewBox.height)
  })

  it('seats the eyebrow on top of the first line and inside the view box', () => {
    const layout = layouts[2]
    const eyebrow = { text: 'BREAKING', fontSize: 36, width: 160, originOffset: -2, capHeight: 25, descent: 0 }
    for (const perLine of [false, true]) {
      for (const align of ['left', 'center', 'right'] as const) {
        const plain = buildShape({ ...base, perLine, align, seed: 5 }, layout.labels, layout.widths)
        const shape = buildShape({ ...base, perLine, align, seed: 5 }, layout.labels, layout.widths, [], undefined, { eyebrow })
        const box = shape.eyebrow!.box
        expect(shape.path).toBe(plain.path)
        expect(box.y + box.height).toBeGreaterThanOrEqual(-0.5)
        expect(box.y + box.height).toBeLessThanOrEqual(1.5)
        expect(box.width).toBeCloseTo(160 + 36 * 0.6, 1)
        expect(shape.viewBox.y).toBeLessThan(box.y)
        expect(shape.viewBox.x).toBeLessThanOrEqual(box.x)
        expect(shape.viewBox.x + shape.viewBox.width).toBeGreaterThanOrEqual(box.x + box.width)
        expect(shape.eyebrow!.baseline).toBeCloseTo(box.y + 36 * 0.2 + 25, 1)
      }
    }
    const tapeless = buildShape({ ...base, seed: 5 }, layout.labels, layout.widths, [], undefined, { eyebrow, tapeless: true })
    expect(tapeless.eyebrow!.box.x).toBeCloseTo(tapeless.lines[0].inkX ?? 0, 5)
    expect(tapeless.eyebrow!.box.y + tapeless.eyebrow!.box.height).toBeLessThan(0)
  })
})
