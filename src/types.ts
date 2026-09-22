export type ShapeMode = 'clean' | 'tape' | 'cling' | 'rough' | 'torn'
export type TextAlign = 'left' | 'center' | 'right'
export type CoverFormat = 'regular' | 'series'
export type CoverStyle = 'headline' | 'feature'
export type TapeTone = 'light' | 'dark' | 'yellow' | 'none'
export type ColumnWidth = 'narrow' | 'medium' | 'wide'
export type EdgePreference = 'auto' | 'left' | 'right' | 'top' | 'bottom'

export interface GeneratorSettings {
  headline: string
  style: CoverStyle
  titleCase: boolean
  tone: TapeTone
  eyebrowEnabled: boolean
  eyebrow: string
  coverFormat: CoverFormat
  column: ColumnWidth
  autoSize: boolean
  fontSize: number
  align: TextAlign
  autoWrap: boolean
  perLine: boolean
  rotationVariance: number
  lineGap: number
  hugStrength: number
  preferredEdge: EdgePreference
  mode: ShapeMode
  seed: number
  seedLocked: boolean
}

export interface Point {
  x: number
  y: number
}

export interface TextLine {
  text: string
  width: number
  x: number
  inkX?: number
  baseline: number
}

export interface ShapeStrip {
  path: string
  points: Point[]
  line: TextLine
  angle: number
  centerX: number
  centerY: number
}

/** Ink measurements for the optional eyebrow label, taken from canvas measureText. */
export interface EyebrowMetrics {
  text: string
  fontSize: number
  width: number
  originOffset: number
  capHeight: number
  descent: number
}

export interface EyebrowShape {
  path: string
  points: Point[]
  text: string
  x: number
  baseline: number
  fontSize: number
  angle: number
  centerX: number
  centerY: number
  box: { x: number; y: number; width: number; height: number }
}

export interface ShapeResult {
  points: Point[]
  path: string
  strips?: ShapeStrip[]
  lines: TextLine[]
  eyebrow?: EyebrowShape
  viewBox: { x: number; y: number; width: number; height: number }
  personality: string
}
