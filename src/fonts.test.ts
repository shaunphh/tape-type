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
  })

  it('has nothing ready before the files load', () => {
    expect(embeddedFontCssNow([{ text: 'Dublin', weight: 700 }])).toBeNull()
  })
})
