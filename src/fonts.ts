import barlowLatin from '@fontsource/barlow/files/barlow-latin-700-normal.woff2?url'
import barlowLatinExt from '@fontsource/barlow/files/barlow-latin-ext-700-normal.woff2?url'
import { FONT_FAMILY, FONT_WEIGHT } from './artwork'

// Same subsets and ranges as the Fontsource CSS the app itself uses.
const subsets = [
  { url: barlowLatin, range: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD', test: null },
  { url: barlowLatinExt, range: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF', test: /[Ā-˿ᴀ-ᶿḀ-ỿⱠ-Ɀ꜠-ꟿ]/ },
]

let loaded: Promise<string[]> | null = null
let cached: string[] | null = null

async function toDataUrl(url: string) {
  const blob = await fetch(url).then((response) => {
    if (!response.ok) throw new Error(`Font request failed: ${response.status}`)
    return response.blob()
  })
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;,]*/, 'data:font/woff2'))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Starts fetching the export fonts early, so copy/export clicks never have to wait on the network. */
export function preloadEmbeddedFonts() {
  loaded ??= Promise.all(subsets.map((subset) => toDataUrl(subset.url)))
    .then((urls) => (cached = urls))
    .catch(() => (cached = []))
  return loaded
}

/**
 * @font-face rules for the Barlow Bold subsets this text needs, or '' if the fonts
 * haven't loaded (the SVG then falls back to the named family, as before).
 */
export function embeddedFontCss(text: string) {
  if (!cached?.length) return ''
  return subsets
    .map((subset, index) => ({ ...subset, data: cached?.[index] }))
    .filter((subset) => subset.data && (!subset.test || subset.test.test(text)))
    .map((subset) => `@font-face{font-family:'${FONT_FAMILY}';font-style:normal;font-weight:${FONT_WEIGHT};src:url(${subset.data}) format('woff2');unicode-range:${subset.range}}`)
    .join('')
}
