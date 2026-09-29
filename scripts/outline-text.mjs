// Draws a fixed line of text as outlines and writes it as an SVG mark, cropped to its ink.
// The cover's "Swipe for more" prompt is made this way, so it needs no font at all: it looks
// the same in the preview, in PNG and SVG exports, and in design tools without Barlow Condensed.
// Glyph outlines, advances and kerning are read straight from the Fontsource WOFF file.
//
// Usage: node scripts/outline-text.mjs "SWIPE FOR MORE" barlow-condensed 800 40 src/assets/swipe-for-more.svg
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { readCmap, readWoffTables } from './woff.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const [text, family, weight, size, output] = process.argv.slice(2)
if (!text || !family || !weight || !size || !output) {
  console.error('Usage: node scripts/outline-text.mjs "<text>" <family> <weight> <size in px> <output.svg>')
  process.exit(1)
}

const tables = readWoffTables(readFileSync(`${root}node_modules/@fontsource/${family}/files/${family}-latin-${weight}-normal.woff`))
const unitsPerEm = tables.head.readUInt16BE(18)
const longLoca = tables.head.readInt16BE(50) === 1
const longMetrics = tables.hhea.readUInt16BE(34)
const cmap = readCmap(tables.cmap)
const advanceOf = (glyph) => tables.hmtx.readUInt16BE(Math.min(glyph, longMetrics - 1) * 4)
const locaOf = (glyph) => longLoca ? tables.loca.readUInt32BE(glyph * 4) : tables.loca.readUInt16BE(glyph * 2) * 2

/** The contours of a simple glyph, as lists of points in font units (y up). */
function readContours(glyph) {
  const start = locaOf(glyph)
  if (locaOf(glyph + 1) === start) return [] // no outline: a space
  const glyf = tables.glyf
  const contourCount = glyf.readInt16BE(start)
  if (contourCount < 0) throw new Error(`Glyph ${glyph} is a composite, which this script does not read`)
  let at = start + 10
  const ends = []
  for (let index = 0; index < contourCount; index += 1) ends.push(glyf.readUInt16BE(at + index * 2))
  at += contourCount * 2
  at += 2 + glyf.readUInt16BE(at) // skip the hinting instructions
  const pointCount = ends[ends.length - 1] + 1
  const flags = []
  while (flags.length < pointCount) {
    const flag = glyf.readUInt8(at)
    at += 1
    flags.push(flag)
    if (flag & 8) {
      const repeats = glyf.readUInt8(at)
      at += 1
      for (let repeat = 0; repeat < repeats; repeat += 1) flags.push(flag)
    }
  }
  const readAxis = (shortBit, sameBit) => {
    const values = []
    let value = 0
    for (const flag of flags) {
      if (flag & shortBit) {
        const delta = glyf.readUInt8(at)
        at += 1
        value += flag & sameBit ? delta : -delta
      } else if (!(flag & sameBit)) {
        value += glyf.readInt16BE(at)
        at += 2
      }
      values.push(value)
    }
    return values
  }
  const xs = readAxis(2, 16)
  const ys = readAxis(4, 32)
  const contours = []
  let first = 0
  for (const end of ends) {
    const points = []
    for (let index = first; index <= end; index += 1) points.push({ x: xs[index], y: ys[index], on: Boolean(flags[index] & 1) })
    contours.push(points)
    first = end + 1
  }
  return contours
}

const valueSize = (format) => 2 * [...format.toString(2)].filter((bit) => bit === '1').length

function readCoverage(table, at) {
  const format = table.readUInt16BE(at)
  const count = table.readUInt16BE(at + 2)
  const index = new Map()
  if (format === 1) {
    for (let entry = 0; entry < count; entry += 1) index.set(table.readUInt16BE(at + 4 + entry * 2), entry)
  } else {
    for (let entry = 0; entry < count; entry += 1) {
      const record = at + 4 + entry * 6
      const start = table.readUInt16BE(record)
      const end = table.readUInt16BE(record + 2)
      const startIndex = table.readUInt16BE(record + 4)
      for (let glyph = start; glyph <= end; glyph += 1) index.set(glyph, startIndex + glyph - start)
    }
  }
  return index
}

function readClasses(table, at) {
  const format = table.readUInt16BE(at)
  const classes = new Map()
  if (format === 1) {
    const start = table.readUInt16BE(at + 2)
    const count = table.readUInt16BE(at + 4)
    for (let entry = 0; entry < count; entry += 1) classes.set(start + entry, table.readUInt16BE(at + 6 + entry * 2))
  } else {
    const count = table.readUInt16BE(at + 2)
    for (let entry = 0; entry < count; entry += 1) {
      const record = at + 4 + entry * 6
      const value = table.readUInt16BE(record + 4)
      for (let glyph = table.readUInt16BE(record); glyph <= table.readUInt16BE(record + 2); glyph += 1) classes.set(glyph, value)
    }
  }
  return classes
}

