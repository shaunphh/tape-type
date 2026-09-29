import logoLeftSvg from './assets/logo-left.svg?raw'
import logoRightSvg from './assets/logo-right.svg?raw'
import swipeArrowSvg from './assets/swipe-arrow.svg?raw'
import { BRAND, type Layer, type Obstacle } from './artwork'
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH, SAFE_MARGIN } from './settings'

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
/** The painted arrow is used at the size it was drawn. */
export const ARROW_WIDTH = swipeArrow.width
/** Clear space between a mark and the headline's lettering: room for the tape and the eyebrow tag. */
const CLEARANCE = 56

export interface Box { x: number; y: number; width: number; height: number }

const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places

const draw = (mark: Mark, box: Box, fill: string): Layer[] =>
  mark.paths.map((d) => ({ kind: 'path', d, fill, angle: 0, cx: 0, cy: 0, place: { x: round(box.x), y: round(box.y), scale: round(box.width / mark.width, 5) } }))

const sized = (mark: Mark, width: number) => ({ width, height: mark.height * width / mark.width })

/** Where each mark sits: the logo in a top corner of the safe area, the arrow in its bottom right corner. */
export function furnitureBoxes(furniture: Pick<Furniture, 'logo' | 'arrow'>): { logo?: Box; arrow?: Box } {
  const right = ARTBOARD_WIDTH - SAFE_MARGIN
  const bottom = ARTBOARD_HEIGHT - SAFE_MARGIN
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
export function buildFurniture(furniture: Pick<Furniture, 'logo' | 'arrow'>, colours: { logo: MarkColour; arrow: MarkColour }): Layer[] {
  const boxes = furnitureBoxes(furniture)
  return [
    ...(boxes.logo && furniture.logo !== 'off' ? draw(logos[furniture.logo], boxes.logo, MARK_FILLS[colours.logo]) : []),
    ...(boxes.arrow ? draw(swipeArrow, boxes.arrow, MARK_FILLS[colours.arrow]) : []),
  ]
}

/** Each mark with the clear space around it: what the headline's lettering keeps out of. */
export function furnitureObstacles(furniture: Pick<Furniture, 'logo' | 'arrow'>): Obstacle[] {
  const boxes = furnitureBoxes(furniture)
  return [boxes.logo, boxes.arrow].flatMap((box) => (box ? [{
    left: round(box.x - CLEARANCE),
    top: round(box.y - CLEARANCE),
    right: round(box.x + box.width + CLEARANCE),
    bottom: round(box.y + box.height + CLEARANCE),
  }] : []))
}

/** How light an sRGB colour looks (CIE L*, 0 black to 100 white) once `darken` of black is laid over it. */
export function lightnessOf(red: number, green: number, blue: number, darken = 0) {
  const linear = (channel: number) => {
    const value = channel * (1 - darken) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
  return luminance > 0.008856 ? 116 * Math.cbrt(luminance) - 16 : 903.3 * luminance
}

// Yellow is the brand's first choice, and is kept for dark ground, where it is strongest. Mid
// tones (a blue sky, grey stone) take the light mark, as on the mock-up. Bright ground takes the dark one.
const YELLOW_UP_TO = 42
const LIGHT_UP_TO = 62
const DARK_FROM = 50
/** The share of the ground under a mark that has to suit a colour for it to be picked. */
const ENOUGH = 0.75

/**
 * Picks a mark's colour from how light the ground under it is (one L* value per sample of that
 * ground): the first of yellow, light and dark that suits enough of it. With nothing to go on
 * (a see-through background) it is yellow.
 */
export function pickMarkColour(ground: number[]): MarkColour {
  if (!ground.length) return 'yellow'
  const share = (suits: (lightness: number) => boolean) => ground.filter(suits).length / ground.length
  const shares: Record<MarkColour, number> = {
    yellow: share((lightness) => lightness <= YELLOW_UP_TO),
    light: share((lightness) => lightness <= LIGHT_UP_TO),
    dark: share((lightness) => lightness >= DARK_FROM),
  }
  const suited = (['yellow', 'light', 'dark'] as const).find((colour) => shares[colour] >= ENOUGH)
  // Ground that is part dark and part bright suits nothing well: take whichever covers more of it.
  return suited ?? (shares.dark > shares.light ? 'dark' : 'light')
}
