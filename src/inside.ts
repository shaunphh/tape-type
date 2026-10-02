import { BRAND, buildLayers, drawLayers, escapeAttribute, layersToSvg, type Layer } from './artwork'
import type { Box, ColourChoice, LogoSide } from './furniture'
import { buildShape, wrapText } from './geometry'
import { lockedLineGap } from './locks'
import type { InkMetrics } from './metrics'
import { photoRect, type PhotoView } from './photo'
import { POST_FRAME, defaults } from './settings'
import { cleanText, normaliseEyebrow, normaliseHeadline } from './text'
import type { GeneratorSettings, ShapeMode } from './types'
import { AD_COLOR, AD_SIZE, AD_SPACE, AD_TYPE } from './adTokens'

/**
 * The inside page of a post: a picture, a tape label, a title, the story, then the details
 * (dates, place, tickets). It follows the article pages of the Alternative Dublin social
 * templates: the same margins, sizes and greys. Everything under the title is one size, and
 * what matters more or less is told apart by weight alone.
 */
export type ImageHeight = 'none' | 'short' | 'medium' | 'tall' | 'fill'
export const IMAGE_HEIGHTS: Record<Exclude<ImageHeight, 'fill'>, number> = { none: 0, short: 340, medium: 430, tall: AD_SPACE.pictureHeight }
/** A picture that fills takes the room the words leave, and the words leave it at least this much. */
export const FILL_SMALLEST = 260
const IMAGE_CHOICES: readonly ImageHeight[] = ['none', 'short', 'medium', 'tall', 'fill']
/**
 * How tall a page's picture is: one of the heights above, or a height of its own in pixels, set by
 * dragging the picture's edge. A height of its own is never less than a picture that fills.
 */
export type PictureHeight = ImageHeight | number
const TALLEST_OWN = POST_FRAME.height
/** The height a picture is measured at: a picture that fills starts at its smallest. */
export const heightOf = (image: PictureHeight) => (typeof image === 'number' ? image : image === 'fill' ? FILL_SMALLEST : IMAGE_HEIGHTS[image])

/**
 * The height a dragged edge asks for, as the page will have it: kept between the smallest picture
 * and the tallest the words leave room for, taking a set height or Fill when it comes within `snap`
 * of one. Dragged all the way, the picture fills, so it goes on filling as the words change.
 */
export function pictureAt(wanted: number, tallest: number, snap: number): PictureHeight {
  const most = Math.max(FILL_SMALLEST, tallest)
  const height = Math.round(Math.min(most, Math.max(FILL_SMALLEST, wanted)))
  const stops: [number, PictureHeight][] = [[IMAGE_HEIGHTS.short, 'short'], [IMAGE_HEIGHTS.medium, 'medium'], [IMAGE_HEIGHTS.tall, 'tall'], [most, 'fill']]
  const near = stops
    .filter(([at]) => at <= most && Math.abs(at - height) <= snap)
    .sort((one, other) => Math.abs(one[0] - height) - Math.abs(other[0] - height))[0]
  return near ? near[1] : height
}
/**
 * Where the picture goes. In the middle it follows the first thing on the page: the title, or
 * the story if there is no title.
 */
export type PicturePosition = 'top' | 'middle' | 'bottom'

/** A page opens with a title or with a label: one or the other, not both. */
export type PageKind = 'title' | 'label'

/** A box of words is set in the grey, or in the title's white. */
export type TextTone = 'grey' | 'light'
export const TONES: Record<TextTone, string> = { grey: AD_COLOR.greyOnDark, light: BRAND.light }

/** What each kind of page keeps to itself: its words, how they are set, its picture's place and its arrow. */
export interface PageWords {
  /** A small tape label, set in capitals. Empty for none. */
  label: string
  title: string
  body: string
  /** The highlight: a closing line, or the date and place. White, under the story. */
  details: string
  /** The highlight is set a size up. */
  large: boolean
  /** The story is set a size up. */
  bodyLarge: boolean
  /** The highlight stands at the foot of the words' room, not straight under the story. */
  pinned: boolean
  /** What the story and the highlight are set in: grey and white to start with. */
  bodyTone: TextTone
  detailsTone: TextTone
  image: PictureHeight
  position: PicturePosition
  arrow: boolean
  arrowColour: ColourChoice
}

export interface InsideOptions extends PageWords {
  kind: PageKind
  /** The other kind's words, kept for when the page is switched back to it. */
  kept: Partial<Record<PageKind, PageWords>>
  /** The template each kind started from, by its key (see `templates.ts`). A kind not named started from its example. */
  from: Partial<Record<PageKind, string>>
  /** How the label's tape is cut, and the seed of that cut. They are the label's own, not the cover's. */
  cut: ShapeMode
  seed: number
  logo: LogoSide
}

/** Inside pages keep 56px from the edges, not a cover's 80: there is more to fit. */
export const PAGE_MARGIN = AD_SPACE.marginInside
export const TEXT_WIDTH = POST_FRAME.width - PAGE_MARGIN * 2
/** The logo is small on an inside page, and the marks sit on the page's own margin. */
export const INSIDE_MARKS = { margin: PAGE_MARGIN, logoWidth: AD_SIZE.logoInside }

