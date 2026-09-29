/**
 * Putting marks into typed words for the person: what the B, S, I and U buttons over a box do.
 * Marks hug the words they are for and never cross a line, so each picked line gets its own.
 */
export interface Marked {
  value: string
  /** What to show picked afterwards: the words that were marked, without their marks. */
  from: number
  to: number
}

const BULLET = '- '
const STARTS_BULLET = /^\s*[-•–]\s+/

export function markSelection(value: string, from: number, to: number, sign: string): Marked {
  const start = Math.max(0, Math.min(from, to, value.length))
  const end = Math.min(value.length, Math.max(from, to))

  if (sign === BULLET) {
    // Whole lines: every line the picked words touch starts with a dash, or stops starting with one.
    const first = value.lastIndexOf('\n', start - 1) + 1
    const after = value.indexOf('\n', end)
    const last = after < 0 ? value.length : after
    const lines = value.slice(first, last).split('\n')
    const all = lines.filter((line) => line.trim()).every((line) => STARTS_BULLET.test(line))
    const next = lines.map((line) => (!line.trim() ? line : all ? line.replace(STARTS_BULLET, '') : STARTS_BULLET.test(line) ? line : BULLET + line)).join('\n')
    return { value: value.slice(0, first) + next + value.slice(last), from: first, to: first + next.length }
  }

  if (start === end) {
    // Nothing picked: a place to type into, with a word standing in.
    const word = 'words'
    return { value: value.slice(0, start) + sign + word + sign + value.slice(end), from: start + sign.length, to: start + sign.length + word.length }
  }

  let shown: { from: number; to: number } | null = null
  let built = value.slice(0, start)
  value.slice(start, end).split('\n').forEach((line, index) => {
    if (index > 0) built += '\n'
    const lead = line.length - line.trimStart().length
    const core = line.trim()
    if (!core) {
      built += line
      return
    }
    // The same marks already round the words come off again.
    const wrapped = core.length > sign.length * 2 && core.startsWith(sign) && core.endsWith(sign)
      && !core.startsWith(sign + sign[0]) && !core.endsWith(sign[0] + sign)
    const words = wrapped ? core.slice(sign.length, -sign.length) : core
    const open = wrapped ? '' : sign
    built += line.slice(0, lead) + open
    const at = built.length
    built += words + open + line.slice(lead + core.length)
    shown = { from: shown?.from ?? at, to: at + words.length }
  })
  const picked = shown as { from: number; to: number } | null
  return { value: built + value.slice(end), from: picked?.from ?? start, to: picked?.to ?? end }
}
