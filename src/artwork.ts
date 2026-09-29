import { POST_FRAME, type Frame } from './settings'
import { cleanText } from './text'
import type { ShapeResult, TapeTone } from './types'

export const FONT_FAMILY = 'Barlow'
export const fontShorthand = (size: number, weight: number) => `${weight} ${size}px "${FONT_FAMILY}"`

// The Alternative Dublin brand colours.
export const BRAND = { yellow: '#FFEF3A', light: '#F0F0F0', dark: '#101010', white: '#FFFFFF' }

export const tones: { value: TapeTone; label: string; tape: string | null; text: string }[] = [
  { value: 'light', label: 'Light', tape: BRAND.light, text: BRAND.dark },
  { value: 'dark', label: 'Dark', tape: BRAND.dark, text: BRAND.white },
  { value: 'yellow', label: 'Yellow', tape: BRAND.yellow, text: BRAND.dark },
  { value: 'none', label: 'None', tape: null, text: BRAND.white },
]

export type PreviewBackground = 'transparent' | 'charcoal' | 'yellow' | 'photo'
export type Position = { x: number; y: number }
export const BACKGROUND_FILLS: Partial<Record<PreviewBackground, string>> = { charcoal: BRAND.dark, yellow: BRAND.yellow }
/** How much black is laid over a photo so the words and marks read on it. */
export const PHOTO_DARKEN = 0.15

/** Where a mark drawn in its own units (the logo, the swipe arrow) sits on the artboard. */
export interface Place { x: number; y: number; scale: number }
/** A part of the artboard the lettering keeps out of: a mark, with the clear space around it. */
export interface Obstacle { left: number; top: number; right: number; bottom: number }

/** One drawing list feeds the live preview, the SVG exports and the PNG exports, so they cannot drift apart. */
export type Layer =
  | { kind: 'path'; d: string; fill: string; angle: number; cx: number; cy: number; place?: Place }
  | { kind: 'text'; text: string; x: number; y: number; size: number; weight: number; fill: string; angle: number; cx: number; cy: number }

export interface LayerOptions {
  tone: TapeTone
  background: PreviewBackground
  /** Weight of the headline lettering (the eyebrow is always Bold). */
  weight: number
  /** The eyebrow tag's colours, where a look sets its own instead of the usual yellow tag. */
  tag?: { tape: string; text: string }
}

export function buildLayers(shape: ShapeResult, options: LayerOptions, fontSize: number): Layer[] {
  const tone = tones.find((entry) => entry.value === options.tone) ?? tones[0]
  const layers: Layer[] = []
  const texts: Layer[] = []
  const hasText = shape.lines.some((line) => line.text.trim())
  const pieces = shape.strips?.length
    ? shape.strips.map((strip) => ({ path: strip.path, line: strip.line, angle: strip.angle, cx: strip.centerX, cy: strip.centerY }))
    : shape.lines.map((line, index) => ({ path: index === 0 ? shape.path : '', line, angle: 0, cx: 0, cy: 0 }))

  for (const piece of pieces) {
    const blank = !piece.line.text.trim()
    // An empty strip would be a stray stub of tape; a connected block is drawn once there is any text.
    const drawTape = tone.tape && piece.path && (shape.strips?.length ? !blank : hasText)
    if (drawTape) layers.push({ kind: 'path', d: piece.path, fill: tone.tape as string, angle: piece.angle, cx: piece.cx, cy: piece.cy })
    if (!blank) texts.push({ kind: 'text', text: piece.line.text, x: piece.line.x, y: piece.line.baseline, size: fontSize, weight: options.weight, fill: tone.text, angle: piece.angle, cx: piece.cx, cy: piece.cy })
  }
  if (shape.eyebrow) {
    const { eyebrow } = shape
    // A yellow label would vanish on yellow tape or a yellow background, so it turns white there.
    const fill = options.tag?.tape ?? (options.tone === 'yellow' || options.background === 'yellow' ? BRAND.white : BRAND.yellow)
    layers.push({ kind: 'path', d: eyebrow.path, fill, angle: eyebrow.angle, cx: eyebrow.centerX, cy: eyebrow.centerY })
    texts.push({ kind: 'text', text: eyebrow.text, x: eyebrow.x, y: eyebrow.baseline, size: eyebrow.fontSize, weight: 700, fill: options.tag?.text ?? BRAND.dark, angle: eyebrow.angle, cx: eyebrow.centerX, cy: eyebrow.centerY })
  }
  return [...layers, ...texts]
}

