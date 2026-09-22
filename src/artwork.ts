import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH, SAFE_MARGIN } from './settings'
import { cleanText } from './text'
import type { ShapeResult, TapeTone } from './types'

export const FONT_FAMILY = 'Barlow'
export const fontShorthand = (size: number, weight: number) => `${weight} ${size}px "${FONT_FAMILY}"`

// Sampled from the published Alternative Dublin covers.
export const BRAND = { yellow: '#FFE900', light: '#F1F1F1', dark: '#111111', white: '#FFFFFF' }

export const tones: { value: TapeTone; label: string; tape: string | null; text: string }[] = [
  { value: 'light', label: 'Light', tape: BRAND.light, text: BRAND.dark },
  { value: 'dark', label: 'Dark', tape: BRAND.dark, text: BRAND.white },
  { value: 'yellow', label: 'Yellow', tape: BRAND.yellow, text: BRAND.dark },
  { value: 'none', label: 'None', tape: null, text: BRAND.white },
]

export type PreviewBackground = 'transparent' | 'charcoal' | 'yellow' | 'photo'
export type Position = { x: number; y: number }
export const BACKGROUND_FILLS: Partial<Record<PreviewBackground, string>> = { charcoal: BRAND.dark, yellow: BRAND.yellow }

/** One drawing list feeds the live preview, the SVG exports and the PNG exports, so they cannot drift apart. */
export type Layer =
  | { kind: 'path'; d: string; fill: string; angle: number; cx: number; cy: number }
  | { kind: 'text'; text: string; x: number; y: number; size: number; weight: number; fill: string; angle: number; cx: number; cy: number }

export interface LayerOptions {
  tone: TapeTone
  background: PreviewBackground
  /** Weight of the headline lettering (the eyebrow is always Bold). */
  weight: number
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
    const fill = options.tone === 'yellow' || options.background === 'yellow' ? BRAND.white : BRAND.yellow
    layers.push({ kind: 'path', d: eyebrow.path, fill, angle: eyebrow.angle, cx: eyebrow.centerX, cy: eyebrow.centerY })
    texts.push({ kind: 'text', text: eyebrow.text, x: eyebrow.x, y: eyebrow.baseline, size: eyebrow.fontSize, weight: 700, fill: BRAND.dark, angle: eyebrow.angle, cx: eyebrow.centerX, cy: eyebrow.centerY })
  }
  return [...layers, ...texts]
}

/** The lettering in a layer list, by weight: which font files an export needs. */
export const textRuns = (layers: Layer[]) => layers.flatMap((layer) => (layer.kind === 'text' ? [{ text: layer.text, weight: layer.weight }] : []))

export const escapeText = (value: string) => cleanText(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const escapeAttribute = (value: string) => cleanText(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

export function layersToSvg(layers: Layer[]) {
  return layers.map((layer) => {
    const transform = layer.angle ? ` transform="rotate(${layer.angle} ${layer.cx} ${layer.cy})"` : ''
    if (layer.kind === 'path') return `<path d="${layer.d}" fill="${layer.fill}"${transform}/>`
    return `<text x="${layer.x}" y="${layer.y}" font-family="${FONT_FAMILY}, sans-serif" font-size="${layer.size}" font-weight="${layer.weight}" fill="${layer.fill}"${transform}>${escapeText(layer.text)}</text>`
  }).join('')
}

export function drawLayers(context: CanvasRenderingContext2D, layers: Layer[]) {
  for (const layer of layers) {
    context.save()
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

/**
 * How far the artwork can be moved on each axis (as a translation) while all lettering stays
 * inside the 80px safe area. The tape and the eyebrow tag may reach into the margin.
 */
export function placementRange(shape: ShapeResult) {
  const { viewBox } = shape
  const ink = shape.inkBox ?? { left: viewBox.x, right: viewBox.x + viewBox.width, top: viewBox.y, bottom: viewBox.y + viewBox.height }
  const axis = (low: number, high: number, size: number) => {
    const minimum = SAFE_MARGIN - low
    const maximum = size - SAFE_MARGIN - high
    if (minimum <= maximum) return { minimum, maximum, excess: 0 }
    // Lettering bigger than the safe area can't move: centre it, and report by how much it overflows.
    const centred = (size - low - high) / 2
    return { minimum: centred, maximum: centred, excess: minimum - maximum }
  }
  return { x: axis(ink.left, ink.right, ARTBOARD_WIDTH), y: axis(ink.top, ink.bottom, ARTBOARD_HEIGHT) }
}

/**
 * Where the artwork sits on the artboard. `position` runs 0–100% across the range that keeps the
 * lettering inside the safe area, so 0 is flush with the left (or top) margin and every drag or
 * key press moves the artwork: there is no stretch where it is stuck against a clamp.
 */
export function getPlacement(shape: ShapeResult, position: Position) {
  const range = placementRange(shape)
  const along = (axis: { minimum: number; maximum: number }, percent: number) =>
    axis.minimum + (axis.maximum - axis.minimum) * Math.max(0, Math.min(100, percent)) / 100
  return {
    x: Math.round(along(range.x, position.x) * 100) / 100,
    y: Math.round(along(range.y, position.y) * 100) / 100,
  }
}

export function svgMarkup(
  layers: Layer[],
  shape: ShapeResult,
  options: { artboard?: boolean; background?: PreviewBackground; photo?: string | null; position?: Position; fontCss?: string } = {},
) {
  const { artboard = true, background = 'transparent', photo = null, position = { x: 50, y: 50 }, fontCss = '' } = options
  // Embedding Barlow keeps the text on its tape in browsers and viewers that don't have it installed.
  const defs = fontCss ? `<defs><style>${fontCss}</style></defs>` : ''
  if (!artboard) {
    const { viewBox } = shape
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}" width="${viewBox.width}" height="${viewBox.height}">${defs}${layersToSvg(layers)}</svg>`
  }
  let backgroundMarkup = ''
  const fill = BACKGROUND_FILLS[background]
  if (fill) backgroundMarkup = `<rect width="${ARTBOARD_WIDTH}" height="${ARTBOARD_HEIGHT}" fill="${fill}"/>`
  if (background === 'photo' && photo) {
    // xlink:href is read by every SVG viewer (SVG 2 browsers, Figma, Illustrator, Inkscape), so the photo is written once.
    backgroundMarkup = `<image xlink:href="${escapeAttribute(photo)}" width="${ARTBOARD_WIDTH}" height="${ARTBOARD_HEIGHT}" preserveAspectRatio="xMidYMid slice"/><rect width="${ARTBOARD_WIDTH}" height="${ARTBOARD_HEIGHT}" fill="#000" opacity=".12"/>`
  }
  const placement = getPlacement(shape, position)
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${ARTBOARD_WIDTH} ${ARTBOARD_HEIGHT}" width="${ARTBOARD_WIDTH}" height="${ARTBOARD_HEIGHT}">${defs}${backgroundMarkup}<g transform="translate(${placement.x} ${placement.y})">${layersToSvg(layers)}</g></svg>`
}
