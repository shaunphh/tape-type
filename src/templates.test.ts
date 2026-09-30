import { describe, expect, it } from 'vitest'
import { EXAMPLE, PAGE_KINDS } from './inside'
import { fakeGitHub, happyGitHub } from './fakeGitHub'
import { SAMPLE_PICTURES, TEMPLATES, pictureOf, publishTemplate, readTemplates, slugOf, templateFor, templatesByKind, unpublishTemplate, withPublished } from './templates'

const files = import.meta.glob('./templates/*/*.json', { eager: true, import: 'default' })
const words = { ...PAGE_KINDS.title.sample, title: 'News', image: 'medium' as const }

describe('templates', () => {
  it('reads saved templates from their files, and checks them like anything stored', () => {
    const found = readTemplates({
      './templates/title/news-story.json': { name: ' News story ', note: 'The numbers', words, cut: 'rough', seed: 5, view: { x: 100, y: 50, zoom: 1 }, photo: 'news-story.jpg', saved: '2026-09-30T09:00:00.000Z' },
      './templates/label/however.json': { name: 'However', words: { label: 'However', image: 'huge' }, cut: 'clean', seed: 42, view: { x: 400, zoom: 0 }, photo: '../../secret.jpg', saved: '2026-09-30T08:00:00.000Z' },
      // Not a kind of page, the examples' own key, not a key, and not a template.
      './templates/poster/big.json': { name: 'Big', words },
      './templates/title/example.json': { name: 'Example', words },
      './templates/title/Big News.json': { name: 'Big news', words },
      './templates/label/empty.json': null,
    }, { './templates/title/news-story.jpg': '/assets/news-story-a1b2.jpg', './secret.jpg': '/secret.jpg' })
    // Oldest first.
    expect(found.map((template) => template.key)).toEqual(['however', 'news-story'])
    const [however, news] = found
    // A title page has no label, so no cut comes with it.
    expect(news).toEqual({ key: 'news-story', kind: 'title', name: 'News story', note: 'The numbers', words, photo: '/assets/news-story-a1b2.jpg', view: { x: 100, y: 50, zoom: 1 }, saved: '2026-09-30T09:00:00.000Z' })
    // A label page's cut comes with it; its picture has to sit beside it; what is wrong falls back.
    expect(however).toMatchObject({ kind: 'label', name: 'However', note: '', cut: 'clean', seed: 42, photo: null, view: { x: 100, y: 50, zoom: 1 } })
    expect(however.words).toEqual({ ...PAGE_KINDS.label.sample, label: 'However' })
    // Where the tool is worked on, a picture saved again is fetched again.
    const fresh = readTemplates(
      { './templates/title/news-story.json': { name: 'News story', words, photo: 'news-story.jpg', updated: '2026-10-01T10:00:00.000Z' } },
      { './templates/title/news-story.jpg': '/src/templates/title/news-story.jpg' },
      true,
    )
    expect(fresh[0].photo).toBe('/src/templates/title/news-story.jpg?t=2026-10-01T10%3A00%3A00.000Z')
  })

  it('puts each kind’s example first, and falls back to it for a template that isn’t there', () => {
    const news = readTemplates({ './templates/title/news-story.json': { name: 'News story', words, photo: 'news-story.jpg' } }, { './templates/title/news-story.jpg': '/news.jpg' })[0]
    const byKind = templatesByKind([news])
    expect(byKind.title.map((template) => template.key)).toEqual([EXAMPLE, 'news-story'])
    expect(byKind.title[0]).toMatchObject({ name: 'Event', words: PAGE_KINDS.title.sample, photo: null })
    expect(byKind.label).toHaveLength(1)
    expect(byKind.label[0]).toMatchObject({ key: EXAMPLE, name: 'Meet the artists', words: PAGE_KINDS.label.sample })
    expect(templateFor('title', 'news-story', byKind)).toBe(news)
    expect(templateFor('title', 'gone', byKind).key).toBe(EXAMPLE)
    expect(templateFor('label', undefined, byKind).key).toBe(EXAMPLE)
    // A template without a picture of its own shows its kind's sample.
    expect(pictureOf(byKind.title[0])).toBe(SAMPLE_PICTURES.title)
    expect(pictureOf(news)).toBe('/news.jpg')
    expect(TEMPLATES.title[0].key).toBe(EXAMPLE)
    expect(TEMPLATES.label[0].key).toBe(EXAMPLE)
  })

  it('names a template’s file after its name', () => {
    const names = ['News story', '  Café — O’Neill’s Line-up!  ', 'However', '!!!', '', 'A'.repeat(50), 'ab '.repeat(20), 'Example']
    expect(names.map(slugOf)).toEqual(['news-story', 'cafe-o-neill-s-line-up', 'however', '', '', 'a'.repeat(40), 'ab-'.repeat(13) + 'a', 'example'])
  })

  it('lists what was saved to GitHub in this visit, before the published tool has been rebuilt with it', () => {
    const [news, stats] = readTemplates({
      './templates/title/news-story.json': { name: 'News story', words, saved: '1' },
      './templates/title/stats.json': { name: 'Stats', words, saved: '2' },
    }, {})
    const byKind = templatesByKind([news, stats])
    const renamed = { ...news, name: 'News story, again' }
    const fresh = { ...news, key: 'fresh', name: 'Fresh' }
    const listed = withPublished(byKind, { saved: [renamed, fresh], removed: ['title/stats', 'label/stats'] })
    // Saved over, it keeps its place; new, it goes at the end; removed, it goes, and only from its own kind.
    expect(listed.title.map((template) => template.name)).toEqual(['Event', 'News story, again', 'Fresh'])
    expect(listed.label).toEqual(byKind.label)
  })

  it('saves a template to GitHub as its file and its picture, in one commit', async () => {
    const { fetcher, calls } = fakeGitHub(happyGitHub())
    const draft = { name: ' Big news ', note: 'For the big ones', kind: 'label' as const, words: PAGE_KINDS.label.sample, cut: 'rough' as const, seed: 7, view: { x: 100, y: 20, zoom: 1.5 }, photo: 'data:image/jpeg;base64,AAAA' }
    const listed = await publishTemplate(draft, 'the-key', undefined, fetcher)
    expect(listed).toMatchObject({ key: 'big-news', kind: 'label', name: 'Big news', note: 'For the big ones', cut: 'rough', seed: 7, photo: draft.photo, view: draft.view })
    const tree = calls.find((call) => call.path === 'git/trees')?.body?.tree as { path: string; content?: string; sha?: string | null }[]
    expect(tree.map((entry) => entry.path)).toEqual(['src/templates/label/big-news.jpg', 'src/templates/label/big-news.json'])
    const file = JSON.parse(tree[1].content ?? '')
    expect(file).toMatchObject({ name: 'Big news', note: 'For the big ones', words: PAGE_KINDS.label.sample, cut: 'rough', seed: 7, view: draft.view, photo: 'big-news.jpg' })
    expect(file.saved).toBe(file.updated)
    expect(tree[1].content?.endsWith('}\n')).toBe(true)
    expect(calls.find((call) => call.path === 'git/commits' && call.method === 'POST')?.body?.message).toBe('Add the label page template "Big news"')
    // Read back as the tool reads its files, it is the template that was saved.
    const [read] = readTemplates({ './templates/label/big-news.json': file }, { './templates/label/big-news.jpg': '/big-news.jpg' })
    expect(read).toMatchObject({ key: 'big-news', name: 'Big news', words: PAGE_KINDS.label.sample, cut: 'rough', seed: 7, view: draft.view, photo: '/big-news.jpg' })
  })

  it('saves over a template on GitHub in its place, and takes its picture away when it has none now', async () => {
    const [over] = readTemplates({ './templates/title/news-story.json': { name: 'News story', words, photo: 'news-story.jpg', saved: '2026-09-30T09:00:00.000Z' } }, { './templates/title/news-story.jpg': '/news.jpg' })
    const { fetcher, calls } = fakeGitHub(happyGitHub())
    await publishTemplate({ name: 'News story', note: '', kind: 'title', words, view: { x: 50, y: 50, zoom: 1 }, photo: null }, 'the-key', over, fetcher)
    const tree = calls.find((call) => call.path === 'git/trees')?.body?.tree as { path: string; content?: string; sha?: string | null }[]
    expect(tree.map((entry) => [entry.path, entry.sha === null ? 'removed' : 'saved'])).toEqual([['src/templates/title/news-story.jpg', 'removed'], ['src/templates/title/news-story.json', 'saved']])
    // It keeps its first saving, so its place in the list.
    expect(JSON.parse(tree[1].content ?? '').saved).toBe('2026-09-30T09:00:00.000Z')
    expect(calls.find((call) => call.path === 'git/commits' && call.method === 'POST')?.body?.message).toBe('Update the title page template "News story"')
    // Removing takes the file and its picture.
    const removal = fakeGitHub(happyGitHub())
    await unpublishTemplate(over, 'the-key', removal.fetcher)
    const gone = removal.calls.find((call) => call.path === 'git/trees')?.body?.tree as { path: string; sha: string | null }[]
    expect(gone).toEqual([
      { path: 'src/templates/title/news-story.json', mode: '100644', type: 'blob', sha: null },
      { path: 'src/templates/title/news-story.jpg', mode: '100644', type: 'blob', sha: null },
    ])
    // A name the examples go by, or none, is refused before GitHub is asked.
    const refused = fakeGitHub(happyGitHub())
    await expect(publishTemplate({ name: 'Example', note: '', kind: 'title', words, view: { x: 50, y: 50, zoom: 1 }, photo: null }, 'key', undefined, refused.fetcher)).rejects.toThrow()
    await expect(publishTemplate({ name: '!!', note: '', kind: 'title', words, view: { x: 50, y: 50, zoom: 1 }, photo: null }, 'key', undefined, refused.fetcher)).rejects.toThrow()
    expect(refused.calls).toHaveLength(0)
  })

  it('keeps the templates in the tool whole: each file reads just as it was saved', () => {
    const all = [...TEMPLATES.title, ...TEMPLATES.label]
    expect(Object.keys(files).length).toBe(all.length - 2)
    for (const [path, data] of Object.entries(files)) {
      const stored = data as { name: string; words: Record<string, unknown> }
      const template = all.find((option) => path.endsWith(`/${option.kind}/${option.key}.json`))
      expect(template, path).toBeDefined()
      expect(template?.name, path).toBe(stored.name)
      expect(template?.words, path).toEqual(stored.words)
    }
  })
})
