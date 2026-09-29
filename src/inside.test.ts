import { describe, expect, it } from 'vitest'
import { BRAND, type Layer } from './artwork'
import { furnitureBoxes } from './furniture'
import { wrapText } from './geometry'
import { BODY, DETAILS, FILL_SMALLEST, IMAGE_HEIGHTS, INSIDE_MARKS, LABEL, PAGE_MARGIN, PAGE_TYPE, STRONG, TEXT_WIDTH, TITLE, insideDefaults, insideSvg, layoutInside, PAGE_KINDS, readLines, sanitizeInside, switchKind, type MeasureInk, type MeasureWidth } from './inside'
import { POST_FRAME } from './settings'

// A stand-in for canvas: every character is half an em wide.
const measure: MeasureWidth = (text, size) => text.length * size * 0.5
const ink: MeasureInk = (text, size) => ({ width: text.length * size * 0.5, originOffset: 0, ascent: size * 0.7, descent: 0 })
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

  it('keeps the words clear of the arrow and, with no picture, of the logo', () => {
    const marks = furnitureBoxes({ logo: 'left', arrow: true }, POST_FRAME, INSIDE_MARKS)
    expect(marks.logo).toMatchObject({ x: PAGE_MARGIN, y: PAGE_MARGIN, width: 128 })
    expect(marks.arrow!.x + marks.arrow!.width).toBeCloseTo(POST_FRAME.width - PAGE_MARGIN, 5)
    const withArrow = page({}, { arrowTop: marks.arrow!.y })
    expect(withArrow.bodyRoom).toBeLessThan(page().bodyRoom)
    const underLogo = page({ image: 'none' }, { logoBottom: marks.logo!.y + marks.logo!.height })
    expect(Math.min(...texts(underLogo.layers).map((layer) => layer.y - layer.size))).toBeGreaterThan(marks.logo!.y + marks.logo!.height)
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
    // The arrow sits on the picture, so it takes no more from the words.
    expect(page({ position: 'bottom', image: 'short' }, { arrowTop: 1250 }).bodyRoom).toBe(layout.bodyRoom)
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

  it('starts a new page with a picture that fills, at the top, and no arrow', () => {
    expect(insideDefaults).toMatchObject({ image: 'fill', position: 'top', label: '', arrow: false, logo: 'off' })
    const layout = layoutInside(insideDefaults, measure, {}, ink)
    expect(layout.banner!.y).toBe(0)
    expect(layout.banner!.height).toBeGreaterThan(FILL_SMALLEST)
    expect(layout.overflow).toBeNull()
  })

  it('wraps a long label inside the margins', () => {
    const layout = page({ label: 'Everything you need to know before you go out tonight', image: 'none' })
    const lettering = texts(layout.layers).filter((layer) => layer.weight === LABEL.weight && layer.fill === BRAND.dark)
    expect(lettering.length).toBeGreaterThan(1)
    expect(layout.label!.x + layout.label!.width).toBeLessThan(POST_FRAME.width - PAGE_MARGIN + 1)
    expect(lettering[1].y - lettering[0].y).toBeCloseTo(LABEL.size * 0.94, 1)
  })

  it('reads a blank line as a new paragraph, a dash as a bullet and stars as bold', () => {
    const read = (typed: string) => readLines(typed).map((paragraph) => paragraph.map(({ text, bullet, strong }) => ({ text, bullet, strong })))
    expect(read('First.\n\n  Second   one. \nSame paragraph.\n\n- A bullet\n• Another\n\n*Ishmael Claxton*\nPhotography\n**Sean Conroy**\n')).toEqual([
      [{ text: 'First.', bullet: false, strong: false }],
      [{ text: 'Second one.', bullet: false, strong: false }, { text: 'Same paragraph.', bullet: false, strong: false }],
      [{ text: 'A bullet', bullet: true, strong: false }, { text: 'Another', bullet: true, strong: false }],
      [{ text: 'Ishmael Claxton', bullet: false, strong: true }, { text: 'Photography', bullet: false, strong: false }, { text: 'Sean Conroy', bullet: false, strong: true }],
    ])
  })

  it('reads words in stars anywhere in a line, and leaves other stars alone', () => {
    const runs = (typed: string) => readLines(typed)[0][0].runs
    expect(runs('When **The theatre**')).toEqual([{ text: 'When ', strong: false }, { text: 'The theatre', strong: true }])
    expect(runs('With *AE MAK*, *Zaska* and more')).toEqual([
      { text: 'With ', strong: false }, { text: 'AE MAK', strong: true }, { text: ', ', strong: false }, { text: 'Zaska', strong: true }, { text: ' and more', strong: false },
    ])
    expect(runs('- *Doors* at six')).toEqual([{ text: 'Doors', strong: true }, { text: ' at six', strong: false }])
    expect(runs('(*free*)')).toEqual([{ text: '(', strong: false }, { text: 'free', strong: true }, { text: ')', strong: false }])
    expect(readLines('*A whole line*')[0][0]).toMatchObject({ text: 'A whole line', strong: true, runs: [{ text: 'A whole line', strong: true }] })
    expect(readLines('*One* and *two*')[0][0]).toMatchObject({ text: 'One and two', strong: false })
    // Stars that hug nothing, stand in a sum or come one to a side are just stars.
    for (const plain of ['5* hotel', '* not bold *', '2*3*4', 'A *lone star', '**two and one*', '***']) {
      expect(readLines(plain)[0][0]).toMatchObject({ text: plain, strong: false, runs: [{ text: plain, strong: false }] })
    }
  })

  it('sets words in stars in their place in the line, and wraps the line as one', () => {
    const layout = page({ title: '', image: 'none', body: 'When *The theatre* opens', details: '' })
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
    const long = page({ title: '', image: 'none', details: '', body: `A free evening with *${names}* and (*friends*), all night` })
    const pieces = texts(long.layers)
    expect(long.bodyLines).toBeGreaterThan(1)
    expect(new Set(pieces.map((layer) => layer.y)).size).toBe(long.bodyLines)
    for (const piece of pieces) expect(piece.x + wide(piece.text)).toBeLessThanOrEqual(PAGE_MARGIN + TEXT_WIDTH + 0.01)
    // A word set two ways stays whole: its parts touch, on one line.
    const open = pieces.find((layer) => layer.text.endsWith('('))!
    const friends = pieces.find((layer) => layer.text === 'friends')!
    const close = pieces.find((layer) => layer.text.startsWith('),'))!
    expect(friends).toMatchObject({ weight: STRONG.weight, y: open.y })
    expect(friends.x).toBeCloseTo(open.x + wide(open.text), 5)
    expect(close).toMatchObject({ text: '), all night', weight: BODY.weight, y: open.y })
    expect(close.x).toBeCloseTo(friends.x + wide('friends'), 5)
    // Words in stars count towards the room like any others.
    expect(long.bodyLines).toBe(page({ title: '', image: 'none', details: '', body: `A free evening with ${names} and (friends), all night` }).bodyLines)
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

  it('sets words in stars white and a little bolder, in the story or the highlight', () => {
    const layout = page({ body: '*Each artist will give a short presentation.*', details: '*Ishmael Claxton*\nPhotography' })
    const lines = texts(layout.layers).filter((layer) => layer.size === BODY.size)
    expect(lines.find((layer) => layer.text === 'Each artist will give a short presentation.')).toMatchObject({ weight: STRONG.weight, fill: STRONG.fill })
    expect(lines.find((layer) => layer.text === 'Ishmael Claxton')).toMatchObject({ weight: STRONG.weight, fill: STRONG.fill })
    expect(lines.find((layer) => layer.text === 'Photography')).toMatchObject({ weight: DETAILS.weight, fill: DETAILS.fill })
    expect(STRONG).toEqual({ weight: 500, fill: TITLE.fill })
    expect(STRONG.weight).toBeGreaterThan(BODY.weight)
  })

  it('sets the page in other sizes and weights when they are being tried', () => {
    const content = { label: 'Meet the artists', title: 'The closure follows a months-long legal dispute', body: 'The story.\n*A bold line.*\n- A bullet', details: 'A date', image: 'none' as const }
    const tried = { title: { largest: 80, smallest: 60, weight: 800, lineHeight: 1 }, text: { size: 30, weight: 400, lineHeight: 1.5 }, details: { size: 26, large: 34, weight: 600 }, strong: { weight: 900 }, label: { size: 60, weight: 900 } }
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
    expect(find('A bold line.').y - find('The story.').y).toBeCloseTo(30 * 1.5, 1)
    // The bullet's indent is the text's, so it shrinks with it.
    expect(find('A bullet').x).toBe(PAGE_MARGIN + Math.round(BODY.indent * 30 / BODY.size))
    expect(find('A date')).toMatchObject({ size: 26, weight: 600 })
    expect(texts(layoutInside({ ...content, large: true }, measure, {}, ink, tried).layers).find((layer) => layer.text === 'A date')).toMatchObject({ size: 34, weight: 600 })
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
    // Each example fits its page, with a picture that fills.
    for (const kind of ['title', 'label'] as const) {
      const layout = layoutInside({ ...insideDefaults, ...PAGE_KINDS[kind].sample }, measure, {}, ink)
      expect(layout).toMatchObject({ overflow: null, empty: false })
      expect(layout.label === null).toBe(kind === 'title')
      expect(layout.titleLines === 0).toBe(kind === 'label')
    }
    // Switching keeps what was typed, and brings it back.
    const typed = { ...insideDefaults, title: 'My own title', body: 'My own story', cut: 'torn' as const }
    const asLabel = switchKind(typed, 'label')
    expect(asLabel).toMatchObject({ kind: 'label', ...PAGE_KINDS.label.sample, cut: 'torn', image: 'fill' })
    expect(asLabel.kept.title).toMatchObject({ title: 'My own title', body: 'My own story', position: 'top' })
    const changed = { ...asLabel, label: 'Line-up', position: 'middle' as const }
    const back = switchKind(changed, 'title')
    expect(back).toMatchObject({ kind: 'title', title: 'My own title', body: 'My own story', label: '', position: 'top' })
    expect(switchKind(back, 'label')).toMatchObject({ kind: 'label', label: 'Line-up', position: 'middle' })
    expect(switchKind(back, 'title')).toBe(back)
  })

  it('replaces invalid stored values instead of trusting them', () => {
    expect(sanitizeInside({ kind: 'poster', kept: 'all', label: 9, cut: 'jagged', seed: 'seven', title: 4, body: null, details: 7, image: 'huge', position: 'left', logo: 'middle', arrow: 'yes' })).toEqual(insideDefaults)
    const kept = { label: { label: 'Line-up', title: '', body: 'Names', details: '', large: true, position: 'bottom' } }
    const chosen = { kind: 'title', kept, label: 'Meet the artists', cut: 'torn', seed: 42, title: 'A title', body: 'A story', details: 'A date', large: true, image: 'none', position: 'middle', logo: 'left', arrow: false }
    expect(sanitizeInside(chosen)).toEqual(chosen)
    // What is kept is checked too, and only for the kind the page is not.
    expect(sanitizeInside({ ...chosen, kept: { title: kept.label, label: { label: 5, body: 'Names', large: 'yes', position: 'sideways' } } }).kept).toEqual({ label: { ...PAGE_KINDS.label.sample, body: 'Names', details: '', large: false } })
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
