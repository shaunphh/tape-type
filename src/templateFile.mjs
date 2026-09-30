/**
 * A template's file as it is saved: by the dev server into src/templates, or by the published
 * tool into the repository on GitHub. Plain JavaScript, so the dev server can use it as well.
 */

/** The key a template is saved under, from its name: "News story" is news-story. */
export const slugOf = (name) =>
  name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).replace(/-$/, '')

/**
 * What goes in the template's JSON file. `saved` is when it was first saved, which keeps its place
 * in the list when it is saved again; `updated` is when it was saved last. Only a label page has a
 * label to cut; a template with a picture names it, beside it, after its key.
 */
export function templateDocument(draft, key, saved, updated) {
  return {
    name: String(draft.name ?? '').trim().slice(0, 60),
    note: typeof draft.note === 'string' ? draft.note.trim().slice(0, 120) : '',
    words: draft.words,
    ...(draft.kind === 'label' && typeof draft.cut === 'string' ? { cut: draft.cut } : {}),
    ...(draft.kind === 'label' && typeof draft.seed === 'number' ? { seed: draft.seed } : {}),
    view: draft.view && typeof draft.view === 'object' ? draft.view : { x: 50, y: 50, zoom: 1 },
    photo: draft.photo ? `${key}.jpg` : null,
    saved,
    updated,
  }
}

/** The file's text: indented, ending with a new line, as it is kept in the repository. */
export const templateText = (document) => `${JSON.stringify(document, null, 2)}\n`
