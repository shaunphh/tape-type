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
  PHOTO_DARKEN,
  buildLayers,
  drawLayers,
  fontShorthand,
  getPlacement,
  layerTransform,
  placementRange,
  svgMarkup,
  textRuns,
  tones,
  type Layer,
  type Position,
  type PreviewBackground,
} from './artwork'
import { loadCover, saveCover, type CoverOptions } from './cover'
import { embeddedFontCss, embeddedFontCssNow, preloadEmbeddedFonts } from './fonts'
import { GRID_CROP, VIDEO_LOOKS, VIDEO_TYPES, frameFor, lookFor, type CoverKind, type Look, type VideoType } from './formats'
import {
  buildFurniture,
  furnitureBoxes,
  furnitureObstacles,
  luminanceOf,
  settleColour,
  type Box,
  type ColourChoice,
  type LogoSide,
  type Ruling,
} from './furniture'
import { buildShape, nextSeed } from './geometry'
import { EYEBROW_WEIGHT, layoutHeadline, weightFor, type HeadlineLayout, type Measure } from './layout'
import { LINE_HEIGHT, applyLocks, isBarred, isLocked, lockedLineGap, unlocked } from './locks'
import { measureInk } from './metrics'
import { CENTRED, MAX_ZOOM, dragPhoto, photoRect, photoSlack, visiblePart, type PhotoView } from './photo'
import {
  TEXT_AREA_WIDTH,
  TREATMENT_KEYS,
  columnWidth,
  columns,
  loadSettings,
  saveSettings,
  stylePresets,
  type Frame,
  type Treatment,
} from './settings'
import { displayText, isAllCaps, normaliseEyebrow, normaliseHeadline } from './text'
import type { CoverStyle, GeneratorSettings, ShapeMode, TextAlign } from './types'

const styles: { value: CoverStyle; label: string; description: string }[] = [
  { value: 'headline', label: 'Headline', description: 'Title Case · block or strips' },
  { value: 'feature', label: 'Feature', description: 'All caps · torn strips' },
]

const eyebrowSuggestions: Record<CoverKind, string[]> = {
  post: ['Breaking', 'News', 'Exclusive', 'The Big Read'],
  video: ['Quick watch', 'Quick guide', 'Breaking', 'News'],
}
const kindOptions: { value: CoverKind; label: string }[] = [
  { value: 'post', label: 'Post 4:5' },
  { value: 'video', label: 'Video cover 9:16' },
]

const positions: { label: string; y: number }[] = [
  { label: 'Top', y: 0 },
  { label: 'Middle', y: 50 },
  { label: 'Bottom', y: 100 },
]

const alignOptions: { value: TextAlign; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Right' },
]
const positionOptions = positions.map((entry) => ({ value: entry.label, label: entry.label }))
const columnOptions = columns.map((entry) => ({ value: entry.value, label: entry.label }))
const formatOptions: { value: GeneratorSettings['coverFormat']; label: string }[] = [
  { value: 'regular', label: 'Regular' },
  { value: 'series', label: 'Series' },
]
const logoOptions: { value: LogoSide; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
]
const colourOptions: { value: ColourChoice; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]
const LOCKED_NOTE = 'Switched off for now'
const WEIGHT_NAMES: Record<number, string> = { 700: 'Bold', 800: 'ExtraBold', 900: 'Black' }

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

// The largest export is PNG 3×: photos are kept at up to the size that needs, and no larger.
const LARGEST_EXPORT = 3
// Phones refuse a canvas much bigger than this, and the whole photo is kept so it can be repositioned.
const MAX_PHOTO_PIXELS = 16_000_000
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

function overflowMessage(layout: HeadlineLayout, settings: GeneratorSettings) {
  const series = settings.coverFormat === 'series'
  const offer = (lead: string, fixes: (string | false)[]) => {
    const options = fixes.filter(Boolean)
    return options.length ? `${lead} Try ${options.join(' or ')}, or shorten it.` : `${lead} Shorten it.`
  }
  if (layout.overflow === 'eyebrow') return 'The eyebrow is too long to fit on the cover. Shorten it.'
  if (layout.overflow === 'lines') {
    // Wrapping can split a typed line but never join two, so only the writer can fix too many.
    if (layout.paragraphs > layout.maxLines) return `The headline has more than ${layout.maxLines === 2 ? 'two' : 'six'} typed lines. Remove some line breaks.`
    if (series) return 'Series covers fit two lines at most. Shorten the headline.'
    return offer('The headline runs past six lines.', [settings.column !== 'wide' && 'a wider column', !settings.autoSize && 'Auto size'])
  }
  if (series) return settings.autoWrap ? 'A word is too wide for a series cover. Shorten it.' : 'A typed line is too wide for a series cover. Turn on Auto wrap, or shorten it.'
  return offer(
    settings.autoWrap ? 'A word is wider than the column.' : 'A typed line is wider than the column.',
    [settings.column !== 'wide' && 'a wider column', !settings.autoWrap && 'Auto wrap', !settings.autoSize && 'Auto size'],
  )
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

interface Photo {
  url: string
  image: HTMLImageElement
  width: number
  height: number
}

const toJpeg = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('unreadable'))), 'image/jpeg', quality))

/**
 * Decodes an uploaded photo and re-encodes all of it as sRGB JPEG, so it can be moved and zoomed
 * behind the cover. It is kept at no more than the 3× export needs with the photo at its widest,
 * so the preview and every export draw from the same pixels.
 */
