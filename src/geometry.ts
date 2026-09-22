import type {
  EdgePreference,
  EyebrowMetrics,
  EyebrowShape,
  GeneratorSettings,
  Point,
  ShapeResult,
  ShapeStrip,
  TextLine,
} from './types'

const round = (value: number) => Math.round(value * 100) / 100
const pointsToPath = (points: Point[]) => `${points.map((point, index) => `${index ? 'L' : 'M'} ${round(point.x)} ${round(point.y)}`).join(' ')} Z`

export function mulberry32(seed: number) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let result = value
    result = Math.imul(result ^ (result >>> 15), result | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

export function nextSeed() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0] || 1
  }
  return Math.floor(Math.random() * 4294967295) || 1
}

export function coverSizeFromCharacters(text: string) {
  const characterCount = text.replace(/\s+/g, ' ').trim().length
  if (characterCount <= 30) return 90
  if (characterCount >= 60) return 72
  return Math.round(90 - ((characterCount - 30) / 30) * 18)
}

function greedyLines(words: string[], maxWidth: number, measure: (text: string) => number) {
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (current && measure(candidate) > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

/**
 * Splits words into exactly `count` lines no wider than maxWidth, choosing the breaks
 * that make line widths as even as possible (least sum of squared widths).
 */
function evenLines(words: string[], count: number, maxWidth: number, measure: (text: string) => number) {
  const widthCache = new Map<string, number>()
  const width = (from: number, to: number) => {
    const key = `${from}:${to}`
    if (!widthCache.has(key)) widthCache.set(key, measure(words.slice(from, to).join(' ')))
    return widthCache.get(key)!
  }
  // cost[k][j]: best cost for the first j words set in k lines; split[k][j]: where line k starts.
  const cost = Array.from({ length: count + 1 }, () => new Array<number>(words.length + 1).fill(Infinity))
  const split = Array.from({ length: count + 1 }, () => new Array<number>(words.length + 1).fill(0))
  cost[0][0] = 0
  for (let k = 1; k <= count; k += 1) {
    for (let j = k; j <= words.length; j += 1) {
      for (let i = k - 1; i < j; i += 1) {
        if (cost[k - 1][i] === Infinity) continue
        const lineWidth = width(i, j)
        if (lineWidth > maxWidth && j - i > 1) continue
        const total = cost[k - 1][i] + lineWidth * lineWidth
        if (total < cost[k][j]) {
          cost[k][j] = total
          split[k][j] = i
        }
      }
    }
  }
  if (cost[count][words.length] === Infinity) return null
  const lines: string[] = []
  for (let k = count, j = words.length; k > 0; k -= 1) {
    const i = split[k][j]
    lines.unshift(words.slice(i, j).join(' '))
    j = i
  }
  return lines
}

/**
 * Wraps each paragraph to maxWidth. With `balance`, keeps the fewest lines that fit
 * but spreads the words so lines come out evenly weighted, instead of leaving one
 * word stranded on a line.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
  autoWrap: boolean,
  balance = false,
) {
  const paragraphs = text.replace(/\r/g, '').split('\n')
  if (!autoWrap) return paragraphs.map((line) => line || ' ')

  const lines: string[] = []
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push(' ')
      continue
    }
    const words = paragraph.trim().split(/\s+/)
    const greedy = greedyLines(words, maxWidth, measure)
    if (!balance || greedy.length < 2) {
      lines.push(...greedy)
      continue
    }
    lines.push(...(evenLines(words, greedy.length, maxWidth, measure) ?? greedy))
  }
  return lines.length ? lines : [' ']
}

interface Edge {
  index: number
  a: Point
  b: Point
  length: number
  side: Exclude<EdgePreference, 'auto'>
}

type MutationKind = 'tab' | 'bite' | 'torn' | 'clip' | 'step' | 'notch' | 'slant'
type JoinTreatment = 'square' | 'angled' | 'stepped' | 'tucked'
type LineTreatment = 'extend' | 'tuck' | 'offset'

interface Personality {
  primary: MutationKind
  secondary: 'bite' | 'clip' | 'notch' | null
  edge: Exclude<EdgePreference, 'auto'>
  targetLine: number
  focalJoin: number
  joinTreatment: JoinTreatment
  lineTreatment: LineTreatment
}

function sideForEdge(a: Point, b: Point): Edge['side'] | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'top' : 'bottom'
  if (Math.abs(dy) > 0) return dy > 0 ? 'right' : 'left'
  return null
}

function eligibleEdges(points: Point[], preferred: EdgePreference, minLength: number) {
  const edges: Edge[] = []
  points.forEach((a, index) => {
    const b = points[(index + 1) % points.length]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const side = sideForEdge(a, b)
    if (side && length >= minLength && (preferred === 'auto' || preferred === side)) {
      edges.push({ index, a, b, length, side })
    }
  })
  return edges
}

function pointAlong(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function mutateEdge(
  points: Point[],
  edge: Edge,
  kind: Exclude<MutationKind, 'clip' | 'slant'>,
  depth: number,
  random: () => number,
  centerBias?: number,
) {
  const { a, b, length, index } = edge
  const tx = (b.x - a.x) / length
  const ty = (b.y - a.y) / length
  const nx = ty
  const ny = -tx
  const center = Math.max(0.2, Math.min(0.8, centerBias ?? 0.38 + random() * 0.24))
  const spanPx = Math.min(length * 0.44, Math.max(12, depth * (kind === 'bite' || kind === 'notch' ? 1.05 : 1.5)))
  const halfT = spanPx / length / 2
  const p1 = pointAlong(a, b, Math.max(0.08, center - halfT))
  const p2 = pointAlong(a, b, Math.min(0.92, center + halfT))
  let inserts: Point[]

  if (kind === 'bite') {
    const middle = pointAlong(p1, p2, 0.58)
    inserts = [p1, { x: middle.x - nx * depth, y: middle.y - ny * depth }, p2]
  } else if (kind === 'notch') {
    const first = pointAlong(p1, p2, 0.34)
    const second = pointAlong(p1, p2, 0.7)
    inserts = [
      p1,
      { x: first.x - nx * depth, y: first.y - ny * depth },
      { x: second.x - nx * depth * 0.62, y: second.y - ny * depth * 0.62 },
      p2,
    ]
  } else if (kind === 'step') {
    const middle = pointAlong(p1, p2, 0.48)
    inserts = [
      p1,
      { x: p1.x + nx * depth, y: p1.y + ny * depth },
      { x: middle.x + nx * depth, y: middle.y + ny * depth },
      { x: middle.x + nx * depth * 0.48, y: middle.y + ny * depth * 0.48 },
      { x: p2.x + nx * depth * 0.48, y: p2.y + ny * depth * 0.48 },
      p2,
    ]
  } else {
    const skew = (random() - 0.5) * spanPx * (kind === 'torn' ? 0.45 : 0.16)
    const firstDepth = kind === 'torn' ? depth * 0.52 : depth * 0.82
    inserts = [
      p1,
      { x: p1.x + nx * firstDepth + tx * skew, y: p1.y + ny * firstDepth + ty * skew },
      { x: p2.x + nx * depth, y: p2.y + ny * depth },
      p2,
    ]
  }

  return [...points.slice(0, index + 1), ...inserts, ...points.slice(index + 1)]
}

function slantEdge(points: Point[], edge: Edge, depth: number, random: () => number) {
  const result = points.map((point) => ({ ...point }))
  const dx = edge.b.x - edge.a.x
  const dy = edge.b.y - edge.a.y
  const length = Math.hypot(dx, dy)
  const nx = dy / length
  const ny = -dx / length
  const moveStart = random() < 0.5
  const index = moveStart ? edge.index : (edge.index + 1) % result.length
  const amount = depth * (0.34 + random() * 0.18)
  result[index].x += nx * amount
  result[index].y += ny * amount
  return result
}

function clipCorner(points: Point[], side: Exclude<EdgePreference, 'auto'>, target: Point, amount: number) {
  const candidates = points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length]
    const next = points[(index + 1) % points.length]
    const previousLength = Math.hypot(point.x - previous.x, point.y - previous.y)
    const nextLength = Math.hypot(next.x - point.x, next.y - point.y)
    const sideBias = side === 'right' ? -point.x : side === 'left' ? point.x : side === 'bottom' ? -point.y : point.y
    const distance = Math.hypot(point.x - target.x, point.y - target.y)
    return { index, point, previous, next, previousLength, nextLength, score: distance + sideBias * 0.03 }
  }).filter((candidate) => candidate.previousLength > amount * 1.25 && candidate.nextLength > amount * 1.25)

  if (!candidates.length) return points
  candidates.sort((a, b) => a.score - b.score)
  const chosen = candidates[0]
  const before = pointAlong(chosen.point, chosen.previous, amount / chosen.previousLength)
  const after = pointAlong(chosen.point, chosen.next, amount / chosen.nextLength)
  return [...points.slice(0, chosen.index), before, after, ...points.slice(chosen.index + 1)]
}

function indexOfExtreme(values: number[], direction: 'min' | 'max') {
  return values.reduce((chosen, value, index) => {
    return direction === 'max'
      ? value > values[chosen] ? index : chosen
      : value < values[chosen] ? index : chosen
  }, 0)
}

function getPersonality(settings: GeneratorSettings, widths: number[], random: () => number): Personality {
  const longest = indexOfExtreme(widths, 'max')
  const shortest = indexOfExtreme(widths, 'min')
  const last = widths.length - 1
  let abruptJoin = 0
  let largestChange = -1
  for (let index = 0; index < widths.length - 1; index += 1) {
    const change = Math.abs(widths[index] - widths[index + 1])
    if (change > largestChange) {
      abruptJoin = index
      largestChange = change
    }
  }

  const structuralLines = [longest, last, widths[abruptJoin] >= (widths[abruptJoin + 1] ?? 0) ? abruptJoin : abruptJoin + 1]
  if (shortest !== longest) structuralLines.push(shortest)
  const targetLine = structuralLines[Math.floor(random() * structuralLines.length)]

  const primaryByMode: Record<GeneratorSettings['mode'], MutationKind[]> = {
    clean: ['clip', 'clip', 'bite', 'slant', 'tab'],
    tape: ['torn', 'tab', 'step', 'slant', 'clip', 'notch'],
    cling: ['clip', 'step', 'torn', 'bite', 'tab', 'slant', 'notch'],
    rough: ['torn', 'step', 'bite', 'clip', 'slant', 'notch', 'notch'],
    torn: ['torn', 'slant', 'clip', 'torn'],
  }
  const primaryChoices = primaryByMode[settings.mode]
  const primary = primaryChoices[Math.floor(random() * primaryChoices.length)]
  const secondaryChance = { clean: 0.12, tape: 0.34, cling: 0.27, rough: 0.55, torn: 0.2 }[settings.mode]
  const secondaryRoll = random()
  const secondary = random() < secondaryChance
    ? secondaryRoll < 0.42 ? 'clip' : secondaryRoll < 0.72 ? 'bite' : 'notch'
    : null

  const naturalSide = settings.align === 'right' ? 'left' : settings.align === 'center' && random() < 0.45 ? 'left' : 'right'
  const automaticEdges: Exclude<EdgePreference, 'auto'>[] = [naturalSide, naturalSide, naturalSide, naturalSide === 'right' ? 'left' : 'right', 'top', 'bottom']
  const edge = settings.preferredEdge === 'auto'
    ? automaticEdges[Math.floor(random() * automaticEdges.length)]
    : settings.preferredEdge

  const joinChoices: Record<GeneratorSettings['mode'], JoinTreatment[]> = {
    clean: ['square', 'angled', 'angled'],
    tape: ['angled', 'stepped', 'square'],
    cling: ['tucked', 'angled', 'stepped', 'square'],
    rough: ['stepped', 'tucked', 'angled'],
    torn: ['angled', 'stepped', 'square'],
  }
  const joinTreatment = joinChoices[settings.mode][Math.floor(random() * joinChoices[settings.mode].length)]
  const focalJoin = widths.length <= 1
    ? -1
    : random() < 0.68 ? abruptJoin : Math.min(widths.length - 2, Math.max(0, targetLine - (random() < 0.5 ? 1 : 0)))

  let lineTreatment: LineTreatment
  if (targetLine === shortest && shortest !== longest) lineTreatment = random() < 0.72 ? 'tuck' : 'offset'
  else if (targetLine === longest) lineTreatment = random() < 0.75 ? 'extend' : 'offset'
  else lineTreatment = random() < 0.5 ? 'extend' : random() < 0.5 ? 'tuck' : 'offset'

  return { primary, secondary, edge, targetLine, focalJoin, joinTreatment, lineTreatment }
}

function pushJoin(
  points: Point[],
  fromX: number,
  toX: number,
  y: number,
  direction: 1 | -1,
  outward: 1 | -1,
  treatment: JoinTreatment,
  depth: number,
  padding: number,
) {
  const joint: Point[] = []
  if (treatment === 'angled') {
    joint.push({ x: fromX, y: y - direction * depth / 2 }, { x: toX, y: y + direction * depth / 2 })
  } else if (treatment === 'stepped') {
    const middle = fromX + (toX - fromX) * 0.58
    joint.push(
      { x: fromX, y: y - direction * depth * 0.55 },
      { x: middle, y: y - direction * depth * 0.55 },
      { x: middle, y: y + direction * depth * 0.22 },
      { x: toX, y: y + direction * depth * 0.22 },
    )
  } else if (treatment === 'tucked') {
    const inset = Math.min(padding * 0.32, 5)
    const tuckedX = outward === 1 ? Math.min(fromX, toX) - inset : Math.max(fromX, toX) + inset
    joint.push(
      { x: fromX, y: y - direction * depth * 0.48 },
      { x: tuckedX, y },
      { x: toX, y: y + direction * depth * 0.48 },
    )
  } else {
    joint.push({ x: fromX, y }, { x: toX, y })
  }
  // Glyphs of whichever line reaches further run right over the step, so the join may only
  // bend into the empty side: below a longer upper line, above a longer lower line.
  // (On both edges the upper line is the longer one exactly when fromX > toX.)
  const offsets = joint.map((point) => point.y - y)
  const shift = fromX > toX ? -Math.min(0, ...offsets) : -Math.max(0, ...offsets)
  points.push(...joint.map((point) => ({ x: point.x, y: point.y + shift })))
}

function makeBasePolygon(
  lefts: number[],
  rights: number[],
  top: number,
  bottom: number,
  boundaries: number[],
  joins: JoinTreatment[],
  joinDepth: number,
  horizontalPadding: number,
) {
  const points: Point[] = [{ x: lefts[0], y: top }, { x: rights[0], y: top }]
  for (let index = 0; index < boundaries.length; index += 1) {
    pushJoin(points, rights[index], rights[index + 1], boundaries[index], 1, 1, joins[index], joinDepth, horizontalPadding)
  }
  points.push({ x: rights[rights.length - 1], y: bottom }, { x: lefts[lefts.length - 1], y: bottom })
  for (let index = boundaries.length - 1; index >= 0; index -= 1) {
    pushJoin(points, lefts[index + 1], lefts[index], boundaries[index], -1, -1, joins[index], joinDepth, horizontalPadding)
  }
  return points
}

function addVerticalEdgeLeans(points: Point[], random: () => number, energy: number) {
  const result = points.map((point) => ({ ...point }))
  const candidates = result.map((point, index) => {
    const next = result[(index + 1) % result.length]
    return { index, length: Math.abs(next.y - point.y), horizontalChange: Math.abs(next.x - point.x) }
  }).filter((edge) => edge.length > 24 && edge.horizontalChange < 0.01)

  const count = Math.min(candidates.length, energy >= 56 ? 2 : 1)
  for (let iteration = 0; iteration < count; iteration += 1) {
    const choiceIndex = Math.floor(random() * candidates.length)
    const [choice] = candidates.splice(choiceIndex, 1)
    if (!choice) break
    const endpoint = (choice.index + 1) % result.length
    const direction = random() < 0.5 ? -1 : 1
    const amount = 0.8 + random() * Math.min(2.8, energy * 0.04)
    result[endpoint].x += direction * amount
  }
  return result
}

function closestEdgeToLine(edges: Edge[], side: Edge['side'], lineCenterY: number, targetX: number) {
  return [...edges].sort((a, b) => {
    const distanceA = side === 'left' || side === 'right'
      ? Math.abs((a.a.y + a.b.y) / 2 - lineCenterY)
      : Math.abs((a.a.x + a.b.x) / 2 - targetX)
    const distanceB = side === 'left' || side === 'right'
      ? Math.abs((b.a.y + b.b.y) / 2 - lineCenterY)
      : Math.abs((b.a.x + b.b.x) / 2 - targetX)
    return distanceA - distanceB
  })[0]
}

function rotatePoint(point: Point, centerX: number, centerY: number, angle: number): Point {
  const radians = angle * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const x = point.x - centerX
  const y = point.y - centerY
  return {
    x: centerX + x * cosine - y * sine,
    y: centerY + x * sine + y * cosine,
  }
}

/**
 * A strip torn by hand: both ends wander slightly off vertical, and most strips
 * carry one thin paper sliver at a corner, as on the feature covers.
 */
function tornStrip(left: number, right: number, top: number, bottom: number, fontSize: number, random: () => number): Point[] {
  const height = bottom - top
  const wobble = fontSize * 0.022
  const lean = fontSize * 0.1
  const tornEnd = (x: number) => {
    const topX = x + (random() - 0.5) * lean
    const bottomX = x + (random() - 0.5) * lean * 2
    return [0, 1, 2, 3].map((step) => {
      const t = step / 3
      const drift = step === 0 || step === 3 ? 0 : (random() - 0.5) * 2 * wobble
      return { x: topX + (bottomX - topX) * t + drift, y: top + height * t }
    })
  }
  const rightEnd = tornEnd(right)
  const leftEnd = tornEnd(left)
  const points: Point[] = [leftEnd[0], ...rightEnd, leftEnd[3], leftEnd[2], leftEnd[1]]
  if (random() > 0.62) return points

  const length = fontSize * (0.1 + random() * 0.16)
  const thickness = fontSize * (0.02 + random() * 0.025)
  const onRight = random() < 0.5
  const atTop = random() < 0.5
  const withSliver = points.map((point) => ({ ...point }))
  if (onRight && atTop) {
    const corner = rightEnd[0]
    withSliver.splice(2, 0, { x: corner.x + length, y: corner.y + thickness * 0.25 }, { x: corner.x, y: corner.y + thickness })
  } else if (onRight) {
    const corner = rightEnd[3]
    withSliver.splice(4, 0, { x: corner.x, y: corner.y - thickness }, { x: corner.x + length, y: corner.y - thickness * 0.25 })
  } else if (atTop) {
    const corner = leftEnd[0]
    withSliver.push({ x: corner.x, y: corner.y + thickness }, { x: corner.x - length, y: corner.y + thickness * 0.25 })
  } else {
    const corner = leftEnd[3]
    withSliver.splice(6, 0, { x: corner.x - length, y: corner.y - thickness * 0.25 }, { x: corner.x, y: corner.y - thickness })
  }
  return hasSelfIntersection(withSliver) ? points : withSliver
}

function buildSeparateShape(
  settings: GeneratorSettings,
  lines: TextLine[],
  personality: Personality,
  random: () => number,
  horizontalPadding: number,
  verticalPadding: number,
  energy: number,
  ascent: number,
  descent: number,
): ShapeResult {
  const strips: ShapeStrip[] = []
  const stripLines: TextLine[] = []
  const rotatedPoints: Point[] = []
  const structuralDepth = settings.fontSize * (0.16 + energy / 560)
  const stripHeight = ascent + descent + verticalPadding * 2
  const stripStep = stripHeight + settings.lineGap

  lines.forEach((line, index) => {
    const stripLine = {
      ...line,
      baseline: index * stripStep + verticalPadding + ascent,
    }
    stripLines.push(stripLine)
    const inkX = line.inkX ?? line.x
    let left = inkX - horizontalPadding
    let right = inkX + line.width + horizontalPadding
    const top = index * stripStep
    const bottom = top + stripHeight
    const naturalSide = settings.align === 'right' ? 'left' : 'right'

    if (index === personality.targetLine) {
      if (personality.lineTreatment === 'extend') {
        if (naturalSide === 'right') right += structuralDepth * 0.34
        else left -= structuralDepth * 0.34
      } else if (personality.lineTreatment === 'tuck') {
        const tuck = Math.min(Math.max(0, horizontalPadding) * 0.35, structuralDepth * 0.16)
        if (naturalSide === 'right') right -= tuck
        else left += tuck
      }
    }

    const lean = 0.7 + random() * Math.min(2.5, energy * 0.038)
    let points: Point[] = [
      { x: left, y: top },
      { x: right, y: top },
      { x: right + (random() < 0.5 ? -lean : lean), y: bottom },
      { x: left + (random() < 0.5 ? -lean * 0.55 : lean * 0.55), y: bottom },
    ]

    if (settings.mode === 'torn') {
      points = tornStrip(left, right, top, bottom, settings.fontSize, random)
    } else if (index === personality.targetLine) {
      if (personality.primary === 'clip') {
        points = clipCorner(points, personality.edge, { x: naturalSide === 'right' ? right : left, y: (top + bottom) / 2 }, Math.min(10, 4 + structuralDepth * 0.22))
      } else {
        const requested = eligibleEdges(points, personality.edge, 18)
        const fallback = eligibleEdges(points, naturalSide, 18)
        const candidates = requested.length ? requested : fallback
        if (candidates.length) {
          const edge = closestEdgeToLine(candidates, personality.edge, (top + bottom) / 2, naturalSide === 'right' ? right : left)
          const padding = Math.max(1, edge.side === 'left' || edge.side === 'right' ? horizontalPadding : verticalPadding)
          const depth = personality.primary === 'bite' || personality.primary === 'notch'
            ? Math.min(padding * 0.42, structuralDepth * 0.28)
            : structuralDepth * 0.62
          const centerBias = edge.side === 'top' || edge.side === 'bottom'
            ? naturalSide === 'right' ? 0.78 : 0.22
            : undefined
          const mutated = personality.primary === 'slant'
            ? slantEdge(points, edge, structuralDepth, random)
            : mutateEdge(points, edge, personality.primary, depth, random, centerBias)
          if (!hasSelfIntersection(mutated)) points = mutated
        }
      }
    } else if (random() < 0.34) {
      const side: Edge['side'] = naturalSide === 'right' ? 'right' : 'left'
      const clipped = clipCorner(points, side, { x: naturalSide === 'right' ? right : left, y: random() < 0.5 ? top : bottom }, 3 + random() * 3)
      if (!hasSelfIntersection(clipped)) points = clipped
    }

    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2
    let angle = settings.rotationVariance > 0 ? (random() * 2 - 1) * settings.rotationVariance : 0
    if (settings.rotationVariance > 0 && Math.abs(angle) < settings.rotationVariance * 0.18) {
      angle = (angle < 0 ? -1 : 1) * settings.rotationVariance * 0.18
    }
    angle = round(angle)
    const strip = { path: pointsToPath(points), points, line: stripLine, angle, centerX, centerY }
    strips.push(strip)
    rotatedPoints.push(...points.map((point) => rotatePoint(point, centerX, centerY, angle)))
  })

  const xs = rotatedPoints.map((point) => point.x)
  const ys = rotatedPoints.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const margin = 7

  return {
    points: strips[0]?.points ?? [],
    path: strips[0]?.path ?? '',
    strips,
    lines: stripLines,
    viewBox: {
      x: round(minX - margin),
      y: round(minY - margin),
      width: round(maxX - minX + margin * 2),
      height: round(maxY - minY + margin * 2),
    },
    personality: `${strips.length} strips · ${personality.primary} on line ${personality.targetLine + 1}`,
  }
}

export interface ShapeOptions {
  /** Measured eyebrow label to seat above the first line. */
  eyebrow?: EyebrowMetrics
  /** No tape is drawn (text sits straight on the image), so the eyebrow anchors to the ink instead. */
  tapeless?: boolean
}

export function buildShape(
  settings: GeneratorSettings,
  labels: string[],
  widths: number[],
  originOffsets: number[] = [],
  fontBounds?: { ascent: number; descent: number },
  options: ShapeOptions = {},
): ShapeResult {
  const tapeShape = buildTapeShape(settings, labels, widths, originOffsets, fontBounds)
  const ascent = fontBounds?.ascent ?? settings.fontSize * 0.76
  const descent = fontBounds?.descent ?? settings.fontSize * 0.14
  const lastLine = tapeShape.lines[tapeShape.lines.length - 1]
  const inkBounds = lastLine
    ? { top: tapeShape.lines[0].baseline - ascent, bottom: lastLine.baseline + descent }
    : { top: tapeShape.viewBox.y, bottom: tapeShape.viewBox.y + tapeShape.viewBox.height }
  const shape = { ...tapeShape, inkBounds }
  if (!options.eyebrow?.text.trim() || !shape.lines.length) return shape

  const firstLine = shape.lines[0]
  const firstPoints = shape.strips?.[0]?.points ?? shape.points
  const tapeTop = Math.min(...firstPoints.map((point) => point.y))
  // Only true top-edge corners: torn slivers dip a little below the edge and must not widen the anchor.
  const topEdge = firstPoints.filter((point) => point.y <= tapeTop + 0.3).map((point) => point.x)
  const inkLeft = firstLine.inkX ?? firstLine.x
  const anchor = options.tapeless
    ? { left: inkLeft, right: inkLeft + firstLine.width, top: firstLine.baseline - ascent, gap: settings.fontSize * 0.22, overhang: 0 }
    : { left: Math.min(...topEdge), right: Math.max(...topEdge), top: tapeTop, gap: -1, overhang: 1 }
  const eyebrow = placeEyebrow(options.eyebrow, anchor, settings, mulberry32((settings.seed ^ 0x9e3779b9) >>> 0))
  return {
    ...shape,
    eyebrow,
    inkBounds: { top: Math.min(inkBounds.top, eyebrow.box.y), bottom: inkBounds.bottom },
    viewBox: unionViewBox(shape.viewBox, rotatedCorners(eyebrow), 7),
  }
}

function placeEyebrow(
  metrics: EyebrowMetrics,
  anchor: { left: number; right: number; top: number; gap: number; overhang: number },
  settings: GeneratorSettings,
  random: () => number,
): EyebrowShape {
  const padX = metrics.fontSize * 0.3
  const padY = metrics.fontSize * 0.2
  const width = metrics.width + padX * 2
  const height = metrics.capHeight + metrics.descent + padY * 2
  // Printed labels rarely sit exactly flush: nudge it a little past the tape's outer edge.
  const overhang = anchor.overhang * metrics.fontSize * (0.04 + random() * 0.1)
  let x = anchor.left - overhang
  if (settings.align === 'center') x = (anchor.left + anchor.right - width) / 2
  if (settings.align === 'right') x = anchor.right - width + overhang
  const y = anchor.top - anchor.gap - height
  const points = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ].map((point) => ({ x: round(point.x), y: round(point.y) }))
  let angle = settings.rotationVariance > 0 ? (random() * 2 - 1) * settings.rotationVariance : 0
  angle = round(angle)
  return {
    path: pointsToPath(points),
    points,
    text: metrics.text,
    x: round(x + padX + metrics.originOffset),
    baseline: round(y + padY + metrics.capHeight),
    fontSize: metrics.fontSize,
    angle,
    centerX: round(x + width / 2),
    centerY: round(y + height / 2),
    box: { x: round(x), y: round(y), width: round(width), height: round(height) },
  }
}

function rotatedCorners(eyebrow: EyebrowShape) {
  return eyebrow.points.map((point) => rotatePoint(point, eyebrow.centerX, eyebrow.centerY, eyebrow.angle))
}

function unionViewBox(viewBox: ShapeResult['viewBox'], points: Point[], margin: number): ShapeResult['viewBox'] {
  const minX = Math.min(viewBox.x, ...points.map((point) => point.x - margin))
  const minY = Math.min(viewBox.y, ...points.map((point) => point.y - margin))
  const maxX = Math.max(viewBox.x + viewBox.width, ...points.map((point) => point.x + margin))
  const maxY = Math.max(viewBox.y + viewBox.height, ...points.map((point) => point.y + margin))
  return { x: round(minX), y: round(minY), width: round(maxX - minX), height: round(maxY - minY) }
}

function buildTapeShape(
  settings: GeneratorSettings,
  labels: string[],
  widths: number[],
  originOffsets: number[] = [],
  fontBounds?: { ascent: number; descent: number },
): ShapeResult {
  const random = mulberry32(settings.seed)
  const personality = getPersonality(settings, widths, random)
  const energyBase = { clean: 28, tape: 46, cling: 40, rough: 60, torn: 44 }[settings.mode]
  const energy = energyBase + (random() - 0.5) * 8
  const cling = Math.max(0.82, Math.min(1.16, settings.hugStrength))
  const looseness = Math.max(0, 1 - cling)
  const overCling = Math.max(0, cling - 1) / 0.16
  // Feature strips are cut roomier than headline blocks, matching the printed covers.
  const roomy = settings.style === 'feature'
  const basePaddingX = roomy ? settings.fontSize * 0.3 : Math.max(6, settings.fontSize * 0.11)
  const basePaddingY = roomy ? settings.fontSize * 0.2 : Math.max(3, settings.fontSize * 0.055)
  const horizontalPadding = basePaddingX * (1 + looseness * 1.8) * (1 - overCling * 1.18)
  const verticalPadding = basePaddingY * (1 + looseness * 1.3) * (1 - overCling * 1.1)
  const ascent = fontBounds?.ascent ?? settings.fontSize * 0.76
  const descent = fontBounds?.descent ?? settings.fontSize * 0.14
  const glyphHeight = ascent + descent
  const maxMeasured = Math.max(...widths, 1)
  const lineHeightPx = Math.max(glyphHeight * 0.86, glyphHeight + settings.lineGap)
  const textHeight = glyphHeight + (labels.length - 1) * lineHeightPx
  const top = 0
  const bottom = textHeight + verticalPadding * 2
  const boundaries = labels.slice(1).map((_, index) => {
    return verticalPadding + glyphHeight + index * lineHeightPx + (lineHeightPx - glyphHeight) / 2
  })
  const modeHug = { clean: -0.035, tape: -0.012, cling: 0, rough: -0.008, torn: -0.01 }[settings.mode]
  const hug = Math.max(0.78, Math.min(1, cling + modeHug))
  const effectiveWidths = widths.map((width) => maxMeasured - (maxMeasured - width) * hug)
  const lefts: number[] = []
  const rights: number[] = []
  const lines: TextLine[] = []

  effectiveWidths.forEach((effectiveWidth, index) => {
    const measuredWidth = widths[index]
    let contentX = 0
    if (settings.align === 'center') contentX = (maxMeasured - measuredWidth) / 2
    if (settings.align === 'right') contentX = maxMeasured - measuredWidth

    let blockX = 0
    if (settings.align === 'center') blockX = (maxMeasured - effectiveWidth) / 2
    if (settings.align === 'right') blockX = maxMeasured - effectiveWidth

    const naturalOffset = index === personality.targetLine ? 0 : (random() - 0.5) * energy * 0.025
    lefts.push(blockX - horizontalPadding + (settings.align === 'right' ? naturalOffset : 0))
    rights.push(blockX + effectiveWidth + horizontalPadding + (settings.align !== 'right' ? naturalOffset : 0))
    lines.push({
      text: labels[index],
      width: measuredWidth,
      x: contentX + (originOffsets[index] ?? 0),
      inkX: contentX,
      baseline: verticalPadding + ascent + index * lineHeightPx,
    })
  })

  if (settings.perLine) {
    return buildSeparateShape(
      settings,
      lines,
      personality,
      random,
      horizontalPadding,
      verticalPadding,
      energy,
      ascent,
      descent,
    )
  }

  const target = personality.targetLine
  const structuralDepth = settings.fontSize * (0.17 + energy / 500)
  const treatmentSide = personality.edge === 'left' || personality.edge === 'right'
    ? personality.edge
    : settings.align === 'right' ? 'left' : 'right'
  const inwardLimit = Math.max(0, horizontalPadding) * 0.42
  if (personality.lineTreatment === 'extend') {
    if (treatmentSide === 'right') rights[target] += structuralDepth * 0.42
    else lefts[target] -= structuralDepth * 0.42
  } else if (personality.lineTreatment === 'tuck') {
    if (treatmentSide === 'right') rights[target] -= Math.min(inwardLimit, structuralDepth * 0.2)
    else lefts[target] += Math.min(inwardLimit, structuralDepth * 0.2)
  } else {
    const offset = structuralDepth * 0.22
    lefts[target] -= offset * (treatmentSide === 'left' ? 1 : 0.35)
    rights[target] += offset * (treatmentSide === 'right' ? 1 : 0.35)
  }

  const baseJoin: JoinTreatment = settings.mode === 'clean' ? 'square' : 'angled'
  const joins = boundaries.map((_, index) => {
    const difference = Math.abs(rights[index] - rights[index + 1]) + Math.abs(lefts[index] - lefts[index + 1])
    if (index !== personality.focalJoin || difference < 10) return baseJoin
    return personality.joinTreatment
  })
  const joinDepth = Math.min(lineHeightPx * 0.22, 4 + energy * 0.075)
  const basePoints = makeBasePolygon(lefts, rights, top, bottom, boundaries, joins, joinDepth, Math.max(0, horizontalPadding))
  const leanedPoints = addVerticalEdgeLeans(basePoints, random, energy)
  let points = hasSelfIntersection(leanedPoints) ? basePoints : leanedPoints

  const targetCenterY = verticalPadding + settings.fontSize / 2 + target * lineHeightPx
  const targetX = treatmentSide === 'right' ? rights[target] : lefts[target]
  const minimumEdge = Math.max(16, lineHeightPx * 0.26)
  const primaryCandidates = eligibleEdges(points, personality.edge, minimumEdge)
  const fallbacks = eligibleEdges(points, treatmentSide, minimumEdge)
  const candidates = primaryCandidates.length ? primaryCandidates : fallbacks

  if (personality.primary === 'clip') {
    const clipped = clipCorner(points, personality.edge, { x: targetX, y: targetCenterY }, Math.min(13, 5 + structuralDepth * 0.28))
    if (!hasSelfIntersection(clipped)) points = clipped
  } else if (candidates.length) {
    const edge = closestEdgeToLine(candidates, personality.edge, targetCenterY, targetX)
    const insetAxisPadding = Math.max(1, edge.side === 'left' || edge.side === 'right' ? horizontalPadding : verticalPadding)
    const safeDepth = personality.primary === 'bite' || personality.primary === 'notch'
      ? Math.min(structuralDepth * 0.3, insetAxisPadding * 0.46)
      : structuralDepth * (personality.primary === 'step' ? 0.62 : 0.82)
    const centerBias = edge.side === 'top' || edge.side === 'bottom'
      ? treatmentSide === 'right' ? 0.78 : 0.22
      : undefined
    const mutated = personality.primary === 'slant'
      ? slantEdge(points, edge, structuralDepth, random)
      : mutateEdge(points, edge, personality.primary, safeDepth, random, centerBias)
    if (!hasSelfIntersection(mutated)) points = mutated
  }

  if (personality.secondary) {
    const opposite: Record<Edge['side'], Edge['side']> = { left: 'bottom', right: 'top', top: 'left', bottom: 'right' }
    const secondarySide = opposite[personality.edge]
    if (personality.secondary === 'clip') {
      const clipped = clipCorner(points, secondarySide, { x: targetX, y: boundaries[personality.focalJoin] ?? targetCenterY }, 5 + structuralDepth * 0.14)
      if (!hasSelfIntersection(clipped)) points = clipped
    } else {
      const secondaryCandidates = eligibleEdges(points, secondarySide, 22)
      if (secondaryCandidates.length) {
        const edge = closestEdgeToLine(secondaryCandidates, secondarySide, boundaries[personality.focalJoin] ?? targetCenterY, targetX)
        const padding = Math.max(1, edge.side === 'left' || edge.side === 'right' ? horizontalPadding : verticalPadding)
        const mutated = mutateEdge(points, edge, personality.secondary, Math.min(padding * 0.3, structuralDepth * 0.16), random)
        if (!hasSelfIntersection(mutated)) points = mutated
      }
    }
  }

  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const margin = 6
  const path = pointsToPath(points)

  return {
    points,
    path,
    lines,
    viewBox: {
      x: round(minX - margin),
      y: round(minY - margin),
      width: round(maxX - minX + margin * 2),
      height: round(maxY - minY + margin * 2),
    },
    personality: `${personality.primary} · line ${target + 1} · ${personality.edge} · ${personality.joinTreatment} join`,
  }
}

function orientation(a: Point, b: Point, c: Point) {
  return Math.sign((b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y))
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  return orientation(a, b, c) !== orientation(a, b, d) && orientation(c, d, a) !== orientation(c, d, b)
}

export function hasSelfIntersection(points: Point[]) {
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    for (let j = i + 1; j < points.length; j += 1) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === points.length - 1)) continue
      const c = points[j]
      const d = points[(j + 1) % points.length]
      if (segmentsIntersect(a, b, c, d)) return true
    }
  }
  return false
}
