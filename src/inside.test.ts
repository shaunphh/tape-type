import { describe, expect, it } from 'vitest'
import { BRAND, type Layer } from './artwork'
import { furnitureBoxes } from './furniture'
import { wrapText } from './geometry'
import { BODY, DETAILS, FILL_SMALLEST, TONES, IMAGE_HEIGHTS, INSIDE_MARKS, LABEL, PAGE_MARGIN, PAGE_TYPE, SEMI, STRONG, TEXT_WIDTH, TITLE, insideDefaults, insideSvg, layoutInside, PAGE_KINDS, backToExample, isExample, readLines, sanitizeInside, switchKind, type MeasureInk, type MeasureWidth, type Run } from './inside'
import { POST_FRAME } from './settings'

// A stand-in for canvas: every character is half an em wide.
const measure: MeasureWidth = (text, size) => text.length * size * 0.5
const ink: MeasureInk = (text, size) => ({ width: text.length * size * 0.5, originOffset: 0, ascent: size * 0.7, descent: 0 })
/** A run as it is typed in these tests: its words, then what marks it is in. */
const run = (text: string, style: Partial<Omit<Run, 'text'>> = {}): Run => ({ weight: 'text', italic: false, underline: false, ...style, text })
const texts = (layers: Layer[]) => layers.flatMap((layer) => (layer.kind === 'text' ? [layer] : []))
const paths = (layers: Layer[]) => layers.flatMap((layer) => (layer.kind === 'path' ? [layer] : []))
/** The top of a line of text: where its capitals start. */
const capTop = (layer: { y: number; size: number }) => layer.y - layer.size * 0.7
const page = (overrides: Partial<Parameters<typeof layoutInside>[0]> = {}, marks = {}) =>
  layoutInside({ title: 'The closure follows a months-long legal dispute', body: 'One paragraph of the story.\n\nAnd a second one.', details: '', image: 'medium', cut: 'tape', seed: 1234, ...overrides }, measure, marks, ink)

