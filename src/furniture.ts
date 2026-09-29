import logoLeftSvg from './assets/logo-left.svg?raw'
import logoRightSvg from './assets/logo-right.svg?raw'
import swipeArrowSvg from './assets/swipe-arrow.svg?raw'
import swipeWordsSvg from './assets/swipe-for-more.svg?raw'
import { BRAND, type Layer, type PreviewBackground, type Reserve } from './artwork'
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH, SAFE_MARGIN } from './settings'

export type LogoSide = 'off' | 'left' | 'right'

/** The fixed marks a finished cover carries besides its headline. */
export interface Furniture {
  logo: LogoSide
  swipe: boolean
}

export interface Mark {
  width: number
  height: number
  paths: string[]
}

/** The files in src/assets are cropped to their artwork (scripts/prepare-mark.mjs), so the viewBox is the mark's size. */
export function readMark(svg: string): Mark {
  const [, , width, height] = (/viewBox="([^"]+)"/.exec(svg)?.[1] ?? '').split(/\s+/).map(Number)
  const paths = [...svg.matchAll(/<path[^>]*?\sd="([^"]+)"/g)].map((match) => match[1])
  if (!(width > 0) || !(height > 0) || !paths.length) throw new Error('Unreadable mark')
  return { width, height, paths }
}

const logos = { left: readMark(logoLeftSvg), right: readMark(logoRightSvg) }
const swipeArrow = readMark(swipeArrowSvg)
const swipeWords = readMark(swipeWordsSvg)

// Measured from the cover mock-up: the logo is about a quarter of the cover wide, and the prompt
// is set in 40px capitals (the size its outlines were drawn at).
export const LOGO_WIDTH = 250
/** The painted arrow runs a little taller than the words, which sit level with its point. */
const ARROW_HEIGHT = 72
const ARROW_GAP = 14
/** How far down the arrow its point is, as a share of its height. */
const ARROW_POINT = 0.66
/** Clear space between a mark and the headline's lettering: room for the tape and the eyebrow tag. */
const CLEARANCE = 56

interface Box { x: number; y: number; width: number; height: number }

const draw = (mark: Mark, box: Box, fill: string): Layer[] =>
  mark.paths.map((d) => ({ kind: 'path', d, fill, angle: 0, cx: 0, cy: 0, place: { x: round(box.x), y: round(box.y), scale: round(box.width / mark.width, 5) } }))

const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places

const sized = (mark: Mark, size: { width: number } | { height: number }) => {
  const scale = 'width' in size ? size.width / mark.width : size.height / mark.height
  return { width: mark.width * scale, height: mark.height * scale }
}

/** Where each mark sits: in the corners of the safe area, the words of the prompt standing on its bottom line. */
export function furnitureBoxes(furniture: Furniture) {
  const right = ARTBOARD_WIDTH - SAFE_MARGIN
  const bottom = ARTBOARD_HEIGHT - SAFE_MARGIN
  let logo: Box | undefined
  if (furniture.logo !== 'off') {
    const size = sized(logos[furniture.logo], { width: LOGO_WIDTH })
    logo = { x: furniture.logo === 'left' ? SAFE_MARGIN : right - size.width, y: SAFE_MARGIN, ...size }
  }
  let words: Box | undefined
  let arrow: Box | undefined
  if (furniture.swipe) {
    const arrowSize = sized(swipeArrow, { height: ARROW_HEIGHT })
    const wordsY = bottom - swipeWords.height
    arrow = { x: right - arrowSize.width, y: wordsY + swipeWords.height / 2 - arrowSize.height * ARROW_POINT, ...arrowSize }
    words = { x: arrow.x - ARROW_GAP - swipeWords.width, y: wordsY, width: swipeWords.width, height: swipeWords.height }
  }
  return { logo, words, arrow }
}

/**
 * The logo and swipe prompt as layers, in artboard coordinates. They are yellow, except on the
 * yellow background, where they turn black.
 */
export function buildFurniture(furniture: Furniture, background: PreviewBackground): Layer[] {
  const fill = background === 'yellow' ? BRAND.dark : BRAND.yellow
  const boxes = furnitureBoxes(furniture)
  return [
    ...(boxes.logo && furniture.logo !== 'off' ? draw(logos[furniture.logo], boxes.logo, fill) : []),
    ...(boxes.words ? draw(swipeWords, boxes.words, fill) : []),
    ...(boxes.arrow ? draw(swipeArrow, boxes.arrow, fill) : []),
  ]
}

/** The room the marks need, which the headline's lettering keeps out of wherever it is moved. */
export function furnitureReserve(furniture: Furniture): Reserve {
  const boxes = furnitureBoxes(furniture)
  const promptTop = Math.min(boxes.words?.y ?? Infinity, boxes.arrow?.y ?? Infinity)
  return {
    top: boxes.logo ? round(boxes.logo.y + boxes.logo.height - SAFE_MARGIN + CLEARANCE) : 0,
    bottom: Number.isFinite(promptTop) ? round(ARTBOARD_HEIGHT - SAFE_MARGIN - promptTop + CLEARANCE) : 0,
  }
}
