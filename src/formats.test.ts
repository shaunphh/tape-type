import { describe, expect, it } from 'vitest'
import { BRAND, buildLayers, getPlacement, placementRange, svgMarkup } from './artwork'
import { GRID_CROP, POST_LOOK, TAGS, VIDEO_FRAME, VIDEO_LOOKS, frameFor, lookFor, tagFor } from './formats'
import { furnitureBoxes, furnitureObstacles } from './furniture'
import { buildShape } from './geometry'
import { dragPhoto, photoRect, visiblePart, CENTRED } from './photo'
import { POST_FRAME, SAFE_MARGIN, defaults } from './settings'

const bounds = { ascent: 62, descent: 17 }
const eyebrow = { text: 'QUICK WATCH', fontSize: 40, width: 230, originOffset: -2, capHeight: 28 }
const shape = buildShape({ ...defaults, fontSize: 80 }, ['Protecting', 'Molly Malone'], [390, 520], [], bounds, { eyebrow })
const marks = { logo: 'right', arrow: true } as const

describe('video covers', () => {
  it('are 1080 × 1920, and the profile grid shows the middle three quarters', () => {
    expect(frameFor('video')).toBe(VIDEO_FRAME)
    expect(frameFor('post')).toBe(POST_FRAME)
    expect([VIDEO_FRAME.width, VIDEO_FRAME.height]).toEqual([1080, 1920])
    expect((GRID_CROP.bottom - GRID_CROP.top) / VIDEO_FRAME.width).toBeCloseTo(4 / 3, 6)
    expect(GRID_CROP.top).toBe(VIDEO_FRAME.height - GRID_CROP.bottom)
  })

  it('keep all lettering inside what the grid shows, wherever the words go', () => {
    for (const position of [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }, { x: 50, y: 50 }]) {
      const place = getPlacement(shape, position, furnitureObstacles(marks, VIDEO_FRAME), VIDEO_FRAME)
      const ink = shape.inkBox!
      expect(ink.top + place.y).toBeGreaterThanOrEqual(GRID_CROP.top + SAFE_MARGIN - 0.01)
      expect(ink.bottom + place.y).toBeLessThanOrEqual(GRID_CROP.bottom - SAFE_MARGIN + 0.01)
      expect(ink.left + place.x).toBeGreaterThanOrEqual(SAFE_MARGIN - 0.01)
      expect(ink.right + place.x).toBeLessThanOrEqual(VIDEO_FRAME.width - SAFE_MARGIN + 0.01)
    }
    expect(placementRange(shape, VIDEO_FRAME).y.excess).toBe(0)
  })

  it('put the logo and arrow in the corners of the whole cover, outside what the grid shows', () => {
    const { logo, arrow } = furnitureBoxes(marks, VIDEO_FRAME)
    expect(logo!.y).toBe(SAFE_MARGIN)
    expect(logo!.y + logo!.height).toBeLessThan(GRID_CROP.top)
    expect(arrow!.y + arrow!.height).toBeCloseTo(VIDEO_FRAME.height - SAFE_MARGIN, 5)
    expect(arrow!.y).toBeGreaterThan(GRID_CROP.bottom)
    expect(furnitureBoxes({ logo: 'left', arrow: false }, VIDEO_FRAME).logo!.x).toBe(SAFE_MARGIN)
    // So the words never have to step aside for them.
    for (const y of [0, 100]) {
      expect(getPlacement(shape, { x: 100, y }, furnitureObstacles(marks, VIDEO_FRAME), VIDEO_FRAME)).toEqual(getPlacement(shape, { x: 100, y }, [], VIDEO_FRAME))
    }
  })

  it('cover the whole frame with the photo, and crop it to the frame’s shape', () => {
    const rect = photoRect(3000, 2000, CENTRED, VIDEO_FRAME)
    expect(rect.height).toBeCloseTo(VIDEO_FRAME.height, 6)
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(VIDEO_FRAME.width)
    const part = visiblePart(3000, 2000, { x: 20, y: 60, zoom: 1.4 }, VIDEO_FRAME)
    expect(part.width / part.height).toBeCloseTo(VIDEO_FRAME.width / VIDEO_FRAME.height, 6)
    const moved = photoRect(3000, 2000, dragPhoto(3000, 2000, CENTRED, -90, 0, VIDEO_FRAME), VIDEO_FRAME)
    expect(moved.x - rect.x).toBeCloseTo(-90, 6)
  })

  it('export at the frame’s size, with the words where the preview has them', () => {
    const layers = buildLayers(shape, { tone: 'yellow', background: 'charcoal', weight: 700 }, 80)
    const svg = svgMarkup(layers, shape, { background: 'charcoal', position: { x: 0, y: 100 }, frame: VIDEO_FRAME })
    const placed = getPlacement(shape, { x: 0, y: 100 }, [], VIDEO_FRAME)
    expect(svg).toContain('viewBox="0 0 1080 1920" width="1080" height="1920"')
    expect(svg).toContain(`<rect width="1080" height="1920" fill="${BRAND.dark}"/>`)
    expect(svg).toContain(`<g transform="translate(${placed.x} ${placed.y})">`)
  })
})

