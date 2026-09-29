// Crops an exported SVG mark (the logo, the swipe arrow) to its artwork and writes it to
// src/assets, where src/furniture.ts reads the viewBox as the mark's size. Design tools export
// marks on a padded frame; the cover places them by their real edges.
//
// Usage: node scripts/prepare-mark.mjs <exported.svg> <src/assets/name.svg> [decimals]
import { readFileSync, writeFileSync } from 'node:fs'

const [input, output, decimals = '2'] = process.argv.slice(2)
if (!input || !output) {
  console.error('Usage: node scripts/prepare-mark.mjs <exported.svg> <src/assets/name.svg> [decimals]')
  process.exit(1)
}

const source = readFileSync(input, 'utf8')
if (/<(g|use|clipPath|mask)\b|\stransform=|fill-rule=/.test(source)) throw new Error('Flatten the mark first: only plain <path> elements with the default fill rule are read')
const PARAMETERS = { M: 2, L: 2, H: 1, V: 1, C: 6, Z: 0 }

/** A path as absolute segments. Only the commands design tools write for outlined artwork are read. */
function readPath(d) {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []
  const segments = []
  let at = 0
  while (at < tokens.length) {
    let command = tokens[at]
    at += 1
    if (!(command in PARAMETERS)) throw new Error(`Path command "${command}" is not supported (export with absolute M, L, H, V, C and Z)`)
    do {
      const values = tokens.slice(at, at + PARAMETERS[command]).map(Number)
      if (values.length < PARAMETERS[command] || values.some(Number.isNaN)) throw new Error('Malformed path data')
      at += PARAMETERS[command]
      segments.push({ command, values })
      // Extra coordinate pairs after a move are lines.
      if (command === 'M') command = 'L'
    } while (command !== 'Z' && at < tokens.length && !/^[A-Za-z]$/.test(tokens[at]))
  }
  return segments
}

/** Values of one axis of a cubic curve where it turns around, plus its end. */
function cubicExtremes(p0, p1, p2, p3) {
  const a = -p0 + 3 * p1 - 3 * p2 + p3
  const b = 2 * (p0 - 2 * p1 + p2)
  const c = p1 - p0
  const roots = Math.abs(a) < 1e-9
    ? (Math.abs(b) < 1e-9 ? [] : [-c / b])
    : (b * b - 4 * a * c < 0 ? [] : [(-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a), (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a)])
  return [p3, ...roots.filter((t) => t > 0 && t < 1).map((t) => {
    const u = 1 - t
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
  })]
}

const paths = [...source.matchAll(/<path[^>]*?\sd="([^"]+)"/g)].map((match) => readPath(match[1]))
if (!paths.length) throw new Error('No <path> found')

const xs = []
const ys = []
for (const segments of paths) {
  let x = 0
  let y = 0
  let start = { x: 0, y: 0 }
  for (const { command, values } of segments) {
    if (command === 'C') {
      xs.push(...cubicExtremes(x, values[0], values[2], values[4]))
      ys.push(...cubicExtremes(y, values[1], values[3], values[5]))
      x = values[4]
      y = values[5]
    } else if (command === 'Z') {
      x = start.x
      y = start.y
    } else {
      if (command === 'H') x = values[0]
      else if (command === 'V') y = values[0]
      else [x, y] = values
      if (command === 'M') start = { x, y }
      xs.push(x)
      ys.push(y)
    }
  }
}

const left = Math.min(...xs)
const top = Math.min(...ys)
const factor = 10 ** Number(decimals)
const number = (value) => String(Math.round(value * factor) / factor)
const width = number(Math.max(...xs) - left)
const height = number(Math.max(...ys) - top)
const fill = /fill="(#[0-9a-fA-F]{3,8})"/.exec(source)?.[1] ?? '#000'

const body = paths.map((segments) => {
  const d = segments.map(({ command, values }) => {
    if (command === 'H') return `H${number(values[0] - left)}`
    if (command === 'V') return `V${number(values[0] - top)}`
    return command + values.map((value, index) => number(value - (index % 2 ? top : left))).join(' ')
  }).join('')
  return `<path d="${d}" fill="${fill}"/>`
}).join('\n')

writeFileSync(output, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n${body}\n</svg>\n`)
console.log(`Wrote ${output}: ${paths.length} path${paths.length === 1 ? '' : 's'}, ${width} × ${height}, cropped from ${number(left)},${number(top)}`)
