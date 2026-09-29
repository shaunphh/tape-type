import { PAGE_TYPE, type PageType } from './inside'

/**
 * Trying other sizes and weights on the inside page. It is for the person looking after the
 * tool, on their own machine: the published tool never shows it and never reads what it saved,
 * so its pages are always set in PAGE_TYPE. What is settled on here is then written into
 * PAGE_TYPE (the constants at the top of `inside.ts`) by hand.
 */
export const TYPE_KEY = 'tape-type-page-type-v1'

/** The weights of Barlow the tool carries, in the page and in its exports. */
export const TYPE_WEIGHTS = [400, 500, 600, 700, 800, 900] as const
export const WEIGHT_NAMES: Record<number, string> = { 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' }

/** How far each can be taken. */
export const TYPE_RANGE = {
  title: { size: { min: 36, max: 120 }, lineHeight: { min: 0.9, max: 1.4 } },
  text: { size: { min: 24, max: 60 }, lineHeight: { min: 1, max: 1.6 } },
  label: { size: { min: 28, max: 72 } },
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$/

/** The tool is running on this machine (its dev server, or a local address), not from the published site. */
export const isLocal = (hostname = typeof location === 'undefined' ? '' : location.hostname, dev: boolean = import.meta.env.DEV) =>
  dev || LOCAL_HOST.test(hostname)

const within = (value: unknown, { min, max }: { min: number; max: number }, fallback: number, step = 1) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.min(max, Math.max(min, value)) / step) * step : fallback
const weightOf = (value: unknown, fallback: number) => ((TYPE_WEIGHTS as readonly unknown[]).includes(value) ? value as number : fallback)
const part = (value: unknown) => (value && typeof value === 'object' ? value as Record<string, unknown> : {})
const hundredth = (value: number) => Math.round(value * 100) / 100

/** Stored sizes are untrusted, like everything else that is remembered. */
export function sanitizePageType(stored: Record<string, unknown>): PageType {
  const [title, text, details, strong, label] = [stored.title, stored.text, stored.details, stored.strong, stored.label].map(part)
  const largest = within(title.largest, TYPE_RANGE.title.size, PAGE_TYPE.title.largest)
  return {
    title: {
      largest,
      // The smallest is never the larger of the two.
      smallest: Math.min(largest, within(title.smallest, TYPE_RANGE.title.size, PAGE_TYPE.title.smallest)),
      weight: weightOf(title.weight, PAGE_TYPE.title.weight),
      lineHeight: hundredth(within(title.lineHeight, TYPE_RANGE.title.lineHeight, PAGE_TYPE.title.lineHeight, 0.01)),
    },
    text: {
      size: within(text.size, TYPE_RANGE.text.size, PAGE_TYPE.text.size),
      weight: weightOf(text.weight, PAGE_TYPE.text.weight),
      lineHeight: hundredth(within(text.lineHeight, TYPE_RANGE.text.lineHeight, PAGE_TYPE.text.lineHeight, 0.01)),
    },
    details: {
      size: within(details.size, TYPE_RANGE.text.size, PAGE_TYPE.details.size),
      weight: weightOf(details.weight, PAGE_TYPE.details.weight),
    },
    strong: { weight: weightOf(strong.weight, PAGE_TYPE.strong.weight) },
    label: {
      size: within(label.size, TYPE_RANGE.label.size, PAGE_TYPE.label.size),
      weight: weightOf(label.weight, PAGE_TYPE.label.weight),
    },
  }
}

export const sameType = (one: PageType, other: PageType) => JSON.stringify(one) === JSON.stringify(other)

/**
 * What was tried, from what is stored. A trial is kept with the tool's own values it started
 * from: once those change (a trial was written into the tool), it has done its job and is dropped.
 */
export function readPageType(stored: unknown): PageType {
  const { from, type } = part(stored)
  if (!from || !type || !sameType(sanitizePageType(part(from)), PAGE_TYPE)) return PAGE_TYPE
  return sanitizePageType(part(type))
}

/** What was last tried on this machine. Anywhere else, the tool's own. */
export function loadPageType(local = isLocal()): PageType {
  if (!local) return PAGE_TYPE
  try {
    return readPageType(JSON.parse(localStorage.getItem(TYPE_KEY) ?? 'null'))
  } catch {
    return PAGE_TYPE
  }
}

export function savePageType(type: PageType) {
  try {
    if (sameType(type, PAGE_TYPE)) localStorage.removeItem(TYPE_KEY)
    else localStorage.setItem(TYPE_KEY, JSON.stringify({ from: PAGE_TYPE, type }))
  } catch {
    // Blocked storage only costs remembering what was tried.
  }
}

const named = (weight: number) => `${WEIGHT_NAMES[weight] ?? ''} ${weight}`.trim()

/** The sizes and weights in words, for passing on. */
export function describePageType(type: PageType) {
  return [
    `Title: ${type.title.largest}px down to ${type.title.smallest}px, ${named(type.title.weight)}, line height ${type.title.lineHeight}`,
    `Text: ${type.text.size}px, ${named(type.text.weight)}, line height ${type.text.lineHeight}`,
    `Details: ${type.details.size}px, ${named(type.details.weight)}`,
    `Lines in stars: ${named(type.strong.weight)}`,
    `Label: ${type.label.size}px, ${named(type.label.weight)}`,
  ].join('\n')
}
