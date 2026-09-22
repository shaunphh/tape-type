import { describe, expect, it } from 'vitest'
import { cleanText, displayText, isAllCaps, normaliseEyebrow, normaliseHeadline, toTitleCase } from './text'

describe('title case', () => {
  it('capitalises major words and keeps short function words lowercase', () => {
    expect(toTitleCase('how to make the most of a weekend visit to dublin')).toBe('How to Make the Most of a Weekend Visit to Dublin')
    expect(toTitleCase('a protest in dublin is planned for tomorrow')).toBe('A Protest in Dublin Is Planned for Tomorrow')
  })

  it('always capitalises the first and last word, and the word after a colon or dash', () => {
    expect(toTitleCase('the one to watch: a guide to the city')).toBe('The One to Watch: A Guide to the City')
    expect(toTitleCase('where it all began – and where to')).toBe('Where It All Began – And Where To')
  })

  it('never lowercases deliberate capitals', () => {
    expect(toTitleCase('RTÉ confirms the iPhone ban is ON')).toBe('RTÉ Confirms the iPhone Ban Is ON')
    expect(toTitleCase('The Ravers Guide To Dublin')).toBe('The Ravers Guide To Dublin')
  })

  it('handles apostrophes, hyphens, quotes and line breaks', () => {
    expect(toTitleCase('dublin’s last late-night bus')).toBe('Dublin’s Last Late-Night Bus')
    expect(toTitleCase('“one of the best” in the city\nsays everyone')).toBe('“One of the Best” in the City\nSays Everyone')
  })

  it('sets feature text in capitals regardless of the title case toggle', () => {
    expect(displayText('Yamamori izakaya has held its final club night', 'feature', false)).toBe('YAMAMORI IZAKAYA HAS HELD ITS FINAL CLUB NIGHT')
    expect(displayText('kept as typed', 'headline', false)).toBe('kept as typed')
  })

  it('leaves words that start with a number alone', () => {
    expect(toTitleCase('the 1990s revival hits its 3rd year at 10am')).toBe('The 1990s Revival Hits Its 3rd Year at 10am')
  })

  it('treats typed line breaks as layout, not as the start or end of a title', () => {
    expect(toTitleCase('how to make the most of\na weekend in dublin')).toBe('How to Make the Most of\na Weekend in Dublin')
  })

  it('keeps minor words lowercase inside hyphenated compounds', () => {
    expect(toTitleCase('a state-of-the-art venue')).toBe('A State-of-the-Art Venue')
    expect(toTitleCase('dublin’s last late-night bus')).toBe('Dublin’s Last Late-Night Bus')
  })
})

describe('text cleaning', () => {
  it('turns every kind of typed line break into a line, collapses spaces and drops blank lines', () => {
    const verticalTab = String.fromCharCode(0x0b)
    const lineSeparator = String.fromCharCode(0x2028)
    expect(normaliseHeadline(`Night${verticalTab}market   opens${lineSeparator}${lineSeparator}  tonight \r\n`)).toBe('Night\nmarket opens\ntonight')
  })

  it('removes characters an SVG cannot contain, and composes accents', () => {
    const bell = String.fromCharCode(7)
    const nonCharacter = String.fromCharCode(0xfffe)
    const loneSurrogate = String.fromCharCode(0xdc00)
    expect(cleanText(`A${bell}B${nonCharacter}C${loneSurrogate}D 🎡`)).toBe('ABCD 🎡')
    expect(normaliseHeadline(`Cafe${String.fromCharCode(0x301)}`)).toBe('Café')
  })

  it('upper-cases eyebrows and spots headlines typed in capitals', () => {
    expect(normaliseEyebrow('  mon 27 july –  sun 2 aug ')).toBe('MON 27 JULY – SUN 2 AUG')
    expect(isAllCaps('DUBLIN 2025')).toBe(true)
    expect(isAllCaps('Dublin 2025')).toBe(false)
    expect(isAllCaps('A')).toBe(false)
  })
})
