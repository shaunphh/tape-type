import { BRAND, type Position } from './artwork'
import type { ColourChoice } from './furniture'
import { POST_FRAME, SAFE_MARGIN, stylePresets, type Frame, type Treatment } from './settings'
import type { CoverFormat, CoverStyle } from './types'

export type CoverKind = 'post' | 'video'
export type VideoType = 'report' | 'presenter' | 'feature'

/**
 * What the profile grid keeps of a video cover. Tiles are 3:4 and show the middle of the 9:16
 * cover, so the top and bottom 240px are cut off there.
 */
export const GRID_CROP = { top: 240, bottom: 1680 }

/**
 * A video cover is 1080 × 1920. Its lettering stays inside what the grid shows; the logo and the
 * arrow sit in the corners of the whole cover.
 */
export const VIDEO_FRAME: Frame = {
  width: 1080,
  height: 1920,
  safe: { left: SAFE_MARGIN, top: GRID_CROP.top + SAFE_MARGIN, right: 1080 - SAFE_MARGIN, bottom: GRID_CROP.bottom - SAFE_MARGIN },
}

/** How one kind of cover sets its text block: the choices it is held to for now. */
export interface Look {
  label: string
  description: string
  style: CoverStyle
  coverFormat: CoverFormat
  treatment: Treatment
  /** The tag's colours, where it isn't the usual yellow one. */
  tag?: { tape: string; text: string }
  /** The tag a cover of this kind starts with, or null for none. */
  eyebrow: string | null
  /** Where the text block starts out, across the room lettering has. */
  position: Position
}

// The narrow column is switched off for now, so every look starts in the medium one.
const house: Treatment = { ...stylePresets.headline, column: 'medium' }

/** Posts: black words on a light block of tape, rough cut, left aligned. */
export const POST_LOOK: Look = {
  label: 'Post',
  description: 'Light tape · black words',
  style: 'headline',
  coverFormat: 'regular',
  treatment: { ...house, mode: 'rough' },
  eyebrow: 'Breaking',
  position: { x: 0, y: 50 },
}

/** The three kinds of video, as on the cover mock-ups. */
export const VIDEO_LOOKS: Record<VideoType, Look> = {
  report: {
    label: 'Quick report',
    description: 'Yellow tape · bottom left',
    style: 'headline',
    coverFormat: 'regular',
    treatment: { ...house, tone: 'yellow' },
    tag: { tape: BRAND.dark, text: BRAND.light },
    eyebrow: 'Quick watch',
    position: { x: 0, y: 100 },
  },
  presenter: {
    label: 'Presenter led',
    description: 'Dark tape · top left',
    style: 'headline',
    coverFormat: 'regular',
    treatment: { ...house, tone: 'dark' },
    tag: { tape: BRAND.light, text: BRAND.dark },
    eyebrow: 'Quick guide',
    position: { x: 0, y: 0 },
  },
  feature: {
    label: 'Feature video',
    description: 'Capitals · light tape',
    style: 'feature',
    coverFormat: 'regular',
    treatment: house,
    eyebrow: null,
    position: { x: 0, y: 50 },
  },
}

/** The eyebrow tag in each brand colour, with lettering that reads on it. */
export const TAGS: Record<Exclude<ColourChoice, 'auto'>, { tape: string; text: string }> = {
  yellow: { tape: BRAND.yellow, text: BRAND.dark },
  light: { tape: BRAND.light, text: BRAND.dark },
  dark: { tape: BRAND.dark, text: BRAND.light },
}

/** The tag's colours: the chosen ones, or the look's own (undefined where that is the usual yellow). */
export const tagFor = (choice: ColourChoice, look: Look) => (choice === 'auto' ? look.tag : TAGS[choice])

export const VIDEO_TYPES = Object.keys(VIDEO_LOOKS) as VideoType[]
export const frameFor = (kind: CoverKind) => (kind === 'video' ? VIDEO_FRAME : POST_FRAME)
export const lookFor = (kind: CoverKind, video: VideoType) => (kind === 'video' ? VIDEO_LOOKS[video] : POST_LOOK)
