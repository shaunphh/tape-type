import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clipboard,
  Copy,
  Download,
  Image as ImageIcon,
  Lock,
  Sparkles,
  Unlock,
  Upload,
} from 'lucide-react'
import { buildShape, coverSizeFromCharacters, nextSeed, wrapText } from './geometry'
import { displayText } from './text'
import type {
  ColumnWidth,
  CoverStyle,
  EyebrowMetrics,
  GeneratorSettings,
  ShapeMode,
  ShapeResult,
  TapeTone,
  TextAlign,
} from './types'

const STORAGE_KEY = 'tape-type-settings-v7'
const ARTBOARD_WIDTH = 1080
const ARTBOARD_HEIGHT = 1350
const SAFE_MARGIN = 80
const TEXT_AREA_WIDTH = ARTBOARD_WIDTH - SAFE_MARGIN * 2
const FONT_FAMILY = 'Barlow'
const FONT_WEIGHT = 700
type PreviewBackground = 'transparent' | 'charcoal' | 'yellow' | 'photo'
type Position = { x: number; y: number }

// Sampled from the published Alternative Dublin covers.
const BRAND = { yellow: '#FFE900', light: '#F1F1F1', dark: '#111111', white: '#FFFFFF' }

const tones: { value: TapeTone; label: string; tape: string | null; text: string }[] = [
  { value: 'light', label: 'Light', tape: BRAND.light, text: BRAND.dark },
  { value: 'dark', label: 'Dark', tape: BRAND.dark, text: BRAND.white },
  { value: 'yellow', label: 'Yellow', tape: BRAND.yellow, text: BRAND.dark },
  { value: 'none', label: 'None', tape: null, text: BRAND.white },
]

const styles: { value: CoverStyle; label: string; description: string }[] = [
  { value: 'headline', label: 'Headline', description: 'Title Case · block or strips' },
  { value: 'feature', label: 'Feature', description: 'All caps · torn strips' },
]

// Choosing a style resets the treatment to its house look; everything stays adjustable afterwards.
const stylePresets: Record<CoverStyle, Partial<GeneratorSettings>> = {
  headline: { perLine: false, tone: 'light', align: 'left', mode: 'clean', column: 'narrow', hugStrength: 1, rotationVariance: 0, lineGap: 2 },
  feature: { perLine: true, tone: 'light', align: 'center', mode: 'torn', column: 'wide', hugStrength: 1, rotationVariance: 0.6, lineGap: 8 },
}

const eyebrowSuggestions = ['Breaking', 'News', 'Exclusive', 'The Big Read']

// Published headline blocks mostly sit in a column about half the cover wide; features run wider.
const columns: { value: ColumnWidth; label: string; width: number }[] = [
  { value: 'narrow', label: 'Narrow', width: 620 },
  { value: 'medium', label: 'Medium', width: 760 },
  { value: 'wide', label: 'Wide', width: TEXT_AREA_WIDTH },
]
const columnWidth = (column: ColumnWidth) => columns.find((entry) => entry.value === column)?.width ?? TEXT_AREA_WIDTH

const positions: { label: string; y: number }[] = [
  { label: 'Top', y: 18 },
  { label: 'Middle', y: 50 },
  { label: 'Bottom', y: 82 },
]

const samples = [
  'What’s new in Dublin',
  'Dublin gets a new night market',
  'A massive night market is coming to Smithfield this weekend',
  'How to make the most of a weekend visit to Dublin',
  'One of Dublin’s best-known independent cinemas has announced it’s closing',
  'The Creative Playground is launching this weekend',
]

const modes: { value: ShapeMode; label: string; description: string }[] = [
  { value: 'clean', label: 'Clean cut', description: 'Quiet and precise' },
  { value: 'torn', label: 'Torn', description: 'Hand-torn ends' },
  { value: 'tape', label: 'Tape', description: 'Pointed extensions' },
  { value: 'cling', label: 'Cling', description: 'Hugs every line' },
  { value: 'rough', label: 'Rough cut', description: 'Sharper transitions' },
]

const defaults: GeneratorSettings = {
  headline: 'How to make the most of a weekend visit to Dublin',
  style: 'headline',
  titleCase: true,
  tone: 'light',
  eyebrowEnabled: true,
  eyebrow: 'Breaking',
  coverFormat: 'regular',
  column: 'narrow',
  autoSize: true,
  fontSize: 90,
  align: 'left',
  autoWrap: true,
  perLine: false,
  rotationVariance: 0,
  lineGap: 2,
  hugStrength: 1,
  preferredEdge: 'auto',
  mode: 'clean',
  seed: 18473562,
  seedLocked: false,
}

function oneOf<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback
}