async function preparePhoto(file: File, frame: Frame): Promise<Photo> {
  const source = URL.createObjectURL(file)
  const canvas = document.createElement('canvas')
  try {
    const original = await loadImage(source)
    const cover = Math.max(frame.width / original.naturalWidth, frame.height / original.naturalHeight)
    const scale = Math.min(1, LARGEST_EXPORT * cover, Math.sqrt(MAX_PHOTO_PIXELS / (original.naturalWidth * original.naturalHeight)))
    canvas.width = Math.max(1, Math.round(original.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(original.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('unreadable')
    // JPEG has no transparency: see-through areas of a PNG sit on brand black.
    context.fillStyle = BRAND.dark
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.imageSmoothingQuality = 'high'
    context.drawImage(original, 0, 0, canvas.width, canvas.height)
    const url = URL.createObjectURL(await toJpeg(canvas, 0.9))
    try {
      const image = await loadImage(url)
      return { url, image, width: image.naturalWidth, height: image.naturalHeight }
    } catch (error) {
      URL.revokeObjectURL(url)
      throw error
    }
  } finally {
    canvas.width = 0
    canvas.height = 0
    URL.revokeObjectURL(source)
  }
}

/** The part of the photo the cover shows, as a JPEG data URL for SVG exports (which stay a sensible size). */
async function cropPhoto(photo: Photo, view: PhotoView, frame: Frame) {
  const part = visiblePart(photo.width, photo.height, view, frame)
  const scale = Math.min(1, frame.height * LARGEST_EXPORT / part.height)
  const canvas = document.createElement('canvas')
  try {
    canvas.width = Math.max(1, Math.round(part.width * scale))
    canvas.height = Math.max(1, Math.round(part.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('unreadable')
    context.imageSmoothingQuality = 'high'
    context.drawImage(photo.image, part.x, part.y, part.width, part.height, 0, 0, canvas.width, canvas.height)
    const blob = await toJpeg(canvas, 0.88)
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

const SAMPLE = { width: 24, height: 12 }
let sampler: CanvasRenderingContext2D | null | undefined

/** How bright the photo is under a mark, as the cover shows it: one luminance per sample, for checking the mark reads. */
function photoGround(photo: Photo, view: PhotoView, box: Box, darken: number, frame: Frame) {
  if (sampler === undefined) {
    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE.width
    canvas.height = SAMPLE.height
    sampler = canvas.getContext('2d', { willReadFrequently: true })
  }
  if (!sampler) return []
  const rect = photoRect(photo.width, photo.height, view, frame)
  try {
    sampler.drawImage(photo.image, (box.x - rect.x) / rect.scale, (box.y - rect.y) / rect.scale, box.width / rect.scale, box.height / rect.scale, 0, 0, SAMPLE.width, SAMPLE.height)
    const { data } = sampler.getImageData(0, 0, SAMPLE.width, SAMPLE.height)
    const ground: number[] = []
    for (let index = 0; index < data.length; index += 4) ground.push(luminanceOf(data[index], data[index + 1], data[index + 2], darken))
    return ground
  } catch {
    return []
  }
}

const fillLuminance = (fill: string) => luminanceOf(parseInt(fill.slice(1, 3), 16), parseInt(fill.slice(3, 5), 16), parseInt(fill.slice(5, 7), 16))

/** A few words on how a mark's colour was settled, shown beside its control. */
function colourNote(ruling: Ruling, choice: ColourChoice) {
  if (choice === 'auto') return ruling.reads ? `Picked ${ruling.colour}` : 'Nothing reads well here'
  return ruling.reads ? undefined : 'Hard to read here'
}

const TIED_NOTE = 'Takes the logo’s colour for now'

function RangeField({ label, value, min, max, step = 1, suffix = '', disabled = false, title, format, onChange }: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  disabled?: boolean
  /** What hovering over the field says, such as why it is switched off. */
  title?: string
  format?: (value: number) => string
  onChange: (value: number) => void
}) {
  const progress = ((value - min) / (max - min)) * 100
  const shown = format ? format(value) : `${Math.round(value * 100) / 100}${suffix}`
  return (
    <label className="range-field" title={title}>
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

const PANELS_KEY = 'tape-type-panels-v1'
type PanelId = 'cover' | 'words' | 'photo' | 'marks' | 'style' | 'tape' | 'layout' | 'tune'
/** Which control groups start open: the everyday decisions, with layout and fine-tuning folded away. */
const panelDefaults: Record<PanelId, boolean> = { cover: true, words: true, photo: true, marks: true, style: true, tape: true, layout: false, tune: false }

function loadPanels(): Record<PanelId, boolean> {
  try {
    const stored = JSON.parse(localStorage.getItem(PANELS_KEY) ?? 'null') as Record<string, unknown> | null
    if (!stored || typeof stored !== 'object') return panelDefaults
    const panels = { ...panelDefaults }
    for (const id of Object.keys(panelDefaults) as PanelId[]) {
      const value = stored[id]
      if (typeof value === 'boolean') panels[id] = value
    }
    return panels
  } catch {
    return panelDefaults
  }
}

function savePanels(panels: Record<PanelId, boolean>) {
  try {
    localStorage.setItem(PANELS_KEY, JSON.stringify(panels))
  } catch {
    // Blocked storage only costs remembering which groups were open.
  }
}

/** A collapsible control group. While closed, its header shows the group's current settings in a few words. */
function Panel({ id, title, summary, open, onToggle, children }: {
  id: PanelId
  title: string
  summary: string
  open: boolean
  onToggle: (id: PanelId, open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <details className="panel" open={open} onToggle={(event) => onToggle(id, event.currentTarget.open)}>
      <summary>
        <span className="panel-title">{title}</span>
        <span className="panel-summary">{summary}</span>
        <ChevronDown size={15} className="panel-chevron" aria-hidden="true" />
      </summary>
      <div className="panel-body">{children}</div>
    </details>
  )
}

function Segmented<T extends string>({ label, note, value, options, disabled = false, locked, lockedNote = LOCKED_NOTE, onChange }: {
  label: string
  /** A few words beside the label, such as what Auto settled on. */
  note?: string
  value: T | null
  options: { value: T; label: string }[]
  disabled?: boolean
  /** Options that are switched off for now: greyed out, but still on show. */
  locked?: (value: T) => boolean
  /** What hovering over a switched-off option says. */
  lockedNote?: string
  onChange: (value: T) => void
}) {
  return (
    <div className="position-field">
      <span>{label}{note && <em>{note}</em>}</span>
      <div className="piece-toggle compact" role="group" aria-label={label} style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
        {options.map((option) => {
          const off = locked?.(option.value) ?? false
          return <button key={option.value} aria-pressed={value === option.value} className={value === option.value ? 'active' : ''} disabled={disabled || off} title={off ? lockedNote : undefined} onClick={() => onChange(option.value)}>{option.label}</button>
        })}
      </div>
    </div>
  )
}

/** The preview draws the same layers the exports do. */
function LayerList({ layers }: { layers: Layer[] }) {
  return (
    <>
      {layers.map((layer, index) => (layer.kind === 'path'
        ? <path key={`path-${index}`} d={layer.d} fill={layer.fill} transform={layerTransform(layer)} />
        : <text key={`text-${index}`} x={layer.x} y={layer.y} fill={layer.fill} fontFamily={FONT_FAMILY} fontWeight={layer.weight} fontSize={layer.size} transform={layerTransform(layer)}>{layer.text}</text>))}
    </>
  )
}

interface Drag {
  pointerId: number
  /** What was picked up: the words, or the photo behind them. */
  target: 'artwork' | 'photo'
  touch: boolean
  /** Touch drags start only once the finger clearly moves sideways; until then it may be a scroll. */
  active: boolean
  startX: number
  startY: number
  from: Position
  fromView: PhotoView
  /** Artboard pixels per screen pixel. */
  scale: number
  span: { x: number; y: number }
}

/** How close to the words a press still picks them up, in artboard pixels. */
const GRAB_MARGIN = 14

function App() {
  const [cover, setCover] = useState<CoverOptions>(loadCover)
  const [settings, setSettings] = useState<GeneratorSettings>(() => applyLocks(loadSettings(), lookFor(cover.kind, cover.video)))
  const [history, setHistory] = useState<number[]>([settings.seed])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [seedDraft, setSeedDraft] = useState<string | null>(null)
  const [copied, setCopied] = useState<'svg' | 'seed' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [previewBackground, setPreviewBackground] = useState<PreviewBackground>('charcoal')
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [photoView, setPhotoView] = useState<PhotoView>(CENTRED)
  const [position, setPosition] = useState<Position>(() => ({ x: anchorX(settings.align), y: lookFor(cover.kind, cover.video).position.y }))
  const [sampleOpen, setSampleOpen] = useState(false)
  const [panels, setPanels] = useState<Record<PanelId, boolean>>(loadPanels)
  const previewRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const noticeTimer = useRef<number | undefined>(undefined)
  const treatments = useRef<Partial<Record<CoverStyle, Treatment>>>({})
  const cropRef = useRef<{ key: string; crop: Promise<string> } | null>(null)
  const locksOff = useMemo(unlocked, [])
  const frame = frameFor(cover.kind)
  const look = lookFor(cover.kind, cover.video)
  const fileStem = cover.kind === 'video' ? 'tape-type-video-cover' : 'tape-type-instagram'
  const fonts = useFontStatus()
  const layout = useTextLayout(settings, fonts.version)
  const layoutSettings = useMemo<GeneratorSettings>(() => ({
    ...settings,
    fontSize: layout.fontSize,
    // Locked, the line height is fixed, whatever gap was saved.
    lineGap: locksOff ? settings.lineGap : lockedLineGap(layout.fontSize, layout.ascent + layout.descent),
  }), [settings, layout.fontSize, layout.ascent, layout.descent, locksOff])
  const shape = useMemo(() => buildShape(
    layoutSettings,
    layout.labels,
    layout.widths,
    layout.originOffsets,
    { ascent: layout.ascent, descent: layout.descent },
    { eyebrow: layout.eyebrow, tapeless: settings.tone === 'none' },
  ), [layoutSettings, layout, settings.tone])
  const layers = useMemo(
    () => buildLayers(shape, { tone: settings.tone, background: previewBackground, weight: layout.weight, tag: look.tag }, layout.fontSize),
    [shape, settings.tone, previewBackground, layout.weight, layout.fontSize, look.tag],
  )
  const runs = useMemo(() => textRuns(layers), [layers])
  const range = useMemo(() => placementRange(shape, frame), [shape, frame])
  const shownPhoto = previewBackground === 'photo' ? photo : null
  const darken = cover.darken ? PHOTO_DARKEN : 0
  const markBoxes = useMemo(() => furnitureBoxes({ logo: cover.logo, arrow: cover.arrow }, frame), [cover.logo, cover.arrow, frame])
  const obstacles = useMemo(() => furnitureObstacles({ logo: cover.logo, arrow: cover.arrow }, frame), [cover.logo, cover.arrow, frame])
  // For now the arrow takes the logo's colour whenever both are on the cover.
  const tied = !locksOff && cover.logo !== 'off' && cover.arrow
  // Each mark is checked against what is behind it, so moving the photo can change its colour.
  const rulings = useMemo(() => {
    const flat = BACKGROUND_FILLS[previewBackground]
    const groundUnder = (box?: Box) => (!box ? [] : shownPhoto ? photoGround(shownPhoto, photoView, box, darken, frame) : flat ? [fillLuminance(flat)] : [])
    const logo = settleColour(cover.logoColour, groundUnder(markBoxes.logo))
    // Tied, the arrow is drawn in the logo's colour and only checked against its own ground.
    return { logo, arrow: settleColour(tied ? logo.colour : cover.arrowColour, groundUnder(markBoxes.arrow)) }
  }, [tied, cover.logoColour, cover.arrowColour, markBoxes, shownPhoto, photoView, darken, previewBackground, frame])
  const furniture = useMemo(
    () => buildFurniture({ logo: cover.logo, arrow: cover.arrow }, { logo: rulings.logo.colour, arrow: rulings.arrow.colour }, frame),
    [cover.logo, cover.arrow, rulings.logo.colour, rulings.arrow.colour, frame],
  )
  // Rotation or a wide eyebrow can make the lettering bigger than the safe area even when every line fits its column.
  const lettersTooBig = range.x.excess > 4 || range.y.excess > 4
  const blockedReason = layout.empty
    ? 'Type a headline to export.'
    : layout.overflow
      ? overflowMessage(layout, settings)
      : lettersTooBig ? `The lettering is bigger than ${cover.kind === 'video' ? 'what the profile grid shows' : 'the safe area'}. Try a narrower column, less rotation or a shorter eyebrow.` : null
  const exportDisabled = Boolean(blockedReason) || fonts.loading

  useEffect(() => { preloadEmbeddedFonts(runs) }, [runs])
  useEffect(() => { saveSettings(settings) }, [settings])
  useEffect(() => { saveCover(cover) }, [cover])
  useEffect(() => { savePanels(panels) }, [panels])
  // A replaced photo is let go; its address only has to last while it is on show.
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url) }, [photo])

  const update = useCallback(<K extends keyof GeneratorSettings>(key: K, value: GeneratorSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }, [])

  const togglePanel = useCallback((id: PanelId, open: boolean) => {
    setPanels((current) => (current[id] === open ? current : { ...current, [id]: open }))
  }, [])

  const updateCover = useCallback(<K extends keyof CoverOptions>(key: K, value: CoverOptions[K]) => {
    setCover((current) => ({ ...current, [key]: value }))
  }, [])

  /** Puts the text block into a look: its tape, case and place, and the tag it starts with. */
  const applyLook = (next: Look) => {
    setSettings((current) => ({
      ...current,
      ...next.treatment,
      style: next.style,
      coverFormat: next.coverFormat,
      eyebrowEnabled: next.eyebrow !== null,
      eyebrow: next.eyebrow ?? current.eyebrow,
    }))
    setPosition(next.position)
  }

  const chooseKind = (kind: CoverKind) => {
    if (kind === cover.kind) return
    updateCover('kind', kind)
    applyLook(lookFor(kind, cover.video))
  }

  const chooseVideo = (video: VideoType) => {
    updateCover('video', video)
    applyLook(VIDEO_LOOKS[video])
  }

  const chooseStyle = (style: CoverStyle) => {
    if (style === settings.style || isLocked('style', style, look, locksOff)) return
    // Each style remembers how it was last set up in this session; a style not used yet starts from its house look.
    treatments.current[settings.style] = pickTreatment(settings)
    const treatment = treatments.current[style] ?? stylePresets[style]
    setSettings((current) => ({ ...current, ...treatment, style }))
    setPosition((current) => ({ ...current, x: anchorX(treatment.align) }))
  }

  const resetStyle = () => {
    // With the locks on, the house look is the cover's own; with them off, the chosen style's.
    const treatment = locksOff ? stylePresets[settings.style] : look.treatment
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

  const svgFor = (artboard: boolean, fontCss: string, crop: string | null) =>
    svgMarkup(layers, shape, { artboard, background: previewBackground, photo: crop, darken, position, fontCss, furniture, obstacles, frame })

  /** The photo as the cover shows it, for SVG exports. Made once per photo position, when first asked for. */
  const photoCrop = (): Promise<string | null> => {
    if (!shownPhoto) return Promise.resolve(null)
    const key = [shownPhoto.url, photoView.x, photoView.y, photoView.zoom, frame.height].join('|')
    if (cropRef.current?.key !== key) {
      const crop = cropPhoto(shownPhoto, photoView, frame)
      cropRef.current = { key, crop }
      crop.catch(() => { if (cropRef.current?.crop === crop) cropRef.current = null })
    }
    return cropRef.current.crop
  }

  const copy = async (kind: 'svg' | 'seed') => {
    try {
      if (kind === 'seed') {
        await navigator.clipboard.writeText(String(settings.seed))
      } else {
        const ready = embeddedFontCssNow(runs)
        if (ready !== null && !shownPhoto) {
          await navigator.clipboard.writeText(svgFor(true, ready, null))
        } else {
          // Safari only allows clipboard writes during the click, so it gets a promise of the text.
          const text = Promise.all([embeddedFontCss(runs), photoCrop()]).then(([{ css, missing }, crop]) => {
            if (missing) flash('Barlow couldn’t be embedded (network error), so the copied SVG only matches where Barlow is installed.')
            return new Blob([svgFor(true, css, crop)], { type: 'text/plain' })
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
    try {
      const [{ css, missing }, crop] = await Promise.all([embeddedFontCss(runs), artboard ? photoCrop() : null])
      if (missing) flash('Barlow couldn’t be embedded (network error), so this SVG only matches where Barlow is installed. The PNG is exact.')
      downloadBlob(svgFor(artboard, css, crop), 'image/svg+xml', artboard ? `${fileStem}.svg` : 'tape-cutout.svg')
    } catch {
      flash('The photo couldn’t be added to the SVG. Try a PNG instead.')
    }
  }

  const downloadPng = async (scale: 1 | 2 | 3) => {
    if (exporting) return
    setExporting(true)
    // Snapshot everything now, so edits made while the export runs cannot mix into this file.
    const snapshot = { layers, furniture, obstacles, frame, shape, position, background: previewBackground, photo: shownPhoto, view: photoView, darken, fileStem }
    const canvas = document.createElement('canvas')
    try {
      const allText = snapshot.layers.map((layer) => layer.kind === 'text' ? layer.text : '').join(' ')
      const faces = [...new Set(snapshot.layers.flatMap((layer) => layer.kind === 'text' ? [fontShorthand(layer.size, layer.weight)] : []))]
      await Promise.all(faces.map((face) => document.fonts.load(face, allText)))
      canvas.width = snapshot.frame.width * scale
      canvas.height = snapshot.frame.height * scale
      const context = canvas.getContext('2d')
      if (!context) throw new Error('this device could not create the image')
      context.scale(scale, scale)
      const fill = BACKGROUND_FILLS[snapshot.background]
      if (fill) {
        context.fillStyle = fill
        context.fillRect(0, 0, snapshot.frame.width, snapshot.frame.height)
      } else if (snapshot.photo) {
        const rect = photoRect(snapshot.photo.width, snapshot.photo.height, snapshot.view, snapshot.frame)
        context.imageSmoothingQuality = 'high'
        context.drawImage(snapshot.photo.image, rect.x, rect.y, rect.width, rect.height)
        if (snapshot.darken > 0) {
          context.fillStyle = `rgba(0,0,0,${snapshot.darken})`
          context.fillRect(0, 0, snapshot.frame.width, snapshot.frame.height)
        }
      }
      drawLayers(context, snapshot.furniture)
      const placement = getPlacement(snapshot.shape, snapshot.position, snapshot.obstacles, snapshot.frame)
      context.translate(placement.x, placement.y)
      drawLayers(context, snapshot.layers)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('this device could not create an image that large')
      downloadBlob(blob, 'image/png', `${snapshot.fileStem}-${scale}x.png`)
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
      setPhoto(await preparePhoto(file, frame))
      setPhotoView(CENTRED)
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

  const spans = () => ({ x: range.x.maximum - range.x.minimum, y: range.y.maximum - range.y.minimum })
  // A move of `delta` artboard pixels, as a share of the range the artwork can travel.
  const percentOf = (delta: number, span: number) => (span > 1 ? delta / span * 100 : 0)

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !previewRef.current) return
    const touch = event.pointerType === 'touch'
    const stage = previewRef.current.getBoundingClientRect()
    const scale = frame.width / stage.width
    // A press on the words moves the words; anywhere else on a photo moves the photo.
    const x = (event.clientX - stage.left) * scale - placement.x
    const y = (event.clientY - stage.top) * scale - placement.y
    const { viewBox } = shape
    const onWords = x >= viewBox.x - GRAB_MARGIN && x <= viewBox.x + viewBox.width + GRAB_MARGIN
      && y >= viewBox.y - GRAB_MARGIN && y <= viewBox.y + viewBox.height + GRAB_MARGIN
    dragRef.current = {
      pointerId: event.pointerId,
      target: shownPhoto && !onWords ? 'photo' : 'artwork',
      touch,
      active: !touch,
      startX: event.clientX,
      startY: event.clientY,
      from: position,
      fromView: photoView,
      scale,
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
    if (start.target === 'photo') {
      // On touch, vertical swipes scroll the page: the Up – down slider moves the photo that way.
      if (shownPhoto) setPhotoView(dragPhoto(shownPhoto.width, shownPhoto.height, start.fromView, dx * start.scale, start.touch ? 0 : dy * start.scale, frame))
      return
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
    if (dragRef.current?.active) {
      if (dragRef.current.target === 'photo') setPhotoView(dragRef.current.fromView)
      else setPosition(dragRef.current.from)
    }
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

  const placement = getPlacement(shape, position, obstacles, frame)
  const photoPlace = shownPhoto ? photoRect(shownPhoto.width, shownPhoto.height, photoView, frame) : null
  const slack = shownPhoto ? photoSlack(shownPhoto.width, shownPhoto.height, photoView, frame) : { x: 0, y: 0 }
  const isVideo = cover.kind === 'video'
  const photoMoved = photoView.x !== CENTRED.x || photoView.y !== CENTRED.y || photoView.zoom !== CENTRED.zoom
  const isFeature = settings.style === 'feature'
  const series = settings.coverFormat === 'series'
  const locked = settings.seedLocked
  const noTape = settings.tone === 'none'
  const plain = settings.mode === 'plain'
  // The seed also turns rotated strips, so Randomise stays useful then even with no cut to vary.
  const rotates = settings.perLine && settings.rotationVariance > 0
  const variationOff = locked || ((noTape || plain) && !rotates)
  const variationNote = locked || rotates ? undefined : noTape ? 'No tape, so there is no cut to vary' : plain ? 'Plain tape has no cut to vary' : undefined
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

  const toneLabel = tones.find((tone) => tone.value === settings.tone)?.label ?? 'Light'
  const modeLabel = modes.find((mode) => mode.value === settings.mode)?.label ?? 'Plain'
  const columnLabel = columns.find((entry) => entry.value === settings.column)?.label ?? 'Narrow'
  const alignLabel = alignOptions.find((entry) => entry.value === settings.align)?.label ?? 'Left'
  const positionEntry = positions.find((entry) => Math.abs(position.y - entry.y) < 0.5)
  const headlinePreview = settings.headline.replace(/\s+/g, ' ').trim()
  const eyebrowPreview = settings.eyebrowEnabled ? settings.eyebrow.trim() : ''
  const summaries: Record<PanelId, string> = {
    cover: isVideo ? `Video cover · ${look.label}` : 'Post',
    words: headlinePreview ? (eyebrowPreview ? `${eyebrowPreview} · ${headlinePreview}` : headlinePreview) : 'No headline yet',
    photo: !photo
      ? 'No photo yet'
      : [shownPhoto ? (photoMoved ? `Zoom ${Math.round(photoView.zoom * 100)}%` : 'Centred') : 'Hidden', cover.darken ? 'Darkened' : 'As shot'].join(' · '),
    marks: [cover.logo === 'off' ? 'No logo' : `Logo ${cover.logo}, ${rulings.logo.colour}`, cover.arrow ? `Arrow, ${rulings.arrow.colour}` : 'No arrow'].join(' · '),
    style: `${isFeature ? 'Feature' : 'Headline'} · Barlow ${WEIGHT_NAMES[layout.weight] ?? layout.weight}`,
    tape: noTape ? 'No tape' : `${toneLabel} · ${settings.perLine ? 'Strips' : 'Block'} · ${modeLabel}`,
    layout: [
      alignLabel,
      positionEntry?.label ?? `${Math.round(position.y)}% down`,
      series ? 'Series cover' : `${columnLabel} column`,
      series ? '172px' : settings.autoSize ? `Auto ${layout.fontSize}px` : `${layout.fontSize}px`,
    ].join(' · '),
    tune: `Cling ${Math.round(settings.hugStrength * 100)}% · ${locksOff ? `Gap ${settings.lineGap}px` : `Line height ${LINE_HEIGHT}`} · Turn ${settings.rotationVariance.toFixed(1)}°`,
  }
  const fitTone = blockedReason && !layout.empty ? 'error' : layout.caseWarning ? 'warning' : ''
  const exportBlocked = blockedReason ?? (fonts.loading ? 'Loading fonts…' : null)

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Tape Type home">
          <span className="brand-mark"><span>T</span></span>
          <span>Tape Type</span>
        </a>
        <h1 className="visually-hidden">Tape Type: cutout text generator</h1>
        <p className="topbar-tagline">Controlled tape geometry built around your headline — never a rotated rectangle.</p>
        <div className="topbar-meta">
          <span className="status-dot" />
          Local tool
        </div>
      </header>

      <main id="top" className="workspace">
        <aside className="controls-panel">
          <Panel id="cover" title="Cover" summary={summaries.cover} open={panels.cover} onToggle={togglePanel}>
            <Segmented label="Made for" note={`${frame.width} × ${frame.height}`} value={cover.kind} options={kindOptions} onChange={chooseKind} />
            {isVideo && (
              <>
                <div className="look-toggle" role="group" aria-label="Kind of video">
                  {VIDEO_TYPES.map((video) => (
                    <button key={video} aria-pressed={cover.video === video} className={cover.video === video ? 'active' : ''} onClick={() => chooseVideo(video)}>
                      <strong>{VIDEO_LOOKS[video].label}</strong>
                      <small>{VIDEO_LOOKS[video].description}</small>
                    </button>
                  ))}
                </div>
                <p className="panel-note">The profile grid shows only the middle of a video cover, so the words stay inside the lines. The logo and arrow sit in the corners, outside them.</p>
              </>
            )}
          </Panel>

          <Panel id="words" title="Words" summary={summaries.words} open={panels.words} onToggle={togglePanel}>
            <div className="section-label-row">
              <span className="field-label">Headline</span>
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
              rows={3}
              onChange={(event) => update('headline', event.target.value)}
            />
            <div className="words-status">
              <div className={`fit-line ${fitTone}`}>
                <strong>{layout.fontSize}px</strong>
                <span>{layout.labels.length} / {layout.maxLines} lines</span>
                <span>{layout.characterCount} chars</span>
              </div>
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
            </div>
            {fitTone && <p className={`fit-message ${fitTone}`} role="status">{statusMessage}</p>}
            <div className="sub-block">
              <div className="section-label-row">
                <span className="field-label">Eyebrow</span>
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
                    {eyebrowSuggestions[cover.kind].map((suggestion) => {
                      const active = settings.eyebrow.trim().toLocaleLowerCase() === suggestion.toLocaleLowerCase()
                      return <button key={suggestion} aria-pressed={active} className={active ? 'active' : ''} onClick={() => update('eyebrow', suggestion)}>{suggestion}</button>
                    })}
                  </div>
                </>
              )}
            </div>
          </Panel>

          <Panel id="photo" title="Photo" summary={summaries.photo} open={panels.photo} onToggle={togglePanel}>
            <div className="photo-actions">
              <label className="panel-button upload-button" onClick={clickPhoto}>
                <input type="file" accept="image/*" onChange={choosePhoto} />
                {photo ? <ImageIcon size={14} aria-hidden="true" /> : <Upload size={14} aria-hidden="true" />}
                {!photo ? 'Choose photo' : shownPhoto ? 'Replace photo' : 'Show photo'}
              </label>
              {shownPhoto && <button className="text-button underlined" disabled={!photoMoved} onClick={() => setPhotoView(CENTRED)}>Reset position</button>}
            </div>
            {shownPhoto ? (
              <div className="range-stack">
                <RangeField label="Zoom" value={photoView.zoom} min={1} max={MAX_ZOOM} step={0.01} format={(value) => `${Math.round(value * 100)}%`} onChange={(zoom) => setPhotoView((current) => ({ ...current, zoom }))} />
                <RangeField label="Left – right" value={photoView.x} min={0} max={100} disabled={slack.x < 1} format={(value) => (slack.x < 1 ? 'Fits' : value === 50 ? 'Centre' : `${Math.round(value)}%`)} onChange={(x) => setPhotoView((current) => ({ ...current, x }))} />
                <RangeField label="Up – down" value={photoView.y} min={0} max={100} disabled={slack.y < 1} format={(value) => (slack.y < 1 ? 'Fits' : value === 50 ? 'Centre' : `${Math.round(value)}%`)} onChange={(y) => setPhotoView((current) => ({ ...current, y }))} />
              </div>
            ) : (
              <p className="panel-note">{photo ? 'The photo is hidden while another background is showing.' : 'Photos stay in your browser. Once one is in, drag it on the cover to reposition it.'}</p>
            )}
            <label className="toggle-row spread">
              <span>Darken photo <small>{Math.round(PHOTO_DARKEN * 100)}% black, so the words read</small></span>
              <input type="checkbox" checked={cover.darken} onChange={(event) => updateCover('darken', event.target.checked)} />
              <span className="switch" />
            </label>
          </Panel>

          <Panel id="marks" title="Logo & arrow" summary={summaries.marks} open={panels.marks} onToggle={togglePanel}>
            <Segmented label="Logo" note="Top corner" value={cover.logo} options={logoOptions} onChange={(logo) => updateCover('logo', logo)} />
            <Segmented
              label="Logo colour"
              note={cover.logo !== 'off' ? colourNote(rulings.logo, cover.logoColour) : undefined}
              value={cover.logoColour}
              options={colourOptions}
              disabled={cover.logo === 'off'}
              onChange={(colour) => updateCover('logoColour', colour)}
            />
            <label className="toggle-row spread">
              <span>Swipe arrow <small>Bottom right corner</small></span>
              <input type="checkbox" checked={cover.arrow} onChange={(event) => updateCover('arrow', event.target.checked)} />
              <span className="switch" />
            </label>
            <Segmented
              label="Arrow colour"
              note={!cover.arrow ? undefined : tied ? (rulings.arrow.reads ? 'Same as the logo' : 'Same as the logo · hard to read here') : colourNote(rulings.arrow, cover.arrowColour)}
              value={tied ? cover.logoColour : cover.arrowColour}
              options={colourOptions}
              disabled={!cover.arrow}
              locked={() => tied}
              lockedNote={TIED_NOTE}
              onChange={(colour) => updateCover('arrowColour', colour)}
            />
          </Panel>

          <Panel id="style" title="Style" summary={summaries.style} open={panels.style} onToggle={togglePanel}>
            <div className="style-toggle" role="group" aria-label="Cover style">
              {styles.map((style) => {
                const off = isLocked('style', style.value, look, locksOff)
                return (
                  <button key={style.value} aria-pressed={settings.style === style.value} className={settings.style === style.value ? 'active' : ''} disabled={off} title={off ? LOCKED_NOTE : undefined} onClick={() => chooseStyle(style.value)}>
                    <strong className={style.value === 'feature' ? 'caps' : ''}>{style.label}</strong>
                    <small>{style.description}</small>
                  </button>
                )
              })}
            </div>
            <div className="style-caption">
              <Lock size={12} aria-hidden="true" />
              <span>Barlow {WEIGHT_NAMES[layout.weight] ?? ''} {layout.weight} · {isFeature ? 'ALL CAPS' : settings.titleCase ? 'Title Case' : 'as typed'} · {series ? TEXT_AREA_WIDTH : columnWidth(settings.column)}px column</span>
              <button className="text-button" onClick={resetStyle} title="Put this style's tape, colour, cut and layout back to the house look">Reset style</button>
            </div>
          </Panel>

          <Panel id="tape" title="Tape" summary={summaries.tape} open={panels.tape} onToggle={togglePanel}>
            <div className="tone-row" role="radiogroup" aria-label="Tape colour">
              {tones.map((tone) => {
                const off = isLocked('tone', tone.value, look, locksOff)
                return (
                  <button
                    key={tone.value}
                    role="radio"
                    aria-checked={settings.tone === tone.value}
                    className={settings.tone === tone.value ? 'active' : ''}
                    disabled={off}
                    title={off ? LOCKED_NOTE : undefined}
                    onClick={() => update('tone', tone.value)}
                  >
                    <i className={`tone-swatch ${tone.value}`} aria-hidden="true" style={tone.tape ? { background: tone.tape, color: tone.text } : undefined}>Aa</i>
                    <span>{tone.label}</span>
                  </button>
                )
              })}
            </div>
            {clash && <p className="tone-note" role="status">{clash}</p>}
            <div className="piece-toggle" role="group" aria-label="Tape pieces">
              {([['Block', false], ['Strips', true]] as const).map(([label, perLine]) => {
                const off = isLocked('perLine', perLine, look, locksOff)
                return <button key={label} aria-pressed={settings.perLine === perLine} className={settings.perLine === perLine ? 'active' : ''} disabled={off} title={off ? LOCKED_NOTE : undefined} onClick={() => update('perLine', perLine)}>{label}</button>
              })}
            </div>
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
          </Panel>

          <Panel id="layout" title="Layout" summary={summaries.layout} open={panels.layout} onToggle={togglePanel}>
            <div className="layout-grid">
              <Segmented label="Alignment" value={settings.align} options={alignOptions} locked={(align) => isLocked('align', align, look, locksOff)} onChange={chooseAlign} />
              <Segmented
                label="Position"
                value={positionEntry?.label ?? null}
                options={positionOptions}
                onChange={(label) => {
                  const entry = positions.find((candidate) => candidate.label === label)
                  if (entry) setPosition({ x: anchorX(settings.align), y: entry.y })
                }}
              />
              <Segmented label="Column" value={series ? null : settings.column} options={columnOptions} disabled={series} locked={(column) => isBarred('column', column, locksOff)} onChange={(column) => update('column', column)} />
              <Segmented label="Format" value={settings.coverFormat} options={formatOptions} locked={(format) => isLocked('coverFormat', format, look, locksOff)} onChange={(format) => update('coverFormat', format)} />
              {!series && (
                <>
                  <label className="toggle-row auto-size-toggle">
                    <span>Auto size</span>
                    <input type="checkbox" checked={settings.autoSize} onChange={(event) => setAutoSize(event.target.checked)} />
                    <span className="switch" />
                  </label>
                  <RangeField label="Cover size" value={settings.autoSize ? layout.fontSize : settings.fontSize} min={72} max={90} suffix="px" disabled={settings.autoSize} onChange={(value) => update('fontSize', value)} />
                </>
              )}
            </div>
          </Panel>

          <Panel id="tune" title="Fine-tune" summary={summaries.tune} open={panels.tune} onToggle={togglePanel}>
            <div className="range-stack">
              <RangeField label="Tape cling" value={settings.hugStrength} min={0.82} max={1.16} step={0.01} disabled={noTape} format={(value) => `${Math.round(value * 100)}%`} onChange={(value) => update('hugStrength', value)} />
              {locksOff
                ? <RangeField label="Line gap" value={settings.lineGap} min={-8} max={20} suffix="px" onChange={(value) => update('lineGap', value)} />
                : <RangeField label="Line gap" value={Math.max(-8, Math.min(20, layoutSettings.lineGap))} min={-8} max={20} disabled title={`${LOCKED_NOTE}: lines are set ${LINE_HEIGHT} of the type size apart`} format={() => `Line height ${LINE_HEIGHT}`} onChange={() => undefined} />}
              <RangeField label="Rotation variance" value={settings.rotationVariance} min={0} max={2} step={0.1} disabled={!settings.perLine} format={(value) => `${value.toFixed(1)}°`} onChange={(value) => update('rotationVariance', value)} />
            </div>
          </Panel>

          <p className="automatic-note panel-footer"><Sparkles size={13} aria-hidden="true" /> Size, fit and cut depth stay inside the brand system</p>
          {!locksOff && <p className="automatic-note panel-footer locked-note"><Lock size={12} aria-hidden="true" /> Greyed-out choices are switched off for now</p>}
        </aside>

        <section className="stage-column">
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

          <div className="stage-wrap">
            {notice && <p className="notice" role="alert">{notice}</p>}
            <div
              ref={previewRef}
              className={`preview-stage ${previewBackground}`}
              style={{ aspectRatio: `${frame.width} / ${frame.height}`, width: `min(100cqw, ${Math.round(frame.width / frame.height * 10000) / 100}cqh)` }}
            >
              {previewBackground === 'photo' && !photo && (
                <label className="photo-empty"><Upload size={24} aria-hidden="true" /><span>Choose a photo</span><small>Stays in your browser · included in exports</small><input type="file" accept="image/*" onChange={choosePhoto} /></label>
              )}
              <div
                className="artwork draggable"
                tabIndex={0}
                role="application"
                aria-label={`Artwork position. Drag, or use the arrow keys (Shift for bigger steps).${shownPhoto ? ' Drag the photo behind the words to reposition it.' : ''}`}
                onPointerDown={startDrag}
                onPointerMove={drag}
                onPointerUp={endDrag}
                onPointerCancel={cancelDrag}
                // Only the artwork's own capture ending stops a drag: on touch, the SVG element under the
                // finger holds capture first and hands it over when the drag starts.
                onLostPointerCapture={(event) => { if (event.target === event.currentTarget) endDrag() }}
                onKeyDown={nudge}
              >
                <svg
                  role="img"
                  aria-label={`Generated tape artwork: ${shape.personality}`}
                  viewBox={`0 0 ${frame.width} ${frame.height}`}
                >
                  {shownPhoto && photoPlace && <image href={shownPhoto.url} x={photoPlace.x} y={photoPlace.y} width={photoPlace.width} height={photoPlace.height} preserveAspectRatio="none" />}
                  {shownPhoto && darken > 0 && <rect width={frame.width} height={frame.height} fill="#000" opacity={darken} />}
                  {isVideo && (
                    <g className="grid-guide">
                      <path d={`M0 ${GRID_CROP.top}H${frame.width}M0 ${GRID_CROP.bottom}H${frame.width}`} />
                      <text x={frame.width / 2} y={GRID_CROP.top - 18} textAnchor="middle">Cut off on the profile grid above this line</text>
                      <text x={frame.width / 2} y={GRID_CROP.bottom + 40} textAnchor="middle">Cut off on the profile grid below this line</text>
                    </g>
                  )}
                  <rect className="safe-guide" x={frame.safe.left} y={frame.safe.top} width={frame.safe.right - frame.safe.left} height={frame.safe.bottom - frame.safe.top} />
                  <LayerList layers={furniture} />
                  <g transform={`translate(${placement.x} ${placement.y})`}>
                    <LayerList layers={layers} />
                  </g>
                </svg>
              </div>
              <span className="stage-coordinate top-left">{frame.width} × {frame.height} · {shownPhoto ? 'drag the words or the photo' : 'drag or arrow keys to position'}</span>
              <span className="stage-coordinate bottom-right">{layout.fontSize}px · {layout.labels.length} lines · {shape.personality.toUpperCase()}</span>
            </div>
          </div>
        </section>

        <footer className="export-bar">
          <div className="export-status">
            <p className="eyebrow">{exportBlocked ? 'Export' : 'Ready for layout'}</p>
            {exportBlocked
              ? <p className="export-message" role="status">{exportBlocked}</p>
              : <strong>Export clean, editable artwork</strong>}
          </div>
          <div className="export-actions">
            <button disabled={exportDisabled} onClick={() => copy('svg')}>{copied === 'svg' ? <Check size={16} /> : <Clipboard size={16} />}{copied === 'svg' ? 'Copied' : 'Copy SVG'}</button>
            <button disabled={exportDisabled} onClick={() => downloadSvg(false)}><Download size={16} aria-hidden="true" /> Cutout SVG</button>
            <button disabled={exportDisabled || exporting} onClick={() => downloadPng(1)}><Download size={16} aria-hidden="true" /> PNG 1×</button>
            <button className="png-fallback" disabled={exportDisabled || exporting} onClick={() => downloadPng(2)}><Download size={16} aria-hidden="true" /> PNG 2×</button>
            <button disabled={exportDisabled || exporting} onClick={() => downloadPng(3)}><Download size={16} aria-hidden="true" /> PNG 3×</button>
            <button className="primary" disabled={exportDisabled} onClick={() => downloadSvg(true)}><Download size={16} aria-hidden="true" /> Full SVG</button>
          </div>
        </footer>
      </main>
    </div>
  )
}

export default App
