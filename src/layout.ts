import { EYEBROW_PADDING, coverSizeFromCharacters, wrapText } from './geometry'
import type { InkMetrics } from './metrics'
import { TEXT_AREA_WIDTH, columnWidth } from './settings'
import { startsLowercase } from './text'
import type { ColumnWidth, CoverFormat, CoverStyle, EyebrowMetrics } from './types'

// Every cover is set in Barlow Bold: one weight across posts, videos and both styles. (The
// published feature covers measured as Black: stems 0.27 of the cap height, where Bold is 0.20.)
export const HEADLINE_WEIGHT = 700
export const FEATURE_WEIGHT = 700
export const EYEBROW_WEIGHT = 700
export const weightFor = (style: CoverStyle) => (style === 'feature' ? FEATURE_WEIGHT : HEADLINE_WEIGHT)

const MIN_SIZE = 72
const MAX_SIZE = 90
const SERIES_SIZE = 172
const EYEBROW_MIN_SIZE = 26
/** The published labels are set at about 40px whatever the headline size. */
export const eyebrowSizeFor = (headlineSize: number) => Math.round(Math.min(46, Math.max(38, headlineSize * 0.52)))

export type Measure = (text: string, size: number, weight: number) => InkMetrics
export type OverflowReason = 'lines' | 'width' | 'eyebrow'

export interface LayoutInput {
  /** Display text: normalised, cased for its style, one paragraph per line. */
  text: string
  style: CoverStyle
  titleCase: boolean
  coverFormat: CoverFormat
  column: ColumnWidth
  autoSize: boolean
  fontSize: number
  autoWrap: boolean
  /** Normalised eyebrow text, or '' when the eyebrow is off. */
  eyebrow: string
}

export interface HeadlineLayout {
  labels: string[]
  widths: number[]
  originOffsets: number[]
  ascent: number
  descent: number
  fontSize: number
  weight: number
  characterCount: number
  /** Lines the writer typed (paragraphs), which wrapping can split but never join. */
  paragraphs: number
  maxLines: number
  measureWidth: number
  overflow: OverflowReason | null
  empty: boolean
  eyebrow?: EyebrowMetrics
}

/** Sizes, wraps and checks a headline (and its eyebrow) against the brand rules. Pure, so it can be tested with a fake measure. */
export function layoutHeadline(input: LayoutInput, measure: Measure): HeadlineLayout {
  const caps = input.style === 'feature'
  const weight = weightFor(input.style)
  const series = input.coverFormat === 'series'
  const maxLines = series ? 2 : 6
  const measureWidth = series ? TEXT_AREA_WIDTH : columnWidth(input.column)
  const text = input.text
  const characterCount = text.replace(/\s+/g, ' ').trim().length
  // In Title Case the only lowercase words are the minor ones; published covers end lines with them.
  const avoidStart = !caps && input.titleCase ? startsLowercase : undefined

  const wrapAt = (size: number, balance: boolean) => wrapText(
    text || ' ',
    measureWidth,
    (value) => measure(value, size, weight).width,
    input.autoWrap,
    { balance, avoidStart },
  )
  const fits = (lines: string[], size: number) =>
    lines.length <= maxLines && lines.every((line) => measure(line, size, weight).width <= measureWidth)

  let fontSize: number
  if (series) {
    fontSize = SERIES_SIZE
  } else if (!input.autoSize) {
    fontSize = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(input.fontSize)))
  } else {
    // Features start at full size; headlines start from the character-count ramp. Both shrink only to fit.
    fontSize = caps ? MAX_SIZE : coverSizeFromCharacters(text)
    while (fontSize > MIN_SIZE && !fits(wrapAt(fontSize, false), fontSize)) fontSize -= 1
    // Give up a few pixels when that saves a whole line, as the published covers do.
    const lineCount = wrapAt(fontSize, false).length
    for (let smaller = fontSize - 1; smaller >= Math.max(MIN_SIZE, fontSize - 4); smaller -= 1) {
      const candidate = wrapAt(smaller, false)
      if (candidate.length < lineCount && fits(candidate, smaller)) {
        fontSize = smaller
        break
      }
    }
  }

  // Balancing only moves breaks (never adds lines), so it runs once, at the chosen size.
  let labels = wrapAt(fontSize, true)
  // When a minor word would still have to open a line, a few pixels smaller usually gives a clean break.
  if (avoidStart && input.autoSize && !series && labels.slice(1).some(startsLowercase)) {
    for (let smaller = fontSize - 1; smaller >= Math.max(MIN_SIZE, fontSize - 8); smaller -= 1) {
      const candidate = wrapAt(smaller, true)
      if (candidate.length <= labels.length && fits(candidate, smaller) && !candidate.slice(1).some(startsLowercase)) {
        fontSize = smaller
        labels = candidate
        break
      }
    }
  }
  const metrics = labels.map((label) => measure(label, fontSize, weight))
  // Capitals have no descenders, so feature strips are balanced on cap height rather than on "g/j".
  const reference = measure(caps ? 'H' : 'Hgj', fontSize, weight)
  const ascent = Math.max(reference.ascent || fontSize * 0.72, ...metrics.map((metric) => metric.ascent))
  const descent = Math.max(caps ? fontSize * 0.02 : reference.descent || fontSize * 0.16, ...metrics.map((metric) => metric.descent))

  let overflow: OverflowReason | null = null
  if (text) {
    if (labels.length > maxLines) overflow = 'lines'
    else if (metrics.some((metric) => metric.width > measureWidth)) overflow = 'width'
  }

  let eyebrow: EyebrowMetrics | undefined
  if (input.eyebrow && text) {
    // A long label shrinks until its tag fits the safe area, and blocks export if it still can't.
    const tagWidth = (size: number) => measure(input.eyebrow, size, EYEBROW_WEIGHT).width + 2 * EYEBROW_PADDING.x * size
    let size = eyebrowSizeFor(fontSize)
    while (size > EYEBROW_MIN_SIZE && tagWidth(size) > TEXT_AREA_WIDTH) size -= 1
    const ink = measure(input.eyebrow, size, EYEBROW_WEIGHT)
    eyebrow = {
      text: input.eyebrow,
      fontSize: size,
      width: ink.width,
      originOffset: ink.originOffset,
      capHeight: measure('H', size, EYEBROW_WEIGHT).ascent || size * 0.7,
    }
    if (!overflow && tagWidth(size) > TEXT_AREA_WIDTH) overflow = 'eyebrow'
  }

  return {
    labels,
    widths: metrics.map((metric) => metric.width),
    originOffsets: metrics.map((metric) => metric.originOffset),
    ascent,
    descent,
    fontSize,
    weight,
    characterCount,
    paragraphs: text ? text.split('\n').length : 0,
    maxLines,
    measureWidth,
    overflow,
    empty: !text,
    eyebrow,
  }
}
