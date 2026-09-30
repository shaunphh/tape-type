import labelSample from './assets/samples/label-page.jpg'
import titleSample from './assets/samples/title-page.jpg'
import { EXAMPLE, PAGE_KINDS, PAGE_KIND_NAMES, isTemplateKey, readWords, type PageKind, type PageStart, type PageWords } from './inside'
import { commitFiles, type FileChange } from './github'
import { CENTRED, clampView, type PhotoView } from './photo'
import { slugOf, templateDocument, templateText } from './templateFile.mjs'
import type { ShapeMode } from './types'

export { slugOf }

/**
 * Templates: pages an inside page can start from. Each kind of page has its example first, then
 * the templates saved with "Save as template". A saved template is a file in
 * `src/templates/<kind>/`: its words and switches as JSON, and its picture beside it as a JPEG.
 * The tool on its dev server writes them into the project, to go out with the next push; the
 * published tool, opened with ?unlocked, commits them to the repository on GitHub itself.
 */
export interface PageTemplate extends PageStart {
  name: string
  /** What it is for, in a line. */
  note: string
  /** The picture it shows, and exports, until a photo of one's own is chosen. None shows its kind's sample. */
  photo: string | null
  /** How its picture is framed. */
  view: PhotoView
  /** When it was first saved: saved templates come in that order, after the example, which has none. */
  saved: string
}

/** The pictures the examples show, and any template without one of its own. */
export const SAMPLE_PICTURES: Record<PageKind, string> = { title: titleSample, label: labelSample }
/** How each sample is framed: the Culture Night screen sits to the right of its photo, the portrait's face near the top of its. */
const SAMPLE_VIEWS: Record<PageKind, PhotoView> = { title: { ...CENTRED, x: 100 }, label: { ...CENTRED, y: 12 } }

/** The examples leave a label's cut as it is: they have none of their own. */
const EXAMPLES: Record<PageKind, PageTemplate> = {
  title: { key: EXAMPLE, kind: 'title', name: 'Event', note: 'The story, then the date and place at the foot', words: PAGE_KINDS.title.sample, photo: null, view: SAMPLE_VIEWS.title, saved: '' },
  label: { key: EXAMPLE, kind: 'label', name: 'Meet the artists', note: 'Names in bold, each over what they do', words: PAGE_KINDS.label.sample, photo: null, view: SAMPLE_VIEWS.label, saved: '' },
}

const CUTS: readonly ShapeMode[] = ['plain', 'torn', 'clean', 'tape', 'cling', 'rough']
const MAX_SEED = 4294967295
const part = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {})
const number = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/**
 * Templates as the tool finds them: `./templates/<kind>/<key>.json`, each naming its picture beside
 * it. They are checked like anything stored: a file that isn't a template is left out. `fresh` puts
 * the time each was last saved on its picture's address, so one saved again is fetched again.
 */
export function readTemplates(files: Record<string, unknown>, pictures: Record<string, string>, fresh = false): PageTemplate[] {
  const found: PageTemplate[] = []
  for (const [path, data] of Object.entries(files)) {
    const [, folder, key] = /\/templates\/([^/]+)\/([^/]+)\.json$/.exec(path) ?? []
    if (!PAGE_KIND_NAMES.includes(folder as PageKind) || !isTemplateKey(key) || key === EXAMPLE || !data || typeof data !== 'object') continue
    const kind = folder as PageKind
    const stored = data as Record<string, unknown>
    const view = part(stored.view)
    const picture = typeof stored.photo === 'string' && /^[a-z0-9-]+\.jpg$/.test(stored.photo) ? pictures[path.replace(/[^/]+$/, stored.photo)] : undefined
    const updated = text(stored.updated)
    found.push({
      key,
      kind,
      name: text(stored.name) || key,
      note: text(stored.note),
      words: readWords(part(stored.words), kind),
      // Only a label page has a label to cut.
      ...(kind === 'label' && CUTS.includes(stored.cut as ShapeMode) ? { cut: stored.cut as ShapeMode } : {}),
      ...(kind === 'label' && Number.isInteger(stored.seed) && (stored.seed as number) >= 1 && (stored.seed as number) <= MAX_SEED ? { seed: stored.seed as number } : {}),
      photo: picture ? (fresh && updated ? `${picture}?t=${encodeURIComponent(updated)}` : picture) : null,
      view: clampView({ x: number(view.x, CENTRED.x), y: number(view.y, CENTRED.y), zoom: number(view.zoom, CENTRED.zoom) }),
      saved: text(stored.saved),
    })
  }
  return found.sort((a, b) => a.saved.localeCompare(b.saved) || a.name.localeCompare(b.name))
}

/** Every kind's templates: its example, then the saved ones, oldest first. */
export function templatesByKind(saved: PageTemplate[]): Record<PageKind, PageTemplate[]> {
  return { title: [EXAMPLES.title, ...saved.filter((template) => template.kind === 'title')], label: [EXAMPLES.label, ...saved.filter((template) => template.kind === 'label')] }
}

