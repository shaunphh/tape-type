import { describe, expect, it } from 'vitest'
import { coverDefaults, sanitizeCover } from './cover'
import { LOCKED, applyLocks, isLocked } from './locks'
import { defaults, stylePresets } from './settings'
import type { GeneratorSettings } from './types'

describe('locked choices', () => {
  it('switches off everything but the one house look, and leaves the cut styles open', () => {
    expect(isLocked('style', 'feature', false)).toBe(true)
    expect(isLocked('style', 'headline', false)).toBe(false)
    expect((['dark', 'yellow', 'none'] as const).every((tone) => isLocked('tone', tone, false))).toBe(true)
    expect(isLocked('tone', 'light', false)).toBe(false)
    expect(isLocked('perLine', true, false)).toBe(true)
    expect(isLocked('perLine', false, false)).toBe(false)
    expect(isLocked('align', 'center', false)).toBe(true)
    expect(isLocked('align', 'right', false)).toBe(true)
    expect(isLocked('align', 'left', false)).toBe(false)
    expect(isLocked('coverFormat', 'series', false)).toBe(true)
    expect(Object.keys(LOCKED)).not.toContain('mode')
  })

  it('never locks a default, so the house look is always reachable', () => {
    for (const setting of Object.keys(LOCKED) as (keyof typeof LOCKED)[]) {
      expect(isLocked(setting, defaults[setting], false), setting).toBe(false)
    }
    expect(applyLocks(defaults, false)).toEqual(defaults)
  })

  it('puts settings saved before the locks back to the house look, keeping the words and the cut', () => {
    const saved: GeneratorSettings = { ...defaults, ...stylePresets.feature, style: 'feature', tone: 'yellow', coverFormat: 'series', headline: 'Kept', seed: 42 }
    const next = applyLocks(saved, false)
    expect(next).toMatchObject({ ...stylePresets.headline, style: 'headline', tone: 'light', coverFormat: 'regular', headline: 'Kept', seed: 42 })
    const cut: GeneratorSettings = { ...defaults, mode: 'torn', align: 'right', perLine: true, column: 'wide' }
    expect(applyLocks(cut, false)).toMatchObject({ mode: 'torn', align: 'left', perLine: false, column: 'wide' })
  })

  it('leaves everything alone when unlocked', () => {
    const saved: GeneratorSettings = { ...defaults, style: 'feature', tone: 'dark', align: 'center' }
    expect(applyLocks(saved, true)).toBe(saved)
    expect(isLocked('style', 'feature', true)).toBe(false)
  })
})

describe('cover options', () => {
  it('start with the logo, the swipe prompt and a darkened photo', () => {
    expect(coverDefaults).toEqual({ logo: 'right', swipe: true, darken: true })
  })

  it('replaces invalid stored values instead of trusting them', () => {
    expect(sanitizeCover({ logo: 'middle', swipe: 'yes', darken: 0 })).toEqual(coverDefaults)
    expect(sanitizeCover({ logo: 'left', swipe: false, darken: false })).toEqual({ logo: 'left', swipe: false, darken: false })
    expect(sanitizeCover({})).toEqual(coverDefaults)
  })
})
