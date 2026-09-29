import { BRAND, buildLayers, drawLayers, escapeAttribute, layersToSvg, type Layer } from './artwork'
import type { Box, LogoSide } from './furniture'
import { buildShape, wrapText } from './geometry'
import { EYEBROW_SCALE } from './layout'
import { lockedLineGap } from './locks'
import type { InkMetrics } from './metrics'
import { photoRect, type PhotoView } from './photo'
import { POST_FRAME, defaults } from './settings'
import { cleanText, normaliseEyebrow, normaliseHeadline } from './text'
import type { GeneratorSettings, ShapeMode } from './types'

/**
 * The inside page of a post: a picture, a tape label, a title, the story, then the details
 * (dates, place, tickets). It follows the article pages of the Alternative Dublin social
 * templates: the same margins, sizes and greys. Everything under the title is one size, and
 * what matters more or less is told apart by weight alone.
 */
export type ImageHeight = 'none' | 'short' | 'medium' | 'tall' | 'fill'
export const IMAGE_HEIGHTS: Record<Exclude<ImageHeight, 'fill'>, number> = { none: 0, short: 340, medium: 430, tall: 540 }
/** A picture that fills takes the room the words leave, and the words leave it at least this much. */
export const FILL_SMALLEST = 260
const IMAGE_CHOICES: readonly ImageHeight[] = ['none', 'short', 'medium', 'tall', 'fill']
/**
 * Where the picture goes. In the middle it follows the first thing on the page: the title, or
 * the story if there is no title.
 */
export type PicturePosition = 'top' | 'middle' | 'bottom'

export interface InsideOptions {
  /** A small tape label above the title, set in capitals. Empty for none. */
  label: string
  /** How the label's tape is cut, and the seed of that cut. They are the label's own, not the cover's. */
  cut: ShapeMode
  seed: number
  title: string
  body: string
  /** Dates, places, tickets: set lighter than the story. */
  details: string
  image: ImageHeight
  position: PicturePosition
  logo: LogoSide
  arrow: boolean
}

/** Inside pages keep 56px from the edges, not a cover's 80: there is more to fit. */
export const PAGE_MARGIN = 56
export const TEXT_WIDTH = POST_FRAME.width - PAGE_MARGIN * 2
/** The logo is small on an inside page, and the marks sit on the page's own margin. */
export const INSIDE_MARKS = { margin: PAGE_MARGIN, logoWidth: 128 }

export const TITLE = { weight: 700, largest: 69, smallest: 52, lineHeight: 1.08, lines: 3, mostLines: 4, fill: BRAND.light }
export const BODY = { weight: 500, size: 38, lineHeight: 1.32, paragraphGap: 26, bulletGap: 8, indent: 44, fill: '#C2C2C2' }
/** Details are the story's size in a lighter weight. */
export const DETAILS = { weight: 400 }
/** A line in stars is bold and white, in the story or the details: a name, a lead sentence. */
export const STRONG = { weight: 700, fill: BRAND.light }
/**
 * The label is a cover's tape in small: capitals on light tape, with a cut of its own. It is
 * 45px: the 50 of the Canva pages, brought down by as much as a cover's eyebrow is.
 */
export const LABEL = { size: Math.round(50 * EYEBROW_SCALE), weight: 700 }

/** The sizes and weights the page is set in. `pageType.ts` lets others be tried on this machine. */
export interface PageType {
  title: { largest: number; smallest: number; weight: number; lineHeight: number }
  text: { size: number; weight: number; lineHeight: number }
  /** The details take the text's line height. */
  details: { size: number; weight: number }
  /** A line in stars. */
  strong: { weight: number }
  label: { size: number; weight: number }
}

/** The tool's own: what every page is set in unless others are being tried. */
export const PAGE_TYPE: PageType = {
  title: { largest: TITLE.largest, smallest: TITLE.smallest, weight: TITLE.weight, lineHeight: TITLE.lineHeight },
  text: { size: BODY.size, weight: BODY.weight, lineHeight: BODY.lineHeight },
  details: { size: BODY.size, weight: DETAILS.weight },
  strong: { weight: STRONG.weight },
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
  aboveArrow: 24,
  underLogo: 48,
}

// Barlow's own line is 1.2 of the type size (1.0 above the baseline, 0.2 below). A browser
// centres that in the line height, and the pages are set the way the templates' pages were.
const baselineIn = (size: number, lineHeight: number) => size * (lineHeight / 2 + 0.4)

export type MeasureWidth = (text: string, size: number, weight: number) => number

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
  empty: boolean
}

const BULLET = /^\s*[-•–]\s+/
const STARRED = /^\*{1,2}(?!\s)(.+?)\*{1,2}$/

