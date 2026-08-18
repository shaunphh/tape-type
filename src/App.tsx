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
import { buildShape, nextSeed, wrapText } from './geometry'
import type {
  FontChoice,
  GeneratorSettings,
  ShapeMode,
  ShapeResult,
  TextAlign,
} from './types'

const STORAGE_KEY = 'tape-type-settings-v4'

const samples = [
  'Dublin Gets a New Night Market',
  'A Massive Night Market Is Coming to Smithfield This Weekend',
  'How to Make the Most of a Weekend Visit to Dublin',
  'One of Dublin’s Best-Known Independent Cinemas Has Announced It’s Closing',
]

const modes: { value: ShapeMode; label: string; description: string }[] = [
  { value: 'clean', label: 'Clean cut', description: 'Quiet and precise' },
  { value: 'tape', label: 'Tape', description: 'Pointed extensions' },
  { value: 'cling', label: 'Cling', description: 'Hugs every line' },
  { value: 'rough', label: 'Rough cut', description: 'Sharper transitions' },
]

const colorPresets = [
  { name: 'Paper', shape: '#f2efe6', text: '#202020' },
  { name: 'Signal', shape: '#FFF418', text: '#202020' },
  { name: 'Reverse', shape: '#202020', text: '#ffffff' },
  { name: 'Grey', shape: '#D8D8D8', text: '#202020' },
]

const defaults: GeneratorSettings = {
  headline: 'How to Make the Most of a Weekend Visit to Dublin',
  uppercase: false,
  font: 'Barlow Condensed',
  weight: 800,
  fontSize: 76,
  lineHeight: 0.88,
  maxWidth: 570,
  align: 'left',
  autoWrap: true,
  perLine: true,
  rotationVariance: 0,
  lineGap: 2,
  horizontalPadding: 10,
  verticalPadding: 6,
  irregularity: 46,
  angleSize: 26,
  hugStrength: 1,
  joinStyle: 'angled',
  preferredEdge: 'auto',
  mode: 'cling',
  shapeColor: '#FFF418',
  textColor: '#202020',
  seed: 18473562,
  seedLocked: false,
}

function loadSettings(): GeneratorSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? { ...defaults, ...JSON.parse(stored) } : defaults
  } catch {
    return defaults
  }
}

function useTextLayout(settings: GeneratorSettings) {
  const [fontReady, setFontReady] = useState(0)
  useEffect(() => {
    document.fonts.ready.then(() => setFontReady(1))
  }, [])

  return useMemo(() => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return { labels: [' '], widths: [1] }
    context.font = `${settings.weight} ${settings.fontSize}px "${settings.font}"`
    const measure = (value: string) => context.measureText(value).width
    const headline = settings.uppercase ? settings.headline.toLocaleUpperCase() : settings.headline
    const labels = wrapText(headline, settings.maxWidth, measure, settings.autoWrap)
    return { labels, widths: labels.map(measure) }
  }, [settings.headline, settings.uppercase, settings.maxWidth, settings.autoWrap, settings.font, settings.weight, settings.fontSize, fontReady])
}

function svgMarkup(settings: GeneratorSettings, shape: ShapeResult, shapeOnly = false) {
  const { viewBox } = shape
  const textElement = (line: ShapeResult['lines'][number]) => {
      const content = line.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      return `<text x="${line.x}" y="${line.baseline}" font-family="${settings.font}, sans-serif" font-size="${settings.fontSize}" font-weight="${settings.weight}" fill="${settings.textColor}">${content}</text>`
  }
  let content: string
  if (shape.strips?.length) {
    const backgrounds = shape.strips.map((strip) => `<g transform="rotate(${strip.angle} ${strip.centerX} ${strip.centerY})"><path d="${strip.path}" fill="${settings.shapeColor}"/></g>`).join('')
    const text = shapeOnly ? '' : shape.strips.map((strip) => `<g transform="rotate(${strip.angle} ${strip.centerX} ${strip.centerY})">${textElement(strip.line)}</g>`).join('')
    content = backgrounds + text
  } else {
    const text = shapeOnly ? '' : shape.lines.map(textElement).join('')
    content = `<path d="${shape.path}" fill="${settings.shapeColor}"/>${text}`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}" width="${viewBox.width}" height="${viewBox.height}">${content}</svg>`
}