// The sizes and weights below are the ones Shaun settled on in the Type panel (29 September 2026).
/** Story titles across the AD tools (2 Oct 2026): the variable font's 168 (ExtraBold to the eye). Here they keep the case they're typed in: Shaun undid the capitals the same day. */
export const TITLE = { weight: AD_TYPE.storyTitle.weight, largest: AD_TYPE.storyTitle.size, smallest: 45, lineHeight: AD_TYPE.storyTitle.lineHeight, lines: 3, mostLines: 4, fill: BRAND.light }
/** Lines of text are 1.3 of their size apart at 38px, and 1.2 at 42px: 1.2 was a bit tight at 38 (Shaun, 30 September 2026). */
export const BODY = { weight: AD_TYPE.body.weight, size: AD_TYPE.body.size, large: AD_TYPE.bodyLarge.size, lineHeight: AD_TYPE.body.lineHeight, largeLineHeight: AD_TYPE.bodyLarge.lineHeight, paragraphGap: 26, bulletGap: 8, indent: 44, fill: TONES.grey }
/**
 * The highlight (called the details in the code) is white, in the story's weight, at the story's
 * size or a size up. It is not bolder of itself: words in stars are.
 */
export const DETAILS = { weight: 400, large: 42, fill: TONES.light }
/** Words in two stars are bold and white, in the story or the highlight: a name, a date. */
export const STRONG = { weight: 700, fill: BRAND.light }
/** Words in one star are white too, and a step lighter. */
export const SEMI = { weight: 600, fill: BRAND.light }
/** Where a line under words sits, and how thick it is, as shares of the type size. */
const UNDERLINE = { below: 0.13, thick: 0.055 }
/** The label is a cover's tape in small: capitals on light tape, with a cut of its own. */
export const LABEL = { size: AD_TYPE.label.size, weight: AD_TYPE.label.weight }

/** The sizes and weights the page is set in. `pageType.ts` lets others be tried on this machine. */
export interface PageType {
  title: { largest: number; smallest: number; weight: number; lineHeight: number }
  /** The story, at its usual size and a size up, each with a line height of its own. */
  text: { size: number; large: number; weight: number; lineHeight: number; largeLineHeight: number }
  /** The highlight, at its usual size and a size up. It takes the text's line heights: the usual one, or the one a size up. */
  details: { size: number; large: number; weight: number }
  /** Words in two stars, and in one. */
  strong: { weight: number }
  semi: { weight: number }
  label: { size: number; weight: number }
}

/** The tool's own: what every page is set in unless others are being tried. */
export const PAGE_TYPE: PageType = {
  title: { largest: TITLE.largest, smallest: TITLE.smallest, weight: TITLE.weight, lineHeight: TITLE.lineHeight },
  text: { size: BODY.size, large: BODY.large, weight: BODY.weight, lineHeight: BODY.lineHeight, largeLineHeight: BODY.largeLineHeight },
  details: { size: BODY.size, large: DETAILS.large, weight: DETAILS.weight },
  strong: { weight: STRONG.weight },
  semi: { weight: SEMI.weight },
  label: { size: LABEL.size, weight: LABEL.weight },
}
const CUTS: readonly ShapeMode[] = ['plain', 'torn', 'clean', 'tape', 'cling', 'rough']
const GAP = {
  // Under a picture at the top, and around one among the words or under them.
  underPicture: 44,
  aroundPicture: 60,
  // The label's tape starts where the capitals of a first line would, not at the top of its line.
  aboveLabel: 16,
  labelToTitle: 34,
  labelToText: 46,
  aboveBody: 34,
  aboveDetails: 40,
  // How close words may come to the arrow before they are said to run under it.
  aroundArrow: 12,
  underLogo: 48,
}

// Barlow's own line is 1.2 of the type size (1.0 above the baseline, 0.2 below). A browser
// centres that in the line height, and the pages are set the way the templates' pages were.
const baselineIn = (size: number, lineHeight: number) => size * (lineHeight / 2 + 0.4)

export type MeasureWidth = (text: string, size: number, weight: number, italic?: boolean) => number

export interface InsideLayout {
  /** Where the picture goes, or null for a page with none. */
  banner: Box | null
  /** The label's tape, or null for a page with no label. */
  label: Box | null
  layers: Layer[]
  titleSize: number
  titleLines: number
  /** Lines of story and details together, as set. */
  bodyLines: number
  /** How many of those lines the page has room for under this title. */
  bodyRoom: number
  overflow: 'title' | 'body' | null
  /** How many lines too long the story and details are. */
  over: number
  /** How tall the picture could be before the words run out of room: the height it has when it fills. 0 with none. */
  tallest: number
  /** Words run under the arrow. It stands where it stands, so that is for the words to mend. */
  underArrow: boolean
  empty: boolean
}

const BULLET = /^\s*[-•–]\s+/

/** How a stretch of a line is set: its weight, and whether it slants or is underlined. */
export interface RunStyle {
  weight: 'text' | 'semi' | 'bold'
  italic: boolean
  underline: boolean
}
/** A stretch of a line set one way. */
export interface Run extends RunStyle { text: string }
export interface TypedLine {
  /** The line's words, without their marks. */
  text: string
  bullet: boolean
  runs: Run[]
}

const PLAIN: RunStyle = { weight: 'text', italic: false, underline: false }
const sameStyle = (one: RunStyle, other: RunStyle) => one.weight === other.weight && one.italic === other.italic && one.underline === other.underline

