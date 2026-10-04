import { describe, expect, it } from 'vitest'
import tokens from './ad-tokens.json'
import { AD_COLOR, AD_SIZE, AD_SPACE, AD_TYPE, adNumber, adStyle, toolWeight } from './adTokens'

describe('the shared AD tokens', () => {
  it('hold the values decided on 2 October 2026', () => {
    expect(AD_COLOR).toEqual({ yellow: '#FFED1F', light: '#F0F0F0', dark: '#101010', greyOnDark: '#C2C2C2', greyOnLight: '#4B4A4A', meta: '#7F7C7C' })
    expect(AD_TYPE.storyTitle).toMatchObject({ weight: 168, stem: 168, size: 52 })
    expect(AD_TYPE.label).toMatchObject({ weight: 800, stem: 166, size: 38 })
    expect(AD_TYPE.body).toMatchObject({ weight: 400, size: 38, lineHeight: 1.3 })
    // 5 October 2026: the footer went Condensed and up to 36px, as the team's Canva pages set it.
    expect(AD_TYPE.footer).toMatchObject({ weight: 700, size: 36, condensed: true })
    expect(AD_TYPE.footer.lineHeight * AD_TYPE.footer.size).toBeCloseTo(40)
    expect(adStyle('guide-meta')).toMatchObject({ condensed: true, size: 42 })
    expect(AD_TYPE.body.condensed).toBe(false)
    // Guide Studio's story pages: a smaller title and picture, so the team's stories fit under two-line titles.
    expect(adStyle('story-title-carousel')).toMatchObject({ size: 64, stem: 168 })
    expect(adNumber('spacing', 'picture-height-carousel')).toBe(500)
    expect(AD_SPACE).toEqual({ safeCover: 80, marginInside: 56, pictureHeight: 540 })
    expect(AD_SIZE).toEqual({ logoCover: 210, logoInside: 128, arrow: 100 })
  })

  it('write weights on the variable font scale, read as the tools write them', () => {
    expect([toolWeight(71), toolWeight(141), toolWeight(166), toolWeight(168)]).toEqual([400, 700, 800, 168])
  })

  // The same file is the design system page's tokens.json, which reads lists, one name each.
  it('keep the design system page format: lists of named tokens, every name once, colours as hex', () => {
    const families = Object.entries(tokens).filter(([key, family]) => key !== 'type' && typeof family === 'object' && family !== null && 'tokens' in family)
    expect(families.map(([key]) => key)).toEqual(['color', 'spacing', 'size', 'weight', 'opacity', 'tape'])
    const names = families.flatMap(([, family]) => (family as { tokens: { name: string }[] }).tokens.map((token) => token.name))
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) expect(name).toMatch(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/)
    for (const token of tokens.color.tokens) expect(token.value).toMatch(/^#[0-9a-f]{6}$/)
    for (const family of families) for (const token of (family[1] as { tokens: { usage?: string }[] }).tokens) expect(token.usage?.length).toBeGreaterThan(20)
  })
})
