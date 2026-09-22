import { PACKED_BEARINGS, UNITS_PER_EM } from './barlowBearings'

export interface InkMetrics {
  /** Width of the ink, from the left edge of the first letter to the right edge of the last. */
  width: number
  /** How far the ink starts left of the text origin (negative when it starts to the right), like actualBoundingBoxLeft. */
  originOffset: number
  ascent: number
  descent: number
}

const tables = new Map<number, Map<number, readonly [number, number]>>()

function bearingTable(weight: number) {
  let table = tables.get(weight)
  if (!table) {
    table = new Map()
    for (const entry of (PACKED_BEARINGS[weight] ?? '').split(',')) {
      const [code, left, right] = entry.split(':')
      if (code) table.set(parseInt(code, 36), [Number(left), Number(right)])
    }
    tables.set(weight, table)
  }
  return table
}

/** Left and right side bearings of one character in font units, or zeros if Barlow has no outline for it. */
export function bearingsOf(character: string, weight: number): readonly [number, number] {
  return bearingTable(weight).get(character.codePointAt(0) ?? 0) ?? [0, 0]
}

const isMark = (character: string) => /\p{M}/u.test(character)

/**
 * Ink extent of a line of Barlow, measured the same way in every browser.
 *
 * The advance width (kerning included) comes from canvas, which all engines agree on. The side
 * bearings of the first and last letters come from the font itself: canvas actualBoundingBoxLeft
 * and Right differ between engines (Safari reports the advance box, not the ink), which made the
 * same headline get a looser tape and different line breaks in Safari. Heights still come from
 * canvas, where the engines agree. `context.font` must already be set to the weight and size.
 */
export function measureInk(context: CanvasRenderingContext2D, text: string, weight: number, size: number): InkMetrics {
  const metrics = context.measureText(text)
  const characters = [...text]
  const first = characters.find((character) => !isMark(character))
  const last = characters.reverse().find((character) => !isMark(character))
  const scale = size / UNITS_PER_EM
  const left = first ? bearingsOf(first, weight)[0] * scale : 0
  const right = last ? bearingsOf(last, weight)[1] * scale : 0
  return {
    width: Math.max(1, metrics.width - left - right),
    originOffset: -left,
    ascent: metrics.actualBoundingBoxAscent || 0,
    descent: metrics.actualBoundingBoxDescent || 0,
  }
}
