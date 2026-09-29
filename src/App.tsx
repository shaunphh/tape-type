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
import { GRID_CROP, VIDEO_LOOKS, VIDEO_TYPES, frameFor, lookFor, tagFor, type CoverKind, type Look, type VideoType } from './formats'
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
import { LINE_HEIGHT, applyLocks, firstSinceHouseCut, isBarred, isLocked, lockedLineGap, unlocked, withHouseCut } from './locks'
import labelSample from './assets/samples/label-page.jpg'
import titleSample from './assets/samples/title-page.jpg'
import {
  BODY,
  INSIDE_MARKS,
  PAGE_KINDS,
  PAGE_KIND_NAMES,
  PAGE_MARGIN,
  PAGE_TYPE,
  TEXT_WIDTH as PAGE_TEXT_WIDTH,
  TITLE,
  drawInside,
  insideSvg,
  layoutInside,
  loadInside,
  saveInside,
  switchKind,
  type ImageHeight,
  type InsideOptions,
  type MeasureInk,
  type MeasureWidth,
  type PageKind,
  type PageType,
  type PicturePosition,
  type TextTone,
} from './inside'
import { TYPE_RANGE, TYPE_WEIGHTS, WEIGHT_NAMES, describePageType, isLocal, loadPageType, sameType, savePageType } from './pageType'
import { measureInk } from './metrics'
import { CENTRED, MAX_ZOOM, dragPhoto, photoRect, photoSlack, visiblePart, type PhotoView } from './photo'
import {
  POST_FRAME,
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

const eyebrowSuggestions: Record<CoverKind, string[]> = {
  post: ['Breaking', 'News', 'Exclusive', 'The Big Read'],
  video: ['Quick watch', 'Quick guide', 'Breaking', 'News'],
}
/** What is being made: the two pages of a post, or the cover of a video. */
type Making = 'cover' | 'inside' | 'video'
const makingOptions: { value: Making; label: string; note: string }[] = [
  { value: 'cover', label: 'Cover', note: 'Post · page 1' },
  { value: 'inside', label: 'Inside page', note: 'Post · page 2' },
  { value: 'video', label: 'Video cover', note: '9:16' },
]
const imageOptions: { value: ImageHeight; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'short', label: 'Short' },
  { value: 'medium', label: 'Medium' },
  { value: 'tall', label: 'Tall' },
  { value: 'fill', label: 'Fill' },
]

/** Where the inside page's picture goes, and what that means for the words. */
const pictureOptions: { value: PicturePosition; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'middle', label: 'Middle' },
  { value: 'bottom', label: 'Bottom' },
]
const PICTURE_NOTES: Record<PicturePosition, string> = { top: 'Above the words', middle: 'After the first words', bottom: 'Under the words' }
const toneOptions: { value: TextTone; label: string }[] = [
  { value: 'grey', label: 'Grey' },
  { value: 'light', label: 'White' },
]
/** The pictures an inside page starts with, so it reads as a page before a photo is chosen. They are never exported. */
const SAMPLE_PICTURES: Record<PageKind, string> = { title: titleSample, label: labelSample }
const cutOptions: { value: ShapeMode; label: string }[] = [
  { value: 'plain', label: 'Plain' },
  { value: 'torn', label: 'Torn' },
  { value: 'clean', label: 'Clean' },
  { value: 'tape', label: 'Tape' },
  { value: 'cling', label: 'Cling' },
  { value: 'rough', label: 'Rough' },
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
const weightOptions = TYPE_WEIGHTS.map((weight) => ({ value: String(weight), label: String(weight) }))

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

/** What a photo sits behind: a whole cover, or the banner of an inside page. */
type Size = { width: number; height: number }

const toJpeg = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('unreadable'))), 'image/jpeg', quality))

/**
 * Decodes an uploaded photo and re-encodes all of it as sRGB JPEG, so it can be moved and zoomed
 * behind the cover. It is kept at no more than the 3× export needs with the photo at its widest,
 * so the preview and every export draw from the same pixels.
 */
