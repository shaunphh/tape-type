// Short function words stay lowercase inside a title (AP-style), matching headlines
// such as "How to Make the Most of a Weekend Visit to Dublin".
const MINOR_WORDS = new Set([
  'a', 'an', 'the',
  'and', 'but', 'or', 'nor', 'for', 'yet', 'so',
  'as', 'at', 'by', 'in', 'of', 'off', 'on', 'per', 'to', 'up', 'via', 'vs', 'vs.',
])

const capitaliseFirstLetter = (word: string) => word.replace(/\p{Ll}/u, (letter) => letter.toLocaleUpperCase())

/**
 * Converts lowercase words to title case without ever lowercasing anything the
 * writer capitalised on purpose, so "iPhone", "RTÉ" or a deliberate "Is" survive.
 */
export function toTitleCase(text: string) {
  return text.split('\n').map((line) => {
    const tokens = line.split(/(\s+)/)
    const wordIndexes = tokens.map((token, index) => (/\S/.test(token) ? index : -1)).filter((index) => index >= 0)
    const first = wordIndexes[0]
    const last = wordIndexes[wordIndexes.length - 1]
    let afterBreak = false

    return tokens.map((token, index) => {
      if (!/\S/.test(token)) return token
      const startsTitle = index === first || index === last || afterBreak
      afterBreak = /[:–—?!]$/.test(token) || token === '-'
      // Leave words that already contain a capital, or no lowercase letters, untouched.
      if (/\p{Lu}/u.test(token) || !/\p{Ll}/u.test(token)) return token
      const bare = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.]+$/gu, '').toLocaleLowerCase()
      if (!startsTitle && MINOR_WORDS.has(bare)) return token
      return token.split('-').map(capitaliseFirstLetter).join('-')
    }).join('')
  }).join('\n')
}

/** The text actually set on the artwork for a given style. */
export function displayText(text: string, style: 'headline' | 'feature', titleCase: boolean) {
  if (style === 'feature') return text.toLocaleUpperCase()
  return titleCase ? toTitleCase(text) : text
}
