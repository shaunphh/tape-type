import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH, SAFE_MARGIN } from './settings'
import type { GeneratorSettings, ShapeResult, TapeTone } from './types'

export const FONT_FAMILY = 'Barlow'
export const FONT_WEIGHT = 700
export const fontShorthand = (size: number) => `${FONT_WEIGHT} ${size}px "${FONT_FAMILY}"`

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
export const BACKGROUND_FILLS: Partial<Record<PreviewBackground, string>> = { charcoal: '#242424', yellow: BRAND.yellow }

/** One drawing list feeds the live preview, the SVG exports and the PNG exports, so they cannot drift apart. */
export type Layer =
  | { kind: 'path'; d: string; fill: string; angle: number; cx: number; cy: number }
  | { kind: 'text'; text: string; x: number; y: number; size: number; fill: string; angle: number; cx: number; cy: number }

/** Control characters are invisible in the preview but make SVG exports invalid XML. */
export const stripControlCharacters = (value: string) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')

export function buildLayers(shape: ShapeResult, settings: Pick<GeneratorSettings, 'tone'>, fontSize: number): Layer[] {
  const tone = tones.find((entry) => entry.value === settings.tone) ?? tones[0]
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
    if (!blank) texts.push({ kind: 'text', text: piece.line.text, x: piece.line.x, y: piece.line.baseline, size: fontSize, fill: tone.text, angle: piece.angle, cx: piece.cx, cy: piece.cy })
  }
  if (shape.eyebrow) {
    const { eyebrow } = shape
    // On a yellow headline the label flips to white so it still reads as a separate tag.
    const fill = settings.tone === 'yellow' ? BRAND.white : BRAND.yellow
    layers.push({ kind: 'path', d: eyebrow.path, fill, angle: eyebrow.angle, cx: eyebrow.centerX, cy: eyebrow.centerY })
    texts.push({ kind: 'text', text: eyebrow.text, x: eyebrow.x, y: eyebrow.baseline, size: eyebrow.fontSize, fill: BRAND.dark, angle: eyebrow.angle, cx: eyebrow.centerX, cy: eyebrow.centerY })
  }
  return [...layers, ...texts]
}

export const escapeText = (value: string) => stripControlCharacters(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const escapeAttribute = (value: string) => stripControlCharacters(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

export function layersToSvg(layers: Layer[]) {
  return layers.map((layer) => {
    const transform = layer.angle ? ` transform="rotate(${layer.angle} ${layer.cx} ${layer.cy})"` : ''
    if (layer.kind === 'path') return `<path d="${layer.d}" fill="${layer.fill}"${transform}/>`
    return `<text x="${layer.x}" y="${layer.y}" font-family="${FONT_FAMILY}, sans-serif" font-size="${layer.size}" font-weight="${FONT_WEIGHT}" fill="${layer.fill}"${transform}>${escapeText(layer.text)}</text>`
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
      context.font = fontShorthand(layer.size)
      context.textAlign = 'start'
      context.textBaseline = 'alphabetic'
      context.fillText(layer.text, layer.x, layer.y)
    }
    context.restore()
  }
}

/**
 * Where the artwork sits on the artboard: centred on `position` (percentages), then clamped
 * so the text ink and eyebrow stay inside the 80px safe area on every side.
 */
export function getPlacement(shape: ShapeResult, position: Position) {
  const clamp = (value: number, minimum: number, maximum: number, centre: number) =>
    minimum <= maximum ? Math.max(minimum, Math.min(maximum, value)) : centre

  const inkSpans = shape.lines.filter((line) => line.text.trim()).map((line) => [line.inkX ?? line.x, (line.inkX ?? line.x) + line.width])
  if (shape.eyebrow) inkSpans.push([shape.eyebrow.box.x, shape.eyebrow.box.x + shape.eyebrow.box.width])
  const textLeft = inkSpans.length ? Math.min(...inkSpans.map(([left]) => left)) : shape.viewBox.x
  const textRight = inkSpans.length ? Math.max(...inkSpans.map(([, right]) => right)) : shape.viewBox.x + shape.viewBox.width
  const x = clamp(
    ARTBOARD_WIDTH * position.x / 100 - (shape.viewBox.x + shape.viewBox.width / 2),
    SAFE_MARGIN - textLeft,
    ARTBOARD_WIDTH - SAFE_MARGIN - textRight,
    ARTBOARD_WIDTH / 2 - (textLeft + textRight) / 2,
  )

  const top = shape.inkBounds?.top ?? shape.viewBox.y
  const bottom = shape.inkBounds?.bottom ?? shape.viewBox.y + shape.viewBox.height
  const y = clamp(
    ARTBOARD_HEIGHT * position.y / 100 - (shape.viewBox.y + shape.viewBox.height / 2),
    SAFE_MARGIN - top,
    ARTBOARD_HEIGHT - SAFE_MARGIN - bottom,
    ARTBOARD_HEIGHT / 2 - (top + bottom) / 2,
  )
  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }
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
    const href = escapeAttribute(photo)
    // xlink:href as well as href: Illustrator and older SVG tools only read the xlink form.
    backgroundMarkup = `<image href="${href}" xlink:href="${href}" width="${ARTBOARD_WIDTH}" height="${ARTBOARD_HEIGHT}" preserveAspectRatio="xMidYMid slice"/><rect width="${ARTBOARD_WIDTH}" height="${ARTBOARD_HEIGHT}" fill="#000" opacity=".12"/>`
  }
  const placement = getPlacement(shape, position)
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${ARTBOARD_WIDTH} ${ARTBOARD_HEIGHT}" width="${ARTBOARD_WIDTH}" height="${ARTBOARD_HEIGHT}">${defs}${backgroundMarkup}<g transform="translate(${placement.x} ${placement.y})">${layersToSvg(layers)}</g></svg>`
}
