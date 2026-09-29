import { describe, expect, it } from 'vitest'
import { coverDefaults, sanitizeCover } from './cover'
import { POST_LOOK, VIDEO_LOOKS } from './formats'
import { HELD, applyLocks, isBarred, isLocked } from './locks'
import { defaults, stylePresets } from './settings'
import type { GeneratorSettings } from './types'

describe('locked choices', () => {
  it('holds a post to the one house look, and leaves the cut styles open', () => {
    expect(isLocked('style', 'feature', POST_LOOK, false)).toBe(true)
    expect(isLocked('style', 'headline', POST_LOOK, false)).toBe(false)
    expect((['dark', 'yellow', 'none'] as const).every((tone) => isLocked('tone', tone, POST_LOOK, false))).toBe(true)
    expect(isLocked('tone', 'light', POST_LOOK, false)).toBe(false)
    expect(isLocked('perLine', true, POST_LOOK, false)).toBe(true)
    expect(isLocked('perLine', false, POST_LOOK, false)).toBe(false)
    expect(isLocked('align', 'center', POST_LOOK, false)).toBe(true)
    expect(isLocked('align', 'right', POST_LOOK, false)).toBe(true)
    expect(isLocked('align', 'left', POST_LOOK, false)).toBe(false)
    expect(isLocked('coverFormat', 'series', POST_LOOK, false)).toBe(true)
    expect(HELD).not.toContain('mode')
  })

  it('never locks a default of the settings it holds, so the house look is always reachable', () => {
    for (const setting of HELD) expect(isLocked(setting, defaults[setting], POST_LOOK, false), setting).toBe(false)
    expect(applyLocks(defaults, POST_LOOK, false)).toEqual({ ...defaults, column: 'medium' })
  })

  it('holds each kind of video to its own look', () => {
    expect(isLocked('tone', 'yellow', VIDEO_LOOKS.report, false)).toBe(false)
    expect(isLocked('tone', 'light', VIDEO_LOOKS.report, false)).toBe(true)
    expect(isLocked('tone', 'dark', VIDEO_LOOKS.presenter, false)).toBe(false)
    expect(isLocked('tone', 'yellow', VIDEO_LOOKS.presenter, false)).toBe(true)
    expect(isLocked('style', 'feature', VIDEO_LOOKS.feature, false)).toBe(false)
    expect(isLocked('style', 'headline', VIDEO_LOOKS.feature, false)).toBe(true)
    for (const look of Object.values(VIDEO_LOOKS)) {
      expect(isLocked('align', 'left', look, false)).toBe(false)
      expect(isLocked('perLine', true, look, false)).toBe(true)
    }
  })

  it('puts settings saved before the locks back to the house look, keeping the words and the cut', () => {
    const saved: GeneratorSettings = { ...defaults, ...stylePresets.feature, style: 'feature', tone: 'yellow', coverFormat: 'series', headline: 'Kept', seed: 42 }
    const next = applyLocks(saved, POST_LOOK, false)
    expect(next).toMatchObject({ ...stylePresets.headline, column: 'medium', style: 'headline', tone: 'light', coverFormat: 'regular', headline: 'Kept', seed: 42 })
    const cut: GeneratorSettings = { ...defaults, mode: 'torn', align: 'right', perLine: true, column: 'wide' }
    expect(applyLocks(cut, POST_LOOK, false)).toMatchObject({ mode: 'torn', align: 'left', perLine: false, column: 'wide' })
  })

  it('puts settings saved under another look into the one in use', () => {
    const post: GeneratorSettings = { ...defaults, mode: 'torn', headline: 'Kept' }
    expect(applyLocks(post, VIDEO_LOOKS.report, false)).toMatchObject({ tone: 'yellow', style: 'headline', mode: 'torn', headline: 'Kept' })
    expect(applyLocks(post, VIDEO_LOOKS.feature, false)).toMatchObject({ style: 'feature', tone: 'light', perLine: false, align: 'left' })
    const report = applyLocks(post, VIDEO_LOOKS.report, false)
    expect(applyLocks(report, POST_LOOK, false)).toMatchObject({ tone: 'light', mode: 'torn' })
  })

  it('switches off the narrow column, and moves covers saved in it to the medium one', () => {
    expect(isBarred('column', 'narrow', false)).toBe(true)
    expect(isBarred('column', 'medium', false)).toBe(false)
    expect(isBarred('column', 'wide', false)).toBe(false)
    expect(isBarred('column', 'narrow', true)).toBe(false)
    for (const look of [POST_LOOK, ...Object.values(VIDEO_LOOKS)]) {
      expect(look.treatment.column).toBe('medium')
      expect(applyLocks({ ...defaults, style: look.style, column: 'narrow' }, look, false).column).toBe('medium')
      // A wider column that was chosen is kept.
      expect(applyLocks({ ...defaults, style: look.style, column: 'wide' }, look, false).column).toBe('wide')
    }
    expect(applyLocks({ ...defaults, column: 'narrow' }, POST_LOOK, true).column).toBe('narrow')
  })

  it('leaves everything alone when unlocked', () => {
    const saved: GeneratorSettings = { ...defaults, style: 'feature', tone: 'dark', align: 'center' }
    expect(applyLocks(saved, POST_LOOK, true)).toBe(saved)
    expect(isLocked('style', 'feature', POST_LOOK, true)).toBe(false)
  })
})

describe('cover options', () => {
  it('start as a post with the logo, the swipe arrow and a darkened photo, colours picked automatically', () => {
    expect(coverDefaults).toEqual({ kind: 'post', video: 'report', logo: 'right', logoColour: 'auto', arrow: true, arrowColour: 'auto', darken: true })
  })

  it('replaces invalid stored values instead of trusting them', () => {
    expect(sanitizeCover({ kind: 'story', video: 'vlog', logo: 'middle', logoColour: 'pink', arrow: 'yes', arrowColour: 7, darken: 0 })).toEqual(coverDefaults)
    const chosen = { kind: 'video', video: 'presenter', logo: 'left', logoColour: 'light', arrow: false, arrowColour: 'dark', darken: false }
    expect(sanitizeCover(chosen)).toEqual(chosen)
    expect(sanitizeCover({})).toEqual(coverDefaults)
  })
})

describe('line height', () => {
  it('sets lines 0.94 of the type size apart, whatever the letters measure', async () => {
    const { LINE_HEIGHT, lockedLineGap } = await import('./locks')
    const { buildShape } = await import('./geometry')
    expect(LINE_HEIGHT).toBe(0.94)
    const cases = [
      { fontSize: 76, bounds: { ascent: 54, descent: 15 }, style: 'headline' as const },
      { fontSize: 90, bounds: { ascent: 65, descent: 18 }, style: 'headline' as const },
      // Capitals have no descenders, so their letters are shorter: the lines still sit 0.94 apart.
      { fontSize: 88, bounds: { ascent: 62, descent: 2 }, style: 'feature' as const },
    ]
    for (const { fontSize, bounds, style } of cases) {
      const lineGap = lockedLineGap(fontSize, bounds.ascent + bounds.descent)
      const shape = buildShape({ ...defaults, style, fontSize, lineGap }, ['One Line', 'And Another', 'And a Third'], [300, 420, 380], [], bounds)
      const baselines = shape.lines.map((line) => line.baseline)
      expect(baselines[1] - baselines[0]).toBeCloseTo(fontSize * 0.94, 6)
      expect(baselines[2] - baselines[1]).toBeCloseTo(fontSize * 0.94, 6)
    }
  })
})
