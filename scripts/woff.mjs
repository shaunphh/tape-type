// Shared by the font scripts: reads the tables of a Fontsource WOFF 1 file and its Unicode cmap.
import { inflateSync } from 'node:zlib'

export function readWoffTables(buffer) {
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

export function readCmap(cmap) {
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