/** Pair kerning from the GPOS `kern` feature: returns the change in advance between two glyphs, in font units. */
function readKerning(gpos) {
  if (!gpos) return () => 0
  const featureList = gpos.readUInt16BE(6)
  const lookupList = gpos.readUInt16BE(8)
  const lookups = new Set()
  for (let index = 0; index < gpos.readUInt16BE(featureList); index += 1) {
    const record = featureList + 2 + index * 6
    if (gpos.toString('latin1', record, record + 4) !== 'kern') continue
    const feature = featureList + gpos.readUInt16BE(record + 4)
    for (let entry = 0; entry < gpos.readUInt16BE(feature + 2); entry += 1) lookups.add(gpos.readUInt16BE(feature + 4 + entry * 2))
  }

  // The advance change is the XAdvance of the first glyph's value record; placements come before it.
  const advanceIn = (format, at) => (format & 4 ? gpos.readInt16BE(at + valueSize(format & 3)) : 0)

  const subtables = [...lookups].sort((a, b) => a - b).map((lookupIndex) => {
    const lookup = lookupList + gpos.readUInt16BE(lookupList + 2 + lookupIndex * 2)
    let type = gpos.readUInt16BE(lookup)
    const tables = []
    for (let index = 0; index < gpos.readUInt16BE(lookup + 4); index += 1) {
      let at = lookup + gpos.readUInt16BE(lookup + 6 + index * 2)
      if (type === 9 || gpos.readUInt16BE(lookup) === 9) {
        type = gpos.readUInt16BE(at + 2)
        at += gpos.readUInt32BE(at + 4)
      }
      if (type !== 2) continue
      const format = gpos.readUInt16BE(at)
      const coverage = readCoverage(gpos, at + gpos.readUInt16BE(at + 2))
      const format1 = gpos.readUInt16BE(at + 4)
      const format2 = gpos.readUInt16BE(at + 6)
      const recordSize = valueSize(format1) + valueSize(format2)
      if (format === 1) {
        tables.push((left, right) => {
          const covered = coverage.get(left)
          if (covered === undefined) return null
          const set = at + gpos.readUInt16BE(at + 10 + covered * 2)
          for (let pair = 0; pair < gpos.readUInt16BE(set); pair += 1) {
            const record = set + 2 + pair * (2 + recordSize)
            if (gpos.readUInt16BE(record) === right) return advanceIn(format1, record + 2)
          }
          return null
        })
      } else {
        const classes1 = readClasses(gpos, at + gpos.readUInt16BE(at + 8))
        const classes2 = readClasses(gpos, at + gpos.readUInt16BE(at + 10))
        const count2 = gpos.readUInt16BE(at + 14)
        tables.push((left, right) => {
          if (!coverage.has(left)) return null
          const record = at + 16 + ((classes1.get(left) ?? 0) * count2 + (classes2.get(right) ?? 0)) * recordSize
          return advanceIn(format1, record)
        })
      }
    }
    return tables
  })

  // Within a lookup the first subtable that handles the pair wins; lookups add up.
  return (left, right) => subtables.reduce((total, tables) => {
    for (const table of tables) {
      const value = table(left, right)
      if (value !== null) return total + value
    }
    return total
  }, 0)
}

const kerning = readKerning(tables.GPOS)
const glyphs = [...text].map((character) => {
  const glyph = cmap.get(character.codePointAt(0))
  if (glyph === undefined) throw new Error(`The font has no "${character}"`)
  return glyph
})

// Lay the glyphs along the baseline, in font units.
let pen = 0
const placed = glyphs.map((glyph, index) => {
  if (index > 0) pen += kerning(glyphs[index - 1], glyph)
  const entry = { contours: readContours(glyph), x: pen }
  pen += advanceOf(glyph)
  return entry
})

const points = placed.flatMap((entry) => entry.contours.flat().map((point) => ({ x: point.x + entry.x, y: point.y })))
const left = Math.min(...points.map((point) => point.x))
const right = Math.max(...points.map((point) => point.x))
const top = Math.max(...points.map((point) => point.y))
const bottom = Math.min(...points.map((point) => point.y))
const scale = Number(size) / unitsPerEm
const number = (value) => String(Math.round(value * 100) / 100)
const at = (point, offset) => `${number((point.x + offset - left) * scale)} ${number((top - point.y) * scale)}`
const middle = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, on: true })

// TrueType contours are quadratic: two control points in a row imply a point on the curve halfway between.
const path = placed.flatMap((entry) => entry.contours.map((contour) => {
  const firstOn = contour.findIndex((point) => point.on)
  const ordered = firstOn >= 0 ? [...contour.slice(firstOn), ...contour.slice(0, firstOn)] : [middle(contour[contour.length - 1], contour[0]), ...contour]
  let d = `M${at(ordered[0], entry.x)}`
  for (let index = 1; index <= ordered.length; index += 1) {
    const point = ordered[index % ordered.length]
    if (point.on) {
      if (index < ordered.length) d += `L${at(point, entry.x)}`
      continue
    }
    const next = ordered[(index + 1) % ordered.length]
    const end = next.on ? next : middle(point, next)
    d += `Q${at(point, entry.x)} ${at(end, entry.x)}`
    if (next.on) index += 1
  }
  return `${d}Z`
})).join('')

const width = number((right - left) * scale)
const height = number((top - bottom) * scale)
writeFileSync(
  `${root}${output}`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n<!-- "${text}" in ${family} ${weight} at ${size}px, outlined by scripts/outline-text.mjs. Baseline at y=${number(top * scale)}. -->\n<path d="${path}" fill="#FFE900"/>\n</svg>\n`,
)
console.log(`Wrote ${output}: ${width} × ${height}px, advance ${pen} units (${number(pen * scale)}px), kerning ${pen - glyphs.reduce((total, glyph) => total + advanceOf(glyph), 0)} units`)
