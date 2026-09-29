import { describe, expect, it } from 'vitest'
import { BRAND, getPlacement, type Layer } from './artwork'
import { ARROW_WIDTH, LOGO_WIDTH, READS_FROM, buildFurniture, contrast, furnitureBoxes, furnitureObstacles, luminanceOf, settleColour, type ColourChoice } from './furniture'
import { buildShape } from './geometry'
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH, SAFE_MARGIN, defaults } from './settings'

const both = { logo: 'right', arrow: true } as const
const yellow = { logo: 'yellow', arrow: 'yellow' } as const
const paths = (layers: Layer[]) => layers.flatMap((layer) => (layer.kind === 'path' ? [layer] : []))

describe('cover furniture', () => {
  it('sits the logo in a top corner of the safe area, on the side asked for', () => {
    const right = furnitureBoxes(both).logo!
    expect(right.width).toBeCloseTo(LOGO_WIDTH, 5)
    expect(right.x + right.width).toBeCloseTo(ARTBOARD_WIDTH - SAFE_MARGIN, 5)
    expect(right.y).toBe(SAFE_MARGIN)
    const left = furnitureBoxes({ logo: 'left', arrow: false }).logo!
    expect(left.x).toBe(SAFE_MARGIN)
    expect(left.y).toBe(SAFE_MARGIN)
    // Both lock-ups are the same artwork with DUBLIN moved, so they take up the same room.
    expect(Math.abs(left.height - right.height)).toBeLessThan(1)
  })

  it('sits the swipe arrow in the bottom right corner of the safe area, at the size it was drawn', () => {
    const arrow = furnitureBoxes(both).arrow!
    expect(arrow.width).toBeCloseTo(ARROW_WIDTH, 5)
    expect(arrow.x + arrow.width).toBeCloseTo(ARTBOARD_WIDTH - SAFE_MARGIN, 5)
    expect(arrow.y + arrow.height).toBeCloseTo(ARTBOARD_HEIGHT - SAFE_MARGIN, 5)
  })

  it('draws each mark in place and in its own colour', () => {
    const layers = paths(buildFurniture(both, { logo: 'light', arrow: 'yellow' }))
    expect(layers).toHaveLength(8) // seven logo paths and the arrow
    expect(layers.slice(0, 7).every((layer) => layer.fill === BRAND.light)).toBe(true)
    expect(layers[7].fill).toBe(BRAND.yellow)
    expect(layers.every((layer) => layer.place && layer.place.scale > 0)).toBe(true)
    const boxes = furnitureBoxes(both)
    expect(layers[0].place).toMatchObject({ x: boxes.logo!.x, y: boxes.logo!.y })
    expect(layers[7].place!.x).toBeCloseTo(boxes.arrow!.x, 1)
    expect(paths(buildFurniture(both, { logo: 'dark', arrow: 'dark' })).every((layer) => layer.fill === BRAND.dark)).toBe(true)
  })

  it('draws only what is switched on', () => {
    expect(buildFurniture({ logo: 'off', arrow: false }, yellow)).toHaveLength(0)
    expect(buildFurniture({ logo: 'left', arrow: false }, yellow)).toHaveLength(7)
    expect(buildFurniture({ logo: 'off', arrow: true }, yellow)).toHaveLength(1)
  })

  it('keeps clear space around each mark, and none for a mark that is off', () => {
    expect(furnitureObstacles({ logo: 'off', arrow: false })).toEqual([])
    const [logo, arrow] = furnitureObstacles(both)
    const boxes = furnitureBoxes(both)
    expect(logo.bottom).toBeGreaterThan(boxes.logo!.y + boxes.logo!.height)
    expect(logo.left).toBeLessThan(boxes.logo!.x)
    expect(arrow.top).toBeLessThan(boxes.arrow!.y)
    expect(arrow.left).toBeLessThan(boxes.arrow!.x)
    expect(furnitureObstacles({ logo: 'right', arrow: false })).toEqual([logo])
  })
})

describe('headline and marks', () => {
  const bounds = { ascent: 62, descent: 17 }
  const narrow = buildShape({ ...defaults, fontSize: 80 }, ['How to Make the', 'Most of a Weekend', 'Visit to Dublin'], [520, 560, 470], [], bounds)
  const wide = buildShape({ ...defaults, fontSize: 80, column: 'wide' }, ['One of Dublin’s Best-Known', 'Independent Cinemas Has'], [900, 860], [], bounds)
  const obstacles = furnitureObstacles(both)
  const clear = (shape: typeof narrow, place: { x: number; y: number }) => obstacles.every((obstacle) =>
    shape.inkBox!.left + place.x >= obstacle.right - 0.01 || shape.inkBox!.right + place.x <= obstacle.left + 0.01
    || shape.inkBox!.top + place.y >= obstacle.bottom - 0.01 || shape.inkBox!.bottom + place.y <= obstacle.top + 0.01)

  it('leaves a headline that is beside the marks where it was put', () => {
    for (const position of [{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 0, y: 100 }]) {
      expect(getPlacement(narrow, position, obstacles)).toEqual(getPlacement(narrow, position))
    }
  })

  it('moves a headline that would sit on a mark clear of it, inside the safe area', () => {
    for (const shape of [narrow, wide]) {
      for (let x = 0; x <= 100; x += 10) {
        for (let y = 0; y <= 100; y += 5) {
          const place = getPlacement(shape, { x, y }, obstacles)
          expect(clear(shape, place), `${x},${y}`).toBe(true)
          expect(shape.inkBox!.left + place.x).toBeGreaterThanOrEqual(SAFE_MARGIN - 0.01)
          expect(shape.inkBox!.right + place.x).toBeLessThanOrEqual(ARTBOARD_WIDTH - SAFE_MARGIN + 0.01)
          expect(shape.inkBox!.top + place.y).toBeGreaterThanOrEqual(SAFE_MARGIN - 0.01)
          expect(shape.inkBox!.bottom + place.y).toBeLessThanOrEqual(ARTBOARD_HEIGHT - SAFE_MARGIN + 0.01)
        }
      }
    }
  })

  it('starts a full-width headline under the logo at Top, and stops it above the arrow at Bottom', () => {
    const [logo, arrow] = obstacles
    expect(wide.inkBox!.top + getPlacement(wide, { x: 0, y: 0 }, obstacles).y).toBeCloseTo(logo.bottom, 1)
    expect(wide.inkBox!.bottom + getPlacement(wide, { x: 0, y: 100 }, obstacles).y).toBeCloseTo(arrow.top, 1)
  })
})

