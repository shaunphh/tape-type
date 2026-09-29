import { defaults, stylePresets } from './settings'
import type { GeneratorSettings } from './types'

/**
 * Choices that are switched off for now, while every cover keeps to the one house look: black
 * words on a light block of tape, left aligned. They stay on the page, greyed out, so people can
 * see what is coming. To open one up again, take it off this list.
 */
export const LOCKED = {
  style: ['feature'],
  tone: ['dark', 'yellow', 'none'],
  perLine: [true],
  align: ['center', 'right'],
  coverFormat: ['series'],
} as const satisfies { [K in keyof GeneratorSettings]?: readonly GeneratorSettings[K][] }

export type LockedSetting = keyof typeof LOCKED

/** Opening the tool with ?unlocked in the address lifts every lock. */
export const unlocked = () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('unlocked')

export const isLocked = <K extends LockedSetting>(setting: K, value: GeneratorSettings[K], open = unlocked()) =>
  !open && (LOCKED[setting] as readonly unknown[]).includes(value)

/** Settings saved before the locks went on can hold a locked choice: those go back to the house look. */
export function applyLocks(settings: GeneratorSettings, open = unlocked()): GeneratorSettings {
  if (open) return settings
  let next = settings
  // A locked style takes its whole treatment (strips, centring, torn ends) with it.
  if (isLocked('style', next.style, open)) next = { ...next, ...stylePresets[defaults.style], style: defaults.style }
  for (const setting of Object.keys(LOCKED) as LockedSetting[]) {
    if (isLocked(setting, next[setting], open)) next = { ...next, [setting]: defaults[setting] }
  }
  return next
}
