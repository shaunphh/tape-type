import { describe, expect, it } from 'vitest'
import { bearingsOf, measureInk } from './metrics'

// Canvas stand-in: reports only the advance width and heights, like Safari's box.
const context = (advance: number) => ({
  measureText: () => ({ width: advance, actualBoundingBoxAscent: 63, actualBoundingBoxDescent: 0 }),
}) as unknown as CanvasRenderingContext2D

describe('ink metrics from the font', () => {
  it('knows Barlow’s side bearings in both weights', () => {
    expect(bearingsOf('H', 700)[0]).toBe(61)
    expect(bearingsOf('j', 700)[0]).toBeLessThan(0)
    expect(bearingsOf('H', 900)[0]).toBeGreaterThan(0)
    expect(bearingsOf('ő', 700)[0]).not.toBe(0)
    expect(bearingsOf('ệ', 900)[0]).not.toBe(0)
    expect(bearingsOf(' ', 700)).toEqual([0, 0])
  })

  it('turns an advance width into the ink width, whatever the browser reports as the box', () => {
    const [left, right] = bearingsOf('H', 700)
    const ink = measureInk(context(56.52), 'H', 700, 90)
    expect(ink.width).toBeCloseTo(56.52 - (left + right) * 0.09, 5)
    expect(ink.originOffset).toBeCloseTo(-left * 0.09, 5)
    expect(ink.ascent).toBe(63)
  })

  it('measures from the first and last letters, skipping combining marks', () => {
    const plain = measureInk(context(300), 'Dublin', 700, 90)
    const accented = measureInk(context(300), `Dublin${String.fromCharCode(0x301)}`, 700, 90)
    expect(accented.width).toBeCloseTo(plain.width, 5)
  })
})
