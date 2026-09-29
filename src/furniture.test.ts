import { describe, expect, it } from 'vitest'
import { BRAND, getPlacement, type Layer } from './artwork'
import { ARROW_WIDTH, LOGO_WIDTH, buildFurniture, furnitureBoxes, furnitureObstacles, lightnessOf, pickMarkColour } from './furniture'
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
  const ground = (red: number, green: number, blue: number, darken = 0.15) => [lightnessOf(red, green, blue, darken)]

  it('measures lightness from black to white, darker under the photo’s black', () => {
    expect(lightnessOf(0, 0, 0)).toBeCloseTo(0, 5)
    expect(lightnessOf(255, 255, 255)).toBeCloseTo(100, 1)
    expect(lightnessOf(119, 119, 119)).toBeCloseTo(50, 0)
    expect(lightnessOf(200, 200, 200, 0.15)).toBeLessThan(lightnessOf(200, 200, 200))
  })

  it('is yellow on dark ground, light on mid tones and dark on bright ground', () => {
    expect(pickMarkColour(ground(16, 16, 16, 0))).toBe('yellow') // the Dark background
    expect(pickMarkColour(ground(40, 24, 20))).toBe('yellow') // a dim interior
    expect(pickMarkColour(ground(160, 82, 45))).toBe('yellow') // red brick
    expect(pickMarkColour(ground(74, 144, 217))).toBe('light') // blue sky, as on the mock-up
    expect(pickMarkColour(ground(138, 138, 138))).toBe('light') // grey stone
    expect(pickMarkColour(ground(200, 212, 224))).toBe('dark') // overcast sky
    expect(pickMarkColour(ground(255, 239, 58, 0))).toBe('dark') // the Yellow background
    expect(pickMarkColour(ground(255, 255, 255))).toBe('dark')
  })

  it('goes by most of the ground, not a bright or dark corner of it', () => {
    const mostlyDark = [...Array(80).fill(15), ...Array(20).fill(90)]
    const mostlyBright = [...Array(20).fill(15), ...Array(80).fill(90)]
    expect(pickMarkColour(mostlyDark)).toBe('yellow')
    expect(pickMarkColour(mostlyBright)).toBe('dark')
    expect(['light', 'dark']).toContain(pickMarkColour([...Array(50).fill(15), ...Array(50).fill(90)]))
  })

  it('is yellow when there is nothing behind the mark to go on', () => {
    expect(pickMarkColour([])).toBe('yellow')
  })
})
