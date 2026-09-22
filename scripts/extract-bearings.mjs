// Reads Barlow's glyph side bearings straight from the Fontsource WOFF files and writes
// src/barlowBearings.ts. Browsers disagree about canvas ink metrics (Safari reports the
// advance box, Chrome and Firefox the ink box), so the app measures ink from this table
// instead, and every browser lays out the same cover.
//
// Usage: node scripts/extract-bearings.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const WEIGHTS = [700, 900]
const SUBSETS = ['latin', 'latin-ext', 'vietnamese']

function readWoffTables(buffer) {
  if (buffer.toString('latin1', 0, 4) !== 'wOFF') throw new Error('Not a WOFF 1 file')
  const count = buffer.readUInt16BE(12)
  const tables = {}
  for (let index = 0; index < count; index += 1) {
    const entry = 44 + index * 20
    const tag = buffer.toString('latin1', entry, entry + 4)
    const offset = buffer.readUInt32BE(entry + 4)
    const compressed = buffer.readUInt32BE(entry + 8)
    const original = buffer.readUInt32BE(entry + 12)
    const data = buffer.subarray(offset, offset + compressed)
    tables[tag] = compressed < original ? inflateSync(data) : data
  }
  return tables
}

function readCmap(cmap) {
  const count = cmap.readUInt16BE(2)
  const records = []
  for (let index = 0; index < count; index += 1) {
    const record = 4 + index * 8
    records.push({ platform: cmap.readUInt16BE(record), encoding: cmap.readUInt16BE(record + 2), offset: cmap.readUInt32BE(record + 4) })
  }
  const pick = records.find((r) => r.platform === 3 && r.encoding === 10)
    ?? records.find((r) => r.platform === 0 && r.encoding === 4)
    ?? records.find((r) => r.platform === 3 && r.encoding === 1)
    ?? records.find((r) => r.platform === 0)
  if (!pick) throw new Error('No Unicode cmap')
  const at = pick.offset
  const format = cmap.readUInt16BE(at)
  const map = new Map()
  if (format === 4) {
    const segments = cmap.readUInt16BE(at + 6) / 2
    const ends = at + 14
    const starts = ends + segments * 2 + 2
    const deltas = starts + segments * 2
    const rangeOffsets = deltas + segments * 2
    for (let segment = 0; segment < segments; segment += 1) {
      const end = cmap.readUInt16BE(ends + segment * 2)
      const start = cmap.readUInt16BE(starts + segment * 2)
      const delta = cmap.readInt16BE(deltas + segment * 2)
      const rangeOffset = cmap.readUInt16BE(rangeOffsets + segment * 2)
      for (let code = start; code <= end && code !== 0xffff; code += 1) {
        let glyph
        if (rangeOffset === 0) glyph = (code + delta) & 0xffff
        else {
          const address = rangeOffsets + segment * 2 + rangeOffset + (code - start) * 2
          glyph = cmap.readUInt16BE(address)
          if (glyph) glyph = (glyph + delta) & 0xffff
        }
        if (glyph) map.set(code, glyph)
      }
    }
  } else if (format === 12) {
    const groups = cmap.readUInt32BE(at + 12)
    for (let group = 0; group < groups; group += 1) {
      const entry = at + 16 + group * 12
      const start = cmap.readUInt32BE(entry)
      const end = cmap.readUInt32BE(entry + 4)
      const first = cmap.readUInt32BE(entry + 8)
      for (let code = start; code <= end; code += 1) map.set(code, first + code - start)
    }
  } else {
    throw new Error(`Unsupported cmap format ${format}`)
  }
  return map
}

function readBearings(file) {
  const tables = readWoffTables(readFileSync(file))
  const unitsPerEm = tables.head.readUInt16BE(18)
  const longLoca = tables.head.readInt16BE(50) === 1
  const glyphCount = tables.maxp.readUInt16BE(4)
  const longMetrics = tables.hhea.readUInt16BE(34)
  const advance = (glyph) => tables.hmtx.readUInt16BE(Math.min(glyph, longMetrics - 1) * 4)
  const loca = (glyph) => longLoca ? tables.loca.readUInt32BE(glyph * 4) : tables.loca.readUInt16BE(glyph * 2) * 2
  const bearings = new Map()
  for (const [code, glyph] of readCmap(tables.cmap)) {
    if (glyph >= glyphCount) continue
    const start = loca(glyph)
    if (loca(glyph + 1) === start) continue // no outline (a space): nothing to fit tape to
    const xMin = tables.glyf.readInt16BE(start + 2)
    const xMax = tables.glyf.readInt16BE(start + 6)
    bearings.set(code, [xMin, advance(glyph) - xMax])
  }
  return { unitsPerEm, bearings }
}

const output = {}
let unitsPerEm
for (const weight of WEIGHTS) {
  const merged = new Map()
  for (const subset of SUBSETS) {
    const file = `${root}node_modules/@fontsource/barlow/files/barlow-${subset}-${weight}-normal.woff`
    const result = readBearings(file)
    if (unitsPerEm && result.unitsPerEm !== unitsPerEm) throw new Error('Mixed unitsPerEm')
    unitsPerEm = result.unitsPerEm
    for (const [code, value] of result.bearings) merged.set(code, value)
  }
  output[weight] = [...merged].sort(([a], [b]) => a - b).map(([code, [left, right]]) => `${code.toString(36)}:${left}:${right}`).join(',')
  console.log(`Barlow ${weight}: ${merged.size} glyphs`)
}

const source = `// Generated by scripts/extract-bearings.mjs from @fontsource/barlow. Do not edit by hand.
// Per code point (base 36): left side bearing and right side bearing, in font units.
export const UNITS_PER_EM = ${unitsPerEm}

export const PACKED_BEARINGS: Record<number, string> = {
${WEIGHTS.map((weight) => `  ${weight}: '${output[weight]}',`).join('\n')}
}
`
writeFileSync(`${root}src/barlowBearings.ts`, source)
console.log('Wrote src/barlowBearings.ts')