describe('mark colour', () => {
  const ground = (red: number, green: number, blue: number, darken = 0.15) => [luminanceOf(red, green, blue, darken)]
  const settled = (samples: number[], choice: ColourChoice = 'auto', free = false) => settleColour(choice, samples, free)
  const marks = { yellow: luminanceOf(255, 239, 58), light: luminanceOf(240, 240, 240), dark: luminanceOf(16, 16, 16) }

  it('measures contrast from none to black on white, the same either way up', () => {
    expect(contrast(luminanceOf(0, 0, 0), luminanceOf(255, 255, 255))).toBeCloseTo(106, 0)
    expect(contrast(luminanceOf(255, 255, 255), luminanceOf(0, 0, 0))).toBeCloseTo(108, 0)
    expect(contrast(marks.yellow, marks.yellow)).toBe(0)
    expect(contrast(marks.light, marks.yellow)).toBe(0) // too close to tell apart
    expect(luminanceOf(200, 200, 200, 0.15)).toBeLessThan(luminanceOf(200, 200, 200))
  })

  it('agrees with the eye that light marks hold up on a blue sky', () => {
    const sky = luminanceOf(74, 144, 217)
    expect(contrast(marks.light, sky)).toBeGreaterThan(contrast(marks.dark, sky))
    expect(contrast(marks.yellow, sky)).toBeGreaterThan(READS_FROM)
  })

  it('keeps marks yellow wherever yellow reads, with nothing else to choose', () => {
    const reads = [
      ground(16, 16, 16, 0), // the Dark background
      ground(40, 24, 20), // a dim interior
      ground(160, 82, 45), // red brick
      ground(74, 144, 217), // blue sky
      ground(138, 138, 138), // grey stone
    ]
    for (const samples of reads) {
      expect(settled(samples)).toEqual({ colour: 'yellow', allowed: ['yellow'], yellowReads: true, reads: true })
      expect(settled(samples, 'dark').colour).toBe('yellow')
    }
  })

  it('turns dark where the ground is too bright for yellow', () => {
    for (const samples of [ground(200, 212, 224), ground(255, 255, 255), ground(255, 239, 58, 0)]) {
      expect(settled(samples)).toEqual({ colour: 'dark', allowed: ['dark'], yellowReads: false, reads: true })
      // Light is no better than yellow there, so it can't be chosen.
      expect(settled(samples, 'light').colour).toBe('dark')
    }
  })

  it('goes by most of the ground, not a bright or dark corner of it', () => {
    const [dim] = ground(40, 24, 20)
    const [bright] = ground(255, 255, 255)
    expect(settled([...Array(80).fill(dim), ...Array(20).fill(bright)]).colour).toBe('yellow')
    expect(settled([...Array(20).fill(dim), ...Array(80).fill(bright)]).colour).toBe('dark')
  })

  it('opens every colour, to be picked by eye, where nothing reads', () => {
    const [dim] = ground(40, 24, 20)
    const [bright] = ground(255, 255, 255)
    const split = [...Array(60).fill(dim), ...Array(40).fill(bright)]
    expect(settled(split)).toEqual({ colour: 'yellow', allowed: ['yellow', 'light', 'dark'], yellowReads: false, reads: false })
    expect(settled(split, 'light').colour).toBe('light')
    expect(settled(split, 'dark').colour).toBe('dark')
  })

  it('is yellow when there is nothing behind the mark to check', () => {
    expect(settled([])).toEqual({ colour: 'yellow', allowed: ['yellow'], yellowReads: true, reads: true })
  })

  it('lets any colour be set once the locks are lifted, and says when it is hard to read', () => {
    const bright = ground(255, 255, 255)
    expect(settled(bright, 'auto', true)).toMatchObject({ colour: 'dark', allowed: ['yellow', 'light', 'dark'], reads: true })
    expect(settled(bright, 'yellow', true)).toMatchObject({ colour: 'yellow', reads: false })
    expect(settled(ground(40, 24, 20), 'light', true)).toMatchObject({ colour: 'light', reads: true })
  })
})
