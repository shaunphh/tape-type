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
  FONT_FAMILY,
  FONT_WEIGHT,
  buildLayers,
  drawLayers,
  fontShorthand,
  getPlacement,
  stripControlCharacters,
  svgMarkup,
  tones,
  type Layer,
  type Position,
  type PreviewBackground,
} from './artwork'
import { embeddedFontCss, preloadEmbeddedFonts } from './fonts'
import { buildShape, coverSizeFromCharacters, nextSeed, wrapText } from './geometry'
import {
  ARTBOARD_HEIGHT,
  ARTBOARD_WIDTH,
  SAFE_MARGIN,
  TEXT_AREA_WIDTH,
  columnWidth,
  columns,
  loadSettings,
  saveSettings,
  stylePresets,
} from './settings'
import { displayText } from './text'
import type {
  CoverStyle,
  EyebrowMetrics,
  GeneratorSettings,
  ShapeMode,
  TextAlign,
} from './types'

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
  { value: 'clean', label: 'Clean cut', description: 'Quiet and precise' },
  { value: 'torn', label: 'Torn', description: 'Hand-torn ends' },
  { value: 'tape', label: 'Tape', description: 'Pointed extensions' },
  { value: 'cling', label: 'Cling', description: 'Hugs every line' },
  { value: 'rough', label: 'Rough cut', description: 'Sharper transitions' },
]

// Large enough for a 3× export without upscaling, small enough to keep SVGs and the clipboard manageable.
const PHOTO_MAX_EDGE = 4050
const eyebrowSizeFor = (fontSize: number) => Math.round(Math.min(56, Math.max(30, fontSize * 0.46)))
const anchorX = (align: TextAlign) => align === 'left' ? 0 : align === 'center' ? 50 : 100

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
  const headline = useMemo(() => displayText(stripControlCharacters(settings.headline.replace(/\r/g, '')), settings.style, settings.titleCase)
    .split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n'), [settings.headline, settings.style, settings.titleCase])
  const eyebrowText = settings.eyebrowEnabled ? stripControlCharacters(settings.eyebrow).replace(/\s+/g, ' ').trim().toLocaleUpperCase() : ''

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
      return { labels: [headline || ' '], widths: [1], originOffsets: [0], ascent: 68, descent: 14, fontSize: 90, characterCount, maxLines, overflow: false, empty: !headline, caseWarning, eyebrow: undefined, fontVersion }
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
    const overflow = Boolean(headline) && (measured.labels.length > maxLines || Math.max(...measured.widths) > measureWidth)

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
    return { ...measured, fontSize, characterCount, maxLines, overflow, empty: !headline, caseWarning, eyebrow, fontVersion }
  }, [headline, eyebrowText, caps, settings.headline, settings.autoWrap, settings.coverFormat, settings.column, settings.autoSize, settings.fontSize, fontVersion])
}