// Marks come in pairs that hug the words, and stand clear of the letters and figures around
// them, so "5* hotel", "2*3*4" and "some_file_name" are left alone.
const mark = (sign: '*' | '_', twice: boolean) => {
  // A star means something to a pattern, so it is escaped; an underscore must not be.
  const one = sign === '*' ? '\\*' : sign
  const pair = twice ? one + one : one
  return new RegExp(`(^|[^\\p{L}\\p{N}${one}])${pair}(?!${one})(\\S(?:.*?[^\\s${one}])?)${pair}(?![\\p{L}\\p{N}${one}])`, 'u')
}
// The longer of each pair comes first: of two marks that open together, the first listed is taken.
const MARKS: { pattern: RegExp; set: (style: RunStyle) => RunStyle }[] = [
  { pattern: mark('*', true), set: (style) => ({ ...style, weight: 'bold' }) },
  { pattern: mark('*', false), set: (style) => ({ ...style, weight: style.weight === 'bold' ? 'bold' : 'semi' }) },
  { pattern: mark('_', true), set: (style) => ({ ...style, underline: true }) },
  { pattern: mark('_', false), set: (style) => ({ ...style, italic: true }) },
]

/** A line as runs: the words in marks, and the words between them. Marks can sit inside marks. */
function readRuns(line: string, style: RunStyle = PLAIN, runs: Run[] = []): Run[] {
  const add = (value: string) => {
    if (!value) return
    const last = runs[runs.length - 1]
    if (last && sameStyle(last, style)) last.text += value
    else runs.push({ ...style, text: value })
  }
  let rest = line
  while (rest) {
    // The first pair to open: where its mark is, not the letter before it.
    const opens = (found: RegExpExecArray) => found.index + found[1].length
    let first: { found: RegExpExecArray; mark: (typeof MARKS)[number] } | null = null
    for (const candidate of MARKS) {
      const found = candidate.pattern.exec(rest)
      if (found && (!first || opens(found) < opens(first.found))) first = { found, mark: candidate }
    }
    if (!first) break
    const { found } = first
    add(rest.slice(0, found.index) + found[1])
    readRuns(found[2], first.mark.set(style), runs)
    rest = rest.slice(found.index + found[0].length)
  }
  add(rest)
  return runs
}

/**
 * What was typed, as paragraphs of lines. A blank line starts a new paragraph; a new line is a
 * new line. A dash starts a bullet. Words in **two stars** are bold, in *one* semibold, in
 * _underscores_ italic and in __two__ underlined: a whole line, or part of one.
 */
export function readLines(typed: string): TypedLine[][] {
  return cleanText(typed.normalize('NFC')).replace(/\r/g, '').split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.split('\n').map((line) => {
      const bullet = BULLET.test(line)
      const runs = readRuns(line.replace(BULLET, '').replace(/\s+/g, ' ').trim())
      return { text: runs.map((run) => run.text).join(''), bullet, runs }
    }).filter((line) => line.text))
    .filter((paragraph) => paragraph.length)
}

/** A stretch of a set line, and how far along the line it starts. */
interface Piece extends Run { x: number }

/**
 * Wraps a line of runs to the width. A line breaks at its spaces only, so a word set two ways
 * stays whole. Words are measured one by one, each the way it is set, and placed by those
 * measures, so what is drawn is what was fitted.
 */
function wrapRuns(runs: Run[], width: number, widthOf: (text: string, style: RunStyle) => number, space: number): Piece[][] {
  // The line's words, each as the parts it is set in.
  const words: Run[][] = []
  let open = false
  for (const run of runs) {
    for (const part of run.text.split(/( )/)) {
      if (part === ' ') open = false
      else if (part) {
        if (open) words[words.length - 1].push({ ...run, text: part })
        else words.push([{ ...run, text: part }])
        open = true
      }
    }
  }
  const lines: Run[][][] = []
  let line: Run[][] = []
  let used = 0
  for (const word of words) {
    const wide = word.reduce((sum, part) => sum + widthOf(part.text, part), 0)
    if (line.length && used + space + wide > width) {
      lines.push(line)
      line = []
      used = 0
    }
    used += (line.length ? space : 0) + wide
    line.push(word)
  }
  if (line.length) lines.push(line)

  return lines.map((wordsOfLine) => {
    const pieces: Piece[] = []
    let x = 0
    wordsOfLine.forEach((word, index) => {
      if (index > 0) x += space
      word.forEach((part, partIndex) => {
        const last = pieces[pieces.length - 1]
        // Words set the same way, one after the other, are one piece of text.
        if (last && sameStyle(last, part)) last.text += (partIndex === 0 ? ' ' : '') + part.text
        else pieces.push({ ...part, x })
        x += widthOf(part.text, part)
      })
    })
    return pieces
  })
}

const hundredth = (value: number) => Math.round(value * 100) / 100
const text = (value: string, x: number, y: number, size: number, weight: number, fill: string, italic = false): Layer =>
  ({ kind: 'text', text: value, x, y: hundredth(y), size, weight, fill, angle: 0, cx: 0, cy: 0, ...(italic ? { italic } : {}) })
/** The line under underlined words: drawn, so every export has it where the preview does. */
const underline = (x: number, baseline: number, wide: number, size: number, fill: string): Layer => {
  const top = hundredth(baseline + size * UNDERLINE.below)
  const thick = Math.max(2, Math.round(size * UNDERLINE.thick))
  return { kind: 'path', d: `M${hundredth(x)} ${top}H${hundredth(x + wide)}V${top + thick}H${hundredth(x)}Z`, fill, angle: 0, cx: 0, cy: 0 }
}