export const TEMPLATES = templatesByKind(readTemplates(
  import.meta.glob('./templates/*/*.json', { eager: true, import: 'default' }),
  import.meta.glob<string>('./templates/*/*.jpg', { eager: true, query: '?url', import: 'default' }),
  import.meta.env.DEV,
))

/** The template a page of this kind started from: its example if there is no such template, or no longer one. */
export const templateFor = (kind: PageKind, key: string | undefined, templates = TEMPLATES) =>
  templates[kind].find((template) => template.key === key) ?? templates[kind][0]

/** The picture a template shows: its own, or its kind's sample. */
export const pictureOf = (template: PageTemplate) => template.photo ?? SAMPLE_PICTURES[template.kind]

const ENDPOINT = '/__templates'

/** A template as it is sent to be saved. */
export interface TemplateDraft {
  name: string
  note: string
  kind: PageKind
  words: PageWords
  cut?: ShapeMode
  seed?: number
  view: PhotoView
  /** Its picture as a JPEG data URL, or none for its kind's sample. */
  photo: string | null
}

async function ask(input: string, init: RequestInit): Promise<{ key: string; file?: string }> {
  const response = await fetch(input, init)
  const answer = await response.json().catch(() => ({})) as { key?: string; file?: string; error?: string }
  if (!response.ok || !answer.key) throw new Error(answer.error ?? `the dev server answered ${response.status}`)
  return { key: answer.key, file: answer.file }
}

/** Saves a template, or saves over the one with its name. Answers with its key and where its file is. */
export const saveTemplate = (draft: TemplateDraft) =>
  ask(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) })

export const removeTemplate = (kind: PageKind, key: string) => ask(`${ENDPOINT}/${kind}/${key}`, { method: 'DELETE' })

/** This session's saves and removals on GitHub, which the published tool lists before it has been rebuilt with them. */
export interface Published {
  saved: PageTemplate[]
  /** `<kind>/<key>` of each template removed. */
  removed: string[]
}

/** The templates, with this session's saves in their place (or at the end) and its removals gone. */
export function withPublished(templates: Record<PageKind, PageTemplate[]>, published: Published): Record<PageKind, PageTemplate[]> {
  const listed = (kind: PageKind) => {
    const kept = templates[kind].filter((template) => !published.removed.includes(`${kind}/${template.key}`))
    for (const saved of published.saved.filter((template) => template.kind === kind)) {
      const at = kept.findIndex((template) => template.key === saved.key)
      if (at >= 0) kept[at] = saved
      else kept.push(saved)
    }
    return kept
  }
  return { title: listed('title'), label: listed('label') }
}

/**
 * Saves a template into the repository on GitHub, in one commit on main: its picture beside it if
 * it has one (a picture it had before goes, if it now has none). `over` is the template it saves
 * over, if any. Answers with the template as the tool lists it.
 */
export async function publishTemplate(draft: TemplateDraft, githubKey: string, over?: PageTemplate, fetcher?: typeof fetch): Promise<PageTemplate> {
  const key = slugOf(draft.name)
  if (!isTemplateKey(key) || key === EXAMPLE) throw new Error('give it a name with a letter or a number in it, other than the examples’')
  const photo = draft.photo ? /^data:image\/jpeg;base64,([A-Za-z0-9+/]+=*)$/.exec(draft.photo)?.[1] : undefined
  if (draft.photo && !photo) throw new Error('its picture has to be a JPEG')
  const now = new Date().toISOString()
  const document = templateDocument(draft, key, over?.saved || now, now)
  const folder = `src/templates/${draft.kind}`
  const changes: FileChange[] = [
    ...(photo ? [{ path: `${folder}/${key}.jpg`, base64: photo }] : over?.photo ? [{ path: `${folder}/${key}.jpg`, remove: true as const }] : []),
    { path: `${folder}/${key}.json`, text: templateText(document) },
  ]
  await commitFiles(githubKey, `${over ? 'Update' : 'Add'} the ${draft.kind} page template "${document.name}"`, changes, fetcher)
  return {
    key,
    kind: draft.kind,
    name: document.name,
    note: document.note,
    words: draft.words,
    ...(draft.kind === 'label' ? { cut: draft.cut, seed: draft.seed } : {}),
    photo: draft.photo,
    view: clampView(draft.view),
    saved: document.saved,
  }
}

/** Takes a template out of the repository on GitHub, its picture with it. */
export async function unpublishTemplate(template: PageTemplate, githubKey: string, fetcher?: typeof fetch) {
  const folder = `src/templates/${template.kind}`
  await commitFiles(githubKey, `Remove the ${template.kind} page template "${template.name}"`, [
    { path: `${folder}/${template.key}.json`, remove: true },
    ...(template.photo ? [{ path: `${folder}/${template.key}.jpg`, remove: true as const }] : []),
  ], fetcher)
}
