import { describe, expect, it } from 'vitest'
import { BRAND, type Layer } from './artwork'
import { furnitureBoxes } from './furniture'
import { BODY, DETAILS, IMAGE_HEIGHTS, INSIDE_MARKS, PAGE_MARGIN, STRONG, TEXT_WIDTH, TITLE, insideDefaults, insideSvg, layoutInside, readLines, sanitizeInside, type MeasureWidth } from './inside'
import { POST_FRAME } from './settings'

// A stand-in for canvas: every character is half an em wide.
const measure: MeasureWidth = (text, size) => text.length * size * 0.5
const texts = (layers: Layer[]) => layers.flatMap((layer) => (layer.kind === 'text' ? [layer] : []))
const page = (overrides: Partial<Parameters<typeof layoutInside>[0]> = {}, marks = {}) =>
  layoutInside({ title: 'The closure follows a months-long legal dispute', body: 'One paragraph of the story.\n\nAnd a second one.', details: '', image: 'medium', ...overrides }, measure, marks)

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

  it('sets the title as large as fits in three lines, between 50 and 72', () => {
    expect(page({ title: 'Ireland Music Week is back' }).titleSize).toBe(72)
    // 100 characters: three lines of 26 characters at 72 won't hold it, so it comes down.
    const long = page({ title: 'Bolands Mills is set to come alive this Culture Night with Milling About and Culture in Every Corner' })
    expect(long.titleSize).toBeLessThan(72)
    expect(long.titleSize).toBeGreaterThanOrEqual(50)
    expect(long.titleLines).toBeLessThanOrEqual(TITLE.mostLines)
    const tooLong = page({ title: Array(40).fill('wordy').join(' ') })
    expect(tooLong.titleSize).toBe(50)
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

  it('reads a blank line as a new paragraph, a dash as a bullet and stars as bold', () => {
    expect(readLines('First.\n\n  Second   one. \nSame paragraph.\n\n- A bullet\n• Another\n\n*Ishmael Claxton*\nPhotography\n**Sean Conroy**\n')).toEqual([
      [{ text: 'First.', bullet: false, strong: false }],
      [{ text: 'Second one.', bullet: false, strong: false }, { text: 'Same paragraph.', bullet: false, strong: false }],
      [{ text: 'A bullet', bullet: true, strong: false }, { text: 'Another', bullet: true, strong: false }],
      [{ text: 'Ishmael Claxton', bullet: false, strong: true }, { text: 'Photography', bullet: false, strong: false }, { text: 'Sean Conroy', bullet: false, strong: true }],
    ])
    // A star inside a line is just a star.
    expect(readLines('5* hotel\n* not bold *')[0].map((line) => line.strong)).toEqual([false, false])
  })

  it('sets lines of a paragraph close, paragraphs apart and bullets in between', () => {
    const pitch = BODY.size * BODY.lineHeight
    const body = (typed: string) => texts(page({ body: typed }).layers).filter((layer) => layer.size === BODY.size && layer.text !== '•')
    const [a, b] = body('A line\nAnd the next')
    expect(b.y - a.y).toBeCloseTo(pitch, 1)
    const [c, d] = body('A paragraph\n\nAnd the next')
    expect(d.y - c.y).toBeCloseTo(pitch + BODY.paragraphGap, 1)
    const layout = page({ body: 'The Dublin performance is one of the headline dates\n- Presale Monday\n- General sale Wednesday' })
    const lines = texts(layout.layers).filter((layer) => layer.size === BODY.size)
    expect(lines.filter((layer) => layer.text === '•')).toHaveLength(2)
    expect(lines.find((layer) => layer.text === 'Presale Monday')!.x).toBe(PAGE_MARGIN + BODY.indent)
    const [first, second] = lines.filter((layer) => layer.text !== '•' && layer.x > PAGE_MARGIN)
    expect(second.y - first.y).toBeCloseTo(pitch + BODY.bulletGap, 1)
  })

  it('sets the details under the story, the same size in a lighter weight', () => {
    const layout = page({ body: 'The story.', details: '22 September · 6.30pm\nThis Must Be The Place, Smithfield\nTickets via Eventbrite' })
    const lines = texts(layout.layers).filter((layer) => layer.size === BODY.size)
    const story = lines.find((layer) => layer.text === 'The story.')!
    const details = lines.filter((layer) => layer.weight === DETAILS.weight)
    expect(details.map((layer) => layer.text)).toEqual(['22 September · 6.30pm', 'This Must Be The Place, Smithfield', 'Tickets via Eventbrite'])
    expect(story.weight).toBe(BODY.weight)
    expect(DETAILS.weight).toBeLessThan(BODY.weight)
    expect(details[0].y).toBeGreaterThan(story.y + BODY.size * BODY.lineHeight)
    expect(details[1].y - details[0].y).toBeCloseTo(BODY.size * BODY.lineHeight, 1)
    expect(layout.bodyLines).toBe(4)
    // Details alone are a page too.
    expect(page({ title: '', body: '', details: 'Tickets via Eventbrite' })).toMatchObject({ empty: false, bodyLines: 1 })
  })

  it('sets a line in stars bold and white, in the story or the details', () => {
    const layout = page({ body: '*Each artist will give a short presentation.*', details: '*Ishmael Claxton*\nPhotography' })
    const lines = texts(layout.layers).filter((layer) => layer.size === BODY.size)
    expect(lines.find((layer) => layer.text === 'Each artist will give a short presentation.')).toMatchObject({ weight: STRONG.weight, fill: STRONG.fill })
    expect(lines.find((layer) => layer.text === 'Ishmael Claxton')).toMatchObject({ weight: STRONG.weight, fill: STRONG.fill })
    expect(lines.find((layer) => layer.text === 'Photography')).toMatchObject({ weight: DETAILS.weight, fill: BODY.fill })
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
  })

  it('replaces invalid stored values instead of trusting them', () => {
    expect(sanitizeInside({ title: 4, body: null, details: 7, image: 'huge', logo: 'middle', arrow: 'yes' })).toEqual(insideDefaults)
    const chosen = { title: 'A title', body: 'A story', details: 'A date', image: 'none', logo: 'left', arrow: false }
    expect(sanitizeInside(chosen)).toEqual(chosen)
    // A page saved before details existed gets none, not the sample ones.
    expect(sanitizeInside({ title: 'A title', body: 'A story' }).details).toBe('')
  })
})
