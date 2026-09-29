import { describe, expect, it } from 'vitest'
import { BRAND, type Layer } from './artwork'
import { LOGO_WIDTH, buildFurniture, furnitureBoxes, furnitureReserve } from './furniture'
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH, SAFE_MARGIN } from './settings'

const both = { logo: 'right', swipe: true } as const
const paths = (layers: Layer[]) => layers.flatMap((layer) => (layer.kind === 'path' ? [layer] : []))

describe('cover furniture', () => {
  it('sits the logo in a top corner of the safe area, on the side asked for', () => {
    const right = furnitureBoxes(both).logo!
    expect(right.width).toBeCloseTo(LOGO_WIDTH, 5)
    expect(right.x + right.width).toBeCloseTo(ARTBOARD_WIDTH - SAFE_MARGIN, 5)
    expect(right.y).toBe(SAFE_MARGIN)
    const left = furnitureBoxes({ logo: 'left', swipe: false }).logo!
    expect(left.x).toBe(SAFE_MARGIN)
    expect(left.y).toBe(SAFE_MARGIN)
    // Both lock-ups are the same artwork with DUBLIN moved, so they take up the same room.
    expect(Math.abs(left.height - right.height)).toBeLessThan(1)
  })

  it('stands the swipe words on the bottom safe line, with the arrow ending on the right one', () => {
    const { words, arrow } = furnitureBoxes(both)
    expect(words!.y + words!.height).toBeCloseTo(ARTBOARD_HEIGHT - SAFE_MARGIN, 5)
    expect(arrow!.x + arrow!.width).toBeCloseTo(ARTBOARD_WIDTH - SAFE_MARGIN, 5)
    expect(words!.x + words!.width).toBeLessThan(arrow!.x)
    // The arrow's point is level with the middle of the words.
    expect(arrow!.y).toBeLessThan(words!.y)
    expect(arrow!.y + arrow!.height).toBeGreaterThan(words!.y + words!.height / 2)
  })

  it('draws every mark in place, in the yellow of the rest of the cover', () => {
    const layers = paths(buildFurniture(both, 'photo'))
    expect(layers).toHaveLength(9) // seven logo paths, the words, the arrow
    expect(layers.every((layer) => layer.fill === BRAND.yellow && layer.place && layer.place.scale > 0)).toBe(true)
    const logo = furnitureBoxes(both).logo!
    expect(layers[0].place).toMatchObject({ x: logo.x, y: logo.y })
  })

  it('turns black on the yellow background, where yellow would vanish', () => {
    expect(paths(buildFurniture(both, 'yellow')).every((layer) => layer.fill === BRAND.dark)).toBe(true)
  })

  it('draws only what is switched on', () => {
    expect(buildFurniture({ logo: 'off', swipe: false }, 'photo')).toHaveLength(0)
    expect(buildFurniture({ logo: 'left', swipe: false }, 'photo')).toHaveLength(7)
    expect(buildFurniture({ logo: 'off', swipe: true }, 'photo')).toHaveLength(2)
  })

  it('reserves room for each mark, and none when it is off', () => {
    expect(furnitureReserve({ logo: 'off', swipe: false })).toEqual({ top: 0, bottom: 0 })
    const reserve = furnitureReserve(both)
    const boxes = furnitureBoxes(both)
    expect(reserve.top).toBeGreaterThan(boxes.logo!.height)
    expect(ARTBOARD_HEIGHT - SAFE_MARGIN - reserve.bottom).toBeLessThan(Math.min(boxes.words!.y, boxes.arrow!.y))
    expect(furnitureReserve({ logo: 'right', swipe: false })).toEqual({ top: reserve.top, bottom: 0 })
  })
})