function numberIn(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

/** Stored settings are untrusted: older builds and hand edits can leave out-of-range or unknown values. */
function sanitizeSettings(stored: Record<string, unknown>): GeneratorSettings {
  const text = (value: unknown, fallback: string) => typeof value === 'string' ? value : fallback
  const flag = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback
  return {
    headline: text(stored.headline, defaults.headline),
    style: oneOf(stored.style, ['headline', 'feature'] as const, defaults.style),
    titleCase: flag(stored.titleCase, defaults.titleCase),
    tone: oneOf(stored.tone, ['light', 'dark', 'yellow', 'none'] as const, defaults.tone),
    eyebrowEnabled: flag(stored.eyebrowEnabled, defaults.eyebrowEnabled),
    eyebrow: text(stored.eyebrow, defaults.eyebrow),
    coverFormat: oneOf(stored.coverFormat, ['regular', 'series'] as const, defaults.coverFormat),
    column: oneOf(stored.column, ['narrow', 'medium', 'wide'] as const, defaults.column),
    autoSize: flag(stored.autoSize, defaults.autoSize),
    fontSize: Math.round(numberIn(stored.fontSize, 72, 90, defaults.fontSize)),
    align: oneOf(stored.align, ['left', 'center', 'right'] as const, defaults.align),
    autoWrap: flag(stored.autoWrap, defaults.autoWrap),
    perLine: flag(stored.perLine, defaults.perLine),
    rotationVariance: numberIn(stored.rotationVariance, 0, 2, defaults.rotationVariance),
    lineGap: numberIn(stored.lineGap, -8, 20, defaults.lineGap),
    hugStrength: numberIn(stored.hugStrength, 0.82, 1.16, defaults.hugStrength),
    preferredEdge: oneOf(stored.preferredEdge, ['auto', 'left', 'right', 'top', 'bottom'] as const, defaults.preferredEdge),
    mode: oneOf(stored.mode, ['clean', 'tape', 'cling', 'rough', 'torn'] as const, defaults.mode),
    seed: Math.max(1, Math.floor(numberIn(stored.seed, 1, 4294967295, defaults.seed))),
    seedLocked: flag(stored.seedLocked, defaults.seedLocked),
  }
}

function loadSettings(): GeneratorSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    return stored && typeof stored === 'object' ? sanitizeSettings(stored) : defaults
  } catch {
    return defaults
  }
}

const fontShorthand = (size: number) => `${FONT_WEIGHT} ${size}px "${FONT_FAMILY}"`
const eyebrowSizeFor = (fontSize: number) => Math.round(Math.min(56, Math.max(30, fontSize * 0.46)))

/** Bumps whenever a web font finishes loading, so measurements taken against a fallback get redone. */
function useFontVersion() {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const bump = () => setVersion((current) => current + 1)
    document.fonts.ready.then(bump)
    document.fonts.addEventListener('loadingdone', bump)
    return () => document.fonts.removeEventListener('loadingdone', bump)
  }, [])
  return version
}