/** The lettering in a layer list, by weight: which font files an export needs. */
export const textRuns = (layers: Layer[]) => layers.flatMap((layer) => (layer.kind === 'text' ? [{ text: layer.text, weight: layer.weight }] : []))

export const escapeText = (value: string) => cleanText(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const escapeAttribute = (value: string) => cleanText(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** The SVG transform that puts a layer in place, or undefined when it needs none. */
export function layerTransform(layer: Layer) {
  const place = layer.kind === 'path' && layer.place ? `translate(${layer.place.x} ${layer.place.y}) scale(${layer.place.scale})` : ''
  const turn = layer.angle ? `rotate(${layer.angle} ${layer.cx} ${layer.cy})` : ''
  return [place, turn].filter(Boolean).join(' ') || undefined
}

export function layersToSvg(layers: Layer[]) {
  return layers.map((layer) => {
    const placed = layerTransform(layer)
    const transform = placed ? ` transform="${placed}"` : ''
    if (layer.kind === 'path') return `<path d="${layer.d}" fill="${layer.fill}"${transform}/>`
    return `<text x="${layer.x}" y="${layer.y}" font-family="${FONT_FAMILY}, sans-serif" font-size="${layer.size}" font-weight="${layer.weight}" fill="${layer.fill}"${transform}>${escapeText(layer.text)}</text>`
  }).join('')
}

export function drawLayers(context: CanvasRenderingContext2D, layers: Layer[]) {
  for (const layer of layers) {
    context.save()
    if (layer.kind === 'path' && layer.place) {
      context.translate(layer.place.x, layer.place.y)
      context.scale(layer.place.scale, layer.place.scale)
    }
    if (layer.angle) {
      context.translate(layer.cx, layer.cy)
      context.rotate(layer.angle * Math.PI / 180)
      context.translate(-layer.cx, -layer.cy)
    }
    context.fillStyle = layer.fill
    if (layer.kind === 'path') {
      context.fill(new Path2D(layer.d))
    } else {
      context.font = fontShorthand(layer.size, layer.weight)
      context.textAlign = 'start'
      context.textBaseline = 'alphabetic'
      context.fillText(layer.text, layer.x, layer.y)
    }
    context.restore()
  }
}

const inkOf = (shape: ShapeResult) => {
  const { viewBox } = shape
  return shape.inkBox ?? { left: viewBox.x, right: viewBox.x + viewBox.width, top: viewBox.y, bottom: viewBox.y + viewBox.height }
}

/**
 * How far the artwork can be moved on each axis (as a translation) while all lettering stays
 * inside the frame's safe area (80px in from the edges of a post). The tape and the eyebrow tag
 * may reach into the margin.
 */
export function placementRange(shape: ShapeResult, frame: Frame = POST_FRAME) {
  const ink = inkOf(shape)
  const axis = (low: number, high: number, from: number, to: number) => {
    const minimum = from - low
    const maximum = to - high
    if (minimum <= maximum) return { minimum, maximum, excess: 0 }
    // Lettering bigger than the safe area can't move: centre it, and report by how much it overflows.
    const centred = (from + to - low - high) / 2
    return { minimum: centred, maximum: centred, excess: minimum - maximum }
  }
  return { x: axis(ink.left, ink.right, frame.safe.left, frame.safe.right), y: axis(ink.top, ink.bottom, frame.safe.top, frame.safe.bottom) }
}

/**
 * Where the artwork sits on the artboard. `position` runs 0–100% across the range that keeps the
 * lettering inside the safe area, so 0 is flush with the left (or top) margin and every drag or
 * key press moves the artwork: there is no stretch where it is stuck against a clamp.
 */
export function getPlacement(shape: ShapeResult, position: Position, obstacles: Obstacle[] = [], frame: Frame = POST_FRAME) {
  const range = placementRange(shape, frame)
  const along = (axis: { minimum: number; maximum: number }, percent: number) =>
    axis.minimum + (axis.maximum - axis.minimum) * Math.max(0, Math.min(100, percent)) / 100
  const place = stepAside(inkOf(shape), { x: along(range.x, position.x), y: along(range.y, position.y) }, range, obstacles)
  return { x: Math.round(place.x * 100) / 100, y: Math.round(place.y * 100) / 100 }
}

/**
 * Lettering that would sit on the logo or the swipe arrow steps aside, by the shortest way that
 * keeps it inside the safe area: a headline beside a mark stays where it was put, and one
 * dragged into a mark stops against it.
 */
function stepAside(
  ink: { left: number; right: number; top: number; bottom: number },
  from: { x: number; y: number },
  range: ReturnType<typeof placementRange>,
  obstacles: Obstacle[],
) {
  const place = { ...from }
  const hits = (obstacle: Obstacle) =>
    ink.left + place.x < obstacle.right && ink.right + place.x > obstacle.left && ink.top + place.y < obstacle.bottom && ink.bottom + place.y > obstacle.top
  // Stepping clear of one mark can land on another, so go round twice.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const obstacle of obstacles) {
      if (!hits(obstacle)) continue
      const moves = ([
        { axis: 'x', to: obstacle.left - ink.right },
        { axis: 'x', to: obstacle.right - ink.left },
        { axis: 'y', to: obstacle.top - ink.bottom },
        { axis: 'y', to: obstacle.bottom - ink.top },
      ] as const)
        .filter((move) => move.to >= range[move.axis].minimum - 0.01 && move.to <= range[move.axis].maximum + 0.01)
        .sort((a, b) => Math.abs(a.to - place[a.axis]) - Math.abs(b.to - place[b.axis]))
      if (moves.length) place[moves[0].axis] = moves[0].to
    }
  }
  return place
}