/** Measures the ink of a line, as the cover does: what the label's tape is cut around. */
export type MeasureInk = (text: string, size: number, weight: number) => InkMetrics

/** The label as tape and lettering, its lettering starting on the margin and its tape at `top`. */
function buildLabel(label: string, top: number, inkOf: MeasureInk, cut: ShapeMode, seed: number, { size, weight }: PageType['label']) {
  // Measured from where a line starts, not from its first letter's ink, so the label lines up
  // with the lines under it, which start on the margin too.
  const measure = (value: string) => {
    const ink = inkOf(value, size, weight)
    return { ...ink, width: ink.width - ink.originOffset }
  }
  const lines = wrapText(label, TEXT_WIDTH - size, (value) => measure(value).width, true, { balance: true })
  const metrics = lines.map(measure)
  // Capitals have no descenders, so the tape is balanced on the cap height, as a feature cover's is.
  const bounds = { ascent: Math.max(measure('H').ascent || size * 0.7, ...metrics.map((metric) => metric.ascent)), descent: size * 0.02 }
  const settings: GeneratorSettings = {
    ...defaults,
    headline: label,
    style: 'feature',
    tone: 'light',
    perLine: false,
    align: 'left',
    mode: cut,
    seed,
    fontSize: size,
    hugStrength: 1,
    rotationVariance: 0,
    lineGap: lockedLineGap(size, bounds.ascent + bounds.descent),
  }
  const shape = buildShape(settings, lines, metrics.map((metric) => metric.width), [], bounds)
  const xs = shape.points.map((point) => point.x)
  const ys = shape.points.map((point) => point.y)
  const offset = { x: PAGE_MARGIN, y: top - Math.min(...ys) }
  const layers = buildLayers(shape, { tone: 'light', background: 'charcoal', weight }, size).map((layer): Layer => (layer.kind === 'path'
    ? { ...layer, place: { x: offset.x, y: Math.round(offset.y * 100) / 100, scale: 1 } }
    : { ...layer, x: Math.round((layer.x + offset.x) * 100) / 100, y: Math.round((layer.y + offset.y) * 100) / 100 }))
  const box: Box = { x: offset.x + Math.min(...xs), y: top, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
  return { layers, box }
}

/**
 * Sets the page, top to bottom: the title, the story, the highlight, with the picture at the
 * top, at the bottom, or after the first of them. The label sits over whichever comes first.
 * The title takes the largest size from 52 down to 45 that fits it in three lines. A picture
 * that fills takes the room the words leave; with any other, the highlight can stand at the
 * foot of that room. `marks` says where the logo ends, so the words start clear of it, and
 * where the arrow is: it stands where it stands, and the layout only says when words run under
 * it. Without `ink` to measure it by, there is no label. `type` is for trying other sizes and
 * weights.
 */
export function layoutInside(
  content: Pick<InsideOptions, 'title' | 'body' | 'image'> & Partial<Pick<InsideOptions, 'label' | 'cut' | 'seed' | 'details' | 'large' | 'bodyLarge' | 'pinned' | 'bodyTone' | 'detailsTone' | 'position'>>,
  measure: MeasureWidth,
  marks: { logoBottom?: number; arrow?: Box } = {},
  ink?: MeasureInk,
  type: PageType = PAGE_TYPE,
): InsideLayout {
  const { width, height: pageHeight } = POST_FRAME
  const fills = content.image === 'fill'
  const pictured = content.image !== 'none'
  const position = pictured ? content.position ?? 'top' : 'top'
  const label = ink ? normaliseEyebrow(content.label ?? '') : ''
  const title = normaliseHeadline(content.title)
  const story = readLines(content.body)
  const details = readLines(content.details ?? '')
  const textSize = content.bodyLarge ? type.text.large : type.text.size
  // A box set a size up takes the line height for that size.
  const lineHeightFor = (large: boolean | undefined) => (large ? type.text.largeLineHeight : type.text.lineHeight)
  // Lines are counted in lines of the text.
  const pitch = textSize * lineHeightFor(content.bodyLarge)
  // The words end on the bottom margin.
  const foot = pageHeight - PAGE_MARGIN

  const wrapTitle = (size: number) => wrapText(title, TEXT_WIDTH, (value) => measure(value, size, type.title.weight), true, { balance: true })
  let titleSize = Math.max(type.title.largest, type.title.smallest)
  while (title && titleSize > Math.min(type.title.largest, type.title.smallest) && wrapTitle(titleSize).length > TITLE.lines) titleSize -= 1
  const titleLines = title ? wrapTitle(titleSize) : []

  /** The page with a picture this tall. */
  const flow = (pictureHeight: number) => {
    let layers: Layer[] = []
    const placed: { banner: Box | null; label: Box | null } = { banner: null, label: null }
    const picture = (top: number, height: number) => { placed.banner = { x: 0, y: Math.round(top), width, height: Math.round(height) } }
    // The words start at the top margin, under the logo if it is on, or under a picture at the top.
    let y = marks.logoBottom ? marks.logoBottom + GAP.underLogo : PAGE_MARGIN
    // What comes next follows nothing, words, or the picture (which brings its own gap).
    let after: 'nothing' | 'words' | 'picture' = 'nothing'
    // Where the words end, and where they would have with the highlight straight under the story.
    let wordsEnd = 0
    let flowEnd = 0
    let bodyLines = 0
    // A picture with no words under it has the page to its foot.
    let last = false
    if (pictured && position === 'top') {
      picture(0, pictureHeight)
      y = pictureHeight + GAP.underPicture
      after = 'picture'
    }
    let waiting = pictured && position === 'middle'
    const inTheMiddle = () => {
      if (!waiting) return
      waiting = false
      if (after === 'words') y += GAP.aroundPicture
      picture(y, pictureHeight)
      y += pictureHeight + GAP.aroundPicture
      after = 'picture'
      last = true
    }
    // A picture at the bottom that doesn't fill has its place before any word is set.
    const standing = pictured && position === 'bottom' && !fills ? pageHeight - pictureHeight : null
    const wordsFoot = standing !== null ? standing - GAP.aroundPicture : pictured && position === 'bottom' ? pageHeight - FILL_SMALLEST - GAP.aroundPicture : foot

    const setLabel = (gapUnder: number) => {
      if (!label || !ink) return
      y += GAP.aboveLabel
      const made = buildLabel(label, y, ink, content.cut ?? insideDefaults.cut, content.seed ?? insideDefaults.seed, type.label)
      layers.push(...made.layers)
      placed.label = made.box
      y += made.box.height + gapUnder
    }
    const setTitle = () => {
      const titlePitch = titleSize * type.title.lineHeight
      titleLines.forEach((line, index) => {
        layers.push(text(line, PAGE_MARGIN, y + index * titlePitch + baselineIn(titleSize, type.title.lineHeight), titleSize, type.title.weight, TITLE.fill))
      })
      y += titleLines.length * titlePitch
    }
    const setText = (paragraphs: TypedLine[][], block: { size: number; weight: number; lineHeight: number }, blockFill: string) => {
      const { lineHeight } = block
      // The gaps and the bullets' indent are the text's, and grow and shrink with it.
      const scale = block.size / BODY.size
      const weightOf = (style: RunStyle) => (style.weight === 'bold' ? type.strong.weight : style.weight === 'semi' ? type.semi.weight : block.weight)
      const fillOf = (style: RunStyle) => (style.weight === 'text' ? blockFill : STRONG.fill)
      const widthOf = (value: string, style: RunStyle) => measure(value, block.size, weightOf(style), style.italic)
      paragraphs.forEach((paragraph, paragraphIndex) => {
        if (paragraphIndex > 0) y += BODY.paragraphGap * scale
        paragraph.forEach((typed, lineIndex) => {
          if (lineIndex > 0 && typed.bullet && paragraph[lineIndex - 1].bullet) y += BODY.bulletGap * scale
          const indent = typed.bullet ? Math.round(BODY.indent * scale) : 0
          const left = PAGE_MARGIN + indent
          const opening = typed.runs[0]
          if (typed.bullet) layers.push(text('•', PAGE_MARGIN + Math.round(10 * scale), y + baselineIn(block.size, lineHeight), block.size, weightOf(opening), fillOf(opening)))
          // A line set one way is wrapped and drawn whole; one with words in marks, piece by piece.
          const lines: Piece[][] = typed.runs.length === 1
            ? wrapText(typed.text, TEXT_WIDTH - indent, (value) => widthOf(value, opening), true).map((line) => [{ ...opening, text: line, x: 0 }])
            : wrapRuns(typed.runs, TEXT_WIDTH - indent, widthOf, measure(' ', block.size, block.weight))
          for (const line of lines) {
            const baseline = y + baselineIn(block.size, lineHeight)
            for (const piece of line) {
              // On a whole pixel, so the preview and both kinds of export put the letters in the same place.
              const x = Math.round(left + piece.x)
              layers.push(text(piece.text, x, baseline, block.size, weightOf(piece), fillOf(piece), piece.italic))
              if (piece.underline) layers.push(underline(x, baseline, widthOf(piece.text, piece), block.size, fillOf(piece)))
            }
            y += block.size * lineHeight
            bodyLines += 1
          }
        })
      })
    }
    const setHighlight = () => setText(details, { size: content.large ? type.details.large : type.details.size, weight: type.details.weight, lineHeight: lineHeightFor(content.large) }, content.detailsTone ? TONES[content.detailsTone] : DETAILS.fill)

    const blocks = [
      { has: titleLines.length > 0, gap: 0, labelGap: GAP.labelToTitle, pinned: false, set: setTitle },
      { has: story.length > 0, gap: GAP.aboveBody, labelGap: GAP.labelToText, pinned: false, set: () => setText(story, { size: textSize, weight: type.text.weight, lineHeight: lineHeightFor(content.bodyLarge) }, content.bodyTone ? TONES[content.bodyTone] : BODY.fill) },
      // A picture that fills has taken the room already, so there is no foot to stand apart on.
      { has: details.length > 0, gap: GAP.aboveDetails, labelGap: GAP.labelToText, pinned: Boolean(content.pinned) && !fills, set: setHighlight },
    ].filter((block) => block.has)
    blocks.forEach((block, index) => {
      if (after === 'words') y += block.gap
      if (index === 0) setLabel(block.labelGap)
      const top = y
      const before = layers
      if (block.pinned && index > 0) layers = []
      block.set()
      flowEnd = y
      if (layers !== before) {
        // Set where it fell to find its height, it moves down to stand on the foot, if there is room to.
        const down = Math.max(0, wordsFoot - y)
        before.push(...layers.map((layer): Layer => (layer.kind === 'text'
          ? { ...layer, y: hundredth(layer.y + down) }
          : { ...layer, place: { x: 0, y: hundredth(down), scale: 1 } })))
        layers = before
        y = top + (y - top) + down
      }
      after = 'words'
      wordsEnd = y
      last = false
      // In the middle, the picture follows the first of them.
      if (index === 0) inTheMiddle()
    })
    if (!blocks.length && label) {
      setLabel(0)
      after = 'words'
      wordsEnd = y
      flowEnd = y
    }
    // With nothing typed but a label, or nothing at all, a picture for the middle still has its place.
    inTheMiddle()
    if (pictured && position === 'bottom') {
      // Filling, it starts under the words; otherwise it stands on the foot of the page.
      const under = after === 'words' ? Math.ceil(wordsEnd + GAP.aroundPicture) : marks.logoBottom ? y : 0
      const top = standing ?? Math.min(under, pageHeight - FILL_SMALLEST)
      picture(top, pageHeight - top)
    }

    // How much room is left: for the words above their foot, and for a picture that comes last above the page's.
    const { banner } = placed
    const spare = Math.min(wordsFoot - flowEnd, banner && last ? pageHeight - (banner.y + banner.height) : Infinity)
    return { layers, banner, label: placed.label, bodyLines, spare, last, empty: !label && !blocks.length }
  }

  // The room is counted with the smallest picture the page may have; one that fills then takes what is left.
  const measuredAt = heightOf(content.image)
  const measured = flow(measuredAt)
  const grows = fills && position !== 'bottom' && measured.spare >= 1
  const page = grows ? flow(FILL_SMALLEST + Math.floor(measured.spare)) : measured
  // The room the words leave shrinks as the picture grows, a pixel for a pixel, wherever it is.
  const tallest = pictured ? Math.max(FILL_SMALLEST, measuredAt + Math.floor(measured.spare)) : 0

  const { spare, bodyLines } = measured
  const over = spare < -0.5 ? Math.ceil((-spare - 0.5) / pitch) : 0
  const bodyRoom = Math.max(0, over ? bodyLines - over : bodyLines + Math.floor((spare + 0.5) / pitch))
  const overflow = titleLines.length > TITLE.mostLines ? 'title' : over > 0 ? 'body' : null

  // The arrow keeps its corner whatever is typed: the words are told when they run under it.
  const { arrow } = marks
  const underArrow = Boolean(arrow) && page.layers.some((layer) => {
    if (layer.kind !== 'text' || !arrow) return false
    const right = layer.x + measure(layer.text, layer.size, layer.weight, layer.italic)
    const clear = GAP.aroundArrow
    return right > arrow.x - clear && layer.x < arrow.x + arrow.width + clear
      && layer.y + layer.size * 0.25 > arrow.y - clear && layer.y - layer.size * 0.75 < arrow.y + arrow.height + clear
  })

  return { banner: page.banner, label: page.label, layers: page.layers, titleSize, titleLines: titleLines.length, bodyLines, bodyRoom, overflow, over, tallest, underArrow, empty: page.empty }
}

interface Picture {
  image: CanvasImageSource
  width: number
  height: number
}

/** Draws the page for a PNG: the same picture, marks and words as the preview and the SVG. */
export function drawInside(
  context: CanvasRenderingContext2D,
  layout: InsideLayout,
  options: { photo: Picture | null; view: PhotoView; darken: number; furniture: Layer[] },
) {
  context.fillStyle = BRAND.dark
  context.fillRect(0, 0, POST_FRAME.width, POST_FRAME.height)
  if (layout.banner && options.photo) {
    const { banner } = layout
    const rect = photoRect(options.photo.width, options.photo.height, options.view, banner)
    context.save()
    context.beginPath()
    context.rect(banner.x, banner.y, banner.width, banner.height)
    context.clip()
    context.imageSmoothingQuality = 'high'
    context.drawImage(options.photo.image, banner.x + rect.x, banner.y + rect.y, rect.width, rect.height)
    if (options.darken > 0) {
      context.fillStyle = `rgba(0,0,0,${options.darken})`
      context.fillRect(banner.x, banner.y, banner.width, banner.height)
    }
    context.restore()
  }
  drawLayers(context, options.furniture)
  drawLayers(context, layout.layers)
}

/** The page as SVG. `photo` is the part of the picture the banner shows, as a data URL. */
export function insideSvg(layout: InsideLayout, options: { photo?: string | null; darken?: number; furniture?: Layer[]; fontCss?: string } = {}) {
  const { photo = null, darken = 0, furniture = [], fontCss = '' } = options
  const { width, height } = POST_FRAME
  const defs = fontCss ? `<defs><style>${fontCss}</style></defs>` : ''
  let banner = ''
  if (layout.banner && photo) {
    const at = layout.banner.y ? ` y="${layout.banner.y}"` : ''
    banner = `<image xlink:href="${escapeAttribute(photo)}"${at} width="${width}" height="${layout.banner.height}" preserveAspectRatio="xMidYMid slice"/>`
    if (darken > 0) banner += `<rect${at} width="${width}" height="${layout.banner.height}" fill="#000" opacity="${darken}"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${defs}<rect width="${width}" height="${height}" fill="${BRAND.dark}"/>${banner}${layersToSvg(furniture)}${layersToSvg(layout.layers)}</svg>`
}

/**
 * The two kinds of page, and what each starts with. The examples show what the page is for,
 * and how its words are typed: stars for bold, a new line for a new line. They are the pages as
 * Shaun had them on 29 and 30 September 2026.
 */
export const PAGE_KINDS: Record<PageKind, { label: string; description: string; sample: PageWords }> = {
  title: {
    label: 'Title page',
    description: 'A title, the story, then the details',
    sample: {
      label: '',
      title: 'Bolands Mills is set to come alive this Culture Night',
      body: 'A free evening of live music, art, storytelling and movement, with performances from AE MAK, Sorcha Richardson and Zaska on the Factory Main Stage.\n\nThe Factory Main Stage will host performances from AE MAK, Sorcha Richardson and Zaska, while DJ and chef Marcus O’Laoire brings a relaxed vinyl listening session to Grindstone Coffee.',
      details: '**Friday 18 September · 6.30pm**\n**Bolands Mills, Dublin 4**',
      large: false,
      bodyLarge: false,
      // The date and place stand at the foot of the page, under a picture of a set height.
      pinned: true,
      bodyTone: 'grey',
      detailsTone: 'light',
      image: 'tall',
      position: 'top',
      arrow: true,
      arrowColour: 'light',
    },
  },
  label: {
    label: 'Label page',
    description: 'A label over a list: names, a line-up, what’s on',
    sample: {
      label: 'Meet the artists',
      title: '',
      body: '**Aoife Dooley**\nIllustration\n**Emma Rose Hanley**\nCeramics',
      details: '*Four Dublin creatives are coming together for an evening exploring their work, practice and inspiration.*',
      // The closing line is a size up from the list over it.
      large: true,
      bodyLarge: false,
      pinned: false,
      bodyTone: 'light',
      detailsTone: 'light',
      image: 'tall',
      position: 'bottom',
      // The arrow sits on the picture.
      arrow: true,
      arrowColour: 'light',
    },
  },
}
export const PAGE_KIND_NAMES = Object.keys(PAGE_KINDS) as PageKind[]

/** A page's words and switches, and nothing else it carries. */
export const wordsOf = ({ label, title, body, details, large, bodyLarge, pinned, bodyTone, detailsTone, image, position, arrow, arrowColour }: PageWords): PageWords =>
  ({ label, title, body, details, large, bodyLarge, pinned, bodyTone, detailsTone, image, position, arrow, arrowColour })

/** Whether a page's words and switches are still these: those of the template it started from, say. */
export const sameWords = (page: PageWords, words: PageWords) => JSON.stringify(wordsOf(page)) === JSON.stringify(wordsOf(words))

/** Each kind's example is a template like any other, under this key, which no saved template can take. */
export const EXAMPLE = 'example'
/** A template's key is its file's name: small letters and numbers, joined by single dashes. */
export const isTemplateKey = (key: unknown): key is string => typeof key === 'string' && key.length <= 40 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)

/** What a page can be started from: its kind's example, or a template saved from the tool. */
export interface PageStart {
  key: string
  kind: PageKind
  words: PageWords
  /** A label page's cut, and its seed. None leaves the label's cut as it is. */
  cut?: ShapeMode
  seed?: number
}

/** The page as the other kind: its own words are kept, and that kind's come back, or its example. */
export function switchKind(inside: InsideOptions, kind: PageKind): InsideOptions {
  if (kind === inside.kind) return inside
  const { [kind]: back, ...others } = inside.kept
  return { ...inside, ...(back ?? PAGE_KINDS[kind].sample), kind, kept: { ...others, [inside.kind]: wordsOf(inside) } }
}

/**
 * The page started again from a template: as the template's kind, with its words and switches, and
 * on a label page its cut. What was typed as the other kind is kept, as when switching kinds.
 */
export function startFrom(inside: InsideOptions, start: PageStart): InsideOptions {
  const page = switchKind(inside, start.kind)
  return { ...page, ...wordsOf(start.words), from: { ...page.from, [start.kind]: start.key }, cut: start.cut ?? page.cut, seed: start.seed ?? page.seed }
}

export const INSIDE_KEY = 'tape-type-inside-v1'
export const insideDefaults: InsideOptions = {
  kind: 'title',
  kept: {},
  from: {},
  ...PAGE_KINDS.title.sample,
  // One quiet cut, as on the labels of the Canva pages.
  cut: 'clean',
  seed: defaults.seed,
  logo: 'off',
}

const POSITIONS: readonly PicturePosition[] = ['top', 'middle', 'bottom']
/** How every page was set before it had switches for it: what a page saved then is read as. */
const BEFORE: Pick<PageWords, 'large' | 'bodyLarge' | 'pinned' | 'bodyTone' | 'detailsTone'> = { large: false, bodyLarge: false, pinned: false, bodyTone: 'grey', detailsTone: 'light' }
const COLOURS: readonly ColourChoice[] = ['auto', 'yellow', 'light', 'dark']

/**
 * Stored words, against what they fall back on: the example, or for the picture's height and the
 * arrow, which both kinds once shared, what the page had before each kind had its own.
 */
function sanitizeWords(stored: Record<string, unknown>, sample: PageWords, shared: Partial<Pick<PageWords, 'image' | 'arrow' | 'arrowColour'>> = {}): PageWords {
  // A page saved with words of its own, before a switch existed, was set the way every page then was.
  return wordsFrom(stored, sample, typeof stored.body === 'string' ? { ...sample, details: '', ...BEFORE } : sample, shared)
}

/** A template's words and switches, as untrusted as a stored page's: anything missing or wrong is its kind's example's. */
export const readWords = (stored: Record<string, unknown>, kind: PageKind): PageWords => wordsFrom(stored, PAGE_KINDS[kind].sample, PAGE_KINDS[kind].sample)

function wordsFrom(stored: Record<string, unknown>, sample: PageWords, start: PageWords, shared: Partial<Pick<PageWords, 'image' | 'arrow' | 'arrowColour'>> = {}): PageWords {
  const words = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback)
  return {
    label: words(stored.label, sample.label),
    title: words(stored.title, sample.title),
    body: words(stored.body, sample.body),
    details: words(stored.details, start.details),
    large: typeof stored.large === 'boolean' ? stored.large : start.large,
    bodyLarge: typeof stored.bodyLarge === 'boolean' ? stored.bodyLarge : start.bodyLarge,
    pinned: typeof stored.pinned === 'boolean' ? stored.pinned : start.pinned,
    bodyTone: stored.bodyTone === 'grey' || stored.bodyTone === 'light' ? stored.bodyTone : start.bodyTone,
    detailsTone: stored.detailsTone === 'grey' || stored.detailsTone === 'light' ? stored.detailsTone : start.detailsTone,
    image: IMAGE_CHOICES.includes(stored.image as ImageHeight)
      ? stored.image as ImageHeight
      : typeof stored.image === 'number' && Number.isFinite(stored.image) ? Math.round(Math.min(TALLEST_OWN, Math.max(FILL_SMALLEST, stored.image))) : shared.image ?? sample.image,
    position: POSITIONS.includes(stored.position as PicturePosition) ? stored.position as PicturePosition : sample.position,
    arrow: typeof stored.arrow === 'boolean' ? stored.arrow : shared.arrow ?? sample.arrow,
    arrowColour: COLOURS.includes(stored.arrowColour as ColourChoice) ? stored.arrowColour as ColourChoice : shared.arrowColour ?? sample.arrowColour,
  }
}