async function preparePhoto(file: File, frame: Size): Promise<Photo> {
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
async function cropPhoto(photo: Photo, view: PhotoView, frame: Size) {
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
function photoGround(photo: Photo, view: PhotoView, box: Box, darken: number, frame: Size) {
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
type PanelId = 'cover' | 'words' | 'type' | 'photo' | 'marks' | 'style' | 'tape' | 'layout' | 'tune'
/** Which control groups start open: the everyday decisions, with layout and fine-tuning folded away. */
const panelDefaults: Record<PanelId, boolean> = { cover: true, words: true, type: true, photo: true, marks: true, style: true, tape: true, layout: false, tune: false }

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

// Asked as the page loads, not as the app draws: drawing can happen more than once.
const FIRST_OPENING = firstSinceHouseCut()

function App() {
  const [cover, setCover] = useState<CoverOptions>(loadCover)
  const [settings, setSettings] = useState<GeneratorSettings>(() => applyLocks(withHouseCut(loadSettings(), lookFor(cover.kind, cover.video), FIRST_OPENING), lookFor(cover.kind, cover.video)))
  const [history, setHistory] = useState<number[]>([settings.seed])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [seedDraft, setSeedDraft] = useState<string | null>(null)
  const [copied, setCopied] = useState<'svg' | 'seed' | 'type' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [previewBackground, setPreviewBackground] = useState<PreviewBackground>('charcoal')
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [photoView, setPhotoView] = useState<PhotoView>(CENTRED)
  const [inside, setInside] = useState<InsideOptions>(loadInside)
  const [insidePhoto, setInsidePhoto] = useState<Photo | null>(null)
  const [insideView, setInsideView] = useState<PhotoView>(CENTRED)
  const [samplePhotos, setSamplePhotos] = useState<Partial<Record<PageKind, Photo>>>({})
  // Other sizes and weights can be tried where the tool runs on this machine; the published tool keeps its own.
  const local = useMemo(() => isLocal(), [])
  const [pageType, setPageType] = useState<PageType>(() => loadPageType())
  // While the tool is being worked on, its own values can change under an open page: a trial from before them is dropped.
  const typeBase = JSON.stringify(PAGE_TYPE)
  const typeBaseSeen = useRef(typeBase)
  useEffect(() => {
    if (typeBaseSeen.current === typeBase) return
    typeBaseSeen.current = typeBase
    setPageType(PAGE_TYPE)
  }, [typeBase])
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
  const isInside = cover.kind === 'post' && cover.page === 'inside'
  const fileStem = cover.kind === 'video' ? 'tape-type-video-cover' : isInside ? 'tape-type-instagram-page-2' : 'tape-type-instagram'
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
  // The eyebrow's colour is open on video covers; a post's keeps to its look for now.
  const eyebrowOpen = locksOff || cover.kind === 'video'
  const tag = useMemo(() => tagFor(eyebrowOpen && cover.eyebrowColour !== settings.tone ? cover.eyebrowColour : 'auto', look), [eyebrowOpen, cover.eyebrowColour, settings.tone, look])
  const layers = useMemo(
    () => buildLayers(shape, { tone: settings.tone, background: previewBackground, weight: layout.weight, tag }, layout.fontSize),
    [shape, settings.tone, previewBackground, layout.weight, layout.fontSize, tag],
  )
  const range = useMemo(() => placementRange(shape, frame), [shape, frame])
  const darken = cover.darken ? PHOTO_DARKEN : 0

  // The inside page has its own marks (a small logo, off to start with) and sets them on its own margin.
  // An inside page goes without the logo for now, so its words start at the top of the page.
  const marksLogo = isInside ? (locksOff ? inside.logo : 'off') : cover.logo
  const marksArrow = isInside ? inside.arrow : cover.arrow
  const markSizes = isInside ? INSIDE_MARKS : undefined
  const markBoxes = useMemo(() => furnitureBoxes({ logo: marksLogo, arrow: marksArrow }, frame, markSizes), [marksLogo, marksArrow, frame, markSizes])
  const obstacles = useMemo(() => furnitureObstacles({ logo: cover.logo, arrow: cover.arrow }, frame), [cover.logo, cover.arrow, frame])

  const measureWidth = useMemo<MeasureWidth>(() => {
    const context = document.createElement('canvas').getContext('2d')
    return (value, size, weight) => {
      if (!context) return value.length * size * 0.5
      context.font = fontShorthand(size, weight)
      return context.measureText(value).width
    }
  }, [])
  // The inside page's label is tape, cut around its ink as a cover's is.
  const measureLabel = useMemo<MeasureInk>(() => {
    const context = document.createElement('canvas').getContext('2d')
    return (value, size, weight) => {
      if (!context) return { width: value.length * size * 0.6, originOffset: 0, ascent: size * 0.7, descent: 0 }
      context.font = fontShorthand(size, weight)
      return measureInk(context, value, weight, size)
    }
  }, [])
  useEffect(() => {
    if (!isInside) return
    const words = `${inside.title} ${inside.body} ${inside.details}`
    const weights = new Set([pageType.title.weight, pageType.text.weight, pageType.details.weight, pageType.strong.weight])
    for (const weight of weights) document.fonts.load(fontShorthand(BODY.size, weight), words).catch(() => undefined)
    const label = normaliseEyebrow(inside.label)
    if (label) document.fonts.load(fontShorthand(pageType.label.size, pageType.label.weight), label).catch(() => undefined)
  }, [isInside, inside.label, inside.title, inside.body, inside.details, pageType])
  const page = useMemo(
    () => layoutInside(inside, measureWidth, { logoBottom: markBoxes.logo ? markBoxes.logo.y + markBoxes.logo.height : undefined, arrowTop: markBoxes.arrow?.y }, measureLabel, pageType),
    // Measured again whenever a font finishes loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inside, measureWidth, markBoxes, measureLabel, pageType, fonts.version],
  )
  const runs = useMemo(() => textRuns(isInside ? page.layers : layers), [isInside, page.layers, layers])

  // An inside page starts with a sample picture, so it reads as a page before a photo is chosen.
  useEffect(() => {
    if (!isInside || samplePhotos[inside.kind]) return
    let wanted = true
    const kind = inside.kind
    loadImage(SAMPLE_PICTURES[kind])
      .then((image) => { if (wanted) setSamplePhotos((current) => ({ ...current, [kind]: { url: SAMPLE_PICTURES[kind], image, width: image.naturalWidth, height: image.naturalHeight } })) })
      .catch(() => undefined)
    return () => { wanted = false }
  }, [isInside, inside.kind, samplePhotos])
  const ownPhoto = isInside ? insidePhoto ?? photo : photo
  // The photo in play: behind a cover, or in the inside page's banner (the cover's, until another is chosen).
  const shownPhoto = isInside ? (page.banner ? ownPhoto ?? samplePhotos[inside.kind] ?? null : null) : previewBackground === 'photo' ? photo : null
  const sampleShown = isInside && Boolean(shownPhoto) && !ownPhoto
  const view = isInside ? insideView : photoView
  const setView = isInside ? setInsideView : setPhotoView
  const photoFrame = isInside && page.banner ? page.banner : frame
  // How far down the page the inside page's picture starts.
  const bannerTop = isInside && page.banner ? page.banner.y : 0

  // For now the arrow takes the logo's colour whenever both are on the cover.
  const tied = !locksOff && marksLogo !== 'off' && marksArrow
  // Each mark is checked against what is behind it, so moving the photo can change its colour.
  const rulings = useMemo(() => {
    const flat = isInside ? BRAND.dark : BACKGROUND_FILLS[previewBackground]
    const middle = (box: Box) => box.y + box.height / 2 - bannerTop
    const onPhoto = (box: Box) => shownPhoto && (!isInside || (middle(box) >= 0 && middle(box) < photoFrame.height))
    const groundUnder = (box?: Box) => (!box ? [] : onPhoto(box) && shownPhoto ? photoGround(shownPhoto, view, { ...box, y: box.y - bannerTop }, darken, photoFrame) : flat ? [fillLuminance(flat)] : [])
    const logo = settleColour(cover.logoColour, groundUnder(markBoxes.logo))
    // Tied, the arrow is drawn in the logo's colour and only checked against its own ground.
    return { logo, arrow: settleColour(tied ? logo.colour : cover.arrowColour, groundUnder(markBoxes.arrow)) }
  }, [tied, isInside, cover.logoColour, cover.arrowColour, markBoxes, shownPhoto, view, darken, previewBackground, photoFrame, bannerTop])
  const furniture = useMemo(
    () => buildFurniture({ logo: marksLogo, arrow: marksArrow }, { logo: rulings.logo.colour, arrow: rulings.arrow.colour }, frame, markSizes),
    [marksLogo, marksArrow, rulings.logo.colour, rulings.arrow.colour, frame, markSizes],
  )
  // Rotation or a wide eyebrow can make the lettering bigger than the safe area even when every line fits its column.
  const lettersTooBig = range.x.excess > 4 || range.y.excess > 4
  const coverBlocked = layout.empty
    ? 'Type a headline to export.'
    : layout.overflow
      ? overflowMessage(layout, settings)
      : lettersTooBig ? `The lettering is bigger than ${cover.kind === 'video' ? 'what the profile grid shows' : 'the safe area'}. Try a narrower column, less rotation or a shorter eyebrow.` : null
  const pageBlocked = page.empty
    ? 'Type a title or some text to export.'
    : page.overflow === 'title'
      ? 'The title runs past four lines. Shorten it.'
      : page.overflow === 'body'
        ? `The text is ${page.over} ${page.over === 1 ? 'line' : 'lines'} too long for the page. Cut it${!page.banner ? '' : inside.image === 'fill' ? ', or set the picture to None' : ', or use a shorter picture'}.`
        : page.banner && !shownPhoto ? 'Choose a photo, or set the picture to None.'
          : sampleShown ? 'That is a sample picture. Choose a photo of your own, or set the picture to None.' : null
  const blockedReason = isInside ? pageBlocked : coverBlocked
  const exportDisabled = Boolean(blockedReason) || fonts.loading

  useEffect(() => { preloadEmbeddedFonts(runs) }, [runs])
  useEffect(() => { saveSettings(settings) }, [settings])
  useEffect(() => { saveCover(cover) }, [cover])
  useEffect(() => { saveInside(inside) }, [inside])
  useEffect(() => { if (local) savePageType(pageType) }, [local, pageType])
  useEffect(() => { savePanels(panels) }, [panels])
  // A replaced photo is let go; its address only has to last while it is on show.
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url) }, [photo])
  useEffect(() => () => { if (insidePhoto) URL.revokeObjectURL(insidePhoto.url) }, [insidePhoto])

  const update = useCallback(<K extends keyof GeneratorSettings>(key: K, value: GeneratorSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }, [])

  const togglePanel = useCallback((id: PanelId, open: boolean) => {
    setPanels((current) => (current[id] === open ? current : { ...current, [id]: open }))
  }, [])

  const updateCover = useCallback(<K extends keyof CoverOptions>(key: K, value: CoverOptions[K]) => {
    setCover((current) => ({ ...current, [key]: value }))
  }, [])

  const updateInside = useCallback(<K extends keyof InsideOptions>(key: K, value: InsideOptions[K]) => {
    setInside((current) => ({ ...current, [key]: value }))
  }, [])

  const updateType = useCallback(<G extends keyof PageType>(group: G, changes: Partial<PageType[G]>) => {
    setPageType((current) => ({ ...current, [group]: { ...current[group], ...changes } }))
  }, [])

  const copyType = async () => {
    try {
      await navigator.clipboard.writeText(describePageType(pageType))
      setCopied('type')
      setTimeout(() => setCopied(null), 1400)
    } catch {
      flash('The browser blocked copying.')
    }
  }

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
    // Each look has a tag colour of its own, so a chosen one doesn't carry over.
    setCover((current) => (current.eyebrowColour === 'auto' ? current : { ...current, eyebrowColour: 'auto' }))
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

  const making: Making = cover.kind === 'video' ? 'video' : isInside ? 'inside' : 'cover'
  const chooseMaking = (next: Making) => {
    if (next === making) return
    chooseKind(next === 'video' ? 'video' : 'post')
    if (next !== 'video') updateCover('page', next)
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

  const svgFor = (artboard: boolean, fontCss: string, crop: string | null) => (isInside
    ? insideSvg(page, { photo: crop, darken, furniture, fontCss })
    : svgMarkup(layers, shape, { artboard, background: previewBackground, photo: crop, darken, position, fontCss, furniture, obstacles, frame }))

  /** The photo as the cover shows it, for SVG exports. Made once per photo position, when first asked for. */
  const photoCrop = (): Promise<string | null> => {
    if (!shownPhoto) return Promise.resolve(null)
    const key = [shownPhoto.url, view.x, view.y, view.zoom, photoFrame.height].join('|')
    if (cropRef.current?.key !== key) {
      const crop = cropPhoto(shownPhoto, view, photoFrame)
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
    const snapshot = { layers: isInside ? page.layers : layers, page: isInside ? page : null, furniture, obstacles, frame, shape, position, background: previewBackground, photo: shownPhoto, view, darken, fileStem }
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
      if (snapshot.page) {
        drawInside(context, snapshot.page, { photo: snapshot.photo, view: snapshot.view, darken: snapshot.darken, furniture: snapshot.furniture })
      } else if (fill) {
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
      if (!snapshot.page) {
        drawLayers(context, snapshot.furniture)
        const placement = getPlacement(snapshot.shape, snapshot.position, snapshot.obstacles, snapshot.frame)
        context.translate(placement.x, placement.y)
        drawLayers(context, snapshot.layers)
      }
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
      if (isInside) {
        setInsidePhoto(await preparePhoto(file, POST_FRAME))
        setInsideView(CENTRED)
        return
      }
      setPhoto(await preparePhoto(file, frame))
      setPhotoView(CENTRED)
      setPreviewBackground('photo')
    } catch {
      flash('That file couldn’t be opened as an image. If it’s an iPhone HEIC photo, convert it to JPEG first.')
    }
  }

  const clickPhoto = (event: React.MouseEvent) => {
    // With a photo already loaded, the first click switches back to it; the next one replaces it.
    if (!isInside && photo && previewBackground !== 'photo') {
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
    // On the inside page only the picture moves, and only from inside its banner.
    const down = (event.clientY - stage.top) * scale - bannerTop
    const onBanner = down >= 0 && down < photoFrame.height
    if (isInside && !(shownPhoto && onBanner)) return
    dragRef.current = {
      pointerId: event.pointerId,
      target: isInside || (shownPhoto && !onWords) ? 'photo' : 'artwork',
      touch,
      active: !touch,
      startX: event.clientX,
      startY: event.clientY,
      from: position,
      fromView: view,
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
      if (shownPhoto) setView(dragPhoto(shownPhoto.width, shownPhoto.height, start.fromView, dx * start.scale, start.touch ? 0 : dy * start.scale, photoFrame))
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
      if (dragRef.current.target === 'photo') setView(dragRef.current.fromView)
      else setPosition(dragRef.current.from)
    }
    dragRef.current = null
  }

  const nudge = (event: React.KeyboardEvent) => {
    if (isInside) return
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
  const photoPlace = shownPhoto ? photoRect(shownPhoto.width, shownPhoto.height, view, photoFrame) : null
  const slack = shownPhoto ? photoSlack(shownPhoto.width, shownPhoto.height, view, photoFrame) : { x: 0, y: 0 }
  const isVideo = cover.kind === 'video'
  const photoMoved = view.x !== CENTRED.x || view.y !== CENTRED.y || view.zoom !== CENTRED.zoom
  const anyPhoto = ownPhoto
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
  const insideTitle = inside.title.replace(/\s+/g, ' ').trim()
  const insideLabel = normaliseEyebrow(inside.label)
  // A page opens with a title or a label. The other stays on show, switched off, unless it already has words in it.
  const labelOff = !locksOff && inside.kind === 'title' && !insideLabel
  const titleOff = !locksOff && inside.kind === 'label' && !insideTitle
  const summaries: Record<PanelId, string> = {
    cover: isInside ? PAGE_KINDS[inside.kind].label : look.label,
    words: isInside
      ? [insideLabel, insideTitle || 'No title yet'].filter(Boolean).join(' · ')
      : headlinePreview ? (eyebrowPreview ? `${eyebrowPreview} · ${headlinePreview}` : headlinePreview) : 'No headline yet',
    type: sameType(pageType, PAGE_TYPE)
      ? `The tool’s own · title ${pageType.title.largest}–${pageType.title.smallest}, text ${pageType.text.size}`
      : `Changed · title ${pageType.title.largest}–${pageType.title.smallest}, text ${pageType.text.size}`,
    photo: !anyPhoto
      ? 'No photo yet'
      : [shownPhoto ? (photoMoved ? `Zoom ${Math.round(view.zoom * 100)}%` : 'Centred') : isInside ? 'No picture' : 'Hidden', cover.darken ? 'Darkened' : 'As shot'].join(' · '),
    marks: [marksLogo === 'off' ? 'No logo' : `Logo ${marksLogo}, ${rulings.logo.colour}`, marksArrow ? `Arrow, ${rulings.arrow.colour}` : 'No arrow'].join(' · '),
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
          {isVideo && (
            <Panel id="cover" title="Kind of video" summary={summaries.cover} open={panels.cover} onToggle={togglePanel}>
              <div className="look-toggle" role="group" aria-label="Kind of video">
                {VIDEO_TYPES.map((video) => (
                  <button key={video} aria-pressed={cover.video === video} className={cover.video === video ? 'active' : ''} onClick={() => chooseVideo(video)}>
                    <strong>{VIDEO_LOOKS[video].label}</strong>
                    <small>{VIDEO_LOOKS[video].description}</small>
                  </button>
                ))}
              </div>
              <p className="panel-note">The profile grid shows only the middle of a video cover, so the words stay inside the lines. The logo and arrow sit in the corners, outside them.</p>
            </Panel>
          )}

          {isInside && (
            <Panel id="cover" title="Kind of page" summary={summaries.cover} open={panels.cover} onToggle={togglePanel}>
              <div className="look-toggle" role="group" aria-label="Kind of page">
                {PAGE_KIND_NAMES.map((kind) => (
                  <button key={kind} aria-pressed={inside.kind === kind} className={inside.kind === kind ? 'active' : ''} onClick={() => setInside((current) => switchKind(current, kind))}>
                    <strong>{PAGE_KINDS[kind].label}</strong>
                    <small>{PAGE_KINDS[kind].description}</small>
                  </button>
                ))}
              </div>
              <p className="panel-note">A page opens with a title or with a label, not both. Each kind keeps its own words, so switching between them loses nothing.</p>
            </Panel>
          )}

          {isInside && (
            <Panel id="words" title="Words" summary={summaries.words} open={panels.words} onToggle={togglePanel}>
              <div className="section-label-row">
                <span className="field-label">Label</span>
                <span className="field-hint">{labelOff ? 'A title page has no label' : 'Capitals on tape'}</span>
              </div>
              <input className="eyebrow-input" aria-label="Label" value={inside.label} maxLength={40} placeholder={labelOff ? '' : 'Meet the artists'} disabled={labelOff} title={labelOff ? 'Switch to a label page to use a label' : undefined} onChange={(event) => updateInside('label', event.target.value)} />
              {insideLabel && (
                <>
                  <Segmented label="Label cut" note="The label’s own" value={inside.cut} options={cutOptions} onChange={(cut) => updateInside('cut', cut)} />
                  <button className="panel-button" disabled={inside.cut === 'plain'} title={inside.cut === 'plain' ? 'Plain tape has no cut to vary' : undefined} onClick={() => updateInside('seed', nextSeed())}><Sparkles size={14} aria-hidden="true" /> Randomise cut</button>
                </>
              )}
              <div className="sub-block">
                <div className="section-label-row">
                  <span className="field-label">Title</span>
                  {titleOff && <span className="field-hint">A label page has no title</span>}
                </div>
                <textarea aria-label="Title" className="title-input" value={inside.title} rows={titleOff ? 1 : 3} disabled={titleOff} title={titleOff ? 'Switch to a title page to use a title' : undefined} onChange={(event) => updateInside('title', event.target.value)} />
                <div className="words-status">
                  <div className={`fit-line ${page.overflow === 'title' ? 'error' : ''}`}>
                    <strong>{page.titleLines ? `${page.titleSize}px` : 'No title'}</strong>
                    <span>{page.titleLines} / {TITLE.lines} lines</span>
                    <span>sized {pageType.title.smallest}–{pageType.title.largest}</span>
                  </div>
                </div>
              </div>
              <div className="sub-block">
                <span className="field-label">Text</span>
                <textarea aria-label="Text" className="body-input" value={inside.body} rows={7} onChange={(event) => updateInside('body', event.target.value)} />
                <Segmented label="Text colour" value={inside.bodyTone} options={toneOptions} onChange={(tone) => updateInside('bodyTone', tone)} />
              </div>
              <div className="sub-block">
                <div className="section-label-row">
                  <span className="field-label">Highlight</span>
                  <span className="field-hint">A closing line, or the date and place</span>
                </div>
                <textarea aria-label="Highlight" className="body-input details-input" value={inside.details} rows={3} placeholder={'22 September · 6.30pm\nThis Must Be The Place, Smithfield\nTickets via Eventbrite'} onChange={(event) => updateInside('details', event.target.value)} />
                <Segmented label="Highlight colour" value={inside.detailsTone} options={toneOptions} onChange={(tone) => updateInside('detailsTone', tone)} />
                <Segmented label="Highlight size" note={inside.large ? 'A size up' : 'The text’s size'} value={inside.large ? 'large' : 'text'} options={[{ value: 'text', label: `${pageType.details.size}px` }, { value: 'large', label: `${pageType.details.large}px` }]} onChange={(size) => updateInside('large', size === 'large')} />
                <div className="words-status">
                  <div className={`fit-line ${page.overflow === 'body' ? 'error' : ''}`}>
                    <strong>{pageType.text.size}px</strong>
                    <span>{page.bodyLines} / {page.bodyRoom} lines</span>
                    <span>text and highlight</span>
                  </div>
                </div>
                <p className="panel-note">Leave a blank line between paragraphs. Start a line with a dash for a bullet. Put words in *stars* to make them bold and white: a whole line, or a name inside one.</p>
              </div>
              {blockedReason && !page.empty && <p className="fit-message error" role="status">{blockedReason}</p>}
            </Panel>
          )}

          {isInside && local && (
            <Panel id="type" title="Type · this machine only" summary={summaries.type} open={panels.type} onToggle={togglePanel}>
              <p className="panel-note">For trying sizes and weights. The published tool doesn’t show this and keeps its own.</p>
              <div className="range-stack">
                <span className="field-label">Title</span>
                <RangeField label="Largest" value={pageType.title.largest} min={TYPE_RANGE.title.size.min} max={TYPE_RANGE.title.size.max} suffix="px" onChange={(largest) => updateType('title', { largest, smallest: Math.min(largest, pageType.title.smallest) })} />
                <RangeField label="Smallest" value={pageType.title.smallest} min={TYPE_RANGE.title.size.min} max={TYPE_RANGE.title.size.max} suffix="px" onChange={(smallest) => updateType('title', { smallest, largest: Math.max(smallest, pageType.title.largest) })} />
                <Segmented label="Weight" note={WEIGHT_NAMES[pageType.title.weight]} value={String(pageType.title.weight)} options={weightOptions} onChange={(weight) => updateType('title', { weight: Number(weight) })} />
                <RangeField label="Line height" value={pageType.title.lineHeight} min={TYPE_RANGE.title.lineHeight.min} max={TYPE_RANGE.title.lineHeight.max} step={0.01} format={(value) => value.toFixed(2)} onChange={(lineHeight) => updateType('title', { lineHeight })} />
              </div>
              <div className="sub-block range-stack">
                <span className="field-label">Text</span>
                <RangeField label="Size" value={pageType.text.size} min={TYPE_RANGE.text.size.min} max={TYPE_RANGE.text.size.max} suffix="px" onChange={(size) => updateType('text', { size })} />
                <Segmented label="Weight" note={WEIGHT_NAMES[pageType.text.weight]} value={String(pageType.text.weight)} options={weightOptions} onChange={(weight) => updateType('text', { weight: Number(weight) })} />
                <RangeField label="Line height" value={pageType.text.lineHeight} min={TYPE_RANGE.text.lineHeight.min} max={TYPE_RANGE.text.lineHeight.max} step={0.01} format={(value) => value.toFixed(2)} onChange={(lineHeight) => updateType('text', { lineHeight })} />
              </div>
              <div className="sub-block range-stack">
                <span className="field-label">Highlight</span>
                <RangeField label="Size" value={pageType.details.size} min={TYPE_RANGE.text.size.min} max={TYPE_RANGE.text.size.max} suffix="px" onChange={(size) => updateType('details', { size })} />
                <RangeField label="A size up" value={pageType.details.large} min={TYPE_RANGE.text.size.min} max={TYPE_RANGE.text.size.max} suffix="px" onChange={(large) => updateType('details', { large })} />
                <Segmented label="Weight" note={WEIGHT_NAMES[pageType.details.weight]} value={String(pageType.details.weight)} options={weightOptions} onChange={(weight) => updateType('details', { weight: Number(weight) })} />
              </div>
              <div className="sub-block range-stack">
                <span className="field-label">Words in stars</span>
                <Segmented label="Weight" note={WEIGHT_NAMES[pageType.strong.weight]} value={String(pageType.strong.weight)} options={weightOptions} onChange={(weight) => updateType('strong', { weight: Number(weight) })} />
              </div>
              <div className="sub-block range-stack">
                <span className="field-label">Label</span>
                <RangeField label="Size" value={pageType.label.size} min={TYPE_RANGE.label.size.min} max={TYPE_RANGE.label.size.max} suffix="px" onChange={(size) => updateType('label', { size })} />
                <Segmented label="Weight" note={WEIGHT_NAMES[pageType.label.weight]} value={String(pageType.label.weight)} options={weightOptions} onChange={(weight) => updateType('label', { weight: Number(weight) })} />
              </div>
              <div className="photo-actions">
                <button className="panel-button" onClick={copyType}>{copied === 'type' ? <Check size={14} aria-hidden="true" /> : <Clipboard size={14} aria-hidden="true" />} {copied === 'type' ? 'Copied' : 'Copy values'}</button>
                <button className="text-button underlined" disabled={sameType(pageType, PAGE_TYPE)} onClick={() => setPageType(PAGE_TYPE)}>Back to the tool’s</button>
              </div>
            </Panel>
          )}

          {!isInside && <Panel id="words" title="Words" summary={summaries.words} open={panels.words} onToggle={togglePanel}>
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
                  <Segmented
                    label="Eyebrow colour"
                    note={!eyebrowOpen ? 'The look’s own, for now' : cover.eyebrowColour === 'auto' || cover.eyebrowColour === settings.tone ? 'The look’s own' : undefined}
                    value={eyebrowOpen && cover.eyebrowColour !== settings.tone ? cover.eyebrowColour : 'auto'}
                    options={colourOptions}
                    locked={(colour) => (eyebrowOpen ? colour === settings.tone : colour !== 'auto')}
                    lockedNote={eyebrowOpen ? 'The tape is this colour: the tag would be lost on it' : LOCKED_NOTE}
                    onChange={(colour) => updateCover('eyebrowColour', colour)}
                  />
                </>
              )}
            </div>
          </Panel>}

          <Panel id="photo" title="Photo" summary={summaries.photo} open={panels.photo} onToggle={togglePanel}>
            {isInside && <Segmented label="Picture" note={!page.banner ? 'Words only' : inside.image === 'fill' ? `Fills the page · ${page.banner.height}px` : `${page.banner.height}px tall`} value={inside.image} options={imageOptions} onChange={(image) => updateInside('image', image)} />}
            {isInside && <Segmented label="Position" note={page.banner ? PICTURE_NOTES[inside.position] : undefined} value={inside.position} options={pictureOptions} disabled={!page.banner} onChange={(place) => updateInside('position', place)} />}
            <div className="photo-actions">
              <label className="panel-button upload-button" onClick={clickPhoto}>
                <input type="file" accept="image/*" onChange={choosePhoto} />
                {anyPhoto ? <ImageIcon size={14} aria-hidden="true" /> : <Upload size={14} aria-hidden="true" />}
                {isInside ? (insidePhoto ? 'Replace photo' : 'Choose photo') : !photo ? 'Choose photo' : shownPhoto ? 'Replace photo' : 'Show photo'}
              </label>
              {shownPhoto && <button className="text-button underlined" disabled={!photoMoved} onClick={() => setView(CENTRED)}>Reset position</button>}
            </div>
            {shownPhoto ? (
              <div className="range-stack">
                <RangeField label="Zoom" value={view.zoom} min={1} max={MAX_ZOOM} step={0.01} format={(value) => `${Math.round(value * 100)}%`} onChange={(zoom) => setView((current) => ({ ...current, zoom }))} />
                <RangeField label="Left – right" value={view.x} min={0} max={100} disabled={slack.x < 1} format={(value) => (slack.x < 1 ? 'Fits' : value === 50 ? 'Centre' : `${Math.round(value)}%`)} onChange={(x) => setView((current) => ({ ...current, x }))} />
                <RangeField label="Up – down" value={view.y} min={0} max={100} disabled={slack.y < 1} format={(value) => (slack.y < 1 ? 'Fits' : value === 50 ? 'Centre' : `${Math.round(value)}%`)} onChange={(y) => setView((current) => ({ ...current, y }))} />
              </div>
            ) : (
              <p className="panel-note">{isInside
                ? (page.banner ? 'Photos stay in your browser. Once one is in, drag it in its banner to reposition it.' : 'This page has no picture. Pick a height above to add one, or Fill to give it the room the words leave.')
                : photo ? 'The photo is hidden while another background is showing.' : 'Photos stay in your browser. Once one is in, drag it on the cover to reposition it.'}</p>
            )}
            {sampleShown && <p className="panel-note">This is a sample picture, to show the page. It is never exported: choose a photo of your own.</p>}
            {isInside && shownPhoto && !sampleShown && !insidePhoto && <p className="panel-note">This is the cover’s photo. Choose another to change it on this page only.</p>}
            <label className="toggle-row spread">
              <span>Darken photo <small>{Math.round(PHOTO_DARKEN * 100)}% black, so the words read</small></span>
              <input type="checkbox" checked={cover.darken} onChange={(event) => updateCover('darken', event.target.checked)} />
              <span className="switch" />
            </label>
          </Panel>

          <Panel id="marks" title="Logo & arrow" summary={summaries.marks} open={panels.marks} onToggle={togglePanel}>
            <Segmented label="Logo" note={isInside ? (locksOff ? 'Small, top corner' : 'Not on an inside page for now') : 'Top corner'} value={marksLogo} options={logoOptions} locked={(logo) => isInside && !locksOff && logo !== 'off'} onChange={(logo) => (isInside ? updateInside('logo', logo) : updateCover('logo', logo))} />
            <Segmented
              label="Logo colour"
              note={marksLogo !== 'off' ? colourNote(rulings.logo, cover.logoColour) : undefined}
              value={cover.logoColour}
              options={colourOptions}
              disabled={marksLogo === 'off'}
              onChange={(colour) => updateCover('logoColour', colour)}
            />
            <label className="toggle-row spread">
              <span>Swipe arrow <small>Bottom right corner</small></span>
              <input type="checkbox" checked={marksArrow} onChange={(event) => (isInside ? updateInside('arrow', event.target.checked) : updateCover('arrow', event.target.checked))} />
              <span className="switch" />
            </label>
            <Segmented
              label="Arrow colour"
              note={!marksArrow ? undefined : tied ? (rulings.arrow.reads ? 'Same as the logo' : 'Same as the logo · hard to read here') : colourNote(rulings.arrow, cover.arrowColour)}
              value={tied ? cover.logoColour : cover.arrowColour}
              options={colourOptions}
              disabled={!marksArrow}
              locked={() => tied}
              lockedNote={TIED_NOTE}
              onChange={(colour) => updateCover('arrowColour', colour)}
            />
          </Panel>

          {!isInside && <>
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
              <RangeField label="Tape cling" value={settings.hugStrength} min={0.82} max={1.16} step={0.01} disabled={noTape || !locksOff} title={locksOff ? undefined : LOCKED_NOTE} format={(value) => `${Math.round(value * 100)}%`} onChange={(value) => update('hugStrength', value)} />
              {locksOff
                ? <RangeField label="Line gap" value={settings.lineGap} min={-8} max={20} suffix="px" onChange={(value) => update('lineGap', value)} />
                : <RangeField label="Line gap" value={Math.max(-8, Math.min(20, layoutSettings.lineGap))} min={-8} max={20} disabled title={`${LOCKED_NOTE}: lines are set ${LINE_HEIGHT} of the type size apart`} format={() => `Line height ${LINE_HEIGHT}`} onChange={() => undefined} />}
              <RangeField label="Rotation variance" value={settings.rotationVariance} min={0} max={2} step={0.1} disabled={!settings.perLine} format={(value) => `${value.toFixed(1)}°`} onChange={(value) => update('rotationVariance', value)} />
            </div>
          </Panel>
          </>}

          <p className="automatic-note panel-footer"><Sparkles size={13} aria-hidden="true" /> {isInside ? 'Sizes, margins and line heights are set by the page' : 'Size, fit and cut depth stay inside the brand system'}</p>
          {!locksOff && !isInside && <p className="automatic-note panel-footer locked-note"><Lock size={12} aria-hidden="true" /> Greyed-out choices are switched off for now</p>}
        </aside>

        <section className="stage-column">
          <div className="making-switcher" role="group" aria-label="What is being made">
            {makingOptions.map((option) => (
              <button key={option.value} aria-pressed={making === option.value} className={making === option.value ? 'active' : ''} onClick={() => chooseMaking(option.value)}>
                <strong>{option.label}</strong>
                <small>{option.note}</small>
              </button>
            ))}
          </div>
          {/* An inside page has no use for these, but keeps their room, so it is shown as large as a cover. */}
          <div className={isInside ? 'preview-toolbar spacer' : 'preview-toolbar'} aria-hidden={isInside || undefined}>
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
              className={`preview-stage ${isInside ? 'charcoal' : previewBackground}`}
              style={{ aspectRatio: `${frame.width} / ${frame.height}`, width: `min(100cqw, ${Math.round(frame.width / frame.height * 10000) / 100}cqh)` }}
            >
              {!isInside && previewBackground === 'photo' && !photo && (
                <label className="photo-empty"><Upload size={24} aria-hidden="true" /><span>Choose a photo</span><small>Stays in your browser · included in exports</small><input type="file" accept="image/*" onChange={choosePhoto} /></label>
              )}
              {sampleShown && page.banner && (
                <label className="sample-badge" style={{ top: `${page.banner.y / frame.height * 100}%` }} title="This picture is a sample, and is never exported">
                  <Upload size={13} aria-hidden="true" /> Sample picture · choose your own
                  <input type="file" accept="image/*" onChange={choosePhoto} />
                </label>
              )}
              {isInside && page.banner && !shownPhoto && (
                <label className="photo-empty banner" style={{ top: `${page.banner.y / frame.height * 100}%`, height: `${page.banner.height / frame.height * 100}%` }}><Upload size={24} aria-hidden="true" /><span>Choose a photo</span><small>Stays in your browser · included in exports</small><input type="file" accept="image/*" onChange={choosePhoto} /></label>
              )}
              <div
                className="artwork draggable"
                tabIndex={0}
                role="application"
                aria-label={isInside
                  ? `Inside page.${shownPhoto ? ' Drag the picture in its banner to reposition it.' : ''}`
                  : `Artwork position. Drag, or use the arrow keys (Shift for bigger steps).${shownPhoto ? ' Drag the photo behind the words to reposition it.' : ''}`}
                onPointerDown={startDrag}
                onPointerMove={drag}
                onPointerUp={endDrag}
                onPointerCancel={cancelDrag}
                // Only the artwork's own capture ending stops a drag: on touch, the SVG element under the
                // finger holds capture first and hands it over when the drag starts.
                onLostPointerCapture={(event) => { if (event.target === event.currentTarget) endDrag() }}
                onKeyDown={nudge}
              >
                {isInside && (
                  <svg role="img" aria-label={`Inside page: ${insideTitle || 'no title yet'}`} viewBox={`0 0 ${frame.width} ${frame.height}`}>
                    <defs><clipPath id="banner"><rect y={bannerTop} width={photoFrame.width} height={photoFrame.height} /></clipPath></defs>
                    {shownPhoto && photoPlace && (
                      <g clipPath="url(#banner)">
                        <image href={shownPhoto.url} x={photoPlace.x} y={bannerTop + photoPlace.y} width={photoPlace.width} height={photoPlace.height} preserveAspectRatio="none" />
                        {darken > 0 && <rect y={bannerTop} width={photoFrame.width} height={photoFrame.height} fill="#000" opacity={darken} />}
                      </g>
                    )}
                    <rect className="safe-guide" x={PAGE_MARGIN} y={PAGE_MARGIN} width={PAGE_TEXT_WIDTH} height={frame.height - PAGE_MARGIN * 2} />
                    <LayerList layers={furniture} />
                    <LayerList layers={page.layers} />
                  </svg>
                )}
                {!isInside && <svg
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
                </svg>}
              </div>
              {!isInside && <span className="stage-coordinate top-left">{frame.width} × {frame.height} · {shownPhoto ? 'drag the words or the photo' : 'drag or arrow keys to position'}</span>}
              {!isInside && <span className="stage-coordinate bottom-right">{layout.fontSize}px · {layout.labels.length} lines · {shape.personality.toUpperCase()}</span>}
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
            <button disabled={exportDisabled || isInside} title={isInside ? 'A cutout is the tape and words of a cover: an inside page has none' : undefined} onClick={() => downloadSvg(false)}><Download size={16} aria-hidden="true" /> Cutout SVG</button>
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