function useTextLayout(settings: GeneratorSettings) {
  const fontVersion = useFontVersion()
  const caps = settings.style === 'feature'
  const headline = useMemo(() => displayText(settings.headline.replace(/\r/g, ''), settings.style, settings.titleCase)
    .split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n'), [settings.headline, settings.style, settings.titleCase])
  const eyebrowText = settings.eyebrowEnabled ? settings.eyebrow.replace(/\s+/g, ' ').trim().toLocaleUpperCase() : ''

  // Ask for exactly the faces/subsets this text needs (e.g. latin-ext for "ő"); loadingdone triggers a re-measure.
  useEffect(() => {
    document.fonts.load(fontShorthand(90), `${headline} ${eyebrowText}`).catch(() => undefined)
  }, [headline, eyebrowText])

  return useMemo(() => {
    const letters = settings.headline.match(/\p{L}/gu)?.join('') ?? ''
    const caseWarning = !caps && letters.length > 1 && letters === letters.toLocaleUpperCase() && letters !== letters.toLocaleLowerCase()
    const characterCount = headline.replace(/\s+/g, ' ').trim().length
    const maxLines = settings.coverFormat === 'series' ? 2 : 6
    const measureWidth = settings.coverFormat === 'series' ? TEXT_AREA_WIDTH : columnWidth(settings.column)
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) {
      return { labels: [headline || ' '], widths: [1], originOffsets: [0], ascent: 68, descent: 14, fontSize: 90, characterCount, maxLines, overflow: false, caseWarning, eyebrow: undefined, fontVersion }
    }

    const measureAtSize = (fontSize: number) => {
      context.font = fontShorthand(fontSize)
      context.textAlign = 'start'
      const getMetrics = (value: string) => context.measureText(value)
      const inkWidth = (metric: TextMetrics) => Math.max(1, metric.actualBoundingBoxLeft + metric.actualBoundingBoxRight || metric.width)
      const labels = wrapText(headline || ' ', measureWidth, (value) => inkWidth(getMetrics(value)), settings.autoWrap, true)
      const metrics = labels.map(getMetrics)
      // Capitals have no descenders, so feature strips are balanced on cap height rather than on "g/j".
      const reference = getMetrics(caps ? 'H' : 'Hgj')
      return {
        labels,
        widths: metrics.map(inkWidth),
        originOffsets: metrics.map((metric) => metric.actualBoundingBoxLeft),
        ascent: Math.max(reference.actualBoundingBoxAscent || fontSize * 0.72, ...metrics.map((metric) => metric.actualBoundingBoxAscent || 0)),
        descent: Math.max(caps ? fontSize * 0.02 : reference.actualBoundingBoxDescent || fontSize * 0.16, ...metrics.map((metric) => metric.actualBoundingBoxDescent || 0)),
      }
    }

    let fontSize = settings.coverFormat === 'series'
      ? 172
      : settings.autoSize ? coverSizeFromCharacters(headline) : Math.max(72, Math.min(90, Math.round(settings.fontSize)))
    let measured = measureAtSize(fontSize)
    if (settings.coverFormat === 'regular' && settings.autoSize) {
      while (fontSize > 72 && (measured.labels.length > maxLines || Math.max(...measured.widths) > measureWidth)) {
        fontSize -= 1
        measured = measureAtSize(fontSize)
      }
    }
    const overflow = measured.labels.length > maxLines || Math.max(...measured.widths) > measureWidth

    let eyebrow: EyebrowMetrics | undefined
    if (eyebrowText) {
      const size = eyebrowSizeFor(fontSize)
      context.font = fontShorthand(size)
      const metric = context.measureText(eyebrowText)
      const capHeight = context.measureText('H').actualBoundingBoxAscent || size * 0.7
      eyebrow = {
        text: eyebrowText,
        fontSize: size,
        width: Math.max(1, metric.actualBoundingBoxLeft + metric.actualBoundingBoxRight || metric.width),
        originOffset: metric.actualBoundingBoxLeft,
        capHeight,
        descent: Math.max(0, metric.actualBoundingBoxDescent || 0),
      }
    }
    return { ...measured, fontSize, characterCount, maxLines, overflow, caseWarning, eyebrow, fontVersion }
  }, [headline, eyebrowText, caps, settings.headline, settings.autoWrap, settings.coverFormat, settings.column, settings.autoSize, settings.fontSize, fontVersion])
}

/** One drawing list feeds the live preview, the SVG exports and the PNG exports, so they cannot drift apart. */
type Layer =
  | { kind: 'path'; d: string; fill: string; angle: number; cx: number; cy: number }
  | { kind: 'text'; text: string; x: number; y: number; size: number; fill: string; angle: number; cx: number; cy: number }

