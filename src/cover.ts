import { VIDEO_TYPES, type CoverKind, type VideoType } from './formats'
import type { ColourChoice, Furniture, LogoSide } from './furniture'

/** What is being made, and what it carries besides its headline: the logo, the swipe arrow, and a darkened photo. */
export interface CoverOptions extends Furniture {
  kind: CoverKind
  /** Which page of a post is being made: its cover, or the page inside. */
  page: 'cover' | 'inside'
  /** The kind of video, kept while a post is being made. */
  video: VideoType
  darken: boolean
}

export const COVER_KEY = 'tape-type-cover-v1'
export const coverDefaults: CoverOptions = { kind: 'post', page: 'cover', video: 'report', logo: 'right', logoColour: 'auto', arrow: true, arrowColour: 'auto', darken: true }

const LOGO_SIDES: readonly LogoSide[] = ['off', 'left', 'right']
const COLOUR_CHOICES: readonly ColourChoice[] = ['auto', 'yellow', 'light', 'dark']

/** Stored options are untrusted, like the generator settings. */
export function sanitizeCover(stored: Record<string, unknown>): CoverOptions {
  const flag = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback
  const colour = (value: unknown, fallback: ColourChoice) => COLOUR_CHOICES.includes(value as ColourChoice) ? value as ColourChoice : fallback
  return {
    kind: stored.kind === 'video' ? 'video' : 'post',
    page: stored.page === 'inside' ? 'inside' : 'cover',
    video: VIDEO_TYPES.includes(stored.video as VideoType) ? stored.video as VideoType : coverDefaults.video,
    logo: LOGO_SIDES.includes(stored.logo as LogoSide) ? stored.logo as LogoSide : coverDefaults.logo,
    logoColour: colour(stored.logoColour, coverDefaults.logoColour),
    arrow: flag(stored.arrow, coverDefaults.arrow),
    arrowColour: colour(stored.arrowColour, coverDefaults.arrowColour),
    darken: flag(stored.darken, coverDefaults.darken),
  }
}

export function loadCover(): CoverOptions {
  try {
    const stored = JSON.parse(localStorage.getItem(COVER_KEY) ?? 'null')
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? sanitizeCover(stored) : coverDefaults
  } catch {
    return coverDefaults
  }
}

export function saveCover(cover: CoverOptions) {
  try {
    localStorage.setItem(COVER_KEY, JSON.stringify(cover))
  } catch {
    // Blocked storage only costs remembering these choices.
  }
}
