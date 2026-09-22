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
import {
  BACKGROUND_FILLS,
  BRAND,
  FONT_FAMILY,
  buildLayers,
  drawLayers,
  fontShorthand,
  getPlacement,
  placementRange,
  svgMarkup,
  textRuns,
  tones,
  type Layer,
  type Position,
  type PreviewBackground,
} from './artwork'
import { embeddedFontCss, embeddedFontCssNow, preloadEmbeddedFonts } from './fonts'
import { buildShape, nextSeed } from './geometry'
import { EYEBROW_WEIGHT, layoutHeadline, weightFor, type Measure, type OverflowReason } from './layout'
import { measureInk } from './metrics'
import {
  ARTBOARD_HEIGHT,
  ARTBOARD_WIDTH,
  SAFE_MARGIN,
  TEXT_AREA_WIDTH,
  TREATMENT_KEYS,
  columnWidth,
  columns,
  loadSettings,
  saveSettings,
  stylePresets,
  type Treatment,
} from './settings'
import { displayText, isAllCaps, normaliseEyebrow, normaliseHeadline } from './text'
import type { CoverStyle, GeneratorSettings, ShapeMode, TextAlign } from './types'

const styles: { value: CoverStyle; label: string; description: string }[] = [
  { value: 'headline', label: 'Headline', description: 'Title Case · block or strips' },
  { value: 'feature', label: 'Feature', description: 'All caps · torn strips' },
]

const eyebrowSuggestions = ['Breaking', 'News', 'Exclusive', 'The Big Read']

const positions: { label: string; y: number }[] = [
  { label: 'Top', y: 0 },
  { label: 'Middle', y: 50 },
  { label: 'Bottom', y: 100 },
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
  { value: 'plain', label: 'Plain', description: 'Clean rectangle' },
  { value: 'torn', label: 'Torn', description: 'Hand-torn ends' },
  { value: 'clean', label: 'Clean cut', description: 'One quiet cut' },
  { value: 'tape', label: 'Tape', description: 'Pointed extensions' },
  { value: 'cling', label: 'Cling', description: 'Hugs every line' },
  { value: 'rough', label: 'Rough cut', description: 'Sharper transitions' },
]

// The largest export (PNG 3×): photos are kept at up to this size, and no larger.
const EXPORT_COVER = { width: ARTBOARD_WIDTH * 3, height: ARTBOARD_HEIGHT * 3 }
const MAX_SEED = 4294967295
const anchorX = (align: TextAlign) => align === 'left' ? 0 : align === 'center' ? 50 : 100
const clampPercent = (value: number) => Math.max(0, Math.min(100, value))
const pickTreatment = (settings: GeneratorSettings) => Object.fromEntries(TREATMENT_KEYS.map((key) => [key, settings[key]])) as Treatment

/** Font loading state: `version` bumps whenever web fonts finish loading, so measurements taken against a fallback get redone. */
function useFontStatus() {
  const [version, setVersion] = useState(0)
  const [loading, setLoading] = useState(() => document.fonts.status === 'loading')
  useEffect(() => {
    const start = () => setLoading(true)
    const done = () => {
      setLoading(document.fonts.status === 'loading')
      setVersion((current) => current + 1)
    }
    document.fonts.ready.then(done)
    document.fonts.addEventListener('loading', start)
    document.fonts.addEventListener('loadingdone', done)
    document.fonts.addEventListener('loadingerror', done)
    return () => {
      document.fonts.removeEventListener('loading', start)
      document.fonts.removeEventListener('loadingdone', done)
      document.fonts.removeEventListener('loadingerror', done)
    }
  }, [])
  return { version, loading }
}

