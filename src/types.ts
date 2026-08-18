export type ShapeMode = 'clean' | 'tape' | 'cling' | 'rough'
export type TextAlign = 'left' | 'center' | 'right'
export type EdgePreference = 'auto' | 'left' | 'right' | 'top' | 'bottom'
export type JoinStyle = 'step' | 'angled'
export type FontChoice = 'Barlow Condensed' | 'Barlow Semi Condensed' | 'Barlow'

export interface GeneratorSettings {
  headline: string
  uppercase: boolean
  font: FontChoice
  weight: number
  fontSize: number
  lineHeight: number
  maxWidth: number
  align: TextAlign
  autoWrap: boolean
  perLine: boolean
  rotationVariance: number
  lineGap: number
  horizontalPadding: number
  verticalPadding: number
  irregularity: number
  angleSize: number
  hugStrength: number
  joinStyle: JoinStyle
  preferredEdge: EdgePreference
  mode: ShapeMode
  shapeColor: string
  textColor: string
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

export interface ShapeResult {
  points: Point[]
  path: string
  strips?: ShapeStrip[]
  lines: TextLine[]
  viewBox: { x: number; y: number; width: number; height: number }
  personality: string
}
