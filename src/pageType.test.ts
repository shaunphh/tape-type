import { describe, expect, it } from 'vitest'
import { PAGE_TYPE } from './inside'
import { describePageType, isLocal, loadPageType, readPageType, sameType, sanitizePageType } from './pageType'

describe('trying other sizes and weights', () => {
  it('is for this machine only: the published tool keeps its own', () => {
    expect(isLocal('localhost', false)).toBe(true)
    expect(isLocal('127.0.0.1', false)).toBe(true)
    expect(isLocal('tape.localhost', false)).toBe(true)
    expect(isLocal('shaunphh.github.io', false)).toBe(false)
    expect(isLocal('localhost.example.com', false)).toBe(false)
    // The dev server counts wherever it is reached from, such as a phone on the same network.
    expect(isLocal('192.168.1.20', true)).toBe(true)
    expect(loadPageType(false)).toBe(PAGE_TYPE)
  })

  it('starts from the tool’s own sizes and weights', () => {
    expect(PAGE_TYPE).toEqual({
      title: { largest: 52, smallest: 45, weight: 700, lineHeight: 1.07 },
      text: { size: 38, large: 42, weight: 400, lineHeight: 1.2 },
      details: { size: 38, large: 42, weight: 400 },
      strong: { weight: 700 },
      semi: { weight: 600 },
      label: { size: 38, weight: 800 },
    })
    expect(sanitizePageType({})).toEqual(PAGE_TYPE)
    expect(sameType(sanitizePageType(JSON.parse(JSON.stringify(PAGE_TYPE))), PAGE_TYPE)).toBe(true)
  })

  it('keeps what was tried within bounds, and to weights the tool carries', () => {
    const tried = sanitizePageType({
      title: { largest: 400, smallest: 2, weight: 650, lineHeight: 3 },
      text: { size: '40', weight: 600, lineHeight: 1.256 },
      details: { size: 31.6, large: 900, weight: 300 },
      strong: { weight: 900 },
      semi: { weight: 650 },
      label: 'big',
    })
    expect(tried.title).toEqual({ largest: 120, smallest: 36, weight: 700, lineHeight: 1.4 })
    expect(tried.text).toEqual({ size: 38, large: 42, weight: 600, lineHeight: 1.26 })
    expect(tried.details).toEqual({ size: 32, large: 60, weight: PAGE_TYPE.details.weight })
    expect(tried.strong).toEqual({ weight: 900 })
    expect(tried.semi).toEqual({ weight: 600 })
    expect(tried.label).toEqual(PAGE_TYPE.label)
    // The smallest title is never the larger of the two.
    expect(sanitizePageType({ title: { largest: 60, smallest: 80 } }).title).toMatchObject({ largest: 60, smallest: 60 })
  })

  it('says what is set in words, for passing on', () => {
    expect(describePageType(PAGE_TYPE)).toBe([
      'Title: 52px down to 45px, Bold 700, line height 1.07',
      'Text: 38px or 42px, Regular 400, line height 1.2',
      'Highlight: 38px or 42px, Regular 400',
      'Words in two stars: Bold 700',
      'Words in one star: SemiBold 600',
      'Label: 38px, ExtraBold 800',
    ].join('\n'))
  })

  it('drops a trial once the tool’s own values are no longer the ones it started from', () => {
    const tried = { ...PAGE_TYPE, text: { ...PAGE_TYPE.text, size: 34 } }
    expect(readPageType({ from: PAGE_TYPE, type: tried })).toEqual(tried)
    // A trial from before the tool's values changed, or one kept without them, has done its job.
    const before = { ...PAGE_TYPE, title: { ...PAGE_TYPE.title, largest: 69 } }
    expect(readPageType({ from: before, type: tried })).toBe(PAGE_TYPE)
    expect(readPageType(tried)).toBe(PAGE_TYPE)
    expect(readPageType(null)).toBe(PAGE_TYPE)
    expect(readPageType('nonsense')).toBe(PAGE_TYPE)
  })
})