export interface TypedLine { text: string; bullet: boolean; strong: boolean }

/**
 * What was typed, as paragraphs of lines. A blank line starts a new paragraph; a new line is a
 * new line. A dash starts a bullet, and a line in stars is bold.
 */
export function readLines(typed: string): TypedLine[][] {
  return cleanText(typed.normalize('NFC')).replace(/\r/g, '').split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.split('\n').map((line) => {
      const bullet = BULLET.test(line)
      const plain = line.replace(BULLET, '').replace(/\s+/g, ' ').trim()
      const starred = STARRED.exec(plain)
      return { text: starred ? starred[1].trim() : plain, bullet, strong: Boolean(starred) }
    }).filter((line) => line.text))
    .filter((paragraph) => paragraph.length)
}

const text = (value: string, x: number, y: number, size: number, weight: number, fill: string): Layer =>
  ({ kind: 'text', text: value, x, y: Math.round(y * 100) / 100, size, weight, fill, angle: 0, cx: 0, cy: 0 })

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
 * Sets the page, top to bottom: the title, the story, the details, with the picture at the top,
 * at the bottom, or after the first of them. The label sits over whichever comes first. The
 * title takes the largest size from 69 down to 52 that fits it in three lines; the story and
 * the details are always 38. A picture that fills takes the room the words leave. `marks` says
 * where the logo ends and the arrow starts, so the words keep clear of both. Without `ink`
 * to measure it by, there is no label. `type` is for trying other sizes and weights.
 */