function useTextLayout(settings: GeneratorSettings, fontVersion: number) {
  const context = useMemo(() => document.createElement('canvas').getContext('2d'), [])
  const text = useMemo(
    () => displayText(normaliseHeadline(settings.headline), settings.style, settings.titleCase),
    [settings.headline, settings.style, settings.titleCase],
  )
  const eyebrow = settings.eyebrowEnabled ? normaliseEyebrow(settings.eyebrow) : ''
  const weight = weightFor(settings.style)

  // Ask for exactly the faces and subsets this text needs (e.g. latin-ext for "ő"); their loading triggers a re-measure.
  useEffect(() => {
    document.fonts.load(fontShorthand(90, weight), text || ' ').catch(() => undefined)
    if (eyebrow) document.fonts.load(fontShorthand(40, EYEBROW_WEIGHT), eyebrow).catch(() => undefined)
  }, [text, eyebrow, weight])

  return useMemo(() => {
    const measure: Measure = (value, size, fontWeight) => {
      if (!context) return { width: value.length * size * 0.5, originOffset: 0, ascent: size * 0.72, descent: size * 0.2 }
      context.font = fontShorthand(size, fontWeight)
      return measureInk(context, value, fontWeight, size)
    }
    const layout = layoutHeadline({
      text,
      style: settings.style,
      titleCase: settings.titleCase,
      coverFormat: settings.coverFormat,
      column: settings.column,
      autoSize: settings.autoSize,
      fontSize: settings.fontSize,
      autoWrap: settings.autoWrap,
      eyebrow,
    }, measure)
    return { ...layout, caseWarning: settings.style !== 'feature' && isAllCaps(settings.headline), fontVersion }
  }, [context, text, eyebrow, settings.style, settings.titleCase, settings.coverFormat, settings.column, settings.autoSize, settings.fontSize, settings.autoWrap, settings.headline, fontVersion])
}

function overflowMessage(reason: OverflowReason, settings: GeneratorSettings) {
  if (reason === 'eyebrow') return 'The eyebrow is too long to fit on the cover. Shorten it.'
  if (settings.coverFormat === 'series') return 'Series covers fit two lines at most. Shorten the headline.'
  const lead = reason === 'lines' ? 'The headline runs past six lines.' : 'A line is wider than the column.'
  const fixes = [
    settings.column !== 'wide' && 'a wider column',
    reason === 'width' && !settings.autoWrap && 'Auto wrap',
    !settings.autoSize && 'Auto size',
  ].filter(Boolean) as string[]
  return fixes.length ? `${lead} Try ${fixes.join(' or ')}, or shorten it.` : `${lead} Shorten it.`
}

function downloadBlob(content: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.hidden = true
  // Firefox only follows clicks on links that are in the document.
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Phones can take a while to hand the file over; revoking too soon cancels the download.
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('unreadable'))
    image.src = src
  })
}

/**
 * Decodes an uploaded photo and re-encodes the part the cover shows (the centred 4:5 crop every
 * output uses) as sRGB JPEG, at no more than the 3× export needs. The preview, PNG and SVG then
 * share the same pixels, and SVG exports stay a sensible size.
 */