function downloadBlob(content: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
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
 * Decodes, downsizes and re-encodes an uploaded photo as sRGB JPEG, so the preview, PNG and SVG
 * all use the same pixels and SVG exports stay a sensible size.
 */
async function preparePhoto(file: File) {
  const source = URL.createObjectURL(file)
  try {
    const image = await loadImage(source)
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('unreadable')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
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

function App() {
  const [settings, setSettings] = useState<GeneratorSettings>(loadSettings)
  const [history, setHistory] = useState<number[]>([settings.seed])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [copied, setCopied] = useState<'svg' | 'seed' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [previewBackground, setPreviewBackground] = useState<PreviewBackground>('charcoal')
  const [photo, setPhoto] = useState<string | null>(null)
  const [position, setPosition] = useState<Position>({ x: anchorX(settings.align), y: 50 })
  const [sampleOpen, setSampleOpen] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null)
  const noticeTimer = useRef<number | undefined>(undefined)
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
  const exportBlocked = layout.overflow || layout.empty

  useEffect(() => { preloadEmbeddedFonts() }, [])
  useEffect(() => { saveSettings(settings) }, [settings])

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

  const flash = (message: string) => {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 6000)
  }

  const exportSvg = (artboard: boolean) => {
    const text = layers.map((layer) => layer.kind === 'text' ? layer.text : '').join(' ')
    return svgMarkup(layers, shape, { artboard, background: previewBackground, photo, position, fontCss: embeddedFontCss(text) })
  }

  const copy = async (kind: 'svg' | 'seed') => {
    try {
      await navigator.clipboard.writeText(kind === 'svg' ? exportSvg(true) : String(settings.seed))
      setCopied(kind)
      setTimeout(() => setCopied(null), 1400)
    } catch {
      flash('The browser blocked copying. Use Full SVG to download the file instead.')
    }
  }

  const downloadSvg = (artboard: boolean) => {
    downloadBlob(exportSvg(artboard), 'image/svg+xml', artboard ? 'tape-type-instagram.svg' : 'tape-cutout.svg')
  }

  const downloadPng = async (scale: 1 | 2 | 3) => {
    if (exporting) return
    setExporting(true)
    // Snapshot everything now, so edits made while the export runs cannot mix into this file.
    const snapshot: { layers: Layer[]; shape: typeof shape; position: Position; background: PreviewBackground; photo: string | null } = { layers, shape, position, background: previewBackground, photo }
    const canvas = document.createElement('canvas')
    try {
      const sizes = [...new Set(snapshot.layers.flatMap((layer) => layer.kind === 'text' ? [layer.size] : []))]
      const allText = snapshot.layers.map((layer) => layer.kind === 'text' ? layer.text : '').join(' ')
      await Promise.all(sizes.map((size) => document.fonts.load(fontShorthand(size), allText)))
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
      flash('That photo couldn’t be opened in this browser. HEIC photos need converting to JPEG first.')
    }
  }

  const clickPhoto = (event: React.MouseEvent) => {
    // With a photo already loaded, the first click switches back to it; the next one replaces it.
    if (photo && previewBackground !== 'photo') {
      event.preventDefault()
      setPreviewBackground('photo')
    }
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

  const nudge = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 10 : 2
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    setPosition((current) => ({
      x: Math.max(0, Math.min(100, current.x + move[0])),
      y: Math.max(0, Math.min(100, current.y + move[1])),
    }))
  }

  const placement = getPlacement(shape, position)
  const isFeature = settings.style === 'feature'
  const locked = settings.seedLocked
  const blockedReason = layout.empty ? 'Type a headline to export.' : 'Edit the headline so it fits before exporting.'

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
            <h2>Style</h2>
            <div className="style-toggle" role="group" aria-label="Cover style">
              {styles.map((style) => (
                <button key={style.value} aria-pressed={settings.style === style.value} className={settings.style === style.value ? 'active' : ''} onClick={() => chooseStyle(style.value)}>
                  <strong className={style.value === 'feature' ? 'caps' : ''}>{style.label}</strong>
                  <small>{style.description}</small>
                </button>
              ))}
            </div>
            <div className={`fit-status ${layout.overflow ? 'error' : layout.caseWarning ? 'warning' : ''}`} role="status">
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
            <div className="range-stack composition-ranges">
              <RangeField label="Tape cling" value={settings.hugStrength} min={0.82} max={1.16} step={0.01} disabled={settings.tone === 'none'} format={(value) => `${Math.round(value * 100)}%`} onChange={(value) => update('hugStrength', value)} />
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
                  onClick={() => update('mode', mode.value)}
                >
                  <span className={`mode-icon ${mode.value}`} aria-hidden="true"><i /><i /><i /></span>
                  <strong>{mode.label}</strong>
                  <small>{mode.description}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="control-section compact-grid typography-grid brand-type-section">
            <h2>Layout</h2>
            <div className="brand-lock"><Lock size={14} aria-hidden="true" /><span><strong>Barlow Bold</strong><small>700 · {isFeature ? 'ALL CAPS' : settings.titleCase ? 'Title Case' : 'as typed'} · {settings.coverFormat === 'series' ? TEXT_AREA_WIDTH : columnWidth(settings.column)}px column</small></span></div>
            <SelectField label="Alignment" value={settings.align} onChange={(value) => chooseAlign(value as TextAlign)}>
              <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
            </SelectField>
            <div className="position-field">
              <span>Position</span>
              <div className="piece-toggle compact" role="group" aria-label="Vertical position">
                {positions.map((entry) => (
                  <button key={entry.label} aria-pressed={position.y === entry.y} className={position.y === entry.y ? 'active' : ''} onClick={() => setPosition({ x: anchorX(settings.align), y: entry.y })}>{entry.label}</button>
                ))}
              </div>
            </div>
            <div className="position-field column-field">
              <span>Column</span>
              <div className="piece-toggle compact" role="group" aria-label="Column width">
                {columns.map((entry) => (
                  <button key={entry.value} aria-pressed={settings.column === entry.value} className={settings.column === entry.value ? 'active' : ''} disabled={settings.coverFormat === 'series'} onClick={() => update('column', entry.value)}>{entry.label}</button>
                ))}
              </div>
            </div>
            <div className="piece-toggle format-toggle" role="group" aria-label="Cover format">
              <button aria-pressed={settings.coverFormat === 'regular'} className={settings.coverFormat === 'regular' ? 'active' : ''} onClick={() => update('coverFormat', 'regular')}>Regular cover</button>
              <button aria-pressed={settings.coverFormat === 'series'} className={settings.coverFormat === 'series' ? 'active' : ''} onClick={() => update('coverFormat', 'series')}>Series cover</button>
            </div>
            {settings.coverFormat === 'regular' && (
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
              onPointerUp={() => { dragRef.current = null }}
              onPointerCancel={() => { dragRef.current = null }}
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
              <button className="randomise-button" disabled={locked} onClick={randomise}><Sparkles size={17} aria-hidden="true" /> Randomise cut</button>
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
              {exportBlocked && <p className="export-message">{blockedReason}</p>}
            </div>
            <div className="export-actions">
              <button disabled={exportBlocked} onClick={() => copy('svg')}>{copied === 'svg' ? <Check size={16} /> : <Clipboard size={16} />}{copied === 'svg' ? 'Copied' : 'Copy SVG'}</button>
              <button disabled={exportBlocked} onClick={() => downloadSvg(false)}><Download size={16} aria-hidden="true" /> Cutout SVG</button>
              <button disabled={exportBlocked || exporting} onClick={() => downloadPng(1)}><Download size={16} aria-hidden="true" /> PNG 1×</button>
              <button className="png-fallback" disabled={exportBlocked || exporting} onClick={() => downloadPng(2)}><Download size={16} aria-hidden="true" /> PNG 2×</button>
              <button disabled={exportBlocked || exporting} onClick={() => downloadPng(3)}><Download size={16} aria-hidden="true" /> PNG 3×</button>
              <button className="primary" disabled={exportBlocked} onClick={() => downloadSvg(true)}><Download size={16} aria-hidden="true" /> Full SVG</button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
