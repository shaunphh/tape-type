import type { ColourChoice, Furniture, LogoSide } from './furniture'

/** What a finished cover carries besides its headline: the logo, the swipe arrow, and a darkened photo. */
export interface CoverOptions extends Furniture {
  darken: boolean
}

export const COVER_KEY = 'tape-type-cover-v1'
export const coverDefaults: CoverOptions = { logo: 'right', logoColour: 'auto', arrow: true, arrowColour: 'auto', darken: true }

const LOGO_SIDES: readonly LogoSide[] = ['off', 'left', 'right']
const COLOUR_CHOICES: readonly ColourChoice[] = ['auto', 'yellow', 'light', 'dark']

/** Stored options are untrusted, like the generator settings. */
export function sanitizeCover(stored: Record<string, unknown>): CoverOptions {
  const flag = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback
  const colour = (value: unknown, fallback: ColourChoice) => COLOUR_CHOICES.includes(value as ColourChoice) ? value as ColourChoice : fallback
  return {
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