export function layoutInside(
  content: Pick<InsideOptions, 'title' | 'body' | 'image'> & Partial<Pick<InsideOptions, 'label' | 'cut' | 'seed' | 'details' | 'position'>>,
  measure: MeasureWidth,
  marks: { logoBottom?: number; arrowTop?: number } = {},
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
  // Lines are counted in lines of the text.
  const pitch = type.text.size * type.text.lineHeight
  // The words end above the arrow, or on the bottom margin.
  const foot = marks.arrowTop !== undefined ? marks.arrowTop - GAP.aboveArrow : pageHeight - PAGE_MARGIN

  const wrapTitle = (size: number) => wrapText(title, TEXT_WIDTH, (value) => measure(value, size, type.title.weight), true, { balance: true })
  let titleSize = Math.max(type.title.largest, type.title.smallest)
  while (title && titleSize > Math.min(type.title.largest, type.title.smallest) && wrapTitle(titleSize).length > TITLE.lines) titleSize -= 1
  const titleLines = title ? wrapTitle(titleSize) : []

  /** The page with a picture this tall. */
  const flow = (pictureHeight: number) => {
    const layers: Layer[] = []
    const placed: { banner: Box | null; label: Box | null } = { banner: null, label: null }
    const picture = (top: number, height: number) => { placed.banner = { x: 0, y: Math.round(top), width, height: Math.round(height) } }
    // The words start at the top margin, under the logo if it is on, or under a picture at the top.
    let y = marks.logoBottom ? marks.logoBottom + GAP.underLogo : PAGE_MARGIN
    // What comes next follows nothing, words, or the picture (which brings its own gap).
    let after: 'nothing' | 'words' | 'picture' = 'nothing'
    let wordsEnd = 0
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
    const setText = (paragraphs: TypedLine[][], block: { size: number; weight: number }) => {
      const { lineHeight } = type.text
      // The gaps and the bullets' indent are the text's, and grow and shrink with it.
      const scale = block.size / BODY.size
      paragraphs.forEach((paragraph, paragraphIndex) => {
        if (paragraphIndex > 0) y += BODY.paragraphGap * scale
        paragraph.forEach((typed, lineIndex) => {
          if (lineIndex > 0 && typed.bullet && paragraph[lineIndex - 1].bullet) y += BODY.bulletGap * scale
          const weight = typed.strong ? type.strong.weight : block.weight
          const fill = typed.strong ? STRONG.fill : BODY.fill
          const indent = typed.bullet ? Math.round(BODY.indent * scale) : 0
          const lines = wrapText(typed.text, TEXT_WIDTH - indent, (value) => measure(value, block.size, weight), true)
          if (typed.bullet) layers.push(text('•', PAGE_MARGIN + Math.round(10 * scale), y + baselineIn(block.size, lineHeight), block.size, weight, fill))
          for (const line of lines) {
            layers.push(text(line, PAGE_MARGIN + indent, y + baselineIn(block.size, lineHeight), block.size, weight, fill))
            y += block.size * lineHeight
            bodyLines += 1
          }
        })
      })
    }

    const blocks = [
      { has: titleLines.length > 0, gap: 0, labelGap: GAP.labelToTitle, set: setTitle },
      { has: story.length > 0, gap: GAP.aboveBody, labelGap: GAP.labelToText, set: () => setText(story, type.text) },
      { has: details.length > 0, gap: GAP.aboveDetails, labelGap: GAP.labelToText, set: () => setText(details, type.details) },
    ].filter((block) => block.has)
    blocks.forEach((block, index) => {
      if (after === 'words') y += block.gap
      if (index === 0) setLabel(block.labelGap)
      block.set()
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
    }
    // With nothing typed but a label, or nothing at all, a picture for the middle still has its place.
    inTheMiddle()
    if (pictured && position === 'bottom') {
      // Filling, it starts under the words; otherwise it stands on the foot of the page.
      const under = after === 'words' ? Math.ceil(wordsEnd + GAP.aroundPicture) : marks.logoBottom ? y : 0
      const top = fills ? Math.min(under, pageHeight - FILL_SMALLEST) : pageHeight - pictureHeight
      picture(top, pageHeight - top)
    }

    // How much room is left: for the words above their foot, and for a picture that comes last above the page's.
    const { banner } = placed
    const wordsFoot = banner && position === 'bottom' ? (fills ? pageHeight - FILL_SMALLEST : banner.y) - GAP.aroundPicture : foot
    const spare = Math.min(wordsFoot - wordsEnd, banner && last ? pageHeight - (banner.y + banner.height) : Infinity)
    return { layers, banner, label: placed.label, bodyLines, spare, last, empty: !label && !blocks.length }
  }

  // The room is counted with the smallest picture the page may have; one that fills then takes what is left.
  const measured = flow(fills ? FILL_SMALLEST : pictured ? IMAGE_HEIGHTS[content.image as Exclude<ImageHeight, 'fill'>] : 0)
  const grows = fills && position !== 'bottom' && measured.spare >= 1
  const page = grows ? flow(FILL_SMALLEST + Math.floor(measured.spare)) : measured

  const { spare, bodyLines } = measured
  const over = spare < -0.5 ? Math.ceil((-spare - 0.5) / pitch) : 0
  const bodyRoom = Math.max(0, over ? bodyLines - over : bodyLines + Math.floor((spare + 0.5) / pitch))
  const overflow = titleLines.length > TITLE.mostLines ? 'title' : over > 0 ? 'body' : null

  return { banner: page.banner, label: page.label, layers: page.layers, titleSize, titleLines: titleLines.length, bodyLines, bodyRoom, overflow, over, empty: page.empty }
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

export const INSIDE_KEY = 'tape-type-inside-v1'
export const insideDefaults: InsideOptions = {
  label: '',
  // One quiet cut, as on the labels of the Canva pages.
  cut: 'clean',
  seed: defaults.seed,
  title: 'Bolands Mills is set to come alive this Culture Night',
  body: 'A free evening of live music, art, storytelling and movement, with performances from AE MAK, Sorcha Richardson and Zaska on the Factory Main Stage.',
  details: 'Friday 18 September · 6.30pm\nBolands Mills, Dublin 4\nFree, no ticket needed',
  // The picture takes the room the words leave, so a page is full however much is typed.
  image: 'fill',
  position: 'top',
  logo: 'off',
  arrow: true,
}

/** Stored pages are untrusted, like everything else that is remembered. */
export function sanitizeInside(stored: Record<string, unknown>): InsideOptions {
  const words = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback)
  return {
    label: words(stored.label, insideDefaults.label),
    cut: CUTS.includes(stored.cut as ShapeMode) ? stored.cut as ShapeMode : insideDefaults.cut,
    seed: typeof stored.seed === 'number' && Number.isFinite(stored.seed) ? Math.min(4294967295, Math.max(1, Math.floor(stored.seed))) : insideDefaults.seed,
    title: words(stored.title, insideDefaults.title),
    body: words(stored.body, insideDefaults.body),
    // A page saved before details existed has none, not the sample ones.
    details: words(stored.details, typeof stored.body === 'string' ? '' : insideDefaults.details),
    image: IMAGE_CHOICES.includes(stored.image as ImageHeight) ? stored.image as ImageHeight : insideDefaults.image,
    position: (['top', 'middle', 'bottom'] as const).includes(stored.position as PicturePosition) ? stored.position as PicturePosition : insideDefaults.position,
    logo: (['off', 'left', 'right'] as const).includes(stored.logo as LogoSide) ? stored.logo as LogoSide : insideDefaults.logo,
    arrow: typeof stored.arrow === 'boolean' ? stored.arrow : insideDefaults.arrow,
  }
}

export function loadInside(): InsideOptions {
  try {
    const stored = JSON.parse(localStorage.getItem(INSIDE_KEY) ?? 'null')
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? sanitizeInside(stored) : insideDefaults
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
