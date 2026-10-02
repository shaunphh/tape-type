import { describe, expect, it } from 'vitest'
import { fontShorthand } from './artwork'
import { embeddedFontCssNow, facesFor } from './fonts'

const subsets = (runs: { text: string; weight: number }[]) => facesFor(runs).map((face) => `${face.weight} ${face.subset}`)

describe('embedded fonts', () => {
  it('leaves upright runs to the variable font, and picks static files for the rest by unicode range', () => {
    expect(subsets([{ text: 'How to Make the Most', weight: 700 }])).toEqual([])
    // The variable font has the Central European letters too.
    expect(subsets([{ text: 'Łódź Fest', weight: 700 }])).toEqual([])
    expect(subsets([{ text: 'Việt Nam', weight: 700 }])).toContain('700 vietnamese')
    expect(subsets([{ text: 'Price † ₹', weight: 700 }])).toContain('700 latin-ext')
    // Every weight of a run it can't draw has its static files.
    expect([400, 500, 600, 700, 800, 900].flatMap((weight) => subsets([{ text: 'Phở', weight }]))).toEqual([400, 500, 600, 700, 800, 900].flatMap((weight) => [`${weight} latin`, `${weight} vietnamese`]))
  })

  it('carries the italics on static files, apart from the uprights, for every weight', () => {
    const upright = facesFor([{ text: 'Dublin', weight: 400 }])
    const slanted = facesFor([{ text: 'Dublin', weight: 400, italic: true }])
    expect(upright).toHaveLength(0)
    expect(slanted).toHaveLength(1)
    expect(slanted[0]).toMatchObject({ weight: 400, subset: 'latin', italic: true })
    expect([400, 500, 600, 700, 800, 900].every((weight) => facesFor([{ text: 'Łódź', weight, italic: true }]).length === 2)).toBe(true)
    // A line with both needs the italic file alone; the upright comes from the variable font.
    expect(facesFor([{ text: 'Dublin', weight: 700 }, { text: 'Dublin', weight: 700, italic: true }])).toHaveLength(1)
  })

  it('names the variable font on the usual weights, and static Barlow where it has to', () => {
    expect(fontShorthand(90, 700, false, 'Dublin')).toBe('141 90px "Barlow GX"')
    expect(fontShorthand(38, 400)).toBe('71 38px "Barlow GX"')
    expect(fontShorthand(38, 800, false, 'MEET THE ARTISTS')).toBe('166 38px "Barlow GX"')
    expect(fontShorthand(38, 400, true, 'Dublin')).toBe('italic 400 38px "Barlow"')
    expect(fontShorthand(38, 400, false, 'Phở')).toBe('400 38px "Barlow"')
  })

  it('has nothing ready before the files load', () => {
    expect(embeddedFontCssNow([{ text: 'Dublin', weight: 700 }])).toBeNull()
  })
})
