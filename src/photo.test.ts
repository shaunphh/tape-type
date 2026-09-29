import { describe, expect, it } from 'vitest'
import { CENTRED, MAX_ZOOM, clampView, dragPhoto, photoRect, photoSlack, visiblePart } from './photo'
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH } from './settings'

const photos = [
  { width: 3000, height: 2000 }, // landscape
  { width: 1800, height: 3200 }, // tall phone shot
  { width: 1080, height: 1350 }, // exactly the cover
  { width: 400, height: 300 }, // small
]
const views = [CENTRED, { x: 0, y: 0, zoom: 1 }, { x: 100, y: 100, zoom: 1 }, { x: 30, y: 80, zoom: 1.7 }, { x: 100, y: 0, zoom: MAX_ZOOM }]

describe('photo placement', () => {
  it('always covers the whole cover, wherever the photo is moved or zoomed', () => {
    for (const photo of photos) {
      for (const view of views) {
        const rect = photoRect(photo.width, photo.height, view)
        expect(rect.x).toBeLessThanOrEqual(1e-6)
        expect(rect.y).toBeLessThanOrEqual(1e-6)
        expect(rect.x + rect.width).toBeGreaterThanOrEqual(ARTBOARD_WIDTH - 1e-6)
        expect(rect.y + rect.height).toBeGreaterThanOrEqual(ARTBOARD_HEIGHT - 1e-6)
        expect(rect.width / rect.height).toBeCloseTo(photo.width / photo.height, 6)
      }
    }
  })

  it('centres the photo by default, as covers always have', () => {
    const rect = photoRect(3000, 2000, CENTRED)
    expect(rect.height).toBeCloseTo(ARTBOARD_HEIGHT, 6)
    expect(rect.x).toBeCloseTo((ARTBOARD_WIDTH - rect.width) / 2, 6)
  })

  it('shows a part of the photo that is the cover’s shape and inside the photo', () => {
    for (const photo of photos) {
      for (const view of views) {
        const part = visiblePart(photo.width, photo.height, view)
        expect(part.width / part.height).toBeCloseTo(ARTBOARD_WIDTH / ARTBOARD_HEIGHT, 6)
        expect(part.x).toBeGreaterThanOrEqual(-1e-6)
        expect(part.y).toBeGreaterThanOrEqual(-1e-6)
        expect(part.x + part.width).toBeLessThanOrEqual(photo.width + 1e-6)
        expect(part.y + part.height).toBeLessThanOrEqual(photo.height + 1e-6)
      }
    }
  })

  it('follows a drag pixel for pixel and stops at the photo’s edges', () => {
    const from = photoRect(3000, 2000, CENTRED)
    const moved = dragPhoto(3000, 2000, CENTRED, -120, 40)
    const to = photoRect(3000, 2000, moved)
    expect(to.x - from.x).toBeCloseTo(-120, 6)
    // A landscape photo that just covers the height has nowhere to go up or down.
    expect(photoSlack(3000, 2000, CENTRED).y).toBe(0)
    expect(moved.y).toBe(CENTRED.y)
    expect(dragPhoto(3000, 2000, CENTRED, 5000, 0).x).toBe(0)
    expect(dragPhoto(3000, 2000, CENTRED, -5000, 0).x).toBe(100)
  })

  it('can move both ways once zoomed in', () => {
    const zoomed = { ...CENTRED, zoom: 1.5 }
    const slack = photoSlack(3000, 2000, zoomed)
    expect(slack.x).toBeGreaterThan(0)
    expect(slack.y).toBeGreaterThan(0)
    const from = photoRect(3000, 2000, zoomed)
    const to = photoRect(3000, 2000, dragPhoto(3000, 2000, zoomed, 50, -70))
    expect(to.x - from.x).toBeCloseTo(50, 6)
    expect(to.y - from.y).toBeCloseTo(-70, 6)
  })

  it('keeps stray values in range', () => {
    expect(clampView({ x: -20, y: 140, zoom: 9 })).toEqual({ x: 0, y: 100, zoom: MAX_ZOOM })
    expect(clampView({ x: Number.NaN, y: 50, zoom: 0.2 })).toEqual({ x: 0, y: 50, zoom: 1 })
  })
})