describe('looks', () => {
  it('give each kind of video the tape, tag and place from the mock-ups', () => {
    expect(VIDEO_LOOKS.report).toMatchObject({ style: 'headline', eyebrow: 'Quick watch', position: { x: 0, y: 100 }, tag: { tape: BRAND.dark, text: BRAND.light } })
    expect(VIDEO_LOOKS.report.treatment).toMatchObject({ tone: 'yellow', perLine: false, align: 'left' })
    expect(VIDEO_LOOKS.presenter).toMatchObject({ style: 'headline', eyebrow: 'Quick guide', position: { x: 0, y: 0 }, tag: { tape: BRAND.light, text: BRAND.dark } })
    expect(VIDEO_LOOKS.presenter.treatment).toMatchObject({ tone: 'dark', perLine: false, align: 'left' })
    expect(VIDEO_LOOKS.feature).toMatchObject({ style: 'feature', eyebrow: null })
    expect(VIDEO_LOOKS.feature.treatment).toMatchObject({ tone: 'light', perLine: false, align: 'left', rotationVariance: 0 })
    expect(lookFor('post', 'presenter')).toBe(POST_LOOK)
    // A post's block starts low, where it suits most photos.
    expect(POST_LOOK.position).toEqual({ x: 0, y: 90 })
  })

  it('gives the eyebrow the look’s own colours, or the ones chosen', () => {
    expect(tagFor('auto', VIDEO_LOOKS.report)).toBe(VIDEO_LOOKS.report.tag)
    expect(tagFor('auto', POST_LOOK)).toBeUndefined()
    expect(tagFor('yellow', VIDEO_LOOKS.presenter)).toEqual({ tape: BRAND.yellow, text: BRAND.dark })
    expect(tagFor('light', VIDEO_LOOKS.report)).toEqual({ tape: BRAND.light, text: BRAND.dark })
    expect(tagFor('dark', VIDEO_LOOKS.feature)).toEqual({ tape: BRAND.dark, text: BRAND.light })
    // Its lettering is never the tape's own colour.
    for (const tag of Object.values(TAGS)) expect(tag.text).not.toBe(tag.tape)
    const layers = buildLayers(shape, { tone: 'yellow', background: 'photo', weight: 700, tag: tagFor('light', VIDEO_LOOKS.report) }, 80)
    expect(layers.find((layer) => layer.kind === 'path' && layer.d === shape.eyebrow!.path)).toMatchObject({ fill: BRAND.light })
    expect(layers.find((layer) => layer.kind === 'text' && layer.text === 'QUICK WATCH')).toMatchObject({ fill: BRAND.dark })
    expect(lookFor('video', 'presenter')).toBe(VIDEO_LOOKS.presenter)
  })

  it('colour the tag as the look says, and as before when it says nothing', () => {
    const tag = (options: Parameters<typeof buildLayers>[1]) => {
      const layers = buildLayers(shape, options, 80)
      const tape = layers.find((layer) => layer.kind === 'path' && layer.d === shape.eyebrow!.path)
      const words = layers.find((layer) => layer.kind === 'text' && layer.text === 'QUICK WATCH')
      return [tape?.fill, words?.fill]
    }
    expect(tag({ tone: 'yellow', background: 'photo', weight: 700, tag: VIDEO_LOOKS.report.tag })).toEqual([BRAND.dark, BRAND.light])
    expect(tag({ tone: 'dark', background: 'photo', weight: 700, tag: VIDEO_LOOKS.presenter.tag })).toEqual([BRAND.light, BRAND.dark])
    expect(tag({ tone: 'light', background: 'photo', weight: 700 })).toEqual([BRAND.yellow, BRAND.dark])
    expect(tag({ tone: 'yellow', background: 'photo', weight: 700 })).toEqual([BRAND.white, BRAND.dark])
  })
})
