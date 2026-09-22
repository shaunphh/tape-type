// Short function words stay lowercase inside a title (AP-style), matching headlines
// such as "How to Make the Most of a Weekend Visit to Dublin".
const MINOR_WORDS = new Set([
  'a', 'an', 'the',
  'and', 'but', 'or', 'nor', 'for', 'yet', 'so',
  'as', 'at', 'by', 'in', 'of', 'off', 'on', 'per', 'to', 'up', 'via', 'vs', 'vs.',
])

const LINE_BREAKS = new Set([0x0a, 0x0b, 0x0c, 0x0d, 0x85, 0x2028, 0x2029])

/** Characters XML (and so SVG) cannot contain: most C0/C1 controls and the U+FFFE/U+FFFF non-characters. */
const isForbidden = (code: number) =>
  (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || (code >= 0x7f && code <= 0x9f) || code === 0xfffe || code === 0xffff

/** Removes anything that would make an SVG export invalid XML, including unpaired surrogates. */
export function cleanText(value: string) {
  let result = ''
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        result += value.slice(index, index + 2)
        index += 1
      }
      continue
    }
    if ((code >= 0xdc00 && code <= 0xdfff) || isForbidden(code)) continue
    result += value[index]
  }
  return result
}

/**
 * Headline text as it is set: Unicode-normalised, every kind of typed line break (Word's
 * vertical tab, U+2028 and friends) turned into a new line, spaces collapsed, blank lines dropped.
 */
export function normaliseHeadline(value: string) {
  const unified = Array.from(value.normalize('NFC').replace(/\r\n/g, '\n'), (character) =>
    LINE_BREAKS.has(character.codePointAt(0) ?? 0) ? '\n' : character).join('')
  return cleanText(unified).split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
}

export const normaliseEyebrow = (value: string) => cleanText(value.normalize('NFC')).replace(/\s+/g, ' ').trim().toLocaleUpperCase()

const bareWord = (word: string) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.]+$/gu, '').toLocaleLowerCase()

/** Upper-cases the first letter only when the word starts with a lowercase letter, so "3rd" and "90s" stay as typed. */
const capitalise = (word: string) => word.replace(/^([^\p{L}\p{N}]*)(\p{Ll})/u, (_match, lead: string, letter: string) => lead + letter.toLocaleUpperCase())

/** True when a word (after title casing) starts in lowercase, i.e. it is one of the minor words. */
export const startsLowercase = (word: string) => /^[^\p{L}\p{N}]*\p{Ll}/u.test(word)

/**
 * Converts lowercase words to title case without ever lowercasing anything the writer
 * capitalised on purpose, so "iPhone", "RTÉ" or a deliberate "Is" survive. Typed line
 * breaks are layout, not grammar: the first and last word are those of the whole headline.
 */
export function toTitleCase(text: string) {
  const tokens = text.split(/(\s+)/)
  const words = tokens.map((token, index) => (/\S/.test(token) ? index : -1)).filter((index) => index >= 0)
  const first = words[0]
  const last = words[words.length - 1]
  let afterBreak = false

  return tokens.map((token, index) => {
    if (!/\S/.test(token)) return token
    const startsTitle = index === first || index === last || afterBreak
    afterBreak = /[:–—?!]$/.test(token) || token === '-'
    // Leave words that already contain a capital, or no lowercase letters, untouched.
    if (/\p{Lu}/u.test(token) || !/\p{Ll}/u.test(token)) return token
    if (!startsTitle && MINOR_WORDS.has(bareWord(token))) return token
    // Hyphenated compounds keep short function words lowercase after the first part: "State-of-the-Art".
    return token.split('-').map((part, partIndex) => (partIndex > 0 && MINOR_WORDS.has(bareWord(part)) ? part : capitalise(part))).join('-')
  }).join('')
}

/** True when the headline was typed in capitals (two or more letters, none lowercase). */
export function isAllCaps(value: string) {
  const letters = value.match(/\p{L}/gu)?.join('') ?? ''
  return letters.length > 1 && letters === letters.toLocaleUpperCase() && letters !== letters.toLocaleLowerCase()
}

/** The text actually set on the artwork for a given style. */
export function displayText(text: string, style: 'headline' | 'feature', titleCase: boolean) {
  if (style === 'feature') return text.toLocaleUpperCase()
  return titleCase ? toTitleCase(text) : text
}