function downloadBlob(content: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 500)
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

function App() {
  const [settings, setSettings] = useState<GeneratorSettings>(loadSettings)
  const [history, setHistory] = useState<number[]>([settings.seed])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [copied, setCopied] = useState<'svg' | 'seed' | null>(null)
  const [previewBackground, setPreviewBackground] = useState<'charcoal' | 'yellow' | 'photo'>('charcoal')
  const [photo, setPhoto] = useState<string | null>(null)
  const [position, setPosition] = useState({ x: 50, y: 50 })
  const [sampleOpen, setSampleOpen] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null)
  const layout = useTextLayout(settings)
  const shape = useMemo(() => buildShape(settings, layout.labels, layout.widths), [settings, layout])

  const update = useCallback(<K extends keyof GeneratorSettings>(key: K, value: GeneratorSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
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

  const copy = async (kind: 'svg' | 'seed') => {
    const value = kind === 'svg' ? svgMarkup(settings, shape) : String(settings.seed)
    await navigator.clipboard.writeText(value)
    setCopied(kind)
    setTimeout(() => setCopied(null), 1400)
  }

  const downloadSvg = (shapeOnly = false) => {
    downloadBlob(svgMarkup(settings, shape, shapeOnly), 'image/svg+xml', shapeOnly ? 'tape-shape.svg' : 'tape-headline.svg')
  }

  const downloadPng = () => {
    const targetSize = 2400
    const scale = Math.min(4, targetSize / Math.max(shape.viewBox.width, shape.viewBox.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(shape.viewBox.width * scale)
    canvas.height = Math.ceil(shape.viewBox.height * scale)
    const context = canvas.getContext('2d')
    if (!context) return
    context.scale(scale, scale)
    context.translate(-shape.viewBox.x, -shape.viewBox.y)
    context.font = `${settings.weight} ${settings.fontSize}px "${settings.font}"`
    context.textBaseline = 'alphabetic'
    if (shape.strips?.length) {
      context.fillStyle = settings.shapeColor
      shape.strips.forEach((strip) => {
        context.save()
        context.translate(strip.centerX, strip.centerY)
        context.rotate(strip.angle * Math.PI / 180)
        context.translate(-strip.centerX, -strip.centerY)
        context.fill(new Path2D(strip.path))
        context.restore()
      })
      context.fillStyle = settings.textColor
      shape.strips.forEach((strip) => {
        context.save()
        context.translate(strip.centerX, strip.centerY)
        context.rotate(strip.angle * Math.PI / 180)
        context.translate(-strip.centerX, -strip.centerY)
        context.fillText(strip.line.text, strip.line.x, strip.line.baseline)
        context.restore()
      })
    } else {
      context.fillStyle = settings.shapeColor
      context.fill(new Path2D(shape.path))
      context.fillStyle = settings.textColor
      shape.lines.forEach((line) => context.fillText(line.text, line.x, line.baseline))
    }
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, 'image/png', 'tape-headline.png')
    }, 'image/png')
  }

  const choosePhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setPhoto(String(reader.result))
      setPreviewBackground('photo')
    }
    reader.readAsDataURL(file)
  }

  const startDrag = (event: React.PointerEvent) => {
    if (previewBackground !== 'photo') return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, ...position }
  }

  const drag = (event: React.PointerEvent) => {
    const start = dragRef.current
    const preview = previewRef.current
    if (!start || !preview) return
    const bounds = preview.getBoundingClientRect()
    setPosition({
      x: Math.max(10, Math.min(90, start.x + (event.clientX - start.pointerX) / bounds.width * 100)),
      y: Math.max(10, Math.min(90, start.y + (event.clientY - start.pointerY) / bounds.height * 100)),
    })
  }

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
              <label className="toggle-row">
                <span>All caps</span>
                <input type="checkbox" checked={settings.uppercase} onChange={(event) => update('uppercase', event.target.checked)} />
                <span className="switch" />
              </label>
              <label className="toggle-row">
                <span>Auto wrap</span>
                <input type="checkbox" checked={settings.autoWrap} onChange={(event) => update('autoWrap', event.target.checked)} />
                <span className="switch" />
              </label>
            </div>
          </section>

          <section className="control-section composition-section">
            <h2>Composition</h2>
            <div className="piece-toggle" aria-label="Tape piece mode">
              <button className={!settings.perLine ? 'active' : ''} onClick={() => update('perLine', false)}>Connected</button>
              <button className={settings.perLine ? 'active' : ''} onClick={() => update('perLine', true)}>Separate strips</button>
            </div>
            <div className="range-stack composition-ranges">
              <RangeField label="Tape cling" value={settings.hugStrength} min={0.72} max={1} step={0.01} format={(value) => `${Math.round(value * 100)}%`} onChange={(value) => update('hugStrength', value)} />
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

          <section className="control-section compact-grid typography-grid">
            <h2>Type</h2>
            <SelectField label="Typeface" value={settings.font} onChange={(value) => update('font', value as FontChoice)}>
              <option>Barlow Condensed</option><option>Barlow Semi Condensed</option><option>Barlow</option>
            </SelectField>
            <SelectField label="Alignment" value={settings.align} onChange={(value) => update('align', value as TextAlign)}>
              <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
            </SelectField>
            <div className="weight-control">
              <RangeField label="Weight" value={settings.weight} min={400} max={800} step={100} onChange={(value) => update('weight', value)} />
            </div>
            <div className="width-control">
              <RangeField label="Headline width" value={settings.maxWidth} min={260} max={900} suffix="px" onChange={(value) => update('maxWidth', value)} />
            </div>
            <p className="automatic-note"><Sparkles size={13} /> Cut depth and edge logic are handled automatically</p>
          </section>

          <section className="control-section">
            <h2>Colour</h2>
            <div className="color-layout">
              <div className="color-row">
                {colorPresets.map((preset) => (
                  <button
                    key={preset.name}
                    aria-label={preset.name}
                    title={preset.name}
                    className={settings.shapeColor === preset.shape && settings.textColor === preset.text ? 'active' : ''}
                    style={{ background: preset.shape }}
                    onClick={() => setSettings((current) => ({ ...current, shapeColor: preset.shape, textColor: preset.text }))}
                  >{settings.shapeColor === preset.shape && settings.textColor === preset.text && <Check size={14} color={preset.text} />}</button>
                ))}
                <label className="custom-color" title="Custom tape colour">
                  <input type="color" value={settings.shapeColor} onChange={(event) => update('shapeColor', event.target.value)} />
                  <span>+</span>
                </label>
              </div>
              <label className="text-color-picker" title="Custom text colour">
                <span>Text</span>
                <i style={{ background: settings.textColor }}><input type="color" value={settings.textColor} onChange={(event) => update('textColor', event.target.value)} /></i>
              </label>
            </div>
          </section>

        </aside>

        <section className="preview-column">
          <div className="preview-toolbar">
            <div className="background-switcher" aria-label="Preview background">
              <button className={previewBackground === 'charcoal' ? 'active' : ''} onClick={() => setPreviewBackground('charcoal')}>Dark</button>
              <button className={previewBackground === 'yellow' ? 'active' : ''} onClick={() => setPreviewBackground('yellow')}>Yellow</button>
              <label className={previewBackground === 'photo' ? 'active upload-button' : 'upload-button'}>
                <input type="file" accept="image/*" onChange={choosePhoto} />
                {photo ? <ImageIcon size={14} /> : <Upload size={14} />} Photo
              </label>
            </div>
            <p>{previewBackground === 'photo' ? 'Drag the artwork to position it' : 'Live vector preview'}</p>
          </div>

          <div
            ref={previewRef}
            className={`preview-stage ${previewBackground}`}
            style={photo && previewBackground === 'photo' ? { backgroundImage: `linear-gradient(rgba(0,0,0,.12),rgba(0,0,0,.12)), url(${photo})` } : undefined}
          >
            {previewBackground === 'photo' && !photo && (
              <label className="photo-empty"><Upload size={24} /><span>Choose a photo</span><small>Preview only—nothing leaves your browser</small><input type="file" accept="image/*" onChange={choosePhoto} /></label>
            )}
            <div
              className={`artwork ${previewBackground === 'photo' ? 'draggable' : ''}`}
              style={previewBackground === 'photo' ? { left: `${position.x}%`, top: `${position.y}%` } : undefined}
              onPointerDown={startDrag}
              onPointerMove={drag}
              onPointerUp={() => { dragRef.current = null }}
            >
              <svg
                role="img"
                aria-label={`Generated tape background: ${shape.personality}`}
                viewBox={`${shape.viewBox.x} ${shape.viewBox.y} ${shape.viewBox.width} ${shape.viewBox.height}`}
              >
                {shape.strips?.length ? (
                  <>
                    {shape.strips.map((strip, index) => (
                      <g key={`strip-bg-${index}`} transform={`rotate(${strip.angle} ${strip.centerX} ${strip.centerY})`}>
                        <path d={strip.path} fill={settings.shapeColor} />
                      </g>
                    ))}
                    {shape.strips.map((strip, index) => (
                      <g key={`strip-text-${index}`} transform={`rotate(${strip.angle} ${strip.centerX} ${strip.centerY})`}>
                        <text
                          x={strip.line.x}
                          y={strip.line.baseline}
                          fill={settings.textColor}
                          fontFamily={settings.font}
                          fontWeight={settings.weight}
                          fontSize={settings.fontSize}
                        >{strip.line.text}</text>
                      </g>
                    ))}
                  </>
                ) : (
                  <>
                    <path d={shape.path} fill={settings.shapeColor} />
                    {shape.lines.map((line, index) => (
                      <text
                        key={`${line.text}-${index}`}
                        x={line.x}
                        y={line.baseline}
                        fill={settings.textColor}
                        fontFamily={settings.font}
                        fontWeight={settings.weight}
                        fontSize={settings.fontSize}
                      >{line.text}</text>
                    ))}
                  </>
                )}
              </svg>
            </div>
            <span className="stage-coordinate top-left">A / 01</span>
            <span className="stage-coordinate bottom-right">{shape.personality.toUpperCase()}</span>
          </div>

          <div className="variation-bar">
            <div className="variation-controls">
              <button className="icon-button" aria-label="Previous variation" disabled={historyIndex === 0} onClick={previous}><ArrowLeft size={18} /></button>
              <button className="randomise-button" onClick={randomise}><Sparkles size={17} /> Randomise cut</button>
              <button className="icon-button" aria-label="Next variation" onClick={next}><ArrowRight size={18} /></button>
            </div>
            <div className="seed-control">
              <button aria-label={settings.seedLocked ? 'Unlock seed' : 'Lock seed'} onClick={() => update('seedLocked', !settings.seedLocked)}>{settings.seedLocked ? <Lock size={14} /> : <Unlock size={14} />}</button>
              <span>Seed</span>
              <input
                value={settings.seed}
                inputMode="numeric"
                onChange={(event) => update('seed', Number(event.target.value.replace(/\D/g, '')) || 1)}
              />
              <button aria-label="Copy seed" onClick={() => copy('seed')}>{copied === 'seed' ? <Check size={14} /> : <Copy size={14} />}</button>
            </div>
          </div>

          <div className="export-bar">
            <div>
              <p className="eyebrow">Ready for layout</p>
              <strong>Export clean, editable artwork</strong>
            </div>
            <div className="export-actions">
              <button onClick={() => copy('svg')}>{copied === 'svg' ? <Check size={16} /> : <Clipboard size={16} />}{copied === 'svg' ? 'Copied' : 'Copy SVG'}</button>
              <button onClick={() => downloadSvg(true)}><Download size={16} /> Shape only</button>
              <button onClick={downloadPng}><Download size={16} /> PNG</button>
              <button className="primary" onClick={() => downloadSvg(false)}><Download size={16} /> Download SVG</button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
