import logoLeftSvg from './assets/logo-left.svg?raw'
import logoRightSvg from './assets/logo-right.svg?raw'
import swipeArrowSvg from './assets/swipe-arrow.svg?raw'
import { BRAND, type Layer, type Obstacle } from './artwork'
import { POST_FRAME, SAFE_MARGIN, type Frame } from './settings'

export type LogoSide = 'off' | 'left' | 'right'
export type MarkColour = 'yellow' | 'light' | 'dark'
/** A mark's colour is picked for it from what it sits on, unless one is chosen. */
export type ColourChoice = 'auto' | MarkColour

/** The fixed marks a finished cover carries besides its headline. */
export interface Furniture {
  logo: LogoSide
  logoColour: ColourChoice
  arrow: boolean
  arrowColour: ColourChoice
}

export interface Mark {
  width: number
  height: number
  paths: string[]
}

export const MARK_FILLS: Record<MarkColour, string> = { yellow: BRAND.yellow, light: BRAND.light, dark: BRAND.dark }

/** The files in src/assets are cropped to their artwork (scripts/prepare-mark.mjs), so the viewBox is the mark's size. */
export function readMark(svg: string): Mark {
  const [, , width, height] = (/viewBox="([^"]+)"/.exec(svg)?.[1] ?? '').split(/\s+/).map(Number)
  const paths = [...svg.matchAll(/<path[^>]*?\sd="([^"]+)"/g)].map((match) => match[1])
  if (!(width > 0) || !(height > 0) || !paths.length) throw new Error('Unreadable mark')
  return { width, height, paths }
}

const logos = { left: readMark(logoLeftSvg), right: readMark(logoRightSvg) }
const swipeArrow = readMark(swipeArrowSvg)

// Measured from the cover mock-up: the logo is about a quarter of the cover wide.
export const LOGO_WIDTH = 250
/** The painted arrow was drawn 137px wide; it is used a little smaller. */
export const ARROW_WIDTH = 110
/** Clear space between a mark and the headline's lettering: room for the tape and the eyebrow tag. */
const CLEARANCE = 56

export interface Box { x: number; y: number; width: number; height: number }

const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places

const draw = (mark: Mark, box: Box, fill: string): Layer[] =>
  mark.paths.map((d) => ({ kind: 'path', d, fill, angle: 0, cx: 0, cy: 0, place: { x: round(box.x), y: round(box.y), scale: round(box.width / mark.width, 5) } }))

const sized = (mark: Mark, width: number) => ({ width, height: mark.height * width / mark.width })

/**
 * Where each mark sits: the logo in a top corner, the arrow in the bottom right one, 80px in
 * from the edges of the whole cover (on a video cover that is outside what the profile grid shows).
 */
export function furnitureBoxes(furniture: Pick<Furniture, 'logo' | 'arrow'>, frame: Frame = POST_FRAME): { logo?: Box; arrow?: Box } {
  const right = frame.width - SAFE_MARGIN
  const bottom = frame.height - SAFE_MARGIN
  let logo: Box | undefined
  if (furniture.logo !== 'off') {
    const size = sized(logos[furniture.logo], LOGO_WIDTH)
    logo = { x: furniture.logo === 'left' ? SAFE_MARGIN : right - size.width, y: SAFE_MARGIN, ...size }
  }
  let arrow: Box | undefined
  if (furniture.arrow) {
    const size = sized(swipeArrow, ARROW_WIDTH)
    arrow = { x: right - size.width, y: bottom - size.height, ...size }
  }
  return { logo, arrow }
}

/** The logo and swipe arrow as layers, in artboard coordinates, each in the colour settled for it. */
export function buildFurniture(furniture: Pick<Furniture, 'logo' | 'arrow'>, colours: { logo: MarkColour; arrow: MarkColour }, frame: Frame = POST_FRAME): Layer[] {
  const boxes = furnitureBoxes(furniture, frame)
  return [
    ...(boxes.logo && furniture.logo !== 'off' ? draw(logos[furniture.logo], boxes.logo, MARK_FILLS[colours.logo]) : []),
    ...(boxes.arrow ? draw(swipeArrow, boxes.arrow, MARK_FILLS[colours.arrow]) : []),
  ]
}