async function preparePhoto(file: File) {
  const source = URL.createObjectURL(file)
  try {
    const image = await loadImage(source)
    const cover = Math.max(ARTBOARD_WIDTH / image.naturalWidth, ARTBOARD_HEIGHT / image.naturalHeight)
    const cropWidth = ARTBOARD_WIDTH / cover
    const cropHeight = ARTBOARD_HEIGHT / cover
    const scale = Math.min(1, EXPORT_COVER.height / cropHeight)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(cropWidth * scale))
    canvas.height = Math.max(1, Math.round(cropHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('unreadable')
    // JPEG has no transparency: see-through areas of a PNG sit on brand black.
    context.fillStyle = BRAND.dark
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, (image.naturalWidth - cropWidth) / 2, (image.naturalHeight - cropHeight) / 2, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
    canvas.width = 0
    canvas.height = 0
    if (!blob) throw new Error('unreadable')
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } finally {
    URL.revokeObjectURL(source)
  }
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
  const shown = format ? format(value) : `${Math.round(value * 100) / 100}${suffix}`
  return (
    <label className="range-field">
      <span className="field-heading"><span>{label}</span><output>{shown}</output></span>
      <input
        type="range"
        aria-label={label}
        aria-valuetext={shown}
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

interface Drag {
  pointerId: number
  touch: boolean
  /** Touch drags start only once the finger clearly moves sideways; until then it may be a scroll. */
  active: boolean
  startX: number
  startY: number
  from: Position
  /** Artboard pixels per screen pixel. */
  scale: number
  span: { x: number; y: number }
}

function App() {
  const [settings, setSettings] = useState<GeneratorSettings>(loadSettings)
  const [history, setHistory] = useState<number[]>([settings.seed])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [seedDraft, setSeedDraft] = useState<string | null>(null)
  const [copied, setCopied] = useState<'svg' | 'seed' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [previewBackground, setPreviewBackground] = useState<PreviewBackground>('charcoal')
  const [photo, setPhoto] = useState<string | null>(null)
  const [position, setPosition] = useState<Position>({ x: anchorX(settings.align), y: 50 })
  const [sampleOpen, setSampleOpen] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const noticeTimer = useRef<number | undefined>(undefined)
  const treatments = useRef<Partial<Record<CoverStyle, Treatment>>>({})
  const fonts = useFontStatus()
  const layout = useTextLayout(settings, fonts.version)
  const layoutSettings = useMemo<GeneratorSettings>(() => ({ ...settings, fontSize: layout.fontSize }), [settings, layout.fontSize])
  const shape = useMemo(() => buildShape(
    layoutSettings,
    layout.labels,
    layout.widths,
    layout.originOffsets,
    { ascent: layout.ascent, descent: layout.descent },
    { eyebrow: layout.eyebrow, tapeless: settings.tone === 'none' },
  ), [layoutSettings, layout, settings.tone])
  const layers = useMemo(
    () => buildLayers(shape, { tone: settings.tone, background: previewBackground, weight: layout.weight }, layout.fontSize),
    [shape, settings.tone, previewBackground, layout.weight, layout.fontSize],
  )
  const runs = useMemo(() => textRuns(layers), [layers])
  const blockedReason = layout.empty ? 'Type a headline to export.' : layout.overflow ? overflowMessage(layout.overflow, settings) : null
  const exportDisabled = Boolean(blockedReason) || fonts.loading

  useEffect(() => { preloadEmbeddedFonts(runs) }, [runs])
  useEffect(() => { saveSettings(settings) }, [settings])

  const update = useCallback(<K extends keyof GeneratorSettings>(key: K, value: GeneratorSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }, [])

  const chooseStyle = (style: CoverStyle) => {
    if (style === settings.style) return
    // Each style remembers how it was last set up in this session; a style not used yet starts from its house look.
    treatments.current[settings.style] = pickTreatment(settings)
    const treatment = treatments.current[style] ?? stylePresets[style]
    setSettings((current) => ({ ...current, ...treatment, style }))
    setPosition((current) => ({ ...current, x: anchorX(treatment.align) }))
  }

  const resetStyle = () => {
    const treatment = stylePresets[settings.style]
    setSettings((current) => ({ ...current, ...treatment }))
    setPosition((current) => ({ ...current, x: anchorX(treatment.align) }))
  }

  const chooseAlign = (align: TextAlign) => {
    update('align', align)
    setPosition((current) => ({ ...current, x: anchorX(align) }))
  }

  const setAutoSize = (autoSize: boolean) => {
    // Turning auto size off keeps the size you were looking at instead of jumping to an old one.
    setSettings((current) => ({ ...current, autoSize, fontSize: autoSize ? current.fontSize : layout.fontSize }))
  }

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

  const commitSeed = () => {
    if (seedDraft === null) return
    const seed = Number(seedDraft)
    setSeedDraft(null)
    if (seedDraft && seed >= 1 && seed <= MAX_SEED && seed !== settings.seed) setVariation(seed)
  }

  const flash = (message: string) => {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 7000)
  }

  const svgFor = (artboard: boolean, fontCss: string) =>
    svgMarkup(layers, shape, { artboard, background: previewBackground, photo, position, fontCss })

  const copy = async (kind: 'svg' | 'seed') => {
    try {
      if (kind === 'seed') {
        await navigator.clipboard.writeText(String(settings.seed))
      } else {
        const ready = embeddedFontCssNow(runs)
        if (ready !== null) {
          await navigator.clipboard.writeText(svgFor(true, ready))
        } else {
          // Safari only allows clipboard writes during the click, so it gets a promise of the text.
          const text = embeddedFontCss(runs).then(({ css, missing }) => {
            if (missing) flash('Barlow couldn’t be embedded (network error), so the copied SVG only matches where Barlow is installed.')
            return new Blob([svgFor(true, css)], { type: 'text/plain' })
          })
          if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
            await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text })])
          } else {
            await navigator.clipboard.writeText(await (await text).text())
          }
        }
      }
      setCopied(kind)
      setTimeout(() => setCopied(null), 1400)
    } catch {
      flash('The browser blocked copying. Use Full SVG to download the file instead.')
    }
  }

  const downloadSvg = async (artboard: boolean) => {
    const build = (css: string) => svgFor(artboard, css)
    const { css, missing } = await embeddedFontCss(runs)
    if (missing) flash('Barlow couldn’t be embedded (network error), so this SVG only matches where Barlow is installed. The PNG is exact.')
    downloadBlob(build(css), 'image/svg+xml', artboard ? 'tape-type-instagram.svg' : 'tape-cutout.svg')
  }

  const downloadPng = async (scale: 1 | 2 | 3) => {
    if (exporting) return
    setExporting(true)
    // Snapshot everything now, so edits made while the export runs cannot mix into this file.
    const snapshot: { layers: Layer[]; shape: typeof shape; position: Position; background: PreviewBackground; photo: string | null } = { layers, shape, position, background: previewBackground, photo }
    const canvas = document.createElement('canvas')
    try {
      const allText = snapshot.layers.map((layer) => layer.kind === 'text' ? layer.text : '').join(' ')
      const faces = [...new Set(snapshot.layers.flatMap((layer) => layer.kind === 'text' ? [fontShorthand(layer.size, layer.weight)] : []))]
      await Promise.all(faces.map((face) => document.fonts.load(face, allText)))
      canvas.width = ARTBOARD_WIDTH * scale
      canvas.height = ARTBOARD_HEIGHT * scale
      const context = canvas.getContext('2d')
      if (!context) throw new Error('this device could not create the image')
      context.scale(scale, scale)
      const fill = BACKGROUND_FILLS[snapshot.background]
      if (fill) {
        context.fillStyle = fill
        context.fillRect(0, 0, ARTBOARD_WIDTH, ARTBOARD_HEIGHT)
      } else if (snapshot.background === 'photo' && snapshot.photo) {
        const image = await loadImage(snapshot.photo)
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
      if (!blob) throw new Error('this device could not create an image that large')
      downloadBlob(blob, 'image/png', `tape-type-instagram-${scale}x.png`)
    } catch (error) {
      flash(`PNG export failed: ${error instanceof Error ? error.message : 'unknown error'}.${scale > 1 ? ' Try a smaller size.' : ''}`)
    } finally {
      // Release the (up to 50 MB) bitmap straight away; phones run out of canvas memory quickly.
      canvas.width = 0
      canvas.height = 0
      setExporting(false)
    }
  }

  const choosePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      setPhoto(await preparePhoto(file))
      setPreviewBackground('photo')
    } catch {
      flash('That file couldn’t be opened as an image. If it’s an iPhone HEIC photo, convert it to JPEG first.')
    }
  }

  const clickPhoto = (event: React.MouseEvent) => {
    // With a photo already loaded, the first click switches back to it; the next one replaces it.
    if (photo && previewBackground !== 'photo') {
      event.preventDefault()
      setPreviewBackground('photo')
    }
  }

  const spans = () => {
    const range = placementRange(shape)
    return { x: range.x.maximum - range.x.minimum, y: range.y.maximum - range.y.minimum }
  }
  // A move of `delta` artboard pixels, as a share of the range the artwork can travel.
  const percentOf = (delta: number, span: number) => (span > 1 ? delta / span * 100 : 0)

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !previewRef.current) return
    const touch = event.pointerType === 'touch'
    dragRef.current = {
      pointerId: event.pointerId,
      touch,
      active: !touch,
      startX: event.clientX,
      startY: event.clientY,
      from: position,
      scale: ARTBOARD_WIDTH / previewRef.current.getBoundingClientRect().width,
      span: spans(),
    }
    if (!touch) event.currentTarget.setPointerCapture(event.pointerId)
  }

  const drag = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragRef.current
    if (!start || start.pointerId !== event.pointerId) return
    const dx = event.clientX - start.startX
    const dy = event.clientY - start.startY
    if (!start.active) {
      // A mostly vertical swipe is a page scroll, so leave it to the browser.
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) {
        dragRef.current = null
        return
      }
      if (Math.abs(dx) < 10) return
      start.active = true
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    setPosition({
      x: clampPercent(start.from.x + percentOf(dx * start.scale, start.span.x)),
      // On touch, vertical swipes scroll the page: height is set with Top, Middle and Bottom.
      y: start.touch ? start.from.y : clampPercent(start.from.y + percentOf(dy * start.scale, start.span.y)),
    })
  }

  const endDrag = () => { dragRef.current = null }

  const cancelDrag = () => {
    // The browser took the gesture over (usually to scroll): undo anything it moved.
    if (dragRef.current?.active) setPosition(dragRef.current.from)
    dragRef.current = null
  }

  const nudge = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 50 : 10
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    const span = spans()
    setPosition((current) => ({
      x: clampPercent(current.x + percentOf(move[0], span.x)),
      y: clampPercent(current.y + percentOf(move[1], span.y)),
    }))
  }

  const placement = getPlacement(shape, position)
  const isFeature = settings.style === 'feature'
  const series = settings.coverFormat === 'series'
  const locked = settings.seedLocked
  const noTape = settings.tone === 'none'
  const plain = settings.mode === 'plain'
  const variationOff = locked || noTape || plain
  const variationNote = noTape ? 'No tape, so there is no cut to vary' : plain ? 'Plain tape has no cut to vary' : undefined
  const clash = settings.tone === 'yellow' && previewBackground === 'yellow'
    ? 'Yellow tape disappears on the Yellow background.'
    : settings.tone === 'dark' && previewBackground === 'charcoal'
      ? 'Dark tape disappears on the Dark background.'
      : noTape && (previewBackground === 'yellow' || previewBackground === 'transparent')
        ? 'White text with no tape needs a photo or the Dark background behind it.'
        : null
  const statusMessage = blockedReason && !layout.empty
    ? blockedReason
    : layout.caseWarning
      ? 'All caps is for Feature covers. Switch style, or retype the headline in title case.'
      : series ? 'Reserved 172px recurring-series scale.' : 'Fits the approved 72–90px cover range.'

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
                <button className="text-button" aria-expanded={sampleOpen} onClick={() => setSampleOpen((open) => !open)}>Try a sample <ChevronDown size={14} /></button>
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
            <div className="section-label-row">
              <h2>Style</h2>
              <button className="text-button" onClick={resetStyle} title="Put this style's tape, colour, cut and layout back to the house look">Reset style</button>
            </div>
            <div className="style-toggle" role="group" aria-label="Cover style">
              {styles.map((style) => (
                <button key={style.value} aria-pressed={settings.style === style.value} className={settings.style === style.value ? 'active' : ''} onClick={() => chooseStyle(style.value)}>
                  <strong className={style.value === 'feature' ? 'caps' : ''}>{style.label}</strong>
                  <small>{style.description}</small>
                </button>
              ))}
            </div>
            <div className={`fit-status ${blockedReason && !layout.empty ? 'error' : layout.caseWarning ? 'warning' : ''}`} role="status">
              <div><strong>{layout.fontSize}px</strong><span>{layout.labels.length} / {layout.maxLines} lines</span><span>{layout.characterCount} chars</span></div>
              <p>{statusMessage}</p>
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
                  {eyebrowSuggestions.map((suggestion) => {
                    const active = settings.eyebrow.trim().toLocaleLowerCase() === suggestion.toLocaleLowerCase()
                    return <button key={suggestion} aria-pressed={active} className={active ? 'active' : ''} onClick={() => update('eyebrow', suggestion)}>{suggestion}</button>
                  })}
                </div>
              </>
            )}
          </section>

          <section className="control-section composition-section">
            <h2>Tape</h2>
            <div className="piece-toggle" role="group" aria-label="Tape pieces">
              <button aria-pressed={!settings.perLine} className={!settings.perLine ? 'active' : ''} onClick={() => update('perLine', false)}>Block</button>
              <button aria-pressed={settings.perLine} className={settings.perLine ? 'active' : ''} onClick={() => update('perLine', true)}>Strips</button>
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
                  <i className={`tone-swatch ${tone.value}`} aria-hidden="true" style={tone.tape ? { background: tone.tape, color: tone.text } : undefined}>Aa</i>
                  <span>{tone.label}</span>
                </button>
              ))}
            </div>
            {clash && <p className="tone-note" role="status">{clash}</p>}
            <div className="range-stack composition-ranges">
              <RangeField label="Tape cling" value={settings.hugStrength} min={0.82} max={1.16} step={0.01} disabled={noTape} format={(value) => `${Math.round(value * 100)}%`} onChange={(value) => update('hugStrength', value)} />
              <RangeField label="Line gap" value={settings.lineGap} min={-8} max={20} suffix="px" onChange={(value) => update('lineGap', value)} />
              <RangeField label="Rotation variance" value={settings.rotationVariance} min={0} max={2} step={0.1} disabled={!settings.perLine} format={(value) => `${value.toFixed(1)}°`} onChange={(value) => update('rotationVariance', value)} />
            </div>
          </section>

          <section className="control-section">
            <h2>Cut style</h2>
            <div className="mode-grid" role="group" aria-label="Cut style">
              {modes.map((mode) => (
                <button
                  key={mode.value}
                  aria-pressed={settings.mode === mode.value}
                  className={settings.mode === mode.value ? 'active' : ''}
                  disabled={noTape}
                  onClick={() => update('mode', mode.value)}
                >
                  <span className={`mode-icon ${mode.value}`} aria-hidden="true"><i /><i /><i /></span>
                  <strong>{mode.label}</strong>
                  <small>{mode.description}</small>
                </button>
              ))}
            </div>
            {noTape && <p className="tone-note">No tape: the text sits straight on the image.</p>}
          </section>

          <section className="control-section compact-grid typography-grid brand-type-section">
            <h2>Layout</h2>
            <div className="brand-lock"><Lock size={14} aria-hidden="true" /><span><strong>Barlow {isFeature ? 'Black' : 'Bold'}</strong><small>{layout.weight} · {isFeature ? 'ALL CAPS' : settings.titleCase ? 'Title Case' : 'as typed'} · {series ? TEXT_AREA_WIDTH : columnWidth(settings.column)}px column</small></span></div>
            <SelectField label="Alignment" value={settings.align} onChange={(value) => chooseAlign(value as TextAlign)}>
              <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
            </SelectField>
            <div className="position-field">
              <span>Position</span>
              <div className="piece-toggle compact" role="group" aria-label="Vertical position">
                {positions.map((entry) => {
                  const active = Math.abs(position.y - entry.y) < 0.5
                  return <button key={entry.label} aria-pressed={active} className={active ? 'active' : ''} onClick={() => setPosition({ x: anchorX(settings.align), y: entry.y })}>{entry.label}</button>
                })}
              </div>
            </div>
            <div className="position-field column-field">
              <span>Column</span>
              <div className="piece-toggle compact" role="group" aria-label="Column width">
                {columns.map((entry) => {
                  const active = !series && settings.column === entry.value
                  return <button key={entry.value} aria-pressed={active} className={active ? 'active' : ''} disabled={series} onClick={() => update('column', entry.value)}>{entry.label}</button>
                })}
              </div>
            </div>
            <div className="piece-toggle format-toggle" role="group" aria-label="Cover format">
              <button aria-pressed={!series} className={!series ? 'active' : ''} onClick={() => update('coverFormat', 'regular')}>Regular cover</button>
              <button aria-pressed={series} className={series ? 'active' : ''} onClick={() => update('coverFormat', 'series')}>Series cover</button>
            </div>
            {!series && (
              <>
                <label className="toggle-row auto-size-toggle">
                  <span>Auto size</span>
                  <input type="checkbox" checked={settings.autoSize} onChange={(event) => setAutoSize(event.target.checked)} />
                  <span className="switch" />
                </label>
                <div className="size-control">
                  <RangeField label="Cover size" value={settings.autoSize ? layout.fontSize : settings.fontSize} min={72} max={90} suffix="px" disabled={settings.autoSize} onChange={(value) => update('fontSize', value)} />
                </div>
              </>
            )}
            <p className="automatic-note"><Sparkles size={13} aria-hidden="true" /> Size, fit and cut depth stay inside the brand system</p>
          </section>
        </aside>

        <section className="preview-column">
          <div className="preview-toolbar">
            <div className="background-switcher" role="group" aria-label="Preview background">
              <button aria-pressed={previewBackground === 'transparent'} className={previewBackground === 'transparent' ? 'active' : ''} onClick={() => setPreviewBackground('transparent')}>Clear</button>
              <button aria-pressed={previewBackground === 'charcoal'} className={previewBackground === 'charcoal' ? 'active' : ''} onClick={() => setPreviewBackground('charcoal')}>Dark</button>
              <button aria-pressed={previewBackground === 'yellow'} className={previewBackground === 'yellow' ? 'active' : ''} onClick={() => setPreviewBackground('yellow')}>Yellow</button>
              <label className={previewBackground === 'photo' ? 'active upload-button' : 'upload-button'} onClick={clickPhoto} title={photo ? 'Click again to replace the photo' : 'Choose a photo'}>
                <input type="file" accept="image/*" onChange={choosePhoto} />
                {photo ? <ImageIcon size={14} aria-hidden="true" /> : <Upload size={14} aria-hidden="true" />} Photo
              </label>
            </div>
            <p>1080 × 1350 · drag or use arrow keys to position</p>
          </div>

          {notice && <p className="notice" role="alert">{notice}</p>}

          <div
            ref={previewRef}
            className={`preview-stage ${previewBackground}`}
            style={photo && previewBackground === 'photo' ? { backgroundImage: `linear-gradient(rgba(0,0,0,.12),rgba(0,0,0,.12)), url(${photo})` } : undefined}
          >
            {previewBackground === 'photo' && !photo && (
              <label className="photo-empty"><Upload size={24} aria-hidden="true" /><span>Choose a photo</span><small>Stays in your browser · included in exports</small><input type="file" accept="image/*" onChange={choosePhoto} /></label>
            )}
            <div
              className="artwork draggable"
              tabIndex={0}
              role="application"
              aria-label="Artwork position. Drag, or use the arrow keys (Shift for bigger steps)."
              onPointerDown={startDrag}
              onPointerMove={drag}
              onPointerUp={endDrag}
              onPointerCancel={cancelDrag}
              onLostPointerCapture={endDrag}
              onKeyDown={nudge}
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
                      : <text key={`text-${index}`} x={layer.x} y={layer.y} fill={layer.fill} fontFamily={FONT_FAMILY} fontWeight={layer.weight} fontSize={layer.size} transform={transform}>{layer.text}</text>
                  })}
                </g>
              </svg>
            </div>
            <span className="stage-coordinate top-left">1080 × 1350 / 4:5</span>
            <span className="stage-coordinate bottom-right">{layout.fontSize}px · {layout.labels.length} lines · {shape.personality.toUpperCase()}</span>
          </div>

          <div className="variation-bar">
            <div className="variation-controls" title={variationNote}>
              <button className="icon-button" aria-label="Previous variation" disabled={variationOff || historyIndex === 0} onClick={previous}><ArrowLeft size={18} /></button>
              <button className="randomise-button" disabled={variationOff} onClick={randomise}><Sparkles size={17} aria-hidden="true" /> Randomise cut</button>
              <button className="icon-button" aria-label="Next variation" disabled={variationOff} onClick={next}><ArrowRight size={18} /></button>
            </div>
            <div className="seed-control">
              <button aria-label={locked ? 'Unlock seed' : 'Lock seed'} aria-pressed={locked} onClick={() => update('seedLocked', !locked)}>{locked ? <Lock size={14} /> : <Unlock size={14} />}</button>
              <span>Seed</span>
              <input
                aria-label="Seed"
                value={seedDraft ?? String(settings.seed)}
                inputMode="numeric"
                readOnly={locked}
                onChange={(event) => setSeedDraft(event.target.value.replace(/\D/g, '').slice(0, 10))}
                onBlur={commitSeed}
                onKeyDown={(event) => { if (event.key === 'Enter') commitSeed() }}
              />
              <button aria-label="Copy seed" onClick={() => copy('seed')}>{copied === 'seed' ? <Check size={14} /> : <Copy size={14} />}</button>
            </div>
          </div>

          <div className="export-bar">
            <div>
              <p className="eyebrow">Ready for layout</p>
              <strong>Export clean, editable artwork</strong>
              {(blockedReason || fonts.loading) && <p className="export-message" role="status">{blockedReason ?? 'Loading fonts…'}</p>}
            </div>
            <div className="export-actions">
              <button disabled={exportDisabled} onClick={() => copy('svg')}>{copied === 'svg' ? <Check size={16} /> : <Clipboard size={16} />}{copied === 'svg' ? 'Copied' : 'Copy SVG'}</button>
              <button disabled={exportDisabled} onClick={() => downloadSvg(false)}><Download size={16} aria-hidden="true" /> Cutout SVG</button>
              <button disabled={exportDisabled || exporting} onClick={() => downloadPng(1)}><Download size={16} aria-hidden="true" /> PNG 1×</button>
              <button className="png-fallback" disabled={exportDisabled || exporting} onClick={() => downloadPng(2)}><Download size={16} aria-hidden="true" /> PNG 2×</button>
              <button disabled={exportDisabled || exporting} onClick={() => downloadPng(3)}><Download size={16} aria-hidden="true" /> PNG 3×</button>
              <button className="primary" disabled={exportDisabled} onClick={() => downloadSvg(true)}><Download size={16} aria-hidden="true" /> Full SVG</button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