function buildLayers(shape: ShapeResult, settings: GeneratorSettings, fontSize: number): Layer[] {
  const tone = tones.find((entry) => entry.value === settings.tone) ?? tones[0]
  const layers: Layer[] = []
  const texts: Layer[] = []
  const pieces = shape.strips?.length
    ? shape.strips.map((strip) => ({ path: strip.path, line: strip.line, angle: strip.angle, cx: strip.centerX, cy: strip.centerY }))
    : shape.lines.map((line, index) => ({ path: index === 0 ? shape.path : '', line, angle: 0, cx: 0, cy: 0 }))

  for (const piece of pieces) {
    if (tone.tape && piece.path) layers.push({ kind: 'path', d: piece.path, fill: tone.tape, angle: piece.angle, cx: piece.cx, cy: piece.cy })
    texts.push({ kind: 'text', text: piece.line.text, x: piece.line.x, y: piece.line.baseline, size: fontSize, fill: tone.text, angle: piece.angle, cx: piece.cx, cy: piece.cy })
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

const escapeText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

function layersToSvg(layers: Layer[]) {
  return layers.map((layer) => {
    const transform = layer.angle ? ` transform="rotate(${layer.angle} ${layer.cx} ${layer.cy})"` : ''
    if (layer.kind === 'path') return `<path d="${layer.d}" fill="${layer.fill}"${transform}/>`
    return `<text x="${layer.x}" y="${layer.y}" font-family="${FONT_FAMILY}, sans-serif" font-size="${layer.size}" font-weight="${FONT_WEIGHT}" fill="${layer.fill}"${transform}>${escapeText(layer.text)}</text>`
  }).join('')
}

function drawLayers(context: CanvasRenderingContext2D, layers: Layer[]) {
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

function getPlacement(shape: ShapeResult, position: Position) {
  const desiredCenterX = ARTBOARD_WIDTH * position.x / 100
  const desiredCenterY = ARTBOARD_HEIGHT * position.y / 100
  let x = desiredCenterX - (shape.viewBox.x + shape.viewBox.width / 2)
  let y = desiredCenterY - (shape.viewBox.y + shape.viewBox.height / 2)
  const inkSpans = shape.lines.map((line) => [line.inkX ?? line.x, (line.inkX ?? line.x) + line.width])
  if (shape.eyebrow) inkSpans.push([shape.eyebrow.box.x, shape.eyebrow.box.x + shape.eyebrow.box.width])
  const textLeft = Math.min(...inkSpans.map(([left]) => left))
  const textRight = Math.max(...inkSpans.map(([, right]) => right))
  const minimumTextX = SAFE_MARGIN - textLeft
  const maximumTextX = ARTBOARD_WIDTH - SAFE_MARGIN - textRight
  x = minimumTextX <= maximumTextX
    ? Math.max(minimumTextX, Math.min(maximumTextX, x))
    : ARTBOARD_WIDTH / 2 - (textLeft + textRight) / 2
  const shapeMargin = 48
  if (shape.viewBox.height <= ARTBOARD_HEIGHT - shapeMargin * 2) {
    y = Math.max(shapeMargin - shape.viewBox.y, Math.min(ARTBOARD_HEIGHT - shapeMargin - shape.viewBox.y - shape.viewBox.height, y))
  }
  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }
}

function svgMarkup(
  layers: Layer[],
  shape: ShapeResult,
  options: { artboard?: boolean; background?: PreviewBackground; photo?: string | null; position?: Position } = {},
) {
  const { artboard = true, background = 'transparent', photo = null, position = { x: 50, y: 50 } } = options
  if (!artboard) {
    const { viewBox } = shape
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}" width="${viewBox.width}" height="${viewBox.height}">${layersToSvg(layers)}</svg>`
  }
  let backgroundMarkup = ''
  if (background === 'charcoal') backgroundMarkup = `<rect width="1080" height="1350" fill="#242424"/>`
  if (background === 'yellow') backgroundMarkup = `<rect width="1080" height="1350" fill="${BRAND.yellow}"/>`
  if (background === 'photo' && photo) {
    const href = escapeAttribute(photo)
    // xlink:href as well as href: Illustrator and older SVG tools only read the xlink form.
    backgroundMarkup = `<image href="${href}" xlink:href="${href}" width="1080" height="1350" preserveAspectRatio="xMidYMid slice"/><rect width="1080" height="1350" fill="#000" opacity=".12"/>`
  }
  const placement = getPlacement(shape, position)
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1080 1350" width="1080" height="1350">${backgroundMarkup}<g transform="translate(${placement.x} ${placement.y})">${layersToSvg(layers)}</g></svg>`
}

function downloadBlob(content: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function RangeField({ label, value, min, max, step = 1, suffix = '', disabled = false, format, onChange }: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  disabled?: boolean
  format?: (value: number) => string
  onChange: (value: number) => void
}) {
  const progress = ((value - min) / (max - min)) * 100
  return (
    <label className="range-field">
      <span className="field-heading"><span>{label}</span><output>{format ? format(value) : `${Math.round(value * 100) / 100}${suffix}`}</output></span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ '--progress': `${progress}%` } as React.CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function SelectField({ label, value, children, onChange }: {
  label: string
  value: string | number
  children: React.ReactNode
  onChange: (value: string) => void
}) {
  return (
    <label className="select-field">
      <span>{label}</span>
      <span className="select-wrap">
        <select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
        <ChevronDown size={15} aria-hidden="true" />
      </span>
    </label>
  )
}

const anchorX = (align: TextAlign) => align === 'left' ? 0 : align === 'center' ? 50 : 100

function App() {
  const [settings, setSettings] = useState<GeneratorSettings>(loadSettings)
  const [history, setHistory] = useState<number[]>([settings.seed])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [copied, setCopied] = useState<'svg' | 'seed' | null>(null)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [previewBackground, setPreviewBackground] = useState<PreviewBackground>('charcoal')
  const [photo, setPhoto] = useState<string | null>(null)
  const [position, setPosition] = useState<Position>({ x: anchorX(settings.align), y: 50 })
  const [sampleOpen, setSampleOpen] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null)
  const layout = useTextLayout(settings)
  const layoutSettings = useMemo<GeneratorSettings>(() => ({ ...settings, fontSize: layout.fontSize }), [settings, layout.fontSize])
  const shape = useMemo(() => buildShape(
    layoutSettings,
    layout.labels,
    layout.widths,
    layout.originOffsets,
    { ascent: layout.ascent, descent: layout.descent },
    { eyebrow: layout.eyebrow, tapeless: settings.tone === 'none' },
  ), [layoutSettings, layout, settings.tone])
  const layers = useMemo(() => buildLayers(shape, settings, layout.fontSize), [shape, settings, layout.fontSize])

  const update = useCallback(<K extends keyof GeneratorSettings>(key: K, value: GeneratorSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }, [])

  const chooseStyle = (style: CoverStyle) => {
    setSettings((current) => ({ ...current, ...stylePresets[style], style }))
    setPosition((current) => ({ ...current, x: anchorX(stylePresets[style].align ?? 'left') }))
  }

  const chooseAlign = (align: TextAlign) => {
    update('align', align)
    setPosition((current) => ({ ...current, x: anchorX(align) }))
  }

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // Private mode or full storage: the tool still works, it just won't remember settings.
    }
  }, [settings])

  const setVariation = useCallback((seed: number, addHistory = true) => {
    update('seed', seed)
    if (addHistory) {
      setHistory((current) => [...current.slice(0, historyIndex + 1), seed])
      setHistoryIndex((current) => current + 1)
    }
  }, [historyIndex, update])

  const randomise = useCallback(() => setVariation(nextSeed()), [setVariation])

  const previous = () => {
    if (historyIndex <= 0) return
    const nextIndex = historyIndex - 1
    setHistoryIndex(nextIndex)
    setVariation(history[nextIndex], false)
  }

  const next = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1
      setHistoryIndex(nextIndex)
      setVariation(history[nextIndex], false)
    } else {
      randomise()
    }
  }

  const flash = (message: string) => {
    setExportMessage(message)
    setTimeout(() => setExportMessage(null), 4000)
  }

  const copy = async (kind: 'svg' | 'seed') => {
    const value = kind === 'svg'
      ? svgMarkup(layers, shape, { background: previewBackground, photo, position })
      : String(settings.seed)
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      setTimeout(() => setCopied(null), 1400)
    } catch {
      flash('Copy was blocked by the browser. Use Full SVG to download instead.')
    }
  }

  const downloadSvg = (scope: 'artboard' | 'cutout') => {
    const markup = svgMarkup(layers, shape, { artboard: scope === 'artboard', background: previewBackground, photo, position })
    downloadBlob(markup, 'image/svg+xml', scope === 'artboard' ? 'tape-type-instagram.svg' : 'tape-cutout.svg')
  }

  const downloadPng = async (scale: 1 | 2 | 3) => {
    if (exporting) return
    setExporting(true)
    // Snapshot everything now, so edits made while the export runs cannot mix into this file.
    const snapshot = { layers, shape, position, previewBackground, photo }
    try {
      const sizes = [...new Set(snapshot.layers.flatMap((layer) => layer.kind === 'text' ? [layer.size] : []))]
      const allText = snapshot.layers.map((layer) => layer.kind === 'text' ? layer.text : '').join(' ')
      await Promise.all(sizes.map((size) => document.fonts.load(fontShorthand(size), allText)))
      const canvas = document.createElement('canvas')
      canvas.width = ARTBOARD_WIDTH * scale
      canvas.height = ARTBOARD_HEIGHT * scale
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas unavailable')
      context.scale(scale, scale)
      if (snapshot.previewBackground === 'charcoal') {
        context.fillStyle = '#242424'
        context.fillRect(0, 0, ARTBOARD_WIDTH, ARTBOARD_HEIGHT)
      } else if (snapshot.previewBackground === 'yellow') {
        context.fillStyle = BRAND.yellow
        context.fillRect(0, 0, ARTBOARD_WIDTH, ARTBOARD_HEIGHT)
      } else if (snapshot.previewBackground === 'photo' && snapshot.photo) {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const nextImage = new Image()
          nextImage.onload = () => resolve(nextImage)
          nextImage.onerror = () => reject(new Error('Photo could not be read'))
          nextImage.src = snapshot.photo as string
        })
        const imageScale = Math.max(ARTBOARD_WIDTH / image.naturalWidth, ARTBOARD_HEIGHT / image.naturalHeight)
        const width = image.naturalWidth * imageScale
        const height = image.naturalHeight * imageScale
        context.drawImage(image, (ARTBOARD_WIDTH - width) / 2, (ARTBOARD_HEIGHT - height) / 2, width, height)
        context.fillStyle = 'rgba(0,0,0,.12)'
        context.fillRect(0, 0, ARTBOARD_WIDTH, ARTBOARD_HEIGHT)
      }
      const placement = getPlacement(snapshot.shape, snapshot.position)
      context.translate(placement.x, placement.y)
      drawLayers(context, snapshot.layers)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('This device could not create the image')
      downloadBlob(blob, 'image/png', `tape-type-instagram-${scale}x.png`)
    } catch (error) {
      flash(`PNG export failed: ${error instanceof Error ? error.message : 'unknown error'}. Try a smaller size.`)
    } finally {
      setExporting(false)
    }
  }

  const choosePhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setPhoto(String(reader.result))
      setPreviewBackground('photo')
    }
    reader.readAsDataURL(file)
  }

  const startDrag = (event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, ...position }
  }

  const drag = (event: React.PointerEvent) => {
    const start = dragRef.current
    const preview = previewRef.current
    if (!start || !preview) return
    const bounds = preview.getBoundingClientRect()
    setPosition({
      x: Math.max(0, Math.min(100, start.x + (event.clientX - start.pointerX) / bounds.width * 100)),
      y: Math.max(0, Math.min(100, start.y + (event.clientY - start.pointerY) / bounds.height * 100)),
    })
  }

  const placement = getPlacement(shape, position)
  const isFeature = settings.style === 'feature'
  const locked = settings.seedLocked

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Tape Type home">
          <span className="brand-mark"><span>T</span></span>
          <span>Tape Type</span>
        </a>
        <div className="topbar-meta">
          <span className="status-dot" />
          Local tool
        </div>
      </header>

      <main id="top" className="workspace">
        <aside className="controls-panel">
          <div className="panel-intro">
            <p className="eyebrow">Cutout generator / 01</p>
            <h1>Shape the words.</h1>
            <p>Controlled tape geometry built around your headline—never a rotated rectangle.</p>
          </div>

          <section className="control-section first">
            <div className="section-label-row">
              <h2>Headline</h2>
              <div className="sample-picker">
                <button className="text-button" onClick={() => setSampleOpen((open) => !open)}>Try a sample <ChevronDown size={14} /></button>
                {sampleOpen && (
                  <div className="sample-menu">
                    {samples.map((sample, index) => (
                      <button key={sample} onClick={() => { update('headline', sample); setSampleOpen(false) }}>
                        <span>{String(index + 1).padStart(2, '0')}</span>{sample}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <textarea
              aria-label="Headline text"
              value={settings.headline}
              rows={4}
              onChange={(event) => update('headline', event.target.value)}
            />
            <div className="quick-toggles">
              {!isFeature && (
                <label className="toggle-row">
                  <span>Title case</span>
                  <input type="checkbox" checked={settings.titleCase} onChange={(event) => update('titleCase', event.target.checked)} />
                  <span className="switch" />
                </label>
              )}
              <label className="toggle-row">
                <span>Auto wrap</span>
                <input type="checkbox" checked={settings.autoWrap} onChange={(event) => update('autoWrap', event.target.checked)} />
                <span className="switch" />
              </label>
            </div>
          </section>

          <section className="control-section brand-format-section">
            <h2>Style</h2>
            <div className="style-toggle" aria-label="Cover style">
              {styles.map((style) => (
                <button key={style.value} className={settings.style === style.value ? 'active' : ''} onClick={() => chooseStyle(style.value)}>
                  <strong className={style.value === 'feature' ? 'caps' : ''}>{style.label}</strong>
                  <small>{style.description}</small>
                </button>
              ))}
            </div>
            <div className={`fit-status ${layout.overflow ? 'error' : layout.caseWarning ? 'warning' : ''}`}>
              <div><strong>{layout.fontSize}px</strong><span>{layout.labels.length} / {layout.maxLines} lines</span><span>{layout.characterCount} chars</span></div>
              <p>{layout.overflow ? 'Headline needs editing — it cannot fit within the approved type range.' : layout.caseWarning ? 'All caps is for Feature covers. Switch style, or retype the headline in title case.' : settings.coverFormat === 'series' ? 'Reserved 172px recurring-series scale.' : 'Fits the approved 72–90px cover flex zone.'}</p>
            </div>
          </section>

          <section className="control-section eyebrow-section">
            <div className="section-label-row">
              <h2>Eyebrow</h2>
              <label className="toggle-row inline-toggle">
                <span className="visually-hidden">Show eyebrow</span>
                <input type="checkbox" checked={settings.eyebrowEnabled} onChange={(event) => update('eyebrowEnabled', event.target.checked)} />
                <span className="switch" />
              </label>
            </div>
            {settings.eyebrowEnabled && (
              <>
                <input
                  className="eyebrow-input"
                  aria-label="Eyebrow text"
                  value={settings.eyebrow}
                  maxLength={40}
                  placeholder="Breaking"
                  onChange={(event) => update('eyebrow', event.target.value)}
                />
                <div className="chip-row">
                  {eyebrowSuggestions.map((suggestion) => (
                    <button key={suggestion} className={settings.eyebrow.toLocaleLowerCase() === suggestion.toLocaleLowerCase() ? 'active' : ''} onClick={() => update('eyebrow', suggestion)}>{suggestion}</button>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="control-section composition-section">
            <h2>Tape</h2>
            <div className="piece-toggle" aria-label="Tape piece mode">
              <button className={!settings.perLine ? 'active' : ''} onClick={() => update('perLine', false)}>Block</button>
              <button className={settings.perLine ? 'active' : ''} onClick={() => update('perLine', true)}>Strips</button>
            </div>
            <div className="tone-row" role="radiogroup" aria-label="Tape colour">
              {tones.map((tone) => (
                <button
                  key={tone.value}
                  role="radio"
                  aria-checked={settings.tone === tone.value}
                  className={settings.tone === tone.value ? 'active' : ''}
                  onClick={() => update('tone', tone.value)}
                >
                  <i className={`tone-swatch ${tone.value}`} style={tone.tape ? { background: tone.tape, color: tone.text } : undefined}>Aa</i>
                  <span>{tone.label}</span>
                </button>
              ))}
            </div>
            <div className="range-stack composition-ranges">
              <RangeField label="Tape cling" value={settings.hugStrength} min={0.82} max={1.16} step={0.01} disabled={settings.tone === 'none'} format={(value) => `${Math.round(value * 100)}%`} onChange={(value) => update('hugStrength', value)} />
              <RangeField label="Line gap" value={settings.lineGap} min={-8} max={20} suffix="px" onChange={(value) => update('lineGap', value)} />
              <RangeField label="Rotation variance" value={settings.rotationVariance} min={0} max={2} step={0.1} disabled={!settings.perLine} format={(value) => `${value.toFixed(1)}°`} onChange={(value) => update('rotationVariance', value)} />
            </div>
          </section>

          <section className="control-section">
            <h2>Cut style</h2>
            <div className="mode-grid">
              {modes.map((mode) => (
                <button
                  key={mode.value}
                  className={settings.mode === mode.value ? 'active' : ''}
                  onClick={() => update('mode', mode.value)}
                >
                  <span className={`mode-icon ${mode.value}`}><i /><i /><i /></span>
                  <strong>{mode.label}</strong>
                  <small>{mode.description}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="control-section compact-grid typography-grid brand-type-section">
            <h2>Layout</h2>
            <div className="brand-lock"><Lock size={14} /><span><strong>Barlow Bold</strong><small>700 · {isFeature ? 'ALL CAPS' : settings.titleCase ? 'Title Case' : 'as typed'} · {settings.coverFormat === 'series' ? TEXT_AREA_WIDTH : columnWidth(settings.column)}px column</small></span></div>
            <SelectField label="Alignment" value={settings.align} onChange={(value) => chooseAlign(value as TextAlign)}>
              <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
            </SelectField>
            <div className="position-field">
              <span>Position</span>
              <div className="piece-toggle compact" aria-label="Vertical position">
                {positions.map((entry) => (
                  <button key={entry.label} className={Math.abs(position.y - entry.y) < 1 ? 'active' : ''} onClick={() => setPosition({ x: anchorX(settings.align), y: entry.y })}>{entry.label}</button>
                ))}
              </div>
            </div>
            <div className="position-field column-field">
              <span>Column</span>
              <div className="piece-toggle compact" aria-label="Column width">
                {columns.map((entry) => (
                  <button key={entry.value} className={settings.column === entry.value ? 'active' : ''} disabled={settings.coverFormat === 'series'} onClick={() => update('column', entry.value)}>{entry.label}</button>
                ))}
              </div>
            </div>
            <div className="piece-toggle format-toggle" aria-label="Cover format">
              <button className={settings.coverFormat === 'regular' ? 'active' : ''} onClick={() => update('coverFormat', 'regular')}>Regular cover</button>
              <button className={settings.coverFormat === 'series' ? 'active' : ''} onClick={() => update('coverFormat', 'series')}>Series cover</button>
            </div>
            {settings.coverFormat === 'regular' && (
              <>
                <label className="toggle-row auto-size-toggle">
                  <span>Auto size</span>
                  <input type="checkbox" checked={settings.autoSize} onChange={(event) => update('autoSize', event.target.checked)} />
                  <span className="switch" />
                </label>
                <div className="size-control">
                  <RangeField label="Cover size" value={settings.autoSize ? layout.fontSize : settings.fontSize} min={72} max={90} suffix="px" disabled={settings.autoSize} onChange={(value) => update('fontSize', value)} />
                </div>
              </>
            )}
            <p className="automatic-note"><Sparkles size={13} /> Size, fit and cut depth stay inside the brand system</p>
          </section>
        </aside>

        <section className="preview-column">
          <div className="preview-toolbar">
            <div className="background-switcher" aria-label="Preview background">
              <button className={previewBackground === 'transparent' ? 'active' : ''} onClick={() => setPreviewBackground('transparent')}>Clear</button>
              <button className={previewBackground === 'charcoal' ? 'active' : ''} onClick={() => setPreviewBackground('charcoal')}>Dark</button>
              <button className={previewBackground === 'yellow' ? 'active' : ''} onClick={() => setPreviewBackground('yellow')}>Yellow</button>
              <label className={previewBackground === 'photo' ? 'active upload-button' : 'upload-button'}>
                <input type="file" accept="image/*" onChange={choosePhoto} />
                {photo ? <ImageIcon size={14} /> : <Upload size={14} />} Photo
              </label>
            </div>
            <p>1080 × 1350 · drag treatment to position</p>
          </div>

          <div
            ref={previewRef}
            className={`preview-stage ${previewBackground}`}
            style={photo && previewBackground === 'photo' ? { backgroundImage: `linear-gradient(rgba(0,0,0,.12),rgba(0,0,0,.12)), url(${photo})` } : undefined}
          >
            {previewBackground === 'photo' && !photo && (
              <label className="photo-empty"><Upload size={24} /><span>Choose a photo</span><small>Stays in your browser · included in exports</small><input type="file" accept="image/*" onChange={choosePhoto} /></label>
            )}
            <div
              className="artwork draggable"
              onPointerDown={startDrag}
              onPointerMove={drag}
              onPointerUp={() => { dragRef.current = null }}
              onPointerCancel={() => { dragRef.current = null }}
            >
              <svg
                role="img"
                aria-label={`Generated tape artwork: ${shape.personality}`}
                viewBox={`0 0 ${ARTBOARD_WIDTH} ${ARTBOARD_HEIGHT}`}
              >
                <rect className="safe-guide" x={SAFE_MARGIN} y={SAFE_MARGIN} width={TEXT_AREA_WIDTH} height={ARTBOARD_HEIGHT - SAFE_MARGIN * 2} />
                <g transform={`translate(${placement.x} ${placement.y})`}>
                  {layers.map((layer, index) => {
                    const transform = layer.angle ? `rotate(${layer.angle} ${layer.cx} ${layer.cy})` : undefined
                    return layer.kind === 'path'
                      ? <path key={`path-${index}`} d={layer.d} fill={layer.fill} transform={transform} />
                      : <text key={`text-${index}`} x={layer.x} y={layer.y} fill={layer.fill} fontFamily={FONT_FAMILY} fontWeight={FONT_WEIGHT} fontSize={layer.size} transform={transform}>{layer.text}</text>
                  })}
                </g>
              </svg>
            </div>
            <span className="stage-coordinate top-left">1080 × 1350 / 4:5</span>
            <span className="stage-coordinate bottom-right">{layout.fontSize}px · {layout.labels.length} lines · {shape.personality.toUpperCase()}</span>
          </div>

          <div className="variation-bar">
            <div className="variation-controls">
              <button className="icon-button" aria-label="Previous variation" disabled={locked || historyIndex === 0} onClick={previous}><ArrowLeft size={18} /></button>
              <button className="randomise-button" disabled={locked} onClick={randomise}><Sparkles size={17} /> Randomise cut</button>
              <button className="icon-button" aria-label="Next variation" disabled={locked} onClick={next}><ArrowRight size={18} /></button>
            </div>
            <div className="seed-control">
              <button aria-label={locked ? 'Unlock seed' : 'Lock seed'} aria-pressed={locked} onClick={() => update('seedLocked', !locked)}>{locked ? <Lock size={14} /> : <Unlock size={14} />}</button>
              <span>Seed</span>
              <input
                aria-label="Seed"
                value={settings.seed}
                inputMode="numeric"
                readOnly={locked}
                onChange={(event) => update('seed', Math.min(4294967295, Number(event.target.value.replace(/\D/g, '').slice(0, 10)) || 1))}
              />
              <button aria-label="Copy seed" onClick={() => copy('seed')}>{copied === 'seed' ? <Check size={14} /> : <Copy size={14} />}</button>
            </div>
          </div>

          <div className="export-bar">
            <div>
              <p className="eyebrow">Ready for layout</p>
              <strong>Export clean, editable artwork</strong>
              {exportMessage && <p className="export-message" role="status">{exportMessage}</p>}
            </div>
            <div className="export-actions">
              <button onClick={() => copy('svg')}>{copied === 'svg' ? <Check size={16} /> : <Clipboard size={16} />}{copied === 'svg' ? 'Copied' : 'Copy SVG'}</button>
              <button onClick={() => downloadSvg('cutout')}><Download size={16} /> Cutout SVG</button>
              <button disabled={exporting} onClick={() => downloadPng(1)}><Download size={16} /> PNG 1×</button>
              <button className="png-fallback" disabled={exporting} onClick={() => downloadPng(2)}><Download size={16} /> PNG 2×</button>
              <button disabled={exporting} onClick={() => downloadPng(3)}><Download size={16} /> PNG 3×</button>
              <button className="primary" onClick={() => downloadSvg('artboard')}><Download size={16} /> Full SVG</button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
