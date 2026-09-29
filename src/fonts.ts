import regular from '@fontsource/barlow/files/barlow-latin-400-normal.woff2?url'
import regularExt from '@fontsource/barlow/files/barlow-latin-ext-400-normal.woff2?url'
import regularVietnamese from '@fontsource/barlow/files/barlow-vietnamese-400-normal.woff2?url'
import medium from '@fontsource/barlow/files/barlow-latin-500-normal.woff2?url'
import mediumExt from '@fontsource/barlow/files/barlow-latin-ext-500-normal.woff2?url'
import mediumVietnamese from '@fontsource/barlow/files/barlow-vietnamese-500-normal.woff2?url'
import semibold from '@fontsource/barlow/files/barlow-latin-600-normal.woff2?url'
import semiboldExt from '@fontsource/barlow/files/barlow-latin-ext-600-normal.woff2?url'
import semiboldVietnamese from '@fontsource/barlow/files/barlow-vietnamese-600-normal.woff2?url'
import bold from '@fontsource/barlow/files/barlow-latin-700-normal.woff2?url'
import boldExt from '@fontsource/barlow/files/barlow-latin-ext-700-normal.woff2?url'
import boldVietnamese from '@fontsource/barlow/files/barlow-vietnamese-700-normal.woff2?url'
import extrabold from '@fontsource/barlow/files/barlow-latin-800-normal.woff2?url'
import extraboldExt from '@fontsource/barlow/files/barlow-latin-ext-800-normal.woff2?url'
import extraboldVietnamese from '@fontsource/barlow/files/barlow-vietnamese-800-normal.woff2?url'
import black from '@fontsource/barlow/files/barlow-latin-900-normal.woff2?url'
import blackExt from '@fontsource/barlow/files/barlow-latin-ext-900-normal.woff2?url'
import blackVietnamese from '@fontsource/barlow/files/barlow-vietnamese-900-normal.woff2?url'
import regularItalic from '@fontsource/barlow/files/barlow-latin-400-italic.woff2?url'
import regularItalicExt from '@fontsource/barlow/files/barlow-latin-ext-400-italic.woff2?url'
import regularItalicVietnamese from '@fontsource/barlow/files/barlow-vietnamese-400-italic.woff2?url'
import mediumItalic from '@fontsource/barlow/files/barlow-latin-500-italic.woff2?url'
import mediumItalicExt from '@fontsource/barlow/files/barlow-latin-ext-500-italic.woff2?url'
import mediumItalicVietnamese from '@fontsource/barlow/files/barlow-vietnamese-500-italic.woff2?url'
import semiboldItalic from '@fontsource/barlow/files/barlow-latin-600-italic.woff2?url'
import semiboldItalicExt from '@fontsource/barlow/files/barlow-latin-ext-600-italic.woff2?url'
import semiboldItalicVietnamese from '@fontsource/barlow/files/barlow-vietnamese-600-italic.woff2?url'
import boldItalic from '@fontsource/barlow/files/barlow-latin-700-italic.woff2?url'
import boldItalicExt from '@fontsource/barlow/files/barlow-latin-ext-700-italic.woff2?url'
import boldItalicVietnamese from '@fontsource/barlow/files/barlow-vietnamese-700-italic.woff2?url'
import extraboldItalic from '@fontsource/barlow/files/barlow-latin-800-italic.woff2?url'
import extraboldItalicExt from '@fontsource/barlow/files/barlow-latin-ext-800-italic.woff2?url'
import extraboldItalicVietnamese from '@fontsource/barlow/files/barlow-vietnamese-800-italic.woff2?url'
import blackItalic from '@fontsource/barlow/files/barlow-latin-900-italic.woff2?url'
import blackItalicExt from '@fontsource/barlow/files/barlow-latin-ext-900-italic.woff2?url'
import blackItalicVietnamese from '@fontsource/barlow/files/barlow-vietnamese-900-italic.woff2?url'
import { FONT_FAMILY } from './artwork'

// The same subsets and unicode ranges as the Fontsource CSS the page itself uses.
const RANGES = {
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  vietnamese: 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
}
type Subset = keyof typeof RANGES

