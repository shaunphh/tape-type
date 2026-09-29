import { describe, expect, it } from 'vitest'
import { markSelection } from './marks'

/** Marks the words between the bars, and shows what is picked afterwards between bars too. */
const mark = (typed: string, sign: string) => {
  const from = typed.indexOf('|')
  const to = typed.lastIndexOf('|') - 1
  const value = typed.replace(/\|/g, '')
  const marked = markSelection(value, from, Math.max(from, to), sign)
  return `${marked.value.slice(0, marked.from)}|${marked.value.slice(marked.from, marked.to)}|${marked.value.slice(marked.to)}`
}

describe('the format buttons', () => {
  it('put marks round the words that are picked, and keep them picked', () => {
    expect(mark('With |AE MAK| on stage', '**')).toBe('With **|AE MAK|** on stage')
    expect(mark('With |AE MAK| on stage', '*')).toBe('With *|AE MAK|* on stage')
    expect(mark('In |The Irish Times|', '_')).toBe('In _|The Irish Times|_')
    expect(mark('|Friday|', '__')).toBe('__|Friday|__')
  })

  it('hug the words: spaces at the ends of what was picked stay outside the marks', () => {
    expect(mark('With| AE MAK |on stage', '**')).toBe('With **|AE MAK|** on stage')
  })

  it('mark each line on its own, since marks never cross a line', () => {
    expect(mark('|Aoife Dooley\nIllustration\n\nEmma Rose Hanley|', '**')).toBe('**|Aoife Dooley**\n**Illustration**\n\n**Emma Rose Hanley|**')
  })

  it('take the same marks off again', () => {
    expect(mark('With |**AE MAK**| on stage', '**')).toBe('With |AE MAK| on stage')
    expect(mark('|_slanted_|', '_')).toBe('|slanted|')
    // Other marks are left on, and the new ones go round them.
    expect(mark('|**AE MAK**|', '*')).toBe('*|**AE MAK**|*')
    expect(mark('|__lined__|', '_')).toBe('_|__lined__|_')
  })

  it('give a place to type when nothing is picked', () => {
    expect(mark('Doors at ||', '**')).toBe('Doors at **|words|**')
  })

  it('start the picked lines with a dash, or stop them starting with one', () => {
    expect(mark('Line-up:\nAE |MAK\nZas|ka\nDoors at six', '- ')).toBe('Line-up:\n|- AE MAK\n- Zaska|\nDoors at six')
    expect(mark('|- AE MAK\n- Zaska|', '- ')).toBe('|AE MAK\nZaska|')
    expect(mark('|- AE MAK\nZaska|', '- ')).toBe('|- AE MAK\n- Zaska|')
    expect(mark('One |line', '- ')).toBe('|- One line|')
  })
})
