import { BRAND, drawLayers, escapeAttribute, layersToSvg, type Layer } from './artwork'
import type { Box, LogoSide } from './furniture'
import { wrapText } from './geometry'
import { photoRect, type PhotoView } from './photo'
import { POST_FRAME } from './settings'
import { cleanText, normaliseHeadline } from './text'

/**
 * The inside page of a post: a picture across the top, a title, the story, then the details
 * (dates, place, tickets). It follows the article pages of the Alternative Dublin social
 * templates: the same margins, sizes and greys. Everything under the title is one size, and
 * what matters more or less is told apart by weight alone.
 */
export type ImageHeight = 'none' | 'short' | 'medium' | 'tall'
export const IMAGE_HEIGHTS: Record<ImageHeight, number> = { none: 0, short: 340, medium: 430, tall: 540 }

export interface InsideOptions {
  title: string
  body: string
  /** Dates, places, tickets: set lighter than the story. */
  details: string
  image: ImageHeight
  logo: LogoSide
  arrow: boolean
}

/** Inside pages keep 56px from the edges, not a cover's 80: there is more to fit. */
export const PAGE_MARGIN = 56
export const TEXT_WIDTH = POST_FRAME.width - PAGE_MARGIN * 2
/** The logo is small on an inside page, and the marks sit on the page's own margin. */
export const INSIDE_MARKS = { margin: PAGE_MARGIN, logoWidth: 128 }

export const TITLE = { weight: 700, largest: 72, smallest: 50, lineHeight: 1.08, lines: 3, mostLines: 4, fill: BRAND.light }
export const BODY = { weight: 500, size: 38, lineHeight: 1.32, paragraphGap: 26, bulletGap: 8, indent: 44, fill: '#C2C2C2' }
/** Details are the story's size in a lighter weight. */
export const DETAILS = { weight: 400 }
/** A line in stars is bold and white, in the story or the details: a name, a lead sentence. */
export const STRONG = { weight: 700, fill: BRAND.light }
const GAP = { aboveTitle: 44, aboveBody: 34, aboveDetails: 40, aboveArrow: 24, underLogo: 48 }

// Barlow's own line is 1.2 of the type size (1.0 above the baseline, 0.2 below). A browser
// centres that in the line height, and the pages are set the way the templates' pages were.
const baselineIn = (size: number, lineHeight: number) => size * (lineHeight / 2 + 0.4)

export type MeasureWidth = (text: string, size: number, weight: number) => number

