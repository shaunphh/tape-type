import { describe, expect, it } from 'vitest'
import { displayText, toTitleCase } from './text'

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
})
