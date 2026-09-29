import type { Look } from './formats'
import type { GeneratorSettings } from './types'

/**
 * The text block's choices that are held to the cover's look for now (a post's is black words on
 * a light block of tape, left aligned; each kind of video has its own). Every other value of
 * these stays on the page, greyed out, so people can see what is coming. To open one up again,
 * take it off this list. Only the text block is held: photo, logo and arrow are free.
 */
export const HELD = ['style', 'tone', 'perLine', 'align', 'coverFormat'] as const
export type HeldSetting = (typeof HELD)[number]

/** Opening the tool with ?unlocked in the address lifts every lock. */
export const unlocked = () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('unlocked')

const lookValue = <K extends HeldSetting>(look: Look, setting: K) =>
  (setting === 'style' ? look.style : setting === 'coverFormat' ? look.coverFormat : look.treatment[setting as 'tone' | 'perLine' | 'align']) as GeneratorSettings[K]

export const isLocked = <K extends HeldSetting>(setting: K, value: GeneratorSettings[K], look: Look, open = unlocked()) =>
  !open && value !== lookValue(look, setting)

/** Settings saved before the locks went on, or under another look, are put back to this one. */
export function applyLocks(settings: GeneratorSettings, look: Look, open = unlocked()): GeneratorSettings {
  if (open) return settings
  // A different style takes its whole treatment (strips, centring, torn ends) with it.
  let next = settings.style === look.style ? settings : { ...settings, ...look.treatment, style: look.style }
  for (const setting of HELD) {
    if (next[setting] !== lookValue(look, setting)) next = { ...next, [setting]: lookValue(look, setting) }
  }
  return next
}
