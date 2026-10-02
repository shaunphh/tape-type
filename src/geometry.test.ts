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
    const balanced = wrapText(text, 200, measure, true, { balance: true })
    expect(greedy).toEqual(['YAMAMORI IZAKAYA HAS', 'HELD ITS FINAL CLUB', 'NIGHT'])
    expect(balanced).toHaveLength(greedy.length)
    expect(Math.max(...balanced.map((line) => line.length)) - Math.min(...balanced.map((line) => line.length))).toBeLessThanOrEqual(4)
    expect(balanced.join(' ')).toBe(text)
    expect(wrapText('HOW TO MAKE THE MOST OF A WEEKEND VISIT TO DUBLIN', 130, measure, true, { balance: true }))
      .not.toContain('WEEKEND')
  })

  it('moves minor words to the end of a line when asked, instead of opening the next one', () => {
    const measure = (text: string) => text.length * 10
    const text = 'How to Make the Most of a Weekend Visit to Dublin'
    const lowercaseStart = (word: string) => /^[a-z]/.test(word)
    for (const width of [150, 180, 200, 240, 260]) {
      const plainBalance = wrapText(text, width, measure, true, { balance: true })
      const lines = wrapText(text, width, measure, true, { balance: true, avoidStart: lowercaseStart })
      expect(lines).toHaveLength(plainBalance.length)
      expect(lines.join(' ')).toBe(text)
      expect(lines.slice(1).filter((line) => lowercaseStart(line)), `width ${width}: ${lines.join(' / ')}`).toEqual([])
    }
  })

  it('balances a long pasted headline quickly (the search stops at the column edge)', () => {
    let calls = 0
    const measure = (text: string) => { calls += 1; return text.length * 10 }
    const text = Array.from({ length: 160 }, (_, index) => `word${index}`).join(' ')
    wrapText(text, 600, measure, true, { balance: true })
    expect(calls).toBeLessThan(160 * 12)
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
    const headline = buildShape({ ...base, perLine: true, mode: 'plain', seed: 7 }, layout.labels, layout.widths)
    const feature = buildShape({ ...base, style: 'feature', perLine: true, mode: 'plain', seed: 7 }, layout.labels, layout.widths)
    const leftPad = (shape: typeof headline) => (shape.strips![0].line.inkX ?? 0) - Math.min(...shape.strips![0].points.map((point) => point.x))
    const stripHeight = (shape: typeof headline) => Math.max(...shape.strips![0].points.map((point) => point.y)) - Math.min(...shape.strips![0].points.map((point) => point.y))
    expect(leftPad(feature)).toBeGreaterThan(leftPad(headline) * 2)
    expect(stripHeight(feature)).toBeGreaterThan(stripHeight(headline))
  })

  it('makes a plain block one rectangle as wide as the longest line, with a longer run-out after the text', () => {
    const layout = layouts[1]
    for (const align of ['left', 'center', 'right'] as const) {
      const shape = buildShape({ ...base, mode: 'plain', align, seed: 3 }, layout.labels, layout.widths)
      expect(shape.points).toHaveLength(4)
      const xs = shape.points.map((point) => point.x)
      const lead = Math.min(...shape.lines.map((line) => line.inkX ?? 0)) - Math.min(...xs)
      const trail = Math.max(...xs) - Math.max(...shape.lines.map((line) => (line.inkX ?? 0) + line.width))
      if (align === 'left') expect(trail).toBeGreaterThan(lead + 76 * 0.2)
      if (align === 'right') expect(lead).toBeGreaterThan(trail + 76 * 0.2)
      if (align === 'center') expect(Math.abs(lead - trail)).toBeLessThan(0.01)
    }
  })

  it('stacks headline strips flush at block pitch, but keeps gaps between feature strips', () => {
    const layout = layouts[2]
    const tops = (shape: ReturnType<typeof buildShape>) => shape.strips!.map((strip) => ({
      top: Math.min(...strip.points.map((point) => point.y)),
      bottom: Math.max(...strip.points.map((point) => point.y)),
    }))
    const headline = tops(buildShape({ ...base, perLine: true, mode: 'plain', seed: 2 }, layout.labels, layout.widths))
    const block = buildShape({ ...base, perLine: false, mode: 'plain', seed: 2 }, layout.labels, layout.widths)
    const strips = buildShape({ ...base, perLine: true, mode: 'plain', seed: 2 }, layout.labels, layout.widths)
    headline.slice(1).forEach((strip, index) => expect(strip.top).toBeLessThan(headline[index].bottom))
    strips.lines.forEach((line, index) => expect(line.baseline).toBeCloseTo(block.lines[index].baseline, 5))
    const feature = tops(buildShape({ ...base, style: 'feature', perLine: true, mode: 'torn', lineGap: 12, seed: 2 }, layout.labels, layout.widths))
    feature.slice(1).forEach((strip, index) => expect(strip.top - feature[index].bottom).toBeGreaterThan(8))
  })

  it('keeps a chosen cut when rotation or alignment changes', () => {
    const layout = layouts[3]
    for (let seed = 1; seed <= 40; seed += 1) {
      const still = buildShape({ ...base, perLine: true, mode: 'rough', seed }, layout.labels, layout.widths)
      const turned = buildShape({ ...base, perLine: true, mode: 'rough', rotationVariance: 1.2, seed }, layout.labels, layout.widths)
      still.strips!.forEach((strip, index) => expect(turned.strips![index].path).toBe(strip.path))
      const left = buildShape({ ...base, mode: 'cling', align: 'left', seed }, layout.labels, layout.widths)
      const centred = buildShape({ ...base, mode: 'cling', align: 'center', seed }, layout.labels, layout.widths)
      expect(centred.personality.split(' · ').slice(0, 2)).toEqual(left.personality.split(' · ').slice(0, 2))
    }
  })

  it('seats the eyebrow on top of the first line and inside the view box', () => {
    const layout = layouts[2]
    const eyebrow = { text: 'BREAKING', fontSize: 36, width: 160, originOffset: -2, capHeight: 25 }
    for (const perLine of [false, true]) {
      for (const align of ['left', 'center', 'right'] as const) {
        const plain = buildShape({ ...base, perLine, align, seed: 5 }, layout.labels, layout.widths)
        const shape = buildShape({ ...base, perLine, align, seed: 5 }, layout.labels, layout.widths, [], undefined, { eyebrow })
        const box = shape.eyebrow!.box
        expect(shape.path).toBe(plain.path)
        expect(box.y + box.height).toBeGreaterThanOrEqual(-0.5)
        expect(box.y + box.height).toBeLessThanOrEqual(1.5)
        expect(box.width).toBeCloseTo(160 + 36 * 0.9, 1)
        expect(shape.viewBox.y).toBeLessThan(box.y)
        expect(shape.viewBox.x).toBeLessThanOrEqual(box.x)
        expect(shape.viewBox.x + shape.viewBox.width).toBeGreaterThanOrEqual(box.x + box.width)
        expect(shape.eyebrow!.baseline).toBeCloseTo(box.y + 36 * 0.4 + 25, 1)
      }
    }
    const tapeless = buildShape({ ...base, seed: 5 }, layout.labels, layout.widths, [], undefined, { eyebrow, tapeless: true })
    expect(tapeless.eyebrow!.box.x).toBeCloseTo(tapeless.lines[0].inkX ?? 0, 5)
    expect(tapeless.eyebrow!.box.y + tapeless.eyebrow!.box.height).toBeLessThan(-76 * 0.4)
  })

  it('seats the eyebrow on the first line itself, never on a tab or raised corner, and turns it with its strip', () => {
    const eyebrow = { text: 'NEWS', fontSize: 40, width: 100, originOffset: -2, capHeight: 28 }
    for (const layout of layouts) {
      for (const mode of ['clean', 'tape', 'cling', 'rough'] as const) {
        for (let seed = 1; seed <= 60; seed += 1) {
          for (const perLine of [false, true]) {
            const shape = buildShape({ ...base, mode, perLine, rotationVariance: perLine ? 1 : 0, seed }, layout.labels, layout.widths, [], undefined, { eyebrow })
            const { anchor } = shape
            const box = shape.eyebrow!.box
            // Left aligned: the tag's left edge sits just past the tape's own left edge (a small overhang only).
            expect(box.x, `${mode} ${perLine} ${seed}`).toBeLessThanOrEqual(anchor!.left + 0.01)
            expect(box.x, `${mode} ${perLine} ${seed}`).toBeGreaterThan(anchor!.left - 40 * 0.15)
            expect(box.y + box.height).toBeCloseTo(anchor!.top + 1, 1)
            expect(shape.eyebrow!.angle).toBe(perLine ? shape.strips![0].angle : 0)
          }
        }
      }
    }
  })

  it('never lets a cut uncover a letter, for any cut, style or layout (at 100% cling or looser)', () => {
    const inside = (point: { x: number; y: number }, polygon: { x: number; y: number }[]) => {
      let hit = false
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
        const a = polygon[i]
        const b = polygon[j]
        if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) hit = !hit
      }
      return hit
    }
    const bounds = { ascent: 55, descent: 16 }
    for (const style of ['headline', 'feature'] as const) {
      for (const mode of ['clean', 'tape', 'cling', 'rough', 'torn'] as const) {
        for (const perLine of [false, true]) {
          for (const layout of layouts) {
            for (let seed = 1; seed <= 16; seed += 1) {
              const shape = buildShape({ ...base, style, mode, perLine, align: seed % 3 === 0 ? 'center' : seed % 3 === 1 ? 'left' : 'right', seed }, layout.labels, layout.widths, [], bounds)
              shape.lines.forEach((line, index) => {
                const polygon = shape.strips ? shape.strips[index].points : shape.points
                const left = (line.inkX ?? line.x) + 1.5
                for (const y of [line.baseline - bounds.ascent * 0.92, line.baseline - bounds.ascent * 0.5, line.baseline + bounds.descent * 0.85]) {
                  for (let x = left; x < left + line.width - 3; x += 7) {
                    expect(inside({ x, y }, polygon), `${style} ${mode} ${perLine ? 'strips' : 'block'} seed ${seed} line ${index} at ${Math.round(x)},${Math.round(y)}`).toBe(true)
                  }
                }
              })
            }
          }
        }
      }
    }
  }, 30000)

  it('cuts the eyebrow tag like a label: inside its box, lettering uncovered, the foot flat on the tape', () => {
    const inside = (point: { x: number; y: number }, polygon: { x: number; y: number }[]) => {
      let hit = false
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
        const a = polygon[i]
        const b = polygon[j]
        if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) hit = !hit
      }
      return hit
    }
    let cut = 0
    let runs = 0
    for (const eyebrow of [
      { text: 'NEWS', fontSize: 40, width: 100, originOffset: -2, capHeight: 28 },
      { text: 'WHAT’S ON THIS WEEK', fontSize: 36, width: 380, originOffset: -1, capHeight: 25 },
    ]) {
      for (const align of ['left', 'center', 'right'] as const) {
        for (let seed = 1; seed <= 40; seed += 1) {
          const shape = buildShape({ ...base, align, seed }, layouts[1].labels, layouts[1].widths, [], undefined, { eyebrow })
          const { box, points } = shape.eyebrow!
          runs += 1
          if (points.length !== 4 || new Set(points.map((point) => point.x)).size > 2) cut += 1
          for (const point of points) {
            expect(point.x).toBeGreaterThanOrEqual(box.x - 0.01)
            expect(point.x).toBeLessThanOrEqual(box.x + box.width + 0.01)
            expect(point.y).toBeGreaterThanOrEqual(box.y - 0.01)
            expect(point.y).toBeLessThanOrEqual(box.y + box.height + 0.01)
          }
          // The lettering's box stays on the tag.
          const padX = eyebrow.fontSize * 0.45
          const top = box.y + eyebrow.fontSize * 0.4
          for (const y of [top, top + eyebrow.capHeight / 2, top + eyebrow.capHeight]) {
            for (let x = box.x + padX; x <= box.x + box.width - padX; x += 6) expect(inside({ x, y }, points), `${align} ${seed} ${eyebrow.text}`).toBe(true)
          }
          // Most of the foot is a straight line along the bottom, where it meets the tape.
          const foot = box.y + box.height
          let span = 0
          points.forEach((point, index) => {
            const next = points[(index + 1) % points.length]
            if (Math.abs(point.y - foot) < 0.02 && Math.abs(next.y - foot) < 0.02) span += Math.abs(next.x - point.x)
          })
          expect(span, `${align} ${seed} ${eyebrow.text}`).toBeGreaterThan(box.width * 0.8)
        }
      }
    }
    // A cut, not a rectangle, nearly every time.
    expect(cut / runs).toBeGreaterThan(0.9)
  })

  it('keeps the eyebrow lettering inside the headline lettering on left and right aligned covers', () => {
    const eyebrow = { text: 'NEWS', fontSize: 40, width: 100, originOffset: -2, capHeight: 28 }
    for (const style of ['headline', 'feature'] as const) {
      for (const align of ['left', 'right'] as const) {
        for (const layout of layouts) {
          const shape = buildShape({ ...base, style, align, perLine: true, mode: style === 'feature' ? 'torn' : 'plain', seed: 9 }, layout.labels, layout.widths, [], undefined, { eyebrow })
          const inkLeft = Math.min(...shape.lines.map((line) => line.inkX ?? 0))
          const inkRight = Math.max(...shape.lines.map((line) => (line.inkX ?? 0) + line.width))
          const { box } = shape.eyebrow!
          const padX = 40 * 0.45
          if (align === 'left') expect(box.x + padX).toBeGreaterThanOrEqual(inkLeft - 0.01)
          else expect(box.x + box.width - padX).toBeLessThanOrEqual(inkRight + 0.01)
        }
      }
    }
  })
})