export interface InsideLayout {
  /** Where the picture goes, or null for a page with none. */
  banner: Box | null
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

/**
 * Sets the page. The title takes the largest size from 72 down to 50 that fits it in three
 * lines; the story and the details are always 38. `marks` says where the logo ends and the
 * arrow starts, so the words keep clear of both.
 */
export function layoutInside(
  content: Pick<InsideOptions, 'title' | 'body' | 'image'> & { details?: string },
  measure: MeasureWidth,
  marks: { logoBottom?: number; arrowTop?: number } = {},
): InsideLayout {
  const height = IMAGE_HEIGHTS[content.image]
  const banner = height ? { x: 0, y: 0, width: POST_FRAME.width, height } : null
  const top = banner ? height + GAP.aboveTitle : marks.logoBottom ? marks.logoBottom + GAP.underLogo : PAGE_MARGIN
  const bottom = marks.arrowTop !== undefined ? marks.arrowTop - GAP.aboveArrow : POST_FRAME.height - PAGE_MARGIN

  const title = normaliseHeadline(content.title)
  const blocks = [
    { paragraphs: readLines(content.body), weight: BODY.weight },
    { paragraphs: readLines(content.details ?? ''), weight: DETAILS.weight },
  ].filter((block) => block.paragraphs.length)
  const layers: Layer[] = []

  const wrapTitle = (size: number) => wrapText(title, TEXT_WIDTH, (value) => measure(value, size, TITLE.weight), true, { balance: true })
  let titleSize = TITLE.largest
  let titleLines: string[] = []
  if (title) {
    while (titleSize > TITLE.smallest && wrapTitle(titleSize).length > TITLE.lines) titleSize -= 2
    titleLines = wrapTitle(titleSize)
  }
  const titlePitch = titleSize * TITLE.lineHeight
  titleLines.forEach((line, index) => {
    layers.push(text(line, PAGE_MARGIN, top + index * titlePitch + baselineIn(titleSize, TITLE.lineHeight), titleSize, TITLE.weight, TITLE.fill))
  })

  const pitch = BODY.size * BODY.lineHeight
  const bodyTop = title ? top + titleLines.length * titlePitch + GAP.aboveBody : top
  let y = bodyTop
  let bodyLines = 0
  blocks.forEach((block, blockIndex) => {
    if (blockIndex > 0) y += GAP.aboveDetails
    block.paragraphs.forEach((paragraph, paragraphIndex) => {
      if (paragraphIndex > 0) y += BODY.paragraphGap
      paragraph.forEach((typed, lineIndex) => {
        if (lineIndex > 0 && typed.bullet && paragraph[lineIndex - 1].bullet) y += BODY.bulletGap
        const weight = typed.strong ? STRONG.weight : block.weight
        const fill = typed.strong ? STRONG.fill : BODY.fill
        const indent = typed.bullet ? BODY.indent : 0
        const lines = wrapText(typed.text, TEXT_WIDTH - indent, (value) => measure(value, BODY.size, weight), true)
        if (typed.bullet) layers.push(text('•', PAGE_MARGIN + 10, y + baselineIn(BODY.size, BODY.lineHeight), BODY.size, weight, fill))
        for (const line of lines) {
          layers.push(text(line, PAGE_MARGIN + indent, y + baselineIn(BODY.size, BODY.lineHeight), BODY.size, weight, fill))
          y += pitch
          bodyLines += 1
        }
      })
    })
  })

  // The gaps between paragraphs take room too, so the body's room is counted in whole lines of what is left.
  const gaps = y - bodyTop - bodyLines * pitch
  const bodyRoom = Math.max(0, Math.floor((bottom - bodyTop - gaps + 0.5) / pitch))
  const over = Math.max(0, bodyLines - bodyRoom)
  const overflow = titleLines.length > TITLE.mostLines ? 'title' : over > 0 ? 'body' : null

  return { banner, layers, titleSize, titleLines: titleLines.length, bodyLines, bodyRoom, overflow, over, empty: !title && !blocks.length }
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
    context.rect(0, 0, banner.width, banner.height)
    context.clip()
    context.imageSmoothingQuality = 'high'
    context.drawImage(options.photo.image, rect.x, rect.y, rect.width, rect.height)
    if (options.darken > 0) {
      context.fillStyle = `rgba(0,0,0,${options.darken})`
      context.fillRect(0, 0, banner.width, banner.height)
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
    banner = `<image xlink:href="${escapeAttribute(photo)}" width="${width}" height="${layout.banner.height}" preserveAspectRatio="xMidYMid slice"/>`
    if (darken > 0) banner += `<rect width="${width}" height="${layout.banner.height}" fill="#000" opacity="${darken}"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${defs}<rect width="${width}" height="${height}" fill="${BRAND.dark}"/>${banner}${layersToSvg(furniture)}${layersToSvg(layout.layers)}</svg>`
}

export const INSIDE_KEY = 'tape-type-inside-v1'
export const insideDefaults: InsideOptions = {
  title: 'Bolands Mills is set to come alive this Culture Night',
  body: 'A free evening of live music, art, storytelling and movement, with performances from AE MAK, Sorcha Richardson and Zaska on the Factory Main Stage.',
  details: 'Friday 18 September · 6.30pm\nBolands Mills, Dublin 4\nFree, no ticket needed',
  image: 'medium',
  logo: 'off',
  arrow: true,
}

/** Stored pages are untrusted, like everything else that is remembered. */
export function sanitizeInside(stored: Record<string, unknown>): InsideOptions {
  const words = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback)
  return {
    title: words(stored.title, insideDefaults.title),
    body: words(stored.body, insideDefaults.body),
    // A page saved before details existed has none, not the sample ones.
    details: words(stored.details, typeof stored.body === 'string' ? '' : insideDefaults.details),
    image: Object.keys(IMAGE_HEIGHTS).includes(stored.image as string) ? stored.image as ImageHeight : insideDefaults.image,
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