describe('inside page', () => {
  it('puts the picture across the top, then the title, then the story', () => {
    const layout = page()
    expect(layout.banner).toEqual({ x: 0, y: 0, width: 1080, height: IMAGE_HEIGHTS.medium })
    const [title, ...rest] = texts(layout.layers)
    expect(title).toMatchObject({ weight: TITLE.weight, fill: BRAND.light, x: PAGE_MARGIN })
    expect(title.y).toBeGreaterThan(IMAGE_HEIGHTS.medium)
    const body = rest.filter((layer) => layer.weight === BODY.weight)
    expect(body.length).toBe(layout.bodyLines)
    expect(body.every((layer) => layer.size === 38 && layer.fill === BODY.fill)).toBe(true)
    expect(Math.min(...body.map((layer) => layer.y))).toBeGreaterThan(Math.max(...texts(layout.layers).filter((layer) => layer.weight === TITLE.weight).map((layer) => layer.y)))
    expect(layout.overflow).toBeNull()
  })

  it('sets the title as large as fits in three lines, between 45 and 52', () => {
    expect([TITLE.smallest, TITLE.largest]).toEqual([45, 52])
    expect(page({ title: 'Ireland Music Week is back' }).titleSize).toBe(52)
    // 116 characters: three lines of 37 characters at 52 won't hold it, so it comes down.
    const title = 'Bolands Mills is set to come alive this Culture Night with Milling About and Culture in Every Corner of the old mill'
    const long = page({ title })
    expect(long.titleSize).toBeLessThan(52)
    expect(long.titleSize).toBeGreaterThanOrEqual(45)
    expect(long.titleLines).toBeLessThanOrEqual(TITLE.lines)
    // It comes down no further than it has to: a pixel bigger would take a fourth line.
    const linesAt = (size: number) => wrapText(title, TEXT_WIDTH, (value) => measure(value, size, TITLE.weight), true).length
    expect(linesAt(long.titleSize)).toBe(TITLE.lines)
    expect(linesAt(long.titleSize + 1)).toBeGreaterThan(TITLE.lines)
    const tooLong = page({ title: Array(40).fill('wordy').join(' ') })
    expect(tooLong.titleSize).toBe(45)
    expect(tooLong.overflow).toBe('title')
  })

  it('keeps every line inside the margins', () => {
    const layout = page({ body: Array(60).fill('words').join(' ') })
    for (const layer of texts(layout.layers)) {
      expect(layer.x).toBeGreaterThanOrEqual(PAGE_MARGIN)
      expect(layer.x + measure(layer.text, layer.size, layer.weight)).toBeLessThanOrEqual(PAGE_MARGIN + TEXT_WIDTH + 0.01)
    }
  })

  it('says by how many lines a story runs over, and fits more with a shorter picture or none', () => {
    const body = Array(150).fill('words').join(' ')
    const tall = page({ body, image: 'tall' })
    expect(tall.overflow).toBe('body')
    expect(tall.over).toBe(tall.bodyLines - tall.bodyRoom)
    const short = page({ body, image: 'short' })
    const none = page({ body, image: 'none' })
    expect(short.bodyRoom).toBeGreaterThan(tall.bodyRoom)
    expect(none.bodyRoom).toBeGreaterThan(short.bodyRoom)
    expect(none.banner).toBeNull()
    // The last line that fits ends above the bottom margin.
    const fits = page({ body: Array(30).fill('words').join(' ') })
    expect(Math.max(...texts(fits.layers).map((layer) => layer.y))).toBeLessThan(POST_FRAME.height - PAGE_MARGIN)
  })

  it('starts the words under the logo when there is one and no picture over them', () => {
    const marks = furnitureBoxes({ logo: 'left', arrow: true }, POST_FRAME, INSIDE_MARKS)
    expect(marks.logo).toMatchObject({ x: PAGE_MARGIN, y: PAGE_MARGIN, width: 128 })
    expect(marks.arrow!.x + marks.arrow!.width).toBeCloseTo(POST_FRAME.width - PAGE_MARGIN, 5)
    const underLogo = page({ image: 'none' }, { logoBottom: marks.logo!.y + marks.logo!.height })
    expect(Math.min(...texts(underLogo.layers).map((layer) => layer.y - layer.size))).toBeGreaterThan(marks.logo!.y + marks.logo!.height)
  })

  it('lets the arrow keep its corner whatever is typed, and says when words run under it', () => {
    const { arrow } = furnitureBoxes({ logo: 'off', arrow: true }, POST_FRAME, INSIDE_MARKS)
    // The arrow takes no room from the words: a page fits with it as it does without.
    const without = page({ image: 'none' })
    const withArrow = page({ image: 'none' }, { arrow })
    expect(withArrow.layers).toEqual(without.layers)
    expect(withArrow).toMatchObject({ bodyRoom: without.bodyRoom, overflow: null, underArrow: false })
    expect(without.underArrow).toBe(false)
    // Words that reach the foot of the page are under it only if they reach across to it.
    const lines = (last: string) => `${Array(without.bodyRoom - 1).fill('A line.').join('\n')}\n${last}`
    const short = page({ image: 'none', body: lines('Ends well short.') }, { arrow })
    expect(short).toMatchObject({ overflow: null, underArrow: false })
    const across = page({ image: 'none', body: lines('A last line that runs right across to the corner') }, { arrow })
    expect(across).toMatchObject({ overflow: null, underArrow: true })
    // With no arrow there is nothing to run under.
    expect(page({ image: 'none', body: lines('A last line that runs right across to the corner') }).underArrow).toBe(false)
  })

  it('puts a picture at the bottom under the words, which end above it', () => {
    const layout = page({ position: 'bottom', image: 'short' })
    expect(layout.banner).toEqual({ x: 0, y: POST_FRAME.height - IMAGE_HEIGHTS.short, width: 1080, height: IMAGE_HEIGHTS.short })
    const lines = texts(layout.layers)
    expect(capTop(lines[0])).toBeGreaterThan(PAGE_MARGIN)
    expect(capTop(lines[0])).toBeLessThan(PAGE_MARGIN + 40)
    expect(Math.max(...lines.map((layer) => layer.y))).toBeLessThan(layout.banner!.y)
    expect(layout.overflow).toBeNull()
    // The picture takes much the same room from the words wherever it is: its gap is a little wider here.
    const atTop = page({ position: 'top', image: 'short' }).bodyRoom
    expect(layout.bodyRoom).toBeLessThanOrEqual(atTop)
    expect(layout.bodyRoom).toBeGreaterThanOrEqual(atTop - 1)
    // The arrow sits on the picture, clear of the words.
    const { arrow } = furnitureBoxes({ logo: 'off', arrow: true }, POST_FRAME, INSIDE_MARKS)
    expect(page({ position: 'bottom', image: 'short' }, { arrow })).toMatchObject({ bodyRoom: layout.bodyRoom, underArrow: false })
    const long = page({ position: 'bottom', image: 'short', body: Array(150).fill('words').join(' ') })
    expect(long.overflow).toBe('body')
    expect(long.over).toBe(long.bodyLines - long.bodyRoom)
  })

  it('puts a picture in the middle after the title, or after the story when there is no title', () => {
    const details = '22 September · 6.30pm'
    const layout = page({ position: 'middle', image: 'short', details })
    const banner = layout.banner!
    const bottom = banner.y + banner.height
    const titles = texts(layout.layers).filter((layer) => layer.size === layout.titleSize)
    const rest = texts(layout.layers).filter((layer) => layer.size === BODY.size)
    expect(titles.length).toBe(layout.titleLines)
    expect(Math.max(...titles.map((layer) => layer.y))).toBeLessThan(banner.y)
    expect(Math.min(...rest.map(capTop))).toBeGreaterThan(bottom)
    // The words start at the top margin and the picture has a gap on both sides, which costs two lines.
    const atTop = page({ position: 'top', image: 'short', details }).bodyRoom
    expect(layout.bodyRoom).toBeLessThan(atTop)
    expect(layout.bodyRoom).toBeGreaterThanOrEqual(atTop - 2)

    const untitled = page({ position: 'middle', image: 'short', title: '', details })
    const story = texts(untitled.layers).filter((layer) => layer.fill === BODY.fill)
    const dates = texts(untitled.layers).filter((layer) => layer.fill === DETAILS.fill)
    expect(capTop(story[0])).toBeLessThan(PAGE_MARGIN + 40)
    expect(Math.max(...story.map((layer) => layer.y))).toBeLessThan(untitled.banner!.y)
    expect(capTop(dates[0])).toBeGreaterThan(untitled.banner!.y + untitled.banner!.height)

    // With nothing else on the page, the details come first, and the picture has to fit under them.
    const alone = page({ position: 'middle', image: 'tall', title: '', body: '', details })
    expect(alone.banner!.y).toBeGreaterThan(capTop(texts(alone.layers)[0]))
    expect(alone.overflow).toBeNull()
    const crowded = page({ position: 'middle', image: 'tall', title: '', body: Array(150).fill('words').join(' ') })
    expect(crowded.overflow).toBe('body')
    expect(crowded.banner!.y + crowded.banner!.height).toBeGreaterThan(POST_FRAME.height - PAGE_MARGIN)
  })

  it('gives a picture that fills the room the words leave, wherever it is', () => {
    const details = '22 September · 6.30pm'
    const foot = POST_FRAME.height - PAGE_MARGIN
    const lowest = (layout: ReturnType<typeof page>) => Math.max(...texts(layout.layers).map((layer) => layer.y))

    // At the top the words move down to the foot of the page, and the picture takes the rest.
    const top = page({ image: 'fill', position: 'top', details })
    expect(top.banner!.y).toBe(0)
    expect(top.banner!.height).toBeGreaterThan(IMAGE_HEIGHTS.tall)
    expect(lowest(top)).toBeLessThan(foot)
    expect(lowest(top)).toBeGreaterThan(foot - BODY.size)
    expect(Math.min(...texts(top.layers).map(capTop))).toBeGreaterThan(top.banner!.height + 40)

    // In the middle the first words stay at the top and the rest go to the foot.
    const middle = page({ image: 'fill', position: 'middle', details })
    const titles = texts(middle.layers).filter((layer) => layer.size === middle.titleSize)
    expect(capTop(titles[0])).toBeLessThan(PAGE_MARGIN + 40)
    expect(middle.banner!.y).toBeGreaterThan(Math.max(...titles.map((layer) => layer.y)))
    expect(lowest(middle)).toBeGreaterThan(foot - BODY.size)
    expect(middle.banner!.height).toBeGreaterThan(FILL_SMALLEST)
    // With nothing after it, it runs to the foot of the page, as at the bottom.
    const last = page({ image: 'fill', position: 'middle', body: '', details: '' })
    expect(last.banner!.y + last.banner!.height).toBe(POST_FRAME.height)

    // At the bottom it starts under the words and runs to the foot of the page.
    const bottom = page({ image: 'fill', position: 'bottom', details })
    expect(bottom.banner!.y + bottom.banner!.height).toBe(POST_FRAME.height)
    expect(bottom.banner!.y - lowest(bottom)).toBeGreaterThan(60)
    expect(bottom.banner!.y - lowest(bottom)).toBeLessThan(80)

    for (const layout of [top, middle, bottom]) {
      expect(layout.overflow).toBeNull()
      // The room is what the words would have with the smallest picture.
      expect(layout.bodyRoom).toBeGreaterThan(layout.bodyLines)
    }
    // More words, less picture: never less than the smallest, and then the words are too long.
    const more = page({ image: 'fill', position: 'bottom', body: Array(60).fill('words').join(' ') })
    expect(more.banner!.height).toBeLessThan(bottom.banner!.height)
    expect(more.banner!.height).toBeGreaterThanOrEqual(FILL_SMALLEST)
    for (const position of ['top', 'middle', 'bottom'] as const) {
      const long = page({ image: 'fill', position, body: Array(200).fill('words').join(' ') })
      expect(long.banner!.height).toBe(FILL_SMALLEST)
      expect(long.overflow).toBe('body')
      expect(long.over).toBe(long.bodyLines - long.bodyRoom)
    }
  })

  it('starts the words under the logo when the picture is not at the top', () => {
    const marks = furnitureBoxes({ logo: 'left', arrow: false }, POST_FRAME, INSIDE_MARKS)
    const logoBottom = marks.logo!.y + marks.logo!.height
    for (const position of ['middle', 'bottom'] as const) {
      const layout = page({ position }, { logoBottom })
      expect(Math.min(...texts(layout.layers).map(capTop))).toBeGreaterThan(logoBottom)
      expect(layout.banner!.y).toBeGreaterThan(logoBottom)
    }
    // At the top the logo sits on the picture, and takes nothing from the words.
    expect(page({ position: 'top' }, { logoBottom }).bodyRoom).toBe(page({ position: 'top' }).bodyRoom)
  })

  it('ignores the position when the page has no picture', () => {
    const none = page({ image: 'none', position: 'bottom' })
    expect(none.banner).toBeNull()
    expect(none.layers).toEqual(page({ image: 'none', position: 'top' }).layers)
  })

  it('sets the label in ExtraBold at the text’s size', () => {
    expect(LABEL).toEqual({ size: 38, weight: 800 })
    expect(LABEL.size).toBe(BODY.size)
  })

  it('sets the label in capitals on light tape, over whatever comes first', () => {
    const layout = page({ label: ' Meet  the artists ', image: 'none' })
    const [tapePath] = paths(layout.layers)
    const lettering = texts(layout.layers).find((layer) => layer.text === 'MEET THE ARTISTS')!
    expect(tapePath).toMatchObject({ fill: BRAND.light })
    expect(lettering).toMatchObject({ size: LABEL.size, weight: LABEL.weight, fill: BRAND.dark, x: PAGE_MARGIN })
    // The tape reaches into the margin; its lettering starts on it, like the title under it.
    const label = layout.label!
    expect(label.x).toBeLessThan(PAGE_MARGIN)
    expect(label.x).toBeGreaterThan(PAGE_MARGIN - LABEL.size / 2)
    expect(label.x + label.width).toBeGreaterThan(PAGE_MARGIN + 16 * LABEL.size * 0.5)
    expect(label.x + label.width).toBeLessThan(POST_FRAME.width - PAGE_MARGIN)
    expect(label.y).toBeGreaterThanOrEqual(PAGE_MARGIN)
    expect(capTop(lettering)).toBeGreaterThan(label.y)
    expect(lettering.y).toBeLessThan(label.y + label.height)
    const title = texts(layout.layers).find((layer) => layer.size === layout.titleSize)!
    expect(capTop(title)).toBeGreaterThan(label.y + label.height + 30)
    expect(capTop(title)).toBeLessThan(label.y + label.height + 70)
    // The label takes its room from the story.
    expect(layout.bodyRoom).toBeLessThan(page({ image: 'none' }).bodyRoom)

    // Under a picture at the top; and with no title, over the story.
    const under = page({ label: 'Meet the artists' })
    expect(under.label!.y).toBeGreaterThan(IMAGE_HEIGHTS.medium + 40)
    const untitled = page({ label: 'Meet the artists', title: '', image: 'none' })
    const first = texts(untitled.layers).find((layer) => layer.weight === BODY.weight)!
    expect(capTop(first)).toBeGreaterThan(untitled.label!.y + untitled.label!.height + 40)
    expect(capTop(first)).toBeLessThan(untitled.label!.y + untitled.label!.height + 80)
    // In the middle, the picture follows the label and the title together, never the label alone.
    const middle = page({ label: 'Meet the artists', position: 'middle', image: 'short' })
    expect(middle.banner!.y).toBeGreaterThan(Math.max(...texts(middle.layers).filter((layer) => layer.size === middle.titleSize).map((layer) => layer.y)))
    const story = page({ label: 'Meet the artists', title: '', position: 'middle', image: 'short' })
    expect(story.banner!.y).toBeGreaterThan(Math.max(...texts(story.layers).filter((layer) => layer.weight === BODY.weight).map((layer) => layer.y)))
  })

  it('gives the label a cut and a seed of its own, and has none until one is typed', () => {
    expect(page({ label: '  ' })).toMatchObject({ label: null })
    expect(paths(page({ label: '' }).layers)).toHaveLength(0)
    const cut = (seed: number) => page({ label: 'Meet the artists', title: '', body: '', image: 'none', seed })
    expect(paths(cut(7).layers)[0].d).toBe(paths(cut(7).layers)[0].d)
    expect(new Set([1, 2, 3, 4, 5, 6].map((seed) => paths(cut(seed).layers)[0].d)).size).toBeGreaterThan(1)
    // A label alone is a page; a plain cut is a plain rectangle.
    expect(cut(7)).toMatchObject({ empty: false, bodyLines: 0, overflow: null })
    const plain = page({ label: 'Meet the artists', title: '', body: '', image: 'none', cut: 'plain' })
    expect(paths(plain.layers)[0].d.match(/[ML]/g)).toHaveLength(4)
    expect(paths(page({ label: 'Meet the artists', image: 'none', cut: 'rough' }).layers)[0].d).not.toBe(paths(plain.layers)[0].d)
    // Left out, the cut and the seed are the page's defaults: one quiet cut.
    const unset = layoutInside({ label: 'Meet the artists', title: '', body: '', image: 'none' }, measure, {}, ink)
    const quiet = layoutInside({ label: 'Meet the artists', title: '', body: '', image: 'none', cut: insideDefaults.cut, seed: insideDefaults.seed }, measure, {}, ink)
    expect(insideDefaults.cut).toBe('clean')
    expect(paths(unset.layers)[0].d).toBe(paths(quiet.layers)[0].d)
    // With nothing to measure its ink by, there is no label to cut.
    expect(layoutInside({ label: 'Meet the artists', title: 'A title', body: '', image: 'none' }, measure).label).toBeNull()
  })

  it('starts a new page as a title page: a tall picture, the date and place at the foot, a white arrow', () => {
    expect(insideDefaults).toMatchObject({ kind: 'title', image: 'tall', position: 'top', label: '', pinned: true, arrow: true, arrowColour: 'light', logo: 'off' })
    const { arrow } = furnitureBoxes({ logo: 'off', arrow: true }, POST_FRAME, INSIDE_MARKS)
    const layout = layoutInside(insideDefaults, measure, { arrow }, ink)
    expect(layout.banner).toEqual({ x: 0, y: 0, width: 1080, height: IMAGE_HEIGHTS.tall })
    expect(layout).toMatchObject({ overflow: null, underArrow: false })
    // The date and place are its last two lines, standing on the bottom margin.
    const lines = texts(layout.layers)
    expect(lines.slice(-2).map((layer) => layer.text)).toEqual(['Friday 18 September · 6.30pm', 'Bolands Mills, Dublin 4'])
    expect(lines.slice(-2).every((layer) => layer.weight === STRONG.weight && layer.fill === STRONG.fill)).toBe(true)
    expect(lines[lines.length - 1].y).toBeGreaterThan(POST_FRAME.height - PAGE_MARGIN - BODY.size)
    expect(lines[lines.length - 1].y).toBeLessThan(POST_FRAME.height - PAGE_MARGIN)
    // A label page starts with a tall picture on the foot of the page, the arrow on it, and its closing line a size up.
    expect(PAGE_KINDS.label.sample).toMatchObject({ image: 'tall', position: 'bottom', arrow: true, arrowColour: 'light', pinned: false, large: true })
    const label = layoutInside({ ...insideDefaults, ...PAGE_KINDS.label.sample }, measure, { arrow }, ink)
    expect(label.banner).toEqual({ x: 0, y: POST_FRAME.height - IMAGE_HEIGHTS.tall, width: 1080, height: IMAGE_HEIGHTS.tall })
    expect(label).toMatchObject({ overflow: null, underArrow: false })
    expect(texts(label.layers).filter((layer) => layer.weight === SEMI.weight).every((layer) => layer.size === DETAILS.large)).toBe(true)
  })

  it('puts a page back to its example when asked, leaving the other kind and the label’s cut alone', () => {
    expect(isExample(insideDefaults)).toBe(true)
    const typed = { ...insideDefaults, title: 'My own title', image: 'none' as const, arrow: false, cut: 'torn' as const }
    expect(isExample(typed)).toBe(false)
    expect(backToExample(typed)).toEqual({ ...insideDefaults, cut: 'torn' })
    // As a label page it goes back to the label page's example, and keeps the title page as it was typed.
    const asLabel = { ...switchKind(typed, 'label'), label: 'Line-up', body: 'Names' }
    expect(isExample(asLabel)).toBe(false)
    const back = backToExample(asLabel)
    expect(back).toMatchObject({ kind: 'label', ...PAGE_KINDS.label.sample, cut: 'torn' })
    expect(isExample(back)).toBe(true)
    expect(back.kept.title).toMatchObject({ title: 'My own title', image: 'none', arrow: false })
    expect(switchKind(back, 'title')).toMatchObject({ title: 'My own title', image: 'none', arrow: false })
  })

  it('wraps a long label inside the margins', () => {
    const layout = page({ label: 'Everything you need to know before you go out tonight', image: 'none' })
    const lettering = texts(layout.layers).filter((layer) => layer.weight === LABEL.weight && layer.fill === BRAND.dark)
    expect(lettering.length).toBeGreaterThan(1)
    expect(layout.label!.x + layout.label!.width).toBeLessThan(POST_FRAME.width - PAGE_MARGIN + 1)
    expect(lettering[1].y - lettering[0].y).toBeCloseTo(LABEL.size * 0.94, 1)
  })

  it('reads a blank line as a new paragraph, a new line as a new line and a dash as a bullet', () => {
    const read = (typed: string) => readLines(typed).map((paragraph) => paragraph.map(({ text, bullet }) => ({ text, bullet })))
    expect(read('First.\n\n  Second   one. \nSame paragraph.\n\n- A bullet\n• Another\n\n**Ishmael Claxton**\nPhotography\n')).toEqual([
      [{ text: 'First.', bullet: false }],
      [{ text: 'Second one.', bullet: false }, { text: 'Same paragraph.', bullet: false }],
      [{ text: 'A bullet', bullet: true }, { text: 'Another', bullet: true }],
      [{ text: 'Ishmael Claxton', bullet: false }, { text: 'Photography', bullet: false }],
    ])
  })

  it('reads two stars as bold, one as semibold, underscores as italic and two as underlined', () => {
    const runs = (typed: string) => readLines(typed)[0][0].runs
    expect(runs('When **The theatre**')).toEqual([run('When '), run('The theatre', { weight: 'bold' })])
    expect(runs('With *AE MAK*, **Zaska** and more')).toEqual([
      run('With '), run('AE MAK', { weight: 'semi' }), run(', '), run('Zaska', { weight: 'bold' }), run(' and more'),
    ])
    expect(runs('In _The Irish Times_ on __Friday__')).toEqual([run('In '), run('The Irish Times', { italic: true }), run(' on '), run('Friday', { underline: true })])
    expect(runs('- *Doors* at six')).toEqual([run('Doors', { weight: 'semi' }), run(' at six')])
    expect(runs('(**free**)')).toEqual([run('('), run('free', { weight: 'bold' }), run(')')])
    expect(readLines('**A whole line**')[0][0]).toMatchObject({ text: 'A whole line', runs: [run('A whole line', { weight: 'bold' })] })
    // Marks can sit inside marks, and one set the same way as its neighbour joins it.
    expect(runs('**_Bold and italic_**')).toEqual([run('Bold and italic', { weight: 'bold', italic: true })])
    expect(runs('_**Italic and bold**_')).toEqual([run('Italic and bold', { weight: 'bold', italic: true })])
    expect(runs('**Bold with _a slant_ in it**')).toEqual([run('Bold with ', { weight: 'bold' }), run('a slant', { weight: 'bold', italic: true }), run(' in it', { weight: 'bold' })])
    expect(runs('__*Semibold*, underlined__')).toEqual([run('Semibold', { weight: 'semi', underline: true }), run(', underlined', { underline: true })])
    expect(runs('**One** **two**')).toEqual([run('One', { weight: 'bold' }), run(' '), run('two', { weight: 'bold' })])
    // One star inside two stays bold.
    expect(runs('**Bold *still* bold**')).toEqual([run('Bold still bold', { weight: 'bold' })])
  })

  it('leaves marks alone that hug nothing, or sit inside a word, a sum or a name', () => {
    for (const plain of ['5* hotel', '* not bold *', '2*3*4', 'A *lone star', '**two and one*', '***', 'some_file_name', '_ not slanted _', 'a_b_c', 'An _open slant', '____']) {
      expect(readLines(plain)[0][0], plain).toMatchObject({ text: plain, runs: [run(plain)] })
    }
  })

  it('sets words in marks in their place in the line, and wraps the line as one', () => {
    const layout = page({ title: '', image: 'none', body: 'When **The theatre** opens', details: '' })
    const [when, theatre, opens] = texts(layout.layers)
    expect(when).toMatchObject({ text: 'When', x: PAGE_MARGIN, weight: BODY.weight, fill: BODY.fill })
    expect(theatre).toMatchObject({ text: 'The theatre', weight: STRONG.weight, fill: STRONG.fill, y: when.y })
    expect(opens).toMatchObject({ text: 'opens', weight: BODY.weight, fill: BODY.fill, y: when.y })
    // Each piece starts a space after the one before: characters are half an em wide here.
    const wide = (value: string) => measure(value, BODY.size, 0)
    expect(theatre.x).toBeCloseTo(PAGE_MARGIN + wide('When '), 5)
    expect(opens.x).toBeCloseTo(PAGE_MARGIN + wide('When The theatre '), 5)
    expect(layout.bodyLines).toBe(1)

    // A long line wraps at its spaces, inside the margins, whichever way its words are set.
    const names = Array(14).fill('Sorcha').join(' ')
    const long = page({ title: '', image: 'none', details: '', body: `A free evening with **${names}** and (*friends*), all night` })
    const pieces = texts(long.layers)
    expect(long.bodyLines).toBeGreaterThan(1)
    expect(new Set(pieces.map((layer) => layer.y)).size).toBe(long.bodyLines)
    for (const piece of pieces) expect(piece.x + wide(piece.text)).toBeLessThanOrEqual(PAGE_MARGIN + TEXT_WIDTH + 0.01)
    // A word set two ways stays whole: its parts touch, on one line.
    const open = pieces.find((layer) => layer.text.endsWith('('))!
    const friends = pieces.find((layer) => layer.text === 'friends')!
    const close = pieces.find((layer) => layer.text.startsWith('),'))!
    expect(friends).toMatchObject({ weight: SEMI.weight, y: open.y })
    expect(friends.x).toBeCloseTo(open.x + wide(open.text), 5)
    expect(close).toMatchObject({ text: '), all night', weight: BODY.weight, y: open.y })
    expect(close.x).toBeCloseTo(friends.x + wide('friends'), 5)
    // Words in marks count towards the room like any others.
    expect(long.bodyLines).toBe(page({ title: '', image: 'none', details: '', body: `A free evening with ${names} and (friends), all night` }).bodyLines)
  })

  it('slants italics, and draws the line under underlined words where the words are', () => {
    const layout = page({ title: '', image: 'none', details: '', body: 'In _The Irish Times_ on __Friday night__, **_all of it_**' })
    const [first, times, on, friday, comma, all] = texts(layout.layers)
    expect(first.italic).toBeUndefined()
    expect(times).toMatchObject({ text: 'The Irish Times', italic: true, weight: BODY.weight, fill: BODY.fill })
    expect(on.italic).toBeUndefined()
    expect(friday).toMatchObject({ text: 'Friday night', weight: BODY.weight, fill: BODY.fill })
    expect(comma.text).toBe(',')
    expect(all).toMatchObject({ text: 'all of it', italic: true, weight: STRONG.weight, fill: STRONG.fill })
    // One line, under the underlined words only: as wide as they are, just under their baseline.
    const lines = paths(layout.layers)
    expect(lines).toHaveLength(1)
    const [x, top, right, bottom] = /^M([\d.]+) ([\d.]+)H([\d.]+)V([\d.]+)H/.exec(lines[0].d)!.slice(1).map(Number)
    expect(lines[0].fill).toBe(friday.fill)
    expect(x).toBeCloseTo(friday.x, 2)
    expect(right - x).toBeCloseTo(measure('Friday night', BODY.size, 0), 2)
    expect(top).toBeGreaterThan(friday.y)
    expect(top).toBeLessThan(friday.y + BODY.size * 0.25)
    expect(bottom - top).toBeGreaterThanOrEqual(2)
    // In an export the slant is said, and the line is drawn.
    const svg = insideSvg(layout)
    expect(svg).toContain('font-style="italic" fill="#C2C2C2">The Irish Times</text>')
    expect(svg).toContain(`<path d="${lines[0].d}"`)
    expect(svg).not.toContain('text-decoration')
  })

  it('sets the highlight under the story in white, in the story’s weight and size', () => {
    const typed = '22 September · 6.30pm\nThis Must Be The Place, Smithfield\nTickets via Eventbrite'
    const layout = page({ body: 'The story.', details: typed })
    const story = texts(layout.layers).find((layer) => layer.text === 'The story.')!
    const details = texts(layout.layers).filter((layer) => layer.fill === DETAILS.fill && layer.size === BODY.size)
    expect(details.map((layer) => layer.text)).toEqual(['22 September · 6.30pm', 'This Must Be The Place, Smithfield', 'Tickets via Eventbrite'])
    expect(story).toMatchObject({ weight: BODY.weight, fill: BODY.fill })
    // It is not bolder of itself: words in stars are.
    expect(DETAILS).toMatchObject({ weight: BODY.weight, fill: TITLE.fill })
    expect(details.every((layer) => layer.weight === DETAILS.weight)).toBe(true)
    expect(details[0].y).toBeGreaterThan(story.y + BODY.size * BODY.lineHeight)
    expect(details[1].y - details[0].y).toBeCloseTo(BODY.size * BODY.lineHeight, 1)
    expect(layout.bodyLines).toBe(4)
    // A highlight alone is a page too.
    expect(page({ title: '', body: '', details: 'Tickets via Eventbrite' })).toMatchObject({ empty: false, bodyLines: 1 })
  })

  it('sets the highlight a size up when asked, and wraps it at that size', () => {
    const typed = 'Four Dublin creatives are coming together for an evening exploring their work, practice and inspiration.'
    const usual = page({ body: 'The story.', details: typed, image: 'none' })
    const large = page({ body: 'The story.', details: typed, large: true, image: 'none' })
    const lines = (layout: typeof large) => texts(layout.layers).filter((layer) => layer.fill === DETAILS.fill && layer.weight === DETAILS.weight)
    expect(DETAILS.large).toBe(42)
    expect(lines(usual).every((layer) => layer.size === BODY.size)).toBe(true)
    expect(lines(large).every((layer) => layer.size === 42)).toBe(true)
    expect(lines(large)[1].y - lines(large)[0].y).toBeCloseTo(42 * BODY.lineHeight, 1)
    for (const layer of lines(large)) expect(layer.x + measure(layer.text, layer.size, layer.weight)).toBeLessThanOrEqual(PAGE_MARGIN + TEXT_WIDTH + 0.01)
    // The story keeps its size, and the larger lines take a little more of the room.
    expect(texts(large.layers).find((layer) => layer.text === 'The story.')!.size).toBe(BODY.size)
    expect(large.bodyRoom).toBeLessThanOrEqual(usual.bodyRoom)
  })

  it('sets the story a size up when asked, leaving the highlight as it is', () => {
    const body = 'A free evening of live music, art, storytelling and movement, with performances from **AE MAK** on the Factory Main Stage.'
    const usual = page({ body, details: 'A date', image: 'none' })
    const large = page({ body, details: 'A date', bodyLarge: true, image: 'none' })
    const story = (layout: typeof large) => texts(layout.layers).filter((layer) => layer.fill === BODY.fill || layer.text === 'AE MAK')
    expect(BODY.large).toBe(42)
    expect(story(usual).every((layer) => layer.size === 38)).toBe(true)
    expect(story(large).every((layer) => layer.size === 42)).toBe(true)
    for (const layer of story(large)) expect(layer.x + measure(layer.text, layer.size, layer.weight)).toBeLessThanOrEqual(PAGE_MARGIN + TEXT_WIDTH + 0.01)
    expect(new Set(story(large).map((layer) => layer.y)).size).toBeGreaterThanOrEqual(new Set(story(usual).map((layer) => layer.y)).size)
    expect(texts(large.layers).find((layer) => layer.text === 'A date')!.size).toBe(38)
    // Both can be a size up at once.
    expect(texts(page({ body, details: 'A date', bodyLarge: true, large: true, image: 'none' }).layers).find((layer) => layer.text === 'A date')!.size).toBe(42)
    expect(PAGE_KINDS.title.sample.bodyLarge).toBe(false)
    expect(PAGE_KINDS.label.sample.bodyLarge).toBe(false)
  })

  it('sets words in two stars bold and in one semibold, both in white, in the story or the highlight', () => {
    const layout = page({ body: '**Each artist will give a short presentation.**\n*On their practice.*', details: '**Ishmael Claxton**\nPhotography' })
    const lines = texts(layout.layers).filter((layer) => layer.size === BODY.size)
    expect(lines.find((layer) => layer.text === 'Each artist will give a short presentation.')).toMatchObject({ weight: STRONG.weight, fill: STRONG.fill })
    expect(lines.find((layer) => layer.text === 'On their practice.')).toMatchObject({ weight: SEMI.weight, fill: SEMI.fill })
    expect(lines.find((layer) => layer.text === 'Ishmael Claxton')).toMatchObject({ weight: STRONG.weight, fill: STRONG.fill })
    expect(lines.find((layer) => layer.text === 'Photography')).toMatchObject({ weight: DETAILS.weight, fill: DETAILS.fill })
    expect(STRONG).toEqual({ weight: 700, fill: TITLE.fill })
    expect(SEMI).toEqual({ weight: 600, fill: TITLE.fill })
  })

  it('stands the highlight at the foot of the words’ room when asked, unless the picture fills it', () => {
    const foot = POST_FRAME.height - PAGE_MARGIN
    const content = { body: 'The story.', details: 'A date\nA place' }
    const highlight = (layout: ReturnType<typeof page>) => texts(layout.layers).filter((layer) => layer.fill === DETAILS.fill && layer.weight === DETAILS.weight)
    const lowest = (layout: ReturnType<typeof page>) => Math.max(...highlight(layout).map((layer) => layer.y))
    for (const image of ['none', 'short', 'tall'] as const) {
      const under = page({ ...content, image })
      const pinned = page({ ...content, image, pinned: true })
      // Under the story it follows it; pinned, its last line sits on the bottom margin.
      expect(lowest(under)).toBeLessThan(foot - BODY.size * 2)
      expect(lowest(pinned)).toBeLessThan(foot)
      expect(lowest(pinned)).toBeGreaterThan(foot - BODY.size)
      expect(highlight(pinned).map((layer) => layer.text)).toEqual(['A date', 'A place'])
      expect(highlight(pinned)[1].y - highlight(pinned)[0].y).toBeCloseTo(BODY.size * BODY.lineHeight, 1)
      // Everything else stays where it was, and the page has the same room.
      const others = (layout: ReturnType<typeof page>) => texts(layout.layers).filter((layer) => !highlight(layout).includes(layer))
      expect(others(pinned)).toEqual(others(under))
      expect(pinned).toMatchObject({ bodyRoom: under.bodyRoom, overflow: null, banner: under.banner })
    }
    // Over a picture at the bottom, the foot is the picture's top, less its gap.
    const over = page({ ...content, image: 'short', position: 'bottom', pinned: true })
    expect(lowest(over)).toBeLessThan(over.banner!.y - 60)
    expect(lowest(over)).toBeGreaterThan(over.banner!.y - 60 - BODY.size)
    // An underline moves with its words.
    const lined = page({ body: 'The story.', details: '__A date__', image: 'none', pinned: true })
    const [word] = highlight(lined)
    const [line] = paths(lined.layers)
    expect(Number(/^M[\d.]+ ([\d.]+)H/.exec(line.d)![1]) + line.place!.y).toBeCloseTo(word.y + BODY.size * 0.13, 1)
    // A picture that fills has taken the room: the highlight is where it would be anyway.
    expect(page({ ...content, image: 'fill', pinned: true }).layers).toEqual(page({ ...content, image: 'fill' }).layers)
    // With no room to move into, it stays under the story, and the page says it is too long.
    const long = page({ body: Array(400).fill('words').join(' '), details: 'A date', image: 'none', pinned: true })
    const unpinned = page({ body: Array(400).fill('words').join(' '), details: 'A date', image: 'none' })
    expect(unpinned.over).toBeGreaterThan(0)
    expect(long).toMatchObject({ overflow: 'body', over: unpinned.over })
    expect(long.layers).toEqual(unpinned.layers)
    // Alone on the page it is the first thing on it, and stays at the top.
    expect(texts(page({ title: '', body: '', details: 'A date', image: 'none', pinned: true }).layers)[0].y).toBeLessThan(PAGE_MARGIN + BODY.size * 2)
  })

  it('sets each box of words in the grey or in white, as chosen', () => {
    expect(TONES).toEqual({ grey: BODY.fill, light: TITLE.fill })
    const content = { body: 'The story, with **a name** in it.', details: 'A date, and **a place**' }
    const fills = (layout: ReturnType<typeof page>) => Object.fromEntries(texts(layout.layers).filter((layer) => layer.size === BODY.size).map((layer) => [layer.text, `${layer.weight} ${layer.fill}`]))
    // To start with the story is grey and the highlight white.
    expect(fills(page(content))).toMatchObject({ 'The story, with': `400 ${TONES.grey}`, 'in it.': `400 ${TONES.grey}`, 'A date, and': `400 ${TONES.light}` })
    expect(fills(page({ ...content, bodyTone: 'light', detailsTone: 'grey' }))).toMatchObject({ 'The story, with': `400 ${TONES.light}`, 'A date, and': `400 ${TONES.grey}` })
    // Words in two stars are bold and white either way.
    for (const tones of [{}, { bodyTone: 'light' as const, detailsTone: 'grey' as const }]) {
      expect(fills(page({ ...content, ...tones }))).toMatchObject({ 'a name': `700 ${TONES.light}`, 'a place': `700 ${TONES.light}` })
    }
    // A title page starts with its story in the grey; a label page's list is white, with its names in bold.
    expect(PAGE_KINDS.title.sample).toMatchObject({ bodyTone: 'grey', detailsTone: 'light' })
    expect(PAGE_KINDS.label.sample).toMatchObject({ bodyTone: 'light', detailsTone: 'light' })
  })

  it('sets the page in other sizes and weights when they are being tried', () => {
    const content = { label: 'Meet the artists', title: 'The closure follows a months-long legal dispute', body: 'The story.\n**A bold line.**\n*A lighter one.*\n- A bullet', details: 'A date', image: 'none' as const }
    const tried = { title: { largest: 80, smallest: 60, weight: 800, lineHeight: 1 }, text: { size: 30, large: 36, weight: 400, lineHeight: 1.5 }, details: { size: 26, large: 34, weight: 600 }, strong: { weight: 900 }, semi: { weight: 500 }, label: { size: 60, weight: 900 } }
    const layout = layoutInside(content, measure, {}, ink, tried)
    const lines = texts(layout.layers)
    const find = (value: string) => lines.find((layer) => layer.text === value)!
    expect(find('MEET THE ARTISTS')).toMatchObject({ size: 60, weight: 900 })
    // At 80 a line holds 24 characters, and the title's words fall into three of them.
    expect(layout).toMatchObject({ titleSize: 80, titleLines: 3 })
    const titles = lines.filter((layer) => layer.size === 80)
    expect(titles.every((layer) => layer.weight === 800)).toBe(true)
    expect(titles[1].y - titles[0].y).toBeCloseTo(80, 1)
    expect(find('The story.')).toMatchObject({ size: 30, weight: 400, fill: BODY.fill })
    expect(find('A date').fill).toBe(DETAILS.fill)
    expect(find('A bold line.')).toMatchObject({ size: 30, weight: 900, fill: STRONG.fill })
    expect(find('A lighter one.')).toMatchObject({ size: 30, weight: 500, fill: SEMI.fill })
    expect(find('A bold line.').y - find('The story.').y).toBeCloseTo(30 * 1.5, 1)
    // The bullet's indent is the text's, so it shrinks with it.
    expect(find('A bullet').x).toBe(PAGE_MARGIN + Math.round(BODY.indent * 30 / BODY.size))
    expect(find('A date')).toMatchObject({ size: 26, weight: 600 })
    expect(texts(layoutInside({ ...content, large: true }, measure, {}, ink, tried).layers).find((layer) => layer.text === 'A date')).toMatchObject({ size: 34, weight: 600 })
    expect(texts(layoutInside({ ...content, bodyLarge: true }, measure, {}, ink, tried).layers).find((layer) => layer.text === 'The story.')).toMatchObject({ size: 36, weight: 400 })
    // A title that cannot come down further than its smallest runs over, as before.
    expect(layoutInside({ ...content, title: Array(40).fill('wordy').join(' ') }, measure, {}, ink, tried)).toMatchObject({ titleSize: 60, overflow: 'title' })
    // Smaller text leaves room for more of it.
    const room = (type: typeof tried) => layoutInside({ ...content, body: 'The story.' }, measure, {}, ink, type).bodyRoom
    expect(room(tried)).toBeGreaterThan(room({ ...tried, text: { ...tried.text, size: 44 }, details: { ...tried.details, size: 44 } }))
    // Left out, the page is set in the tool's own.
    expect(layoutInside(content, measure, {}, ink).layers).toEqual(layoutInside(content, measure, {}, ink, PAGE_TYPE).layers)
  })

  it('is empty until something is typed', () => {
    expect(page({ title: ' ', body: '\n', details: ' ' })).toMatchObject({ empty: true, overflow: null })
    expect(page({ title: '', body: 'Only a story.' })).toMatchObject({ empty: false, titleLines: 0 })
  })

  it('exports the picture inside its banner, under the marks and the words', () => {
    const layout = page()
    const mark: Layer = { kind: 'path', d: 'M0 0H10V10Z', fill: BRAND.yellow, angle: 0, cx: 0, cy: 0, place: { x: 914, y: 1198, scale: 0.8 } }
    const svg = insideSvg(layout, { photo: 'data:image/jpeg;base64,AAA', darken: 0.15, furniture: [mark], fontCss: '@font-face{}' })
    expect(svg).toContain('viewBox="0 0 1080 1350"')
    expect(svg).toContain(`<rect width="1080" height="1350" fill="${BRAND.dark}"/>`)
    expect(svg).toContain(`<image xlink:href="data:image/jpeg;base64,AAA" width="1080" height="${IMAGE_HEIGHTS.medium}"`)
    expect(svg).toContain(`<rect width="1080" height="${IMAGE_HEIGHTS.medium}" fill="#000" opacity="0.15"/>`)
    expect(svg.indexOf('<image')).toBeLessThan(svg.indexOf('M0 0H10V10Z'))
    expect(svg.indexOf('M0 0H10V10Z')).toBeLessThan(svg.indexOf('<text'))
    expect(insideSvg(page({ image: 'none' }), { photo: 'data:image/jpeg;base64,AAA' })).not.toContain('<image')
    // Lower down the page, the picture and its darkening go where the banner is.
    const lower = insideSvg(page({ position: 'bottom' }), { photo: 'data:image/jpeg;base64,AAA', darken: 0.15 })
    const top = POST_FRAME.height - IMAGE_HEIGHTS.medium
    expect(lower).toContain(`<image xlink:href="data:image/jpeg;base64,AAA" y="${top}" width="1080" height="${IMAGE_HEIGHTS.medium}"`)
    expect(lower).toContain(`<rect y="${top}" width="1080" height="${IMAGE_HEIGHTS.medium}" fill="#000" opacity="0.15"/>`)
    // The label's tape is drawn under its lettering.
    const labelled = insideSvg(page({ label: 'Meet the artists' }))
    expect(labelled.indexOf(`fill="${BRAND.light}" transform="translate(${PAGE_MARGIN} `)).toBeGreaterThan(0)
    expect(labelled.indexOf('<path')).toBeLessThan(labelled.indexOf('MEET THE ARTISTS'))
  })

  it('comes in two kinds, each with its own words and its own example', () => {
    expect(insideDefaults).toMatchObject({ kind: 'title', kept: {}, ...PAGE_KINDS.title.sample })
    expect(PAGE_KINDS.title.sample).toMatchObject({ label: '', large: false, position: 'top' })
    expect(PAGE_KINDS.label.sample).toMatchObject({ label: 'Meet the artists', title: '', large: true, position: 'bottom' })
    // The examples show the marks at work: two stars for bold, one for semibold.
    const weights = (kind: 'title' | 'label') => new Set(texts(layoutInside({ ...insideDefaults, ...PAGE_KINDS[kind].sample }, measure, {}, ink).layers).map((layer) => layer.weight))
    expect(weights('title')).toEqual(new Set([TITLE.weight, BODY.weight, STRONG.weight]))
    expect(weights('label')).toEqual(new Set([LABEL.weight, STRONG.weight, BODY.weight, SEMI.weight]))
    // Each example fits its page.
    for (const kind of ['title', 'label'] as const) {
      const layout = layoutInside({ ...insideDefaults, ...PAGE_KINDS[kind].sample }, measure, {}, ink)
      expect(layout).toMatchObject({ overflow: null, empty: false })
      expect(layout.label === null).toBe(kind === 'title')
      expect(layout.titleLines === 0).toBe(kind === 'label')
    }
    // Switching keeps what was typed, and brings it back.
    const typed = { ...insideDefaults, title: 'My own title', body: 'My own story', cut: 'torn' as const }
    const asLabel = switchKind(typed, 'label')
    expect(asLabel).toMatchObject({ kind: 'label', ...PAGE_KINDS.label.sample, cut: 'torn' })
    expect(asLabel.kept.title).toMatchObject({ title: 'My own title', body: 'My own story', position: 'top' })
    const changed = { ...asLabel, label: 'Line-up', position: 'middle' as const }
    const back = switchKind(changed, 'title')
    expect(back).toMatchObject({ kind: 'title', title: 'My own title', body: 'My own story', label: '', position: 'top' })
    expect(switchKind(back, 'label')).toMatchObject({ kind: 'label', label: 'Line-up', position: 'middle' })
    expect(switchKind(back, 'title')).toBe(back)
  })

  it('replaces invalid stored values instead of trusting them', () => {
    expect(sanitizeInside({ kind: 'poster', kept: 'all', label: 9, cut: 'jagged', seed: 'seven', title: 4, body: null, details: 7, image: 'huge', position: 'left', logo: 'middle', arrow: 'yes', arrowColour: 'pink' })).toEqual(insideDefaults)
    const kept = { label: { label: 'Line-up', title: '', body: 'Names', details: '', large: true, bodyLarge: true, pinned: true, bodyTone: 'light', detailsTone: 'grey', image: 'short', position: 'bottom', arrow: true, arrowColour: 'dark' } }
    const chosen = { kind: 'title', kept, label: 'Meet the artists', cut: 'torn', seed: 42, title: 'A title', body: 'A story', details: 'A date', large: true, bodyLarge: true, pinned: true, bodyTone: 'light', detailsTone: 'grey', image: 'none', position: 'middle', logo: 'left', arrow: false, arrowColour: 'yellow' }
    expect(sanitizeInside(chosen)).toEqual(chosen)
    // What is kept is checked too, and only for the kind the page is not.
    expect(sanitizeInside({ ...chosen, kept: { title: kept.label, label: { label: 5, body: 'Names', large: 'yes', bodyTone: 'pink', position: 'sideways', image: 'short', arrow: true, arrowColour: 'dark' } } }).kept)
      .toEqual({ label: { ...PAGE_KINDS.label.sample, body: 'Names', details: '', large: false, pinned: false, bodyTone: 'grey', detailsTone: 'light', image: 'short', arrow: true, arrowColour: 'dark' } })
  })

  it('keeps the picture’s height and the arrow a page had when both kinds shared them', () => {
    // Saved before each kind had its own: both kinds take what the page had, and the arrow the colour it had on the cover.
    const before = { kind: 'title', title: 'A title', body: 'A story', details: 'A date', image: 'short', position: 'top', arrow: true, kept: { label: { label: 'Line-up', title: '', body: 'Names', details: '', position: 'bottom' } } }
    const loaded = sanitizeInside(before, 'yellow')
    expect(loaded).toMatchObject({ image: 'short', arrow: true, arrowColour: 'yellow' })
    expect(loaded.kept.label).toMatchObject({ image: 'short', arrow: true, arrowColour: 'yellow', position: 'bottom' })
    // With no colour to go by, the arrow takes the example's.
    expect(sanitizeInside(before).arrowColour).toBe(PAGE_KINDS.title.sample.arrowColour)
    // A page with nothing of its own saved is the example, whatever the cover's arrow was.
    expect(sanitizeInside({}, 'yellow')).toEqual(insideDefaults)
    // A colour of its own, once chosen, is kept.
    expect(sanitizeInside({ ...before, arrowColour: 'dark' }, 'yellow').arrowColour).toBe('dark')
    // It is set the way pages were before they had switches, not the way the examples now are.
    const was = { large: false, bodyLarge: false, pinned: false, bodyTone: 'grey', detailsTone: 'light' }
    expect(loaded).toMatchObject(was)
    expect(loaded.kept.label).toMatchObject(was)
    expect(PAGE_KINDS.title.sample.pinned).toBe(true)
    expect(PAGE_KINDS.label.sample.bodyTone).toBe('light')
  })

  it('reads older saved pages as they were meant', () => {
    const chosen = { kind: 'title', title: 'A title', body: 'A story', details: 'A date', image: 'none', cut: 'torn', seed: 42 }
    // A page saved before the highlight could be set a size up has it at the text's size.
    expect(sanitizeInside({ title: 'A title', body: 'A story', details: 'A date' }).large).toBe(false)
    // A page saved before there were kinds is a label page only if a label is all it opens with.
    expect(sanitizeInside({ label: 'Meet the artists', title: '', body: 'Names' }).kind).toBe('label')
    expect(sanitizeInside({ label: 'Meet the artists', title: 'A title', body: 'A story' }).kind).toBe('title')
    expect(sanitizeInside({ title: '', body: 'A story' }).kind).toBe('title')
    expect(sanitizeInside({ ...chosen, image: 'fill' }).image).toBe('fill')
    expect(sanitizeInside({ ...chosen, seed: -3.5 }).seed).toBe(1)
    expect(sanitizeInside({ ...chosen, seed: Infinity }).seed).toBe(insideDefaults.seed)
    // A page saved before the label and the position existed keeps its picture, at the top, with no label.
    expect(sanitizeInside({ title: 'A title', body: 'A story', details: '', image: 'tall' })).toMatchObject({ label: '', cut: 'clean', position: 'top', image: 'tall' })
    // A page saved before details existed gets none, not the sample ones.
    expect(sanitizeInside({ title: 'A title', body: 'A story' }).details).toBe('')
  })
})
