import type { Furniture, LogoSide } from './furniture'

/** What a finished cover carries besides its headline: the logo, the swipe prompt, and a darkened photo. */
export interface CoverOptions extends Furniture {
  darken: boolean
}

export const COVER_KEY = 'tape-type-cover-v1'
export const coverDefaults: CoverOptions = { logo: 'right', swipe: true, darken: true }

const LOGO_SIDES: readonly LogoSide[] = ['off', 'left', 'right']

/** Stored options are untrusted, like the generator settings. */
export function sanitizeCover(stored: Record<string, unknown>): CoverOptions {
  const flag = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback
  return {
    logo: LOGO_SIDES.includes(stored.logo as LogoSide) ? stored.logo as LogoSide : coverDefaults.logo,
    swipe: flag(stored.swipe, coverDefaults.swipe),
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
