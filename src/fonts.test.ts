import { describe, expect, it } from 'vitest'
import { embeddedFontCssNow, facesFor } from './fonts'

const subsets = (runs: { text: string; weight: number }[]) => facesFor(runs).map((face) => `${face.weight} ${face.subset}`)

describe('embedded fonts', () => {
  it('picks font files by unicode range, per weight', () => {
    expect(subsets([{ text: 'How to Make the Most', weight: 700 }])).toEqual(['700 latin'])
    expect(subsets([{ text: 'Łódź Fest', weight: 700 }])).toEqual(['700 latin', '700 latin-ext'])
    expect(subsets([{ text: 'Việt Nam', weight: 700 }])).toContain('700 vietnamese')
    expect(subsets([{ text: 'Price † ₹', weight: 700 }])).toContain('700 latin-ext')
    expect(subsets([{ text: 'YAMAMORI', weight: 900 }, { text: 'NEWS', weight: 700 }])).toEqual(['700 latin', '900 latin'])
    // Every weight that can be tried on the inside page has its files.
    expect([400, 500, 600, 700, 800, 900].flatMap((weight) => subsets([{ text: 'Dublin', weight }]))).toEqual(['400 latin', '500 latin', '600 latin', '700 latin', '800 latin', '900 latin'])
  })

  it('carries the italics apart from the uprights, for every weight', () => {
    const upright = facesFor([{ text: 'Dublin', weight: 400 }])
    const slanted = facesFor([{ text: 'Dublin', weight: 400, italic: true }])
    expect(upright).toHaveLength(1)
    expect(slanted).toHaveLength(1)
    expect(upright[0].italic).toBeFalsy()
    expect(slanted[0]).toMatchObject({ weight: 400, subset: 'latin', italic: true })
    expect(slanted[0].url).not.toBe(upright[0].url)
    expect([400, 500, 600, 700, 800, 900].every((weight) => facesFor([{ text: 'Łódź', weight, italic: true }]).length === 2)).toBe(true)
    // Both at once when a line has both.
    expect(facesFor([{ text: 'Dublin', weight: 700 }, { text: 'Dublin', weight: 700, italic: true }])).toHaveLength(2)
  })

  it('has nothing ready before the files load', () => {
    expect(embeddedFontCssNow([{ text: 'Dublin', weight: 700 }])).toBeNull()
  })
})
