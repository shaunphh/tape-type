import { describe, expect, it } from 'vitest'
import { PAGE_TYPE } from './inside'
import { describePageType, isLocal, loadPageType, sameType, sanitizePageType } from './pageType'

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
      title: { largest: 69, smallest: 52, weight: 700, lineHeight: 1.08 },
      text: { size: 38, weight: 500, lineHeight: 1.32 },
      details: { size: 38, weight: 400 },
      strong: { weight: 700 },
      label: { size: 45, weight: 700 },
    })
    expect(sanitizePageType({})).toEqual(PAGE_TYPE)
    expect(sameType(sanitizePageType(JSON.parse(JSON.stringify(PAGE_TYPE))), PAGE_TYPE)).toBe(true)
  })

  it('keeps what was tried within bounds, and to weights the tool carries', () => {
    const tried = sanitizePageType({
      title: { largest: 400, smallest: 2, weight: 650, lineHeight: 3 },
      text: { size: '40', weight: 600, lineHeight: 1.256 },
      details: { size: 31.6, weight: 300 },
      strong: { weight: 900 },
      label: 'big',
    })
    expect(tried.title).toEqual({ largest: 120, smallest: 36, weight: 700, lineHeight: 1.4 })
    expect(tried.text).toEqual({ size: 38, weight: 600, lineHeight: 1.26 })
    expect(tried.details).toEqual({ size: 32, weight: 400 })
    expect(tried.strong).toEqual({ weight: 900 })
    expect(tried.label).toEqual(PAGE_TYPE.label)
    // The smallest title is never the larger of the two.
    expect(sanitizePageType({ title: { largest: 60, smallest: 80 } }).title).toMatchObject({ largest: 60, smallest: 60 })
  })

  it('says what is set in words, for passing on', () => {
    expect(describePageType(PAGE_TYPE)).toBe([
      'Title: 69px down to 52px, Bold 700, line height 1.08',
      'Text: 38px, Medium 500, line height 1.32',
      'Details: 38px, Regular 400',
      'Bold lines: Bold 700',
      'Label: 45px, Bold 700',
    ].join('\n'))
  })
})