export interface SvgOptions {
  artboard?: boolean
  background?: PreviewBackground
  /** The part of the photo the cover shows, as a data URL. */
  photo?: string | null
  /** Black laid over the photo, 0–1. */
  darken?: number
  position?: Position
  fontCss?: string
  /** The logo and swipe arrow: drawn on the artboard itself, under the artwork, and left out of cutouts. */
  furniture?: Layer[]
  obstacles?: Obstacle[]
  /** The cover's size and safe area: a post unless given. */
  frame?: Frame
}

export function svgMarkup(layers: Layer[], shape: ShapeResult, options: SvgOptions = {}) {
  const { artboard = true, background = 'transparent', photo = null, darken = PHOTO_DARKEN, position = { x: 50, y: 50 }, fontCss = '', furniture = [], obstacles, frame = POST_FRAME } = options
  // Embedding Barlow keeps the text on its tape in browsers and viewers that don't have it installed.
  const defs = fontCss ? `<defs><style>${fontCss}</style></defs>` : ''
  if (!artboard) {
    const { viewBox } = shape
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}" width="${viewBox.width}" height="${viewBox.height}">${defs}${layersToSvg(layers)}</svg>`
  }
  let backgroundMarkup = ''
  const fill = BACKGROUND_FILLS[background]
  if (fill) backgroundMarkup = `<rect width="${frame.width}" height="${frame.height}" fill="${fill}"/>`
  if (background === 'photo' && photo) {
    // xlink:href is read by every SVG viewer (SVG 2 browsers, Figma, Illustrator, Inkscape), so the photo is written once.
    backgroundMarkup = `<image xlink:href="${escapeAttribute(photo)}" width="${frame.width}" height="${frame.height}" preserveAspectRatio="xMidYMid slice"/>`
    if (darken > 0) backgroundMarkup += `<rect width="${frame.width}" height="${frame.height}" fill="#000" opacity="${darken}"/>`
  }
  const placement = getPlacement(shape, position, obstacles, frame)
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${frame.width} ${frame.height}" width="${frame.width}" height="${frame.height}">${defs}${backgroundMarkup}${layersToSvg(furniture)}<g transform="translate(${placement.x} ${placement.y})">${layersToSvg(layers)}</g></svg>`
}