const FACES: { weight: number; subset: Subset; url: string; italic?: boolean }[] = [
  { weight: 400, subset: 'latin', url: regular },
  { weight: 400, subset: 'latin-ext', url: regularExt },
  { weight: 400, subset: 'vietnamese', url: regularVietnamese },
  { weight: 500, subset: 'latin', url: medium },
  { weight: 500, subset: 'latin-ext', url: mediumExt },
  { weight: 500, subset: 'vietnamese', url: mediumVietnamese },
  // SemiBold and ExtraBold are only set when other weights are being tried on the inside page.
  { weight: 600, subset: 'latin', url: semibold },
  { weight: 600, subset: 'latin-ext', url: semiboldExt },
  { weight: 600, subset: 'vietnamese', url: semiboldVietnamese },
  { weight: 700, subset: 'latin', url: bold },
  { weight: 700, subset: 'latin-ext', url: boldExt },
  { weight: 700, subset: 'vietnamese', url: boldVietnamese },
  { weight: 800, subset: 'latin', url: extrabold },
  { weight: 800, subset: 'latin-ext', url: extraboldExt },
  { weight: 800, subset: 'vietnamese', url: extraboldVietnamese },
  { weight: 900, subset: 'latin', url: black },
  { weight: 900, subset: 'latin-ext', url: blackExt },
  { weight: 900, subset: 'vietnamese', url: blackVietnamese },
  // Italics are only set on the inside page, where words are put in underscores.
  { weight: 400, subset: 'latin', url: regularItalic, italic: true },
  { weight: 400, subset: 'latin-ext', url: regularItalicExt, italic: true },
  { weight: 400, subset: 'vietnamese', url: regularItalicVietnamese, italic: true },
  { weight: 500, subset: 'latin', url: mediumItalic, italic: true },
  { weight: 500, subset: 'latin-ext', url: mediumItalicExt, italic: true },
  { weight: 500, subset: 'vietnamese', url: mediumItalicVietnamese, italic: true },
  { weight: 600, subset: 'latin', url: semiboldItalic, italic: true },
  { weight: 600, subset: 'latin-ext', url: semiboldItalicExt, italic: true },
  { weight: 600, subset: 'vietnamese', url: semiboldItalicVietnamese, italic: true },
  { weight: 700, subset: 'latin', url: boldItalic, italic: true },
  { weight: 700, subset: 'latin-ext', url: boldItalicExt, italic: true },
  { weight: 700, subset: 'vietnamese', url: boldItalicVietnamese, italic: true },
  { weight: 800, subset: 'latin', url: extraboldItalic, italic: true },
  { weight: 800, subset: 'latin-ext', url: extraboldItalicExt, italic: true },
  { weight: 800, subset: 'vietnamese', url: extraboldItalicVietnamese, italic: true },
  { weight: 900, subset: 'latin', url: blackItalic, italic: true },
  { weight: 900, subset: 'latin-ext', url: blackItalicExt, italic: true },
  { weight: 900, subset: 'vietnamese', url: blackItalicVietnamese, italic: true },
]

const parsedRanges = Object.fromEntries(Object.entries(RANGES).map(([subset, range]) => [
  subset,
  range.split(',').map((part) => {
    const [low, high] = part.replace('U+', '').split('-')
    return [parseInt(low, 16), parseInt(high ?? low, 16)] as const
  }),
])) as Record<Subset, (readonly [number, number])[]>

export interface TextRun {
  text: string
  weight: number
  italic?: boolean
}

const covers = (subset: Subset, text: string) => [...text].some((character) => {
  const code = character.codePointAt(0) ?? 0
  return parsedRanges[subset].some(([low, high]) => code >= low && code <= high)
})

/** The font files an export of these runs needs, chosen the way the browser chooses them: by unicode-range. */
export const facesFor = (runs: TextRun[]) =>
  FACES.filter((face) => runs.some((run) => run.weight === face.weight && Boolean(run.italic) === Boolean(face.italic) && covers(face.subset, run.text)))

const pending = new Map<string, Promise<string>>()
const loaded = new Map<string, string>()

function load(url: string) {
  let request = pending.get(url)
  if (!request) {
    request = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Font request failed: ${response.status}`)
        return response.blob()
      })
      .then((blob) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).replace(/^data:[^;,]*/, 'data:font/woff2'))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      }))
      .then((data) => {
        loaded.set(url, data)
        return data
      })
    // A failed request is forgotten, so the next export tries again.
    request.catch(() => pending.delete(url))
    pending.set(url, request)
  }
  return request
}

const fontFace = (face: (typeof FACES)[number], data: string) =>
  `@font-face{font-family:'${FONT_FAMILY}';font-style:${face.italic ? 'italic' : 'normal'};font-weight:${face.weight};src:url(${data}) format('woff2');unicode-range:${RANGES[face.subset]}}`

/** Starts fetching the files these runs need, so exports rarely have to wait. */
export function preloadEmbeddedFonts(runs: TextRun[]) {
  for (const face of facesFor(runs)) load(face.url).catch(() => undefined)
}

/** @font-face rules for these runs if every file they need is already loaded, otherwise null. */
export function embeddedFontCssNow(runs: TextRun[]) {
  const faces = facesFor(runs)
  if (!faces.every((face) => loaded.has(face.url))) return null
  return faces.map((face) => fontFace(face, loaded.get(face.url) as string)).join('')
}

/**
 * @font-face rules for these runs, loading whatever is missing. `missing` is true when a file
 * couldn't be fetched: the SVG then names Barlow without carrying it for those letters.
 */
export async function embeddedFontCss(runs: TextRun[]) {
  const faces = facesFor(runs)
  const results = await Promise.allSettled(faces.map((face) => load(face.url)))
  const css = faces.map((face, index) => {
    const result = results[index]
    return result.status === 'fulfilled' ? fontFace(face, result.value) : ''
  }).join('')
  return { css, missing: results.some((result) => result.status === 'rejected') }
}