/** Each mark with the clear space around it: what the headline's lettering keeps out of. */
export function furnitureObstacles(furniture: Pick<Furniture, 'logo' | 'arrow'>, frame: Frame = POST_FRAME): Obstacle[] {
  const boxes = furnitureBoxes(furniture, frame)
  return [boxes.logo, boxes.arrow].flatMap((box) => (box ? [{
    left: round(box.x - CLEARANCE),
    top: round(box.y - CLEARANCE),
    right: round(box.x + box.width + CLEARANCE),
    bottom: round(box.y + box.height + CLEARANCE),
  }] : []))
}

/** How bright an sRGB colour is on screen (0 black to 1 white) once `darken` of black is laid over it. */
export function luminanceOf(red: number, green: number, blue: number, darken = 0) {
  const channel = (value: number) => (value * (1 - darken) / 255) ** 2.4
  const luminance = 0.2126729 * channel(red) + 0.7151522 * channel(green) + 0.072175 * channel(blue)
  // Near-black is lifted a little: neither screens nor eyes tell the darkest tones apart.
  return luminance < 0.022 ? luminance + (0.022 - luminance) ** 1.414 : luminance
}

const fillLuminance = (fill: string) => luminanceOf(parseInt(fill.slice(1, 3), 16), parseInt(fill.slice(3, 5), 16), parseInt(fill.slice(5, 7), 16))

/**
 * How strongly a mark stands out from the ground behind it, from 0 (not at all) to about 106
 * (black on white), both given as luminance. This is the perceptual contrast measure drafted for
 * the next accessibility guidelines (APCA). Unlike the older contrast ratio it agrees with the
 * eye that light marks hold up on mid tones such as a blue sky.
 */
export function contrast(mark: number, ground: number) {
  if (Math.abs(ground - mark) < 0.0005) return 0
  const raw = ground > mark ? (ground ** 0.56 - mark ** 0.57) * 1.14 : (ground ** 0.65 - mark ** 0.62) * 1.14
  return Math.abs(raw) < 0.1 ? 0 : (Math.abs(raw) - 0.027) * 100
}

/** The contrast a mark needs to read: the guideline figure for large, heavy lettering is 45. */
export const READS_FROM = 50
/** The share of the ground under a mark that a colour has to read on. */
const ENOUGH = 0.75

const COLOURS: readonly MarkColour[] = ['yellow', 'light', 'dark']
const FALLBACKS: readonly MarkColour[] = ['light', 'dark']
const MARK_LUMINANCE = Object.fromEntries(COLOURS.map((colour) => [colour, fillLuminance(MARK_FILLS[colour])])) as Record<MarkColour, number>

/** What was settled for a mark's colour. */
export interface Ruling {
  /** The colour the mark is drawn in. */
  colour: MarkColour
  /** Whether that colour reads on the ground under the mark. */
  reads: boolean
}

/**
 * Settles a mark's colour from the ground under it (one luminance per sample, as the cover shows
 * it). A chosen colour is used as it is. On Auto the mark is yellow wherever yellow reads; where
 * it doesn't, it takes the colour that does read there, and where nothing reads (ground that is
 * part dark, part bright) whatever reads on most of it. With nothing behind the mark to check (a
 * see-through background) Auto is yellow.
 */
export function settleColour(choice: ColourChoice, ground: number[]): Ruling {
  const measure = (colour: MarkColour) => {
    const values = ground.map((sample) => contrast(MARK_LUMINANCE[colour], sample))
    return {
      share: values.length ? values.filter((value) => value >= READS_FROM).length / values.length : 1,
      strength: values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0,
    }
  }
  const measured = { yellow: measure('yellow'), light: measure('light'), dark: measure('dark') }
  const reads = (colour: MarkColour) => measured[colour].share >= ENOUGH
  // Ties go to the colour listed first, so yellow is kept whenever it does as well as another.
  const most = (colours: readonly MarkColour[], by: 'share' | 'strength') =>
    colours.reduce((held, colour) => (measured[colour][by] > measured[held][by] ? colour : held))
  const fallbacks = FALLBACKS.filter(reads)
  const automatic = reads('yellow') ? 'yellow' : fallbacks.length ? most(fallbacks, 'strength') : most(COLOURS, 'share')
  const colour = choice === 'auto' ? automatic : choice
  return { colour, reads: reads(colour) }
}