/**
 * Stored pages are untrusted, like everything else that is remembered. `arrowWas` is the colour
 * the arrow had when it was the cover's to set: a page saved then keeps it.
 */
export function sanitizeInside(stored: Record<string, unknown>, arrowWas?: ColourChoice): InsideOptions {
  const typed = (value: unknown) => typeof value === 'string' && value.trim() !== ''
  // A page saved before there were kinds is a label page if a label is all it opens with.
  const kind: PageKind = PAGE_KIND_NAMES.includes(stored.kind as PageKind)
    ? stored.kind as PageKind
    : typed(stored.label) && !typed(stored.title) && typeof stored.title === 'string' ? 'label' : 'title'
  // A page saved with words of its own keeps the arrow colour it had; one with none takes the example's.
  const own = sanitizeWords(stored, PAGE_KINDS[kind].sample, typeof stored.body === 'string' ? { arrowColour: arrowWas } : {})
  const shared = { image: own.image, arrow: own.arrow, arrowColour: own.arrowColour }
  const kept: InsideOptions['kept'] = {}
  const storedKept = stored.kept && typeof stored.kept === 'object' ? stored.kept as Record<string, unknown> : {}
  for (const name of PAGE_KIND_NAMES) {
    const words = storedKept[name]
    if (name !== kind && words && typeof words === 'object') kept[name] = sanitizeWords(words as Record<string, unknown>, PAGE_KINDS[name].sample, shared)
  }
  // Which template each kind started from. One that has since gone is looked up and not found, so its example stands in.
  const from: InsideOptions['from'] = {}
  const storedFrom = stored.from && typeof stored.from === 'object' ? stored.from as Record<string, unknown> : {}
  for (const name of PAGE_KIND_NAMES) {
    const key = storedFrom[name]
    if (isTemplateKey(key)) from[name] = key
  }
  return {
    kind,
    kept,
    from,
    ...own,
    cut: CUTS.includes(stored.cut as ShapeMode) ? stored.cut as ShapeMode : insideDefaults.cut,
    seed: typeof stored.seed === 'number' && Number.isFinite(stored.seed) ? Math.min(4294967295, Math.max(1, Math.floor(stored.seed))) : insideDefaults.seed,
    logo: (['off', 'left', 'right'] as const).includes(stored.logo as LogoSide) ? stored.logo as LogoSide : insideDefaults.logo,
  }
}

export function loadInside(arrowWas?: ColourChoice): InsideOptions {
  try {
    const stored = JSON.parse(localStorage.getItem(INSIDE_KEY) ?? 'null')
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? sanitizeInside(stored, arrowWas) : insideDefaults
  } catch {
    return insideDefaults
  }
}

export function saveInside(inside: InsideOptions) {
  try {
    localStorage.setItem(INSIDE_KEY, JSON.stringify(inside))
  } catch {
    // Blocked storage only costs remembering the page.
  }
}
